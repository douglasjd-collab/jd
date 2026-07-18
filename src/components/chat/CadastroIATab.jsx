import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Loader2, Sparkles, FileText, ImageIcon, AlertTriangle, UserPlus,
  UserCheck, X, CheckCircle2, FileWarning, Send, RefreshCw
} from 'lucide-react';
import CadastroSeletivoPanel from './CadastroSeletivoPanel';

const CAMPOS = [
  { id: 'nome_completo', label: 'Nome completo', grupo: 'pessoais', principal: true },
  { id: 'cpf', label: 'CPF', grupo: 'pessoais', principal: true },
  { id: 'data_nascimento', label: 'Data de nascimento', grupo: 'pessoais', principal: true },
  { id: 'nome_mae', label: 'Nome da mãe', grupo: 'pessoais' },
  { id: 'nome_pai', label: 'Nome do pai', grupo: 'pessoais' },
  { id: 'rg', label: 'RG / documento', grupo: 'pessoais', principal: true },
  { id: 'data_emissao', label: 'Data de emissão', grupo: 'pessoais' },
  { id: 'orgao_emissor', label: 'Órgão emissor', grupo: 'pessoais' },
  { id: 'uf_emissor', label: 'UF emissor', grupo: 'pessoais' },
  { id: 'sexo', label: 'Sexo', grupo: 'pessoais' },
  { id: 'naturalidade', label: 'Naturalidade', grupo: 'pessoais' },
  { id: 'nacionalidade', label: 'Nacionalidade', grupo: 'pessoais' },
  { id: 'estado_civil', label: 'Estado civil', grupo: 'pessoais' },
  { id: 'profissao', label: 'Profissão', grupo: 'pessoais' },
  { id: 'endereco_cep', label: 'CEP', grupo: 'endereco', principal: true },
  { id: 'endereco_logradouro', label: 'Logradouro', grupo: 'endereco', principal: true },
  { id: 'endereco_numero', label: 'Número', grupo: 'endereco', principal: true },
  { id: 'endereco_complemento', label: 'Complemento', grupo: 'endereco' },
  { id: 'endereco_bairro', label: 'Bairro', grupo: 'endereco', principal: true },
  { id: 'endereco_cidade', label: 'Cidade', grupo: 'endereco', principal: true },
  { id: 'endereco_estado', label: 'UF', grupo: 'endereco', principal: true },
  { id: 'telefone', label: 'Telefone', grupo: 'contato', principal: true },
  { id: 'email', label: 'E-mail', grupo: 'contato' }
];

