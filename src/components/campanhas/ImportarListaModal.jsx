import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const normTel = (s = '') => String(s || '').replace(/\D/g, '');
const normCpf = (s = '') => String(s || '').replace(/\D/g, '');

const titleCaseName = (name = '') => {
  const n = String(name || '').trim();
  if (!n) return '';
  const subs = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return n
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && subs.includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
};

const extractPrimeiroNome = (nomeCompleto = '') => {
  const n = String(nomeCompleto || '').trim();
  if (!n) return '';
  return titleCaseName(nomeCompleto).split(/\s+/)[0] || '';
};

const COLUNAS = {
  nome: ['nome', 'nome completo', 'nome do cliente', 'nome completo do cliente', 'nome do contato', 'cliente'],
  cpf: ['cpf', 'c.p.f'],
  telefone: ['telefone', 'tel', 'celular', 'cel', 'whatsapp', 'whats', 'fone', 'numero', 'número', 'phone'],
};

function detectarColuna(headers, keys) {
  const norm = headers.map((h) => String(h || '').trim().toLowerCase());
  for (const key of keys) {
    const idx = norm.findIndex((h) => h === key);
    if (idx >= 0) return idx;
  }
  for (const key of keys) {
    const idx = norm.findIndex((h) => h.includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

const ERRO_COLUNAS_MSG =
  'Não foi possível importar a lista.\n\nA planilha deve conter obrigatoriamente:\nNome, CPF e Telefone.';

export default function ImportarListaModal({ open, onOpenChange, empresaId, user, onImported }) {
  const [etapa, setEtapa] = useState('upload'); // upload | revisao | processando | done
  const [arquivo, setArquivo] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [colunas, setColunas] = useState(null);
  const [erro, setErro] = useState('');
  const [nomeLista, setNomeLista] = useState('');
  const [progresso, setProgresso] = useState({ total: 0, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
  const inputRef = useRef(null);

  const reset = () => {
    setEtapa('upload');
    setArquivo(null);
    setLinhas([]);
    setColunas(null);
    setErro('');
    setNomeLista('');
    setProgresso({ total: 0, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
  };

  const handleClose = (v) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 250);
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setErro('Formato inválido. Selecione um arquivo Excel (.xlsx).');
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setErro('');
    setArquivo(file);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (json.length === 0) {
        setErro('A planilha está vazia.');
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      const headers = Object.keys(json[0]);
      const idxNome = detectarColuna(headers, COLUNAS.nome);
      const idxCpf = detectarColuna(headers, COLUNAS.cpf);
      const idxTel = detectarColuna(headers, COLUNAS.telefone);
      if (idxNome < 0 || idxCpf < 0 || idxTel < 0) {
        setErro(ERRO_COLUNAS_MSG);
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      const parsed = json
        .map((r) => {
          const row = Object.values(r);
          const nomeRaw = String(row[idxNome] || '').trim();
          const cpfRaw = String(row[idxCpf] || '').trim();
          const telRaw = String(row[idxTel] || '').trim();
          const nomeFormatado = titleCaseName(nomeRaw);
          return {
            nome: nomeFormatado,
            primeiro_nome: extractPrimeiroNome(nomeRaw),
            cpf: cpfRaw,
            cpf_norm: normCpf(cpfRaw),
            telefone: telRaw,
            telefone_norm: normTel(telRaw),
          };
        })
        .filter((r) => r.nome || r.cpf_norm || r.telefone_norm);

      if (parsed.length === 0) {
        setErro('Nenhuma linha com dados válidos foi encontrada.');
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }
      if (parsed.every((r) => !r.cpf_norm && !r.nome)) {
        // "Não aceitar lista contendo apenas telefone"
        setErro(
          'Não foi possível importar a lista.\n\nA planilha deve conter obrigatoriamente:\nNome, CPF e Telefone.\nListas com apenas telefone não são aceitas.'
        );
        setArquivo(null);
        if (inputRef.current) inputRef.current.value = '';
        return;
      }

      setLinhas(parsed);
      setColunas({ nome: headers[idxNome], cpf: headers[idxCpf], telefone: headers[idxTel] });
      setEtapa('revisao');
    } catch (err) {
      console.error(err);
      setErro('Erro ao ler a planilha: ' + (err.message || 'desconhecido'));
      setArquivo(null);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const podeConfirmar = etapa === 'revisao' && linhas.length > 0 && nomeLista.trim().length > 0 && !!empresaId;

  const MAX_SNAPSHOT = 2000;

  const processar = async () => {
    if (!podeConfirmar) return;
    setEtapa('processando');
    setProgresso({ total: linhas.length, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
    try {
      // Buscar clientes existentes para deduplicação por CPF ou Telefone
      let existentes = [];
      try {
        existentes = await base44.entities.Cliente.filter({ empresa_id: empresaId }, null, 5000);
      } catch (e) {
        console.warn('Erro ao buscar clientes existentes:', e.message);
      }
      const porCpf = new Map();
      const porTel = new Map();
      for (const c of existentes) {
        const cpf = normCpf(c.cpf);
        if (cpf) porCpf.set(cpf, c);
        const tel = normTel(c.celular || c.telefone_fixo || '');
        if (tel && !porTel.has(tel)) porTel.set(tel, c);
      }

      const snapshot = [];
      const novosPayloads = [];
      const atualizacoes = [];
      let criados = 0;
      let atualizados = 0;
      let pulados = 0;
      const vistosTelefone = new Set();

      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i];
        if (!l.nome && !l.cpf_norm && !l.telefone_norm) {
          pulados++;
          setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados }));
          continue;
        }
        // chave de dedupicação local por telefone (evita duplicar dentro da própria planilha)
        if (l.telefone_norm && vistosTelefone.has(l.telefone_norm)) {
          pulados++;
          setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados }));
          continue;
        }
        const existente =
          (l.cpf_norm && porCpf.get(l.cpf_norm)) ||
          (l.telefone_norm && porTel.get(l.telefone_norm)) ||
          null;

        if (existente) {
          const patch = {};
          if (!existente.nome_completo && l.nome) patch.nome_completo = l.nome;
          if (!existente.primeiro_nome && l.primeiro_nome) patch.primeiro_nome = l.primeiro_nome;
          if (!existente.cpf && l.cpf) patch.cpf = l.cpf;
          if (!normTel(existente.celular || '') && l.telefone) patch.celular = l.telefone;
          if (!existente.tipo_pessoa) patch.tipo_pessoa = 'Física';
          if (Object.keys(patch).length > 0) {
            atualizacoes.push({ id: existente.id, patch });
          }
          snapshot.push({
            cliente_id: existente.id,
            nome: existente.nome_completo || l.nome,
            primeiro_nome: existente.primeiro_nome || l.primeiro_nome,
            cpf: existente.cpf || l.cpf,
            telefone: normTel(existente.celular || l.telefone),
          });
          if (l.cpf_norm && !porCpf.has(l.cpf_norm)) porCpf.set(l.cpf_norm, existente);
          if (l.telefone_norm && !porTel.has(l.telefone_norm)) porTel.set(l.telefone_norm, existente);
          if (l.telefone_norm) vistosTelefone.add(l.telefone_norm);
          atualizados++;
        } else {
          novosPayloads.push({
            payload: {
              empresa_id: empresaId,
              tipo_pessoa: 'Física',
              nome_completo: l.nome,
              primeiro_nome: l.primeiro_nome,
              cpf: l.cpf,
              celular: l.telefone,
              status: 'ativo',
            },
            linha: l,
          });
          if (l.telefone_norm) vistosTelefone.add(l.telefone_norm);
          criados++;
        }
        setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados }));
      }

      // Criar novos clientes (em lote)
      let clientesCriados = [];
      if (novosPayloads.length > 0) {
        try {
          clientesCriados = await base44.entities.Cliente.bulkCreate(novosPayloads.map((x) => x.payload));
        } catch (e) {
          console.warn('bulkCreate falhou, tentando um a um:', e.message);
          for (const x of novosPayloads) {
            try {
              const r = await base44.entities.Cliente.create(x.payload);
              clientesCriados.push(r);
            } catch (err) {
              console.warn('erro criar cliente:', err.message);
            }
          }
        }
      }
      clientesCriados = clientesCriados || [];
      novosPayloads.forEach((x, idx) => {
        const c = clientesCriados[idx];
        if (!c) return;
        snapshot.push({
          cliente_id: c.id,
          nome: c.nome_completo || x.linha.nome,
          primeiro_nome: c.primeiro_nome || x.linha.primeiro_nome,
          cpf: c.cpf || x.linha.cpf,
          telefone: normTel(c.celular || x.linha.telefone),
        });
      });

      // Aplicar atualizações dos clientes existentes
      for (const u of atualizacoes) {
        try {
          await base44.entities.Cliente.update(u.id, u.patch);
        } catch (e) {
          console.warn('update falhou:', e.message);
        }
      }

      const snapshotTruncado = snapshot.slice(0, MAX_SNAPSHOT);
      const descricaoExtra =
        snapshot.length > MAX_SNAPSHOT ? ` (snapshot exibe ${MAX_SNAPSHOT} de ${snapshot.length})` : '';

      const lista = await base44.entities.ListaContatosImportada.create({
        empresa_id: empresaId,
        nome: nomeLista.trim(),
        descricao: descricaoExtra || '',
        total_contatos: snapshot.length,
        contatos_json: JSON.stringify(snapshotTruncado),
        arquivo_nome: arquivo?.name || '',
        data_importacao: new Date().toISOString(),
        criado_por_id: user?.id,
        criado_por_nome: user?.full_name || user?.email || '',
        status: 'ativa',
      });

      setProgresso((p) => ({ ...p, total: snapshot.length }));
      setEtapa('done');
      toast.success(`Lista "${lista.nome}" importada com ${snapshot.length} contatos.`);
      if (onImported) onImported(lista);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao processar lista: ' + (e.message || 'desconhecido'));
      setEtapa('revisao');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar nova lista de contatos
          </DialogTitle>
        </DialogHeader>

        {etapa === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-3">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-700">Envie uma planilha Excel (.xlsx)</p>
                <p className="text-xs text-slate-500 mt-1">
                  A planilha deve conter obrigatoriamente as colunas:
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">NOME</span>
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">CPF</span>
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">TELEFONE</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Listas contendo apenas telefone não são aceitas.
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onFileChange}
                className="hidden"
                id="import-lista-file"
              />
              <Button
                variant="outline"
                className="cursor-pointer"
                type="button"
                onClick={() => document.getElementById('import-lista-file').click()}
              >
                <Upload className="w-4 h-4 mr-1.5" /> Selecionar arquivo .xlsx
              </Button>
              {arquivo && (
                <p className="text-xs text-slate-500 truncate max-w-full">Arquivo: {arquivo.name}</p>
              )}
            </div>
            {erro && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs whitespace-pre-line">
                <AlertTriangle className="w-4 h-4 mt-px flex-shrink-0" />
                <span>{erro}</span>
              </div>
            )}
          </div>
        )}

        {etapa === 'revisao' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span>Planilha válida — {linhas.length} contatos detectados.</span>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">Arquivo</span>
                <span className="font-medium truncate max-w-[280px]">{arquivo?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coluna Nome</span>
                <span className="font-medium">{colunas.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coluna CPF</span>
                <span className="font-medium">{colunas.cpf}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Coluna Telefone</span>
                <span className="font-medium">{colunas.telefone}</span>
              </div>
            </div>
            <div>
              <Label>Nome da lista *</Label>
              <Input
                value={nomeLista}
                onChange={(e) => setNomeLista(e.target.value)}
                placeholder="Ex: Clientes Credisol Julho"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                A lista ficará salva para reutilização em outras campanhas.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
              <p>• Contatos serão criados no cadastro geral do CRM.</p>
              <p>• Clientes já existentes (mesmo CPF ou telefone) não serão duplicados — apenas terão dados faltantes preenchidos.</p>
              <p>• O primeiro nome será extraído automaticamente para uso nos templates.</p>
            </div>
            {erro && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                <AlertTriangle className="w-4 h-4 mt-px flex-shrink-0" />
                <span>{erro}</span>
              </div>
            )}
          </div>
        )}

        {etapa === 'processando' && (
          <div className="space-y-4 py-6">
            <div className="flex items-center justify-center gap-2 text-slate-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">
                Processando {progresso.atual}/{progresso.total}...
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Novos</p>
                <p className="font-bold text-emerald-700 text-lg">{progresso.criados}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Atualizados</p>
                <p className="font-bold text-blue-600 text-lg">{progresso.atualizados}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Pulados</p>
                <p className="font-bold text-slate-400 text-lg">{progresso.pulados}</p>
              </div>
            </div>
          </div>
        )}

        {etapa === 'done' && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-slate-800">Importação concluída!</p>
              <p className="text-sm text-slate-500 mt-1">
                {progresso.total} contatos salvos na lista "{nomeLista}".
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto text-xs">
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Novos</p>
                <p className="font-bold text-emerald-700">{progresso.criados}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Atualizados</p>
                <p className="font-bold text-blue-600">{progresso.atualizados}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-2">
                <p className="text-slate-500">Pulados</p>
                <p className="font-bold text-slate-400">{progresso.pulados}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              A lista já está disponível para seleção no Público → Listas importadas.
            </p>
          </div>
        )}

        <DialogFooter>
          {etapa === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Fechar
            </Button>
          )}
          {etapa === 'revisao' && (
            <>
              <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); setLinhas([]); setColunas(null); setErro(''); }}>
                Voltar
              </Button>
              <Button onClick={processar} disabled={!podeConfirmar}>
                Importar {linhas.length} contatos <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          )}
          {etapa === 'done' && (
            <Button onClick={() => handleClose(false)}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}