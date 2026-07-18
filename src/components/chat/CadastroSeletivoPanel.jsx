import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, Loader2, UserCheck, Users, AlertTriangle } from 'lucide-react';

/**
 * Cadastro Seletivo — permite ao parceiro digitar o nome ou CPF de um cliente
 * ("Cadastre Maria Aparecida" / "Cadastre o CPF 111.111.111-11") e buscar,
 * dentro do histórico autorizado da conversa, APENAS os documentos daquele
 * cliente. Integra com indexarDocumentosConversa (grupos de pessoas) e
 * analisarDocumentosConversa com cliente_alvo (extração filtrada).
 */

const somenteDigitos = (s) => (s || '').toString().replace(/\D/g, '');

const mascararCpf = (d) => {
  const digits = somenteDigitos(d);
  if (digits.length !== 11) return d || '';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
};

const nivelCor = {
  alta: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  media: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  baixa: 'text-red-400 border-red-500/30 bg-red-500/10',
  nao_identificado: 'text-zinc-500 border-zinc-700 bg-zinc-800/40'
};

const nivelLabel = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
  nao_identificado: 'Não identificada'
};

const fmtData = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch { return iso; }
};

export default function CadastroSeletivoPanel({
  conversaId,
  empresaId,
  telefoneConversa,
  documentos /* lista de documentos da conversa (url, tipo, nome) */,
  onResultadoPronto /* callback(dadosAnalise, selecao) -> abre o revisão prévia do cadastro */,
}) {
  const [alvo, setAlvo] = useState('');
  const [processando, setProcessando] = useState(false);
  const [grupos, setGrupos] = useState(null); // grupos retornados da indexação
  const [selecao, setSelecao] = useState(null); // seleção final (encontrado/ambiguidade/vazio)
  const [erro, setErro] = useState('');

  const alvoEhCpf = useMemo(() => {
    const d = somenteDigitos(alvo);
    return d.length === 11;
  }, [alvo]);

  // Etapa 1 — Indexa a conversa (também útil sem alvo para mostrar grupos)
  const indexar = async () => {
    if (!documentos.length) {
      toast.error('Nenhum documento indexado nesta conversa ainda.');
      return null;
    }
    setProcessando(true);
    setErro('');
    try {
      const resp = await base44.functions.invoke('indexarDocumentosConversa', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        forcar_reindexacao: true
      });
      const data = resp.data || resp;
      if (!data?.success) {
        setErro(data?.error || 'Falha ao indexar documentos.');
        return null;
      }
      setGrupos(data.grupos || []);
      return data.grupos || [];
    } catch (e) {
      setErro(e.message || 'Falha ao indexar documentos.');
      return null;
    } finally {
      setProcessando(false);
    }
  };

  // Etapa 2 — Procura o cliente por nome ou CPF dentro dos grupos
  const procurarEAnalisar = async () => {
    if (!alvo.trim()) {
      toast.error('Informe o nome ou CPF do cliente.');
      return;
    }
    setProcessando(true);
    setErro('');
    try {
      // Garante indexação atualizada
      let gs = grupos;
      if (!gs) {
        gs = await indexar();
        if (!gs) {
          setProcessando(false);
          return;
        }
      }

      // Chama o analisarDocumentosConversa com cliente_alvo — internamente ele
      // re-filtra e retorna os dados de cadastro PRÉ-formatados da pessoa alvo.
      const resp = await base44.functions.invoke('analisarDocumentosConversa', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        telefone_conversa: telefoneConversa,
        documentos,
        cliente_alvo: alvo.trim()
      });
      const data = resp.data || resp;

      if (!data?.success) {
        setErro(data?.error || 'Falha na análise seletiva.');
        setProcessando(false);
        return;
      }

      const sel = data.selecao || null;
      setSelecao(sel);

      // Caso A — Nenhum documento correspondente ao alvo
      if (sel && !sel.encontrado && !sel.ambiguidade) {
        setProcessando(false);
        return;
      }

      // Caso B — Ambiguidade (mais de uma pessoa com mesmo nome/CPF parcial)
      if (sel && sel.ambiguidade) {
        setProcessando(false);
        return;
      }

      // Caso C —Selecionou UMA única pessoa com sucesso → agora dispara callback
      if (data?.leitura && sel?.encontrado) {
        if (onResultadoPronto) {
          onResultadoPronto({
            leitura: data.leitura,
            cliente_existente: data.cliente_existente,
            cliente_existente_id: data.cliente_existente_id,
            acao_sugerida: data.acao_sugerida,
            cpf_valido: data.cpf_valido,
            selecao: sel,
            cliente_alvo: alvo.trim()
          });
        }
        setProcessando(false);
        return;
      }

      setProcessando(false);
    } catch (e) {
      setErro(e.message || 'Falha ao procurar cliente.');
      setProcessando(false);
    }
  };

  // Renderiza lista de candidatos ambíguos — usuário pode escolher um explicitamente
  const escolherCandidato = async (candidato) => {
    setAlvo(candidato.cpf || candidato.nome);
    setSelecao(null);
    setProcessando(true);
    setErro('');
    try {
      const resp = await base44.functions.invoke('analisarDocumentosConversa', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        telefone_conversa: telefoneConversa,
        documentos,
        cliente_alvo: candidato.cpf || candidato.nome
      });
      const data = resp.data || resp;
      if (!data?.success) {
        setErro(data?.error || 'Falha na análise seletiva.');
        setProcessando(false);
        return;
      }
      const sel = data.selecao || null;
      setSelecao(sel);
      if (data?.leitura && sel?.encontrado && onResultadoPronto) {
        onResultadoPronto({
          leitura: data.leitura,
          cliente_existente: data.cliente_existente,
          cliente_existente_id: data.cliente_existente_id,
          acao_sugerida: data.acao_sugerida,
          cpf_valido: data.cpf_valido,
          selecao: sel,
          cliente_alvo: candidato.cpf || candidato.nome
        });
      }
      setProcessando(false);
    } catch (e) {
      setErro(e.message || 'Falha ao escolher candidato.');
      setProcessando(false);
    }
  };

  if (!documentos.length) return null;

  return (
    <div className="space-y-3">
      <div className="cs-t">Cadastro seletivo por nome/CPF</div>
      <div className="text-[11px] text-zinc-400 leading-relaxed">
        A Coach IA procurará no histórico da conversa os documentos correspondentes
        a uma <strong className="text-zinc-100">única pessoa</strong> e ignorará os documentos
        de outras pessoas. Use o CPF como identificador principal.
      </div>

      <div className="flex gap-2">
        <input
          value={alvo}
          onChange={(e) => setAlvo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !processando && procurarEAnalisar()}
          placeholder={alvoEhCpf ? 'CPF (somente dígitos)' : 'Nome do cliente (ex.: Maria Aparecida)'}
          className="flex-1 bg-[#0f0f11] border border-zinc-800 rounded-md text-[11px] text-zinc-100 placeholder-zinc-600 px-2.5 py-2 outline-none focus:border-zinc-600"
        />
        <button
          onClick={procurarEAnalisar}
          disabled={processando}
          className="execute-btn"
          style={{ width: 'auto', padding: '0 12px', height: 36 }}
        >
          {processando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          Procurar
        </button>
      </div>

      {/* Prévia de grupos indexados */}
      {grupos && grupos.length > 0 && !selecao && (
        <div className="rounded-lg p-2.5 border border-zinc-800 bg-[#0f0f11]">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Users size={10} /> Documentos indexados ({grupos.length} pessoa(s))
          </div>
          <ul className="text-[11px] text-zinc-300 space-y-1.5">
            {grupos.map((g) => (
              <li key={g.grupo_id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate">
                    {g.nome || <span className="text-zinc-500 italic">Nome não identificado</span>}
                  </div>
                  <div className="text-[9px] text-zinc-500">
                    {g.cpf ? `CPF ${mascararCpf(g.cpf)}` : 'CPF não identificado'}
                    {g.data_nascimento ? ` · Nasc. ${fmtData(g.data_nascimento)}` : ''}
                    {` · ${g.documentos?.length || 0} doc(s)`}
                  </div>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${nivelCor[g.nivel_confianca] || nivelCor.nao_identificado}`}
                >
                  {nivelLabel[g.nivel_confianca] || ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ambiguidade — mais de uma pessoa com mesmo nome/CPF parcial */}
      {selecao?.ambiguidade && (
        <div className="rounded-lg p-3 border border-amber-500/30 bg-amber-500/10 space-y-2">
          <div className="flex items-start gap-2 text-[11px] text-amber-200">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Encontrei mais de uma pessoa com esse nome.</p>
              <p className="text-amber-200/70 mt-0.5">{selecao.motivo}</p>
              <p className="text-amber-200/70">Qual deseja cadastrar?</p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {selecao.candidatos.map((c) => (
              <li key={c.grupo_id}>
                <button
                  onClick={() => escolherCandidato(c)}
                  disabled={processando}
                  className="w-full text-left px-2.5 py-2 rounded-md border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 text-[11px] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="trim text-amber-100 font-medium truncate">
                      {c.nome || 'Nome não identificado'}
                    </div>
                    <div className="text-[9px] text-amber-200/70">
                      {c.cpf ? `CPF ${mascararCpf(c.cpf)}` : 'Sem CPF identificado'}
                      {c.data_nascimento ? ` · Nasc. ${fmtData(c.data_nascimento)}` : ''}
                      {c.primeiro_documento_data ? ` · Doc enviado em ${fmtData(c.primeiro_documento_data)}` : ''}
                      {` · ${c.documentos_count} doc(s)`}
                    </div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${nivelCor[c.nivel_confianca] || nivelCor.nao_identificado}`}>
                    {nivelLabel[c.nivel_confianca] || ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Não encontrado */}
      {selecao && !selecao.encontrado && !selecao.ambiguidade && (
        <div className="rounded-lg p-3 border border-red-500/30 bg-red-500/10 flex items-start gap-2 text-[11px] text-red-300">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <span>{selecao.motivo || 'Não localizei documentos correspondentes ao cliente solicitado.'}</span>
        </div>
      )}

      {/* Encontrado com sucesso antes do callback */}
      {selecao?.encontrado && (
        <div className="rounded-lg p-2.5 border border-emerald-500/30 bg-emerald-500/10 flex items-start gap-2 text-[11px] text-emerald-200">
          <UserCheck size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Cliente localizado: {selecao.grupo_selecionado?.nome || alvo}</p>
            <p className="text-emerald-200/70 mt-0.5">
              {selecao.documentos_selecionados?.length || 0} documento(s) selecionado(s) ·
              {' '}{selecao.documentos_descartados_count} ignorado(s) ·
              {' '}Confiança da seleção: {nivelLabel[selecao.nivel_confianca_selecao] || '—'}.
            </p>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-lg p-2.5 border border-red-500/30 bg-red-500/10 text-[11px] text-red-300">
          {erro}
        </div>
      )}
    </div>
  );
}