const CONFIANCA = {
  alta: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Alta' },
  media: { border: 'border-amber-500/30', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400', label: 'Média' },
  baixa: { border: 'border-red-500/30', bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', label: 'Baixa' },
  nao_identificado: { border: 'border-zinc-700/60', bg: 'bg-zinc-700/10', text: 'text-zinc-500', dot: 'bg-zinc-600', label: 'Não ident.' }
};

const valorDe = (lid, id) => {
  if (!lid) return '';
  if (id.startsWith('endereco_')) return lid.endereco?.[id.replace('endereco_', '')] || '';
  if (id === 'telefone' || id === 'email') return lid.contato?.[id]?.valor || '';
  return lid.dados_pessoais?.[id]?.valor || '';
};

const confiancaDe = (lid, id) => {
  if (!lid) return null;
  if (id.startsWith('endereco_')) return null;
  if (id === 'telefone' || id === 'email') return lid.contato?.[id]?.confianca || null;
  return lid.dados_pessoais?.[id]?.confianca || null;
};

export default function CadastroIATab({ conversaId, mensagens, empresaId, telefoneConversa, onEnviarMensagem }) {
  const [status, setStatus] = useState('idle');
  const [resultado, setResultado] = useState(null);
  const [form, setForm] = useState({});
  const [jaAnalisou, setJaAnalisou] = useState(null);
  // Cadastro Seletivo — guarda a seleção (cliente_alvo + documentos selecionados) para passar ao confirmar.
  const [clienteAlvo, setClienteAlvo] = useState('');
  const [ultimaSelecao, setUltimaSelecao] = useState(null);

  const documentos = useMemo(() => {
    if (!Array.isArray(mensagens)) return [];
    return mensagens
      .filter((m) => m.arquivo_url && ['imagem', 'pdf', 'documento'].includes(m.tipo_conteudo))
      .map((m) => ({ url: m.arquivo_url, tipo: m.tipo_conteudo, nome: m.arquivo_nome || '' }))
      .slice(-10);
  }, [mensagens]);

  // Análise automática: dispara quando chega documento novo e ainda não analisamos
  useEffect(() => {
    if (!documentos.length) return;
    // Chave de controle = último arquivo analisado
    const ultimaUrl = documentos[documentos.length - 1]?.url;
    if (status === 'idle' && ultimaUrl && jaAnalisou !== ultimaUrl) {
      setJaAnalisou(ultimaUrl);
      analisar();
    }
  }, [documentos]);

  // Lembrete de cadastro quando todos os campos principais já foram extraídos
  const cadastroPronto = useMemo(() => {
    if (!resultado?.leitura || status !== 'review') return false;
    const principais = CAMPOS.filter((c) => c.principal);
    return principais.every((c) => {
      const v = valorDe(resultado.leitura, c.id);
      return String(v || '').trim() !== '';
    });
  }, [resultado, status]);

  const analisar = async () => {
    if (!documentos.length) {
      toast.error('Nenhum documento encontrado nesta conversa.');
      return;
    }
    setStatus('analyzing');
    try {
      const resp = await base44.functions.invoke('analisarDocumentosConversa', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        telefone_conversa: telefoneConversa,
        documentos
      });
      const data = resp.data || {};
      if (!data.success) {
        toast.error(data.error || 'Erro na análise de documentos');
        setStatus('idle');
        return;
      }
      const inicial = {};
      CAMPOS.forEach((c) => { inicial[c.id] = valorDe(data.leitura, c.id); });
      setForm(inicial);
      setResultado(data);
      setStatus('review');
      toast.success('Análise concluída. Revise os dados antes de cadastrar.');
    } catch (e) {
      toast.error('Erro: ' + (e.message || 'Falha na análise'));
      setStatus('idle');
    }
  };

  // Recebe o resultado da análise seletiva (somente documentos do cliente-alvo)
  // e popula o formulário de revisão, mantendo a seleção/auditoria em estado.
  const onResultadoSeletivo = (dadosAnalise) => {
    const inicial = {};
    CAMPOS.forEach((c) => { inicial[c.id] = valorDe(dadosAnalise.leitura, c.id); });
    setForm(inicial);
    setResultado(dadosAnalise);
    setClienteAlvo(dadosAnalise.cliente_alvo || '');
    setUltimaSelecao(dadosAnalise.selecao || null);
    setStatus('review');
    const nome = dadosAnalise.selecao?.grupo_selecionado?.nome || dadosAnalise.cliente_alvo || '';
    toast.success(`Documento(s) de ${nome} preparado(s) para revisão.`);
  };

  const setCampo = (id, v) => setForm((p) => ({ ...p, [id]: v }));

  const confirmar = async () => {
    const faltando = CAMPOS.filter((c) => c.principal && !String(form[c.id] || '').trim());
    if (faltando.length > 0) {
      const ok = window.confirm(`Faltam campos principais: ${faltando.map((f) => f.label).join(', ')}. Deseja cadastrar mesmo assim incompleto?`);
      if (!ok) return;
    }
    setStatus('saving');
    try {
      // Se a operação veio do cadastro seletivo, repassamos cliente_alvo + seleção
      // para que a auditoria registre corretamente os documentos usados/descartados.
      const documentosUrls = ultimaSelecao && Array.isArray(ultimaSelecao.documentos_selecionados)
        ? ultimaSelecao.documentos_selecionados
        : documentos.map((d) => d.url);

      const resp = await base44.functions.invoke('confirmarCadastroCliente', {
        conversa_id: conversaId,
        empresa_id: empresaId,
        dados: form,
        acao: resultado?.acao_sugerida === 'atualizar' && resultado?.cliente_existente_id ? 'atualizar' : 'criar',
        cliente_existente_id: resultado?.cliente_existente_id,
        documentos_urls: documentosUrls,
        cliente_alvo: clienteAlvo || undefined,
        selecao: ultimaSelecao || undefined
      });
      const data = resp.data || {};
      if (!data.success) {
        if (data.cliente_existente_id) {
          setResultado((r) => ({
            ...(r || {}),
            cliente_existente_id: data.cliente_existente_id,
            cliente_existente: data.cliente_existente,
            acao_sugerida: 'atualizar'
          }));
          toast.error(data.error + ' Abrindo comparação com o cadastro existente.');
        } else {
          toast.error(data.error || 'Falha ao salvar');
        }
        setStatus('review');
        return;
      }
      setStatus('done');
      setResultado((r) => ({ ...(r || {}), cliente_id: data.cliente_id, mensagem_salvo: data.mensagem }));
      // Limpa os dados de seleção após salvar — auditoria já foi persistida.
      setUltimaSelecao(null);
      setClienteAlvo('');
      toast.success(data.mensagem);
    } catch (e) {
      toast.error('Erro: ' + (e.message || 'Falha ao salvar'));
      setStatus('review');
    }
  };

  const pedirDocumento = () => {
    const primeiroNome = (form.nome_completo || '').split(' ')[0] || 'tudo bem';
    const msg = `Olá, ${primeiroNome}! Para concluir seu cadastro, preciso que envie uma foto nítida do documento de identidade (frente e verso separadamente) e o comprovante de residência atual, mostrando todos os cantos e sem reflexos. Obrigado!`;
    if (onEnviarMensagem) {
      onEnviarMensagem(msg);
      toast.success('Mensagem preparada e enviada para confirmação.');
    } else {
      navigator.clipboard?.writeText(msg).catch(() => {});
      toast.success('Mensagem copiada.');
    }
  };

  if (!documentos.length) {
    return (
      <div className="space-y-3">
        <div className="cs-t">Cadastro IA</div>
        <div className="text-[11px] text-zinc-400 leading-relaxed">
          Nenhum documento (imagem ou PDF) foi identificado nesta conversa. Solicite o RG/CNH e o comprovante de endereço do cliente para iniciar o cadastro automático.
        </div>
        <button onClick={pedirDocumento} className="cad-btn"><Send size={11} /> Solicitar documentos ao cliente</button>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className="space-y-3">
        <CadastroSeletivoPanel
          conversaId={conversaId}
          empresaId={empresaId}
          telefoneConversa={telefoneConversa}
          documentos={documentos}
          onResultadoPronto={onResultadoSeletivo}
        />
        <div className="cs-t">Cadastro IA · {documentos.length} arquivo(s) na conversa</div>
        <div className="text-[11px] text-zinc-300 leading-relaxed">
          Encontrei <strong className="text-zinc-100">{documentos.length} documento(s)</strong> pessoal(is) nesta conversa. Deseja analisar os arquivos e preparar o cadastro do cliente?
        </div>

        <div className="grid grid-cols-2 gap-2">
          {documentos.slice(0, 6).map((d, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-[#0f0f11] border border-zinc-800 rounded-md text-[10px] text-zinc-400 truncate">
              {d.tipo === 'pdf' ? <FileText className="w-3 h-3 text-zinc-500 shrink-0" /> : <ImageIcon className="w-3 h-3 text-zinc-500 shrink-0" />}
              <span className="truncate">{d.nome || `Arquivo ${i + 1}`}</span>
            </div>
          ))}
        </div>

        <button onClick={analisar} className="execute-btn" style={{ marginTop: 4 }}>
          <Sparkles size={13} /> Analisar documentos
        </button>
        <button onClick={pedirDocumento} className="cad-btn"><Send size={11} /> Solicitar mais documentos</button>
      </div>
    );
  }

  if (status === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="spinner" />
        <span className="text-[11px] text-zinc-500">Lendo documentos e extraindo dados…</span>
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="space-y-3 text-center py-6">
        <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
        <div className="text-sm text-zinc-200 font-medium">Cliente salvo</div>
        <div className="text-[11px] text-zinc-400 leading-relaxed px-4">
          {resultado?.mensagem_salvo || 'Operação concluída.'}
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <button onClick={() => setStatus('review')} className="cad-btn" style={{ width: 'auto', padding: '0 12px' }}>Revisar novamente</button>
          <button onClick={() => { setStatus('idle'); setResultado(null); }} className="cad-btn" style={{ width: 'auto', padding: '0 12px' }}>Concluir</button>
        </div>
      </div>
    );
  }

  // Review
  const lid = resultado?.leitura || {};
  const clienteExistente = resultado?.cliente_existente;
  const temCpf = Boolean(lid.dados_pessoais?.cpf?.valor);
  const cpfValido = temCpf && lid.dados_pessoais?.cpf?.valido !== false;
  const documentosIlegiveis = (lid.documentos || []).filter((d) => d.legivel === false);

  const renderCampos = (grupo) =>
    CAMPOS.filter((c) => c.grupo === grupo).map((c) => {
      const conf = confiancaDe(lid, c.id);
      const cor = CONFIANCA[conf] || CONFIANCA.nao_identificado;
      return (
        <div key={c.id} className={`rounded-md border p-2 ${cor.border} ${cor.bg}`}>
          <div className="flex items-center justify-between mb-1 gap-1">
            <span className="text-[10px] text-zinc-400 leading-tight">
              {c.label}
              {c.principal && <span className="text-red-400"> *</span>}
            </span>
            {conf && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${cor.border} ${cor.bg} ${cor.text} flex items-center gap-1 shrink-0`}>
                <span className={`w-1 h-1 rounded-full ${cor.dot}`} /> {cor.label}
              </span>
            )}
          </div>
          <input
            value={form[c.id] || ''}
            onChange={(e) => setCampo(c.id, e.target.value)}
            placeholder="Não identificado"
            className="w-full bg-transparent border-none outline-none text-[11px] text-zinc-100 placeholder-zinc-600"
          />
        </div>
      );
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="cs-t" style={{ marginBottom: 0 }}>Revisar cadastro</div>
        <button onClick={() => { setStatus('idle'); setResultado(null); }} className="text-[10px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
          <X size={11} /> Cancelar
        </button>
      </div>

      {clienteExistente && (
        <div className="rounded-lg p-3 border border-blue-500/30 bg-blue-500/10">
          <div className="flex items-start gap-2 text-[11px]">
            <UserCheck size={14} className="text-blue-400 mt-0.5 shrink-0" />
            <div className="text-blue-200">
              <p className="font-medium">Cliente já cadastrado</p>
              <p className="text-blue-200/70 mt-0.5">
                Localizei <strong>{clienteExistente.nome_completo || 'cliente'}</strong> com CPF/telefone coincidente. As informações novas podem atualizar o cadastro já existente.
              </p>
            </div>
          </div>
        </div>
      )}

      {temCpf && !cpfValido && (
        <div className="rounded-lg p-2.5 border border-red-500/30 bg-red-500/10 text-[11px] text-red-300 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <span>O CPF identificado não passou na validação. Confira o documento antes de continuar.</span>
        </div>
      )}

      {documentosIlegiveis.length > 0 && (
        <div className="rounded-lg p-2.5 border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300 flex items-start gap-2">
          <FileWarning size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p>Alguns documentos estão ilegíveis. Campos de baixa confiança podem precisar de nova imagem.</p>
            <button onClick={pedirDocumento} className="mt-1.5 text-amber-300 underline">Solicitar nova imagem</button>
          </div>
        </div>
      )}

      <div>
        <div className="cs-t">Dados pessoais</div>
        <div className="grid grid-cols-2 gap-1.5">{renderCampos('pessoais')}</div>
      </div>

      {cadastroPronto && (
        <div className="rounded-lg p-3 border border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-200 flex items-start gap-2 animate-pulse">
          <Sparkles size={14} className="text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Tudo pronto para cadastrar!</p>
            <p className="text-emerald-200/70 mt-0.5">Todos os campos principais foram identificados. Deseja cadastrar este cliente agora?</p>
          </div>
        </div>
      )}

      <div>
        <div className="cs-t">Endereço</div>
        <div className="grid grid-cols-2 gap-1.5">{renderCampos('endereco')}</div>
      </div>

      <div>
        <div className="cs-t">Contato e complementares</div>
        <div className="grid grid-cols-2 gap-1.5">{renderCampos('contato')}</div>
      </div>

      {lid.campos_pendentes?.length > 0 && (
        <div className="rounded-md p-2.5 bg-zinc-900 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Campos pendentes</div>
          <ul className="text-[11px] text-zinc-400 list-disc pl-4 space-y-0.5">
            {lid.campos_pendentes.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {lid.divergencias?.length > 0 && (
        <div className="rounded-md p-2.5 bg-zinc-900 border border-amber-500/20">
          <div className="text-[10px] text-amber-400 uppercase tracking-wider mb-1">Divergências</div>
          <ul className="text-[11px] text-amber-200/80 list-disc pl-4 space-y-0.5">
            {lid.divergencias.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="rounded-lg p-2.5 border border-amber-500/20 bg-amber-500/5 text-[10px] text-amber-300/80 leading-relaxed">
        <AlertTriangle size={11} className="inline mr-1 align-middle" />
        A IA não cadastra nada automaticamente. Revise os campos (destaque vermelho = baixa confiança) e confirme para salvar. Nenhum dado será apagado do cadastro existente sem seleção explícita.
      </div>

      <div className="grid grid-cols-2 gap-2 pt-1">
        <button onClick={pedirDocumento} className="sb"><Send size={11} /> Solicitar documentos</button>
        <button onClick={() => { setStatus('idle'); setResultado(null); }} className="sb"><X size={11} /> Cancelar</button>
      </div>
      <button onClick={confirmar} disabled={status === 'saving'} className="execute-btn">
        {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
        {clienteExistente ? 'Atualizar cadastro' : 'Confirmar e cadastrar'}
      </button>

      <button onClick={analisar} disabled={status === 'saving'} className="w-full h-7 text-[10px] rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:bg-zinc-800 flex items-center justify-center gap-1.5">
        <RefreshCw size={11} /> Reanalisar documentos
      </button>
    </div>
  );
}