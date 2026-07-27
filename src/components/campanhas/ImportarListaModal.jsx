import React, { useMemo, useRef, useState } from 'react';
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
  MapPin,
  Phone,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  normalizarTelefone,
  detectarColunasTelefone,
  detectarColunaCidade,
  mapearColunasParaCampos,
} from './telefonesCliente';

const normCpf = (s = '') => String(s || '').replace(/\D/g, '');

const titleCaseName = (name = '') => {
  const n = String(name || '').trim();
  if (!n) return '';
  const subs = ['de', 'da', 'do', 'das', 'dos', 'e'];
  return n.toLowerCase()
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
  email: ['email', 'e-mail', 'mail'],
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
  'Não foi possível importar a lista.\n\nA planilha deve conter:\nNome (ou CPF) e ao menos uma coluna de Telefone (Telefone, Celular, WhatsApp, Comercial, Recado, etc.).';

export default function ImportarListaModal({ open, onOpenChange, empresaId, user, onImported }) {
  const [etapa, setEtapa] = useState('upload');
  const [arquivo, setArquivo] = useState(null);
  const [linhasTudo, setLinhasTudo] = useState([]);
  const [colunas, setColunas] = useState(null);
  const [cidades, setCidades] = useState([]);
  const [cidadesSel, setCidadesSel] = useState(new Set());
  const [buscaCidade, setBuscaCidade] = useState('');
  const [erro, setErro] = useState('');
  const [nomeLista, setNomeLista] = useState('');
  const [progresso, setProgresso] = useState({ total: 0, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
  const inputRef = useRef(null);

  const reset = () => {
    setEtapa('upload'); setArquivo(null); setLinhasTudo([]);
    setColunas(null); setCidades([]); setCidadesSel(new Set());
    setErro(''); setNomeLista('');
    setProgresso({ total: 0, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
  };

  const handleClose = (v) => { onOpenChange(v); if (!v) setTimeout(reset, 250); };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      setErro('Formato inválido. Selecione um arquivo Excel (.xlsx).');
      setArquivo(null); if (inputRef.current) inputRef.current.value = '';
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
        setArquivo(null); if (inputRef.current) inputRef.current.value = '';
        return;
      }
      const headers = Object.keys(json[0]);
      const idxNome = detectarColuna(headers, COLUNAS.nome);
      const idxCpf = detectarColuna(headers, COLUNAS.cpf);
      const idxEmail = detectarColuna(headers, COLUNAS.email);
      const colTelefones = detectarColunasTelefone(headers);
      const idxCidade = detectarColunaCidade(headers);

      if (colTelefones.length === 0 || (idxNome < 0 && idxCpf < 0)) {
        setErro(ERRO_COLUNAS_MSG);
        setArquivo(null); if (inputRef.current) inputRef.current.value = '';
        return;
      }

      const { map: mapaColCampo, nao_mapeadas } = mapearColunasParaCampos(colTelefones);

      const parsed = json.map((r) => {
        const row = Object.values(r);
        const nomeRaw = idxNome >= 0 ? String(row[idxNome] || '').trim() : '';
        const cpfRaw = idxCpf >= 0 ? String(row[idxCpf] || '').trim() : '';
        const emailRaw = idxEmail >= 0 ? String(row[idxEmail] || '').trim() : '';
        const cidadeRaw = idxCidade >= 0 ? String(row[idxCidade] || '').trim() : '';
        const telefones = [];
        for (const c of colTelefones) {
          const raw = String(row[c.idx] || '').trim();
          const num = normalizarTelefone(raw);
          if (num.length < 8) continue;
          if (telefones.some((t) => t.numero === num)) continue;
          telefones.push({
            numero: num,
            tipo: c.tipo,
            is_whatsapp: !!c.is_whatsapp,
            is_principal: !!c.is_principal,
            header: c.header,
            campo_destino: mapaColCampo[c.header] || null,
          });
        }
        if (telefones.length && !telefones.some((t) => t.is_principal)) telefones[0].is_principal = true;
        const nomeFormatado = titleCaseName(nomeRaw);
        const inconsist = !nomeFormatado || !normCpf(cpfRaw) || telefones.length === 0;
        return {
          nome: nomeFormatado,
          primeiro_nome: extractPrimeiroNome(nomeRaw),
          cpf: cpfRaw,
          cpf_norm: normCpf(cpfRaw),
          email: emailRaw,
          cidade: cidadeRaw,
          telefones,
          inconsistente: inconsist,
        };
      }).filter((r) => r.nome || r.cpf_norm || r.telefones.length);

      if (parsed.length === 0) {
        setErro('Nenhuma linha com dados válidos foi encontrada.');
        setArquivo(null); if (inputRef.current) inputRef.current.value = '';
        return;
      }

      // Mapa de cidades + contagem
      const cityMap = new Map();
      for (const r of parsed) {
        const c = (r.cidade || '').trim();
        if (!c) continue;
        cityMap.set(c, (cityMap.get(c) || 0) + 1);
      }
      const cityArr = Array.from(cityMap.entries())
        .map(([cidade, count]) => ({ cidade, count }))
        .sort((a, b) => b.count - a.count);

      setLinhasTudo(parsed);
      setColunas({
        nome: idxNome >= 0 ? headers[idxNome] : null,
        cpf: idxCpf >= 0 ? headers[idxCpf] : null,
        email: idxEmail >= 0 ? headers[idxEmail] : null,
        cidade: idxCidade >= 0 ? headers[idxCidade] : null,
        telefones: colTelefones,
        mapaColCampo,
        nao_mapeadas,
      });
      setCidades(cityArr);
      setCidadesSel(new Set());
      setEtapa('revisao');
    } catch (err) {
      console.error(err);
      setErro('Erro ao ler a planilha: ' + (err.message || 'desconhecido'));
      setArquivo(null);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const linhasFiltradas = useMemo(() => {
    if (cidadesSel.size === 0) return linhasTudo;
    return linhasTudo.filter((r) => r.cidade && cidadesSel.has(r.cidade));
  }, [linhasTudo, cidadesSel]);

  const cidadesFiltradas = useMemo(() => {
    const termo = buscaCidade.trim().toLowerCase();
    if (!termo) return cidades;
    return cidades.filter((c) => c.cidade.toLowerCase().includes(termo));
  }, [cidades, buscaCidade]);

  const stats = useMemo(() => {
    let totalTel = 0, validos = 0, inconsist = 0;
    for (const r of linhasFiltradas) {
      const unicos = new Set(r.telefones.map((t) => t.numero));
      totalTel += unicos.size;
      if (r.inconsistente) inconsist++; else validos++;
    }
    return { totalRegistros: linhasFiltradas.length, validos, inconsist, totalTel, totalCidades: cidades.length };
  }, [linhasFiltradas, cidades]);

  const toggleCidade = (nome) => {
    setCidadesSel((prev) => {
      const n = new Set(prev);
      if (n.has(nome)) n.delete(nome); else n.add(nome);
      return n;
    });
  };

  const podeConfirmar = etapa === 'revisao' && linhasFiltradas.length > 0 && nomeLista.trim().length > 0 && !!empresaId;
  const MAX_SNAPSHOT = 2000;

  const processar = async () => {
    if (!podeConfirmar) return;
    setEtapa('processando');
    setProgresso({ total: linhasFiltradas.length, atual: 0, criados: 0, atualizados: 0, pulados: 0 });
    try {
      let existentes = [];
      try {
        existentes = await base44.entities.Cliente.filter({ empresa_id: empresaId }, null, 5000);
      } catch (e) { console.warn('Erro ao buscar clientes existentes:', e.message); }
      let existentesTel = [];
      let telExistenteKey = new Set();
      try {
        existentesTel = await base44.entities.ClienteTelefone.filter({ empresa_id: empresaId }, null, 5000);
        telExistenteKey = new Set(existentesTel.map((t) => `${t.cliente_id}:${t.telefone}`));
      } catch (e) { console.warn('Erro ao buscar ClienteTelefone existentes:', e.message); }
      const porCpf = new Map();
      const porTel = new Map();
      for (const c of existentes) {
        const cpf = normCpf(c.cpf);
        if (cpf) porCpf.set(cpf, c);
        const tel = normalizarTelefone(c.celular || c.telefone_fixo || '');
        if (tel && !porTel.has(tel)) porTel.set(tel, c);
      }

      const snapshot = [];
      const novosPayloads = [];
      const atualizacoes = [];
      const telefonesParaCriar = [];
      let criados = 0, atualizados = 0, pulados = 0;
      const vistosCpf = new Set();

      for (let i = 0; i < linhasFiltradas.length; i++) {
        const l = linhasFiltradas[i];
        if (!l.nome && !l.cpf_norm && l.telefones.length === 0) {
          pulados++; setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados })); continue;
        }
        if (l.cpf_norm && vistosCpf.has(l.cpf_norm)) {
          pulados++; setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados })); continue;
        }
        if (l.cpf_norm) vistosCpf.add(l.cpf_norm);

        const principal = l.telefones.find((t) => t.is_principal) || l.telefones[0];
        const telPrincipal = principal?.numero || '';

        const existente = (l.cpf_norm && porCpf.get(l.cpf_norm)) || (telPrincipal && porTel.get(telPrincipal)) || null;

        // Mantém celular (legado) preenchido com o telefone principal, se não existir
        const telefonesPatch = {};
        if (telPrincipal) {
          const atualCel = existente ? normalizarTelefone(existente.celular || '') : '';
          if (!atualCel || atualCel.length < 8) telefonesPatch.celular = telPrincipal;
        }

        // Lista de telefones detectados na linha para criar em ClienteTelefone
        const telefonesDaLinha = l.telefones.map((t) => ({
          numero: t.numero,
          tipo: t.tipo,
          is_whatsapp: !!t.is_whatsapp,
          is_principal: !!t.is_principal,
          header: t.header || '',
        }));
        if (existente) {
          for (const t of telefonesDaLinha) {
            telefonesParaCriar.push({
              empresa_id: empresaId,
              cliente_id: existente.id,
              telefone: t.numero,
              tipo: t.tipo,
              is_whatsapp: t.is_whatsapp,
              is_principal: t.is_principal,
              header_origem: t.header,
              origem: 'importacao_lista',
              status: 'ativo',
            });
          }
        }

        if (existente) {
          const patch = {};
          if (!existente.nome_completo && l.nome) patch.nome_completo = l.nome;
          if (!existente.primeiro_nome && l.primeiro_nome) patch.primeiro_nome = l.primeiro_nome;
          if (!existente.cpf && l.cpf) patch.cpf = l.cpf;
          if (!existente.email && l.email) patch.email = l.email;
          if (l.cidade && !existente.res_cidade) patch.res_cidade = l.cidade;
          if (!existente.tipo_pessoa) patch.tipo_pessoa = 'Física';
          if (!normalizarTelefone(existente.celular || '') && telPrincipal && !telefonesPatch.celular) {
            patch.celular = telPrincipal;
          }
          Object.assign(patch, telefonesPatch);
          if (Object.keys(patch).length > 0) atualizacoes.push({ id: existente.id, patch });
          snapshot.push({
            cliente_id: existente.id,
            nome: existente.nome_completo || l.nome,
            primeiro_nome: existente.primeiro_nome || l.primeiro_nome,
            cpf: existente.cpf || l.cpf,
            cidade: l.cidade,
            telefone: telPrincipal,
            telefones: l.telefones.map((t) => ({ numero: t.numero, tipo: t.tipo })),
            email: existente.email || l.email || '',
          });
          if (l.cpf_norm && !porCpf.has(l.cpf_norm)) porCpf.set(l.cpf_norm, existente);
          atualizados++;
        } else {
          const payload = {
            empresa_id: empresaId,
            tipo_pessoa: 'Física',
            nome_completo: l.nome,
            primeiro_nome: l.primeiro_nome,
            cpf: l.cpf,
            email: l.email || '',
            res_cidade: l.cidade || '',
            status: 'ativo',
            ...telefonesPatch,
          };
          // Garante celular com principal se não foi mapeado
          if (!payload.celular && telPrincipal) payload.celular = telPrincipal;
          novosPayloads.push({ payload, linha: l, telefonesDaLinha });
          criados++;
        }
        setProgresso((p) => ({ ...p, atual: i + 1, criados, atualizados, pulados }));
      }

      let clientesCriados = [];
      if (novosPayloads.length > 0) {
        try {
          clientesCriados = await base44.entities.Cliente.bulkCreate(novosPayloads.map((x) => x.payload));
        } catch (e) {
          console.warn('bulkCreate falhou, tentando um a um:', e.message);
          for (const x of novosPayloads) {
            try { clientesCriados.push(await base44.entities.Cliente.create(x.payload)); } catch (err) { console.warn('erro criar cliente:', err.message); }
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
          cidade: x.linha.cidade,
          telefone: normalizarTelefone(c.celular || (x.linha.telefones[0] && x.linha.telefones[0].numero) || ''),
          telefones: x.linha.telefones.map((t) => ({ numero: t.numero, tipo: t.tipo })),
          email: c.email || x.linha.email || '',
        });
        for (const t of x.telefonesDaLinha || []) {
          telefonesParaCriar.push({
            empresa_id: empresaId,
            cliente_id: c.id,
            telefone: t.numero,
            tipo: t.tipo,
            is_whatsapp: t.is_whatsapp,
            is_principal: t.is_principal,
            header_origem: t.header,
            origem: 'importacao_lista',
            status: 'ativo',
          });
        }
      });

      for (const u of atualizacoes) {
        try { await base44.entities.Cliente.update(u.id, u.patch); } catch (e) { console.warn('update falhou:', e.message); }
      }

      // BulkCreate em ClienteTelefone (um registro por telefone, dedupe por cliente_id+telefone e contra existentes)
      if (telefonesParaCriar.length > 0) {
        const tpVistos = new Set();
        const telefonesUnicos = telefonesParaCriar.filter((t) => {
          const k = `${t.cliente_id}:${t.telefone}`;
          if (tpVistos.has(k)) return false;
          if (telExistenteKey.has(k)) return false;
          tpVistos.add(k);
          return true;
        });
        if (telefonesUnicos.length > 0) {
          try {
            await base44.entities.ClienteTelefone.bulkCreate(telefonesUnicos);
          } catch (e) {
            console.warn('ClienteTelefone bulkCreate falhou:', e.message);
          }
        }
      }

      const snapshotTruncado = snapshot.slice(0, MAX_SNAPSHOT);
      const descricaoExtra = snapshot.length > MAX_SNAPSHOT ? ` (snapshot exibe ${MAX_SNAPSHOT} de ${snapshot.length})` : '';
      const lista = await base44.entities.ListaContatosImportada.create({
        empresa_id: empresaId,
        nome: nomeLista.trim(),
        descricao: `${stats.totalRegistros} registros · ${stats.totalTel} telefones · Cidades: ${cidadesSel.size === 0 ? 'todas' : Array.from(cidadesSel).join(', ')}.${descricaoExtra}`,
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
      toast.success(`Lista "${lista.nome}" importada com ${snapshot.length} contatos e ${stats.totalTel} telefones.`);
      if (onImported) onImported(lista);
    } catch (e) {
      console.error(e);
      toast.error('Erro ao processar lista: ' + (e.message || 'desconhecido'));
      setEtapa('revisao');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Importar nova lista de contatos
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
        {etapa === 'upload' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center space-y-3">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-700">Envie uma planilha Excel (.xlsx)</p>
                <p className="text-xs text-slate-500 mt-1">A planilha deve conter:</p>
                <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">NOME</span>
                  <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-semibold">CPF</span>
                  <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-semibold">TELEFONES (1 ou mais colunas)</span>
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-semibold">CIDADE (opcional)</span>
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-semibold">EMAIL (opcional)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Detectamos automaticamente todas as colunas de telefone (Telefone, Celular, WhatsApp, Comercial, Recado, etc.).
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
              <Button variant="outline" className="cursor-pointer" type="button"
                onClick={() => document.getElementById('import-lista-file').click()}>
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
              <span>Planilha válida — {linhasTudo.length} registros, {cidades.length} cidade(s) detectada(s).</span>
            </div>

            {/* Colunas detectadas */}
            <div className="rounded-lg border border-slate-200 p-3 space-y-1 text-xs text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">Arquivo</span>
                <span className="font-medium truncate max-w-[280px]">{arquivo?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Nome</span>
                <span className="font-medium">{colunas?.nome || '(não detectado)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CPF</span>
                <span className="font-medium">{colunas?.cpf || '(não detectado)'}</span>
              </div>
              {colunas?.email && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Email</span>
                  <span className="font-medium">{colunas.email}</span>
                </div>
              )}
              {colunas?.cidade ? (
                <div className="flex justify-between">
                  <span className="text-slate-500">Cidade</span>
                  <span className="font-medium">{colunas.cidade}</span>
                </div>
              ) : (
                <div className="flex justify-between text-amber-600">
                  <span>Cidade (não detectada)</span>
                  <span className="text-[11px]">Filtro indisponível</span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-100 mt-1">
                <span className="text-slate-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-blue-600" /> Colunas de telefone ({colunas?.telefones?.length || 0})</span>
                <div className="font-medium text-right flex flex-wrap gap-1 justify-end max-w-[320px]">
                  {colunas?.telefones?.map((c, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${c.is_principal ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`} title={`→ ${colunas.mapaColCampo[c.header] || 'ignorado'}`}>
                      {c.header}{c.is_principal ? ' ⭐' : ''}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-start gap-2 text-emerald-700 text-[11px] pt-1">
                <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                <span>
                  Todos os {colunas?.telefones?.length || 0} tipo(s) de telefone detectados serão salvos como registros individuais em ClienteTelefone (sem limite por cliente).
                </span>
              </div>
            </div>

            {/* Estatísticas resumo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Total de registros" value={stats.totalRegistros} color="text-slate-800" />
              <Stat label="Contatos válidos" value={stats.validos} color="text-emerald-600" />
              <Stat label="Com inconsistências" value={stats.inconsist} color="text-amber-600" />
              <Stat label="Total de telefones" value={stats.totalTel} color="text-blue-600" />
            </div>

            {/* Amostra das primeiras linhas */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                Prévia — primeiras {Math.min(5, linhasFiltradas.length)} linhas
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Nome</th>
                      <th className="text-left px-2 py-1.5 font-medium">CPF</th>
                      <th className="text-left px-2 py-1.5 font-medium">Cidade</th>
                      <th className="text-right px-2 py-1.5 font-medium">Telefones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-700">{r.nome || <span className="text-red-500">(sem nome)</span>}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.cpf || '—'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.cidade || '—'}</td>
                        <td className="px-2 py-1.5 text-right text-slate-700">{r.telefones.length}</td>
                      </tr>
                    ))}
                    {linhasFiltradas.length === 0 && (
                      <tr><td colSpan={4} className="px-2 py-4 text-center text-slate-400">Nenhum registro após o filtro</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Filtro por cidade */}
            {cidades.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  Filtrar cidades ({cidadesSel.size === 0 ? 'todas' : `${cidadesSel.size} selecionada(s)`})
                </div>
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setCidadesSel(new Set())}
                    className={`px-3 py-1.5 rounded text-xs border ${cidadesSel.size === 0 ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:bg-slate-50'}`}>
                    Todas ({linhasTudo.length})
                  </button>
                  <Input
                    value={buscaCidade}
                    onChange={(e) => setBuscaCidade(e.target.value)}
                    placeholder="Buscar cidade..."
                    className="h-7 text-xs flex-1"
                  />
                </div>
                <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1 pr-1">
                  {cidadesFiltradas.map((c) => {
                    const sel = cidadesSel.has(c.cidade);
                    return (
                      <label key={c.cidade} className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer ${sel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleCidade(c.cidade)} className="accent-emerald-600" />
                        <span className="font-medium text-slate-700">{c.cidade}</span>
                        <span className="ml-auto text-slate-400">{c.count}</span>
                      </label>
                    );
                  })}
                </div>
                {cidadesSel.size > 0 && (
                  <div className="rounded bg-blue-50 border border-blue-100 text-blue-700 text-xs px-3 py-2">
                    Registros que serão importados: <strong>{stats.totalRegistros}</strong> contatos · <strong>{stats.totalTel}</strong> telefones
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Nome da lista *</Label>
              <Input value={nomeLista} onChange={(e) => setNomeLista(e.target.value)} placeholder="Ex: Clientes Credisol Julho" />
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
              <span className="text-sm font-medium">Processando {progresso.atual}/{progresso.total}...</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all"
                style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Novos</p><p className="font-bold text-emerald-700 text-lg">{progresso.criados}</p></div>
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Atualizados</p><p className="font-bold text-blue-600 text-lg">{progresso.atualizados}</p></div>
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Pulados</p><p className="font-bold text-slate-400 text-lg">{progresso.pulados}</p></div>
            </div>
          </div>
        )}

        {etapa === 'done' && (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <div>
              <p className="text-lg font-semibold text-slate-800">Importação concluída!</p>
              <p className="text-sm text-slate-500 mt-1">{progresso.total} contatos salvos na lista "{nomeLista}".</p>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto text-xs">
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Novos</p><p className="font-bold text-emerald-700">{progresso.criados}</p></div>
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Atualizados</p><p className="font-bold text-blue-600">{progresso.atualizados}</p></div>
              <div className="rounded-lg border border-slate-200 p-2"><p className="text-slate-500">Pulados</p><p className="font-bold text-slate-400">{progresso.pulados}</p></div>
            </div>
            <p className="text-[11px] text-slate-400">A lista já está disponível para seleção no Público → Listas importadas.</p>
          </div>
        )}

        </div>

        <DialogFooter>
          {etapa === 'upload' && <Button variant="outline" onClick={() => handleClose(false)}>Fechar</Button>}
          {etapa === 'revisao' && (
            <>
              <Button variant="outline" onClick={() => { setEtapa('upload'); setArquivo(null); setLinhasTudo([]); setColunas(null); setCidades([]); setCidadesSel(new Set()); setErro(''); }}>Voltar</Button>
              <Button onClick={processar} disabled={!podeConfirmar}>
                Importar {stats.totalRegistros} contatos <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </>
          )}
          {etapa === 'done' && (
            <Button onClick={() => handleClose(false)}><CheckCircle2 className="w-4 h-4 mr-1.5" /> Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2 text-center">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}