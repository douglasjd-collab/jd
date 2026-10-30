import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Bot, BookOpen, Brain, History, Settings, Phone, MessageSquare, Plus, Loader2, X, Save, ShieldCheck, Search, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import VozAgentesConfig from '@/components/configuracoes/VozAgentesConfig';

const TABS = [['agente','Agentes',Bot],['conhecimento','Conhecimento',BookOpen],['memoria','Memória dos clientes',Brain],['aprendizado','Aprendizados',ShieldCheck],['historico','Histórico',History],['configuracao','Configurações',Settings]];
const LABELS = { desativado:'Desativado', pendente:'Aguardando revisão', aprovado:'Aprovado', rejeitado:'Rejeitado', rascunho:'Em acompanhamento', arquivado:'Arquivado' };
const PERMS = { consultar_cliente:'Consultar cliente', registrar_memoria:'Registrar memória', consultar_tabelas:'Consultar tabelas', simular:'Executar simulador', consultar_lances:'Consultar lances', enviar_mensagem:'Enviar mensagens', enviar_video:'Enviar vídeos aprovados', ligar:'Ligar pelo WhatsApp', transferir:'Transferir à equipe' };
const parse = (r) => { try { return JSON.parse(r?.dados_json || '{}'); } catch { return {}; } };
const fmt = (v) => v ? new Date(v).toLocaleString('pt-BR') : '—';
const inputClass = 'w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700';
function Field({ label, children }) { return <label className="block space-y-1.5 text-sm font-medium">{label}{children}</label>; }
function Empty({ children }) { return <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">{children}</div>; }
export default function AgentesIA() {
  const [data, setData] = useState(null);
  const [empresa, setEmpresa] = useState('');
  const [tab, setTab] = useState('agente');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(null);
  const [details, setDetails] = useState(null);
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState([]);
  const [validacao, setValidacao] = useState(null);
  const call = async (args) => (await base44.functions.invoke('gerenciarAgentesIA', { empresa_id: empresa || undefined, ...args })).data;
  const load = async (company = empresa) => {
    setLoading(true); setError('');
    try {
      const res = await call({ acao:'listar', empresa_id:company || undefined });
      setData(res); setEmpresa(res.empresa_id);
    } catch (e) { setError(e?.response?.data?.error || 'Não foi possível carregar o módulo. Tente novamente.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const open = (record, tipo = tab) => {
    setBusca(''); setClientes([]);
    setForm(record ? { ...record, dados:parse(record) } : { tipo, titulo:tipo === 'configuracao' ? 'Operação dos agentes' : '', conteudo:'', origem:'Cadastro manual pelo administrador', dados:{ hora_inicio:8, hora_fim:18, limite_tentativas:4, papel:'qualificador', permissoes:[], confirmacao:'a_confirmar' } });
  };
  const patch = (k,v) => setForm((f) => ({ ...f,[k]:v }));
  const patchData = (k,v) => setForm((f) => ({ ...f,dados:{ ...f.dados,[k]:v } }));
  const perform = async (args) => {
    setBusy(true);
    try { await call(args); toast.success('Alteração salva.'); setForm(null); setDetails(null); await load(); }
    catch (e) { toast.error(e?.response?.data?.error || 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  };
  const save = (e) => {
    e.preventDefault();
    void perform({ acao:'salvar', id:form.id, versao:form.versao, registro:{ tipo:form.tipo,titulo:form.titulo,conteudo:form.conteudo,origem:form.origem,cliente_id:form.cliente_id,dados_json:JSON.stringify(form.dados) } });
  };
  const searchClients = async () => {
    setBusy(true);
    try { const res = await call({ acao:'clientes',busca }); setClientes(res.clientes); if (!res.clientes.length) toast.info('Nenhum cliente encontrado. Tente outro nome ou telefone.'); }
    catch (e) { toast.error(e?.response?.data?.error || 'Falha ao buscar clientes.'); } finally { setBusy(false); }
  };
  const validarOpenAI = async () => {
    setBusy(true);
    try {
      const res = await call({ acao: 'validar_openai' });
      setValidacao(res.resultado);
      if (res.resultado.sucesso) toast.success('Conexão OpenAI validada.');
      else toast.error(res.resultado.mensagem);
      await load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Não foi possível executar o teste.'); }
    finally { setBusy(false); }
  };
  const records = data?.registros || [];
  const testeAtivo = records.some((r) => r.tipo === 'agente' && parse(r).ativo === true);
  const ultimoTeste = validacao || parse(records.find((r) => r.tipo === 'historico' && r.titulo === 'Validação da conexão OpenAI'));
  const visible = records.filter((r) => r.tipo === tab && [r.titulo,r.conteudo,r.cliente_nome].some((s) => String(s || '').toLowerCase().includes(filter.toLowerCase())));
  const config = records.find((r) => r.tipo === 'configuracao');
  const currentHistoryTarget = details?.tipo === 'historico' && records.find((r) => r.id === details.agente_id);
  return <div className="space-y-6">
    <PageHeader title="Agentes de IA" subtitle="Atendimento da JD com treinamento, memória e acompanhamento em um só lugar." />
    <div className="flex flex-wrap items-center gap-3">
      {data?.empresas?.length > 1 && <label className="text-sm">Empresa <select aria-label="Empresa" className={inputClass} value={empresa} disabled={loading || busy} onChange={(e) => { setEmpresa(e.target.value); setForm(null); setDetails(null); setValidacao(null); void load(e.target.value); }}>{data.empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></label>}
      <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">{testeAtivo ? 'Teste ativo • Somente Eduarda' : 'Atendimento automático desativado'}</span>
      <Button variant="outline" size="sm" disabled={loading || busy} onClick={() => load()}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </div>
    {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{error}<Button className="ml-4" variant="outline" onClick={() => load()}>Tentar novamente</Button></div> : loading ? <div className="flex justify-center p-16"><Loader2 className="animate-spin" /></div> : <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Agentes cadastrados',records.filter((r) => r.tipo === 'agente').length],['Memórias de clientes',records.filter((r) => r.tipo === 'memoria').length],['Aprendizados pendentes',records.filter((r) => r.tipo === 'aprendizado' && r.status === 'pendente').length]].map(([label,value]) => <div key={label} className="rounded-xl border bg-white p-4 dark:bg-slate-900"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <div role="tablist" aria-label="Áreas dos agentes" className="flex gap-1 overflow-x-auto border-b pb-2">{TABS.map(([key,label,Icon]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setFilter(''); }} className={'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ' + (tab === key ? 'bg-emerald-100 text-emerald-900' : 'text-slate-500 hover:bg-slate-100')}><Icon className="h-4 w-4" />{label}</button>)}</div>
      {data?.mais_registros && <p className="text-sm text-amber-800">Exibindo os 500 registros mais recentes desta empresa.</p>}
      {tab === 'configuracao' ? <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border bg-white p-6 dark:bg-slate-900"><h2 className="text-lg font-semibold">Conexões e operação</h2><p className="text-sm text-slate-500">OpenAI direta para inteligência. D-API para WhatsApp. O CRM guarda a memória e controla os atendimentos.</p>
          <div className="rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800">Chave OpenAI no servidor: <strong>{data?.integracao?.chave_presente ? 'Presente no servidor' : 'Não configurada'}</strong><p className="mt-2 text-slate-500">A chave deve ser cadastrada nos segredos do servidor como OPENAI_API_KEY_AGENTES. Não cole a chave em treinamentos ou documentos.</p></div>
          <div className="space-y-2"><Button disabled={busy || loading || !data?.integracao?.chave_presente} onClick={validarOpenAI}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Validar conexão OpenAI</Button><p className="text-xs text-slate-500">Gera uma resposta curta com pequeno consumo da sua API. Não envia dados de clientes nem ativa atendimento.</p>{ultimoTeste.testado_em && <div role="status" className={'rounded-lg border p-3 text-sm ' + (ultimoTeste.sucesso ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900')}><strong>{ultimoTeste.sucesso ? 'Último teste aprovado' : 'Último teste não aprovado'}</strong><p>{ultimoTeste.mensagem}</p>{ultimoTeste.resposta && <p className="mt-1">Resposta: {ultimoTeste.resposta}</p>}<p className="mt-1 text-xs">{fmt(ultimoTeste.testado_em)} • {ultimoTeste.modelo} • {ultimoTeste.duracao_ms} ms</p><p className="text-xs">Este teste não consulta o saldo exato nem valida voz ou WhatsApp.</p></div>}</div>
          <p className="text-sm">Voz da IA: <strong>Ponte de áudio pendente de implementação e teste.</strong></p>
          <p className="text-sm">Atendimento automático: <strong>{testeAtivo ? 'Qualificador em teste, somente para Eduarda, por texto.' : 'Desativado. Clique em Desativado no canto do cartão do Qualificador para ativar o teste.'}</strong></p>
          <Button onClick={() => open(config,'configuracao')}>Configurar voz, áudio e operação</Button>
        </section>
        <section className="space-y-3 rounded-xl border bg-white p-6 dark:bg-slate-900"><h2 className="text-lg font-semibold">Regras do coordenador</h2><p className="text-sm">Um responsável por conversa; pausar ao atendimento humano; cancelar tentativas após resposta; respeitar pedidos de interrupção; revisar aprendizados antes do uso geral.</p><p className="text-sm text-slate-500">Essas regras serão aplicadas ao motor de atendimento na próxima etapa. Salvar configurações não inicia mensagens nem chamadas.</p>{config && <p className="text-sm">Horário planejado: {parse(config).hora_inicio}h às {parse(config).hora_fim}h • até {parse(config).limite_tentativas} tentativas por ciclo • horário de Brasília.</p>}</section>
      </div> : <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="relative min-w-60 flex-1 max-w-md"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Pesquisar registros" className={inputClass + ' pl-9'} placeholder="Pesquisar nesta área..." value={filter} onChange={(e) => setFilter(e.target.value)} /></div>{tab !== 'historico' && <Button onClick={() => open(null)}><Plus className="mr-2 h-4 w-4" />{tab === 'agente' ? 'Novo agente' : tab === 'memoria' ? 'Registrar memória' : tab === 'aprendizado' ? 'Sugerir aprendizado' : 'Adicionar conhecimento'}</Button>}</div>
        <p className="text-sm text-slate-500">{tab === 'agente' ? 'Clique no indicador Desativado / Ativo em teste no canto do cartão para alternar. O teste responde apenas à Eduarda (com ou sem o nono dígito), na conexão Douglas | JD Promotora. Áudio e chamadas continuam pendentes.' : tab === 'memoria' ? 'Memória individual vinculada ao cliente. O preenchimento é manual nesta etapa; a extração automática será conectada ao atendimento.' : tab === 'aprendizado' ? 'Registre sugestões e revise antes de incorporá-las. Conversas não alteram o treinamento automaticamente.' : tab === 'historico' ? 'Versões e revisões deste módulo. Mensagens e ligações dos clientes continuam no Bate-Papo.' : 'Cadastre orientações e fontes. Conteúdos novos ou editados aguardam revisão; tabelas e cálculos virão das ferramentas do CRM.'}</p>
        {!visible.length ? <Empty>{tab === 'agente' ? 'Nenhum agente cadastrado para esta empresa.' : 'Nenhum registro encontrado nesta área.'}</Empty> : <div className={'grid gap-4 ' + (tab === 'agente' ? 'xl:grid-cols-3' : 'md:grid-cols-2')}>{visible.map((r) => <article key={r.id} className="flex flex-col gap-3 rounded-xl border bg-white p-5 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><h2 className="font-semibold">{r.titulo}</h2>{r.tipo === 'agente' ? <button type="button" role="switch" aria-checked={Boolean(parse(r).ativo)} aria-label={(parse(r).ativo ? 'Desativar ' : 'Ativar ') + r.titulo} disabled={busy || (!parse(r).ativo && parse(r).papel !== 'qualificador')} title={parse(r).ativo ? 'Clique para desativar' : parse(r).papel === 'qualificador' ? 'Clique para ativar o teste restrito à Eduarda' : 'Este agente ainda está em preparação'} onClick={() => perform({ acao:'alternar_agente',id:r.id,versao:r.versao,ativo:!parse(r).ativo })} className={'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ' + (parse(r).ativo ? 'border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200')}>{busy && <Loader2 className="h-3 w-3 animate-spin" />}{parse(r).ativo ? 'Ativo em teste' : 'Desativado'}</button> : <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{LABELS[r.status] || r.status}</span>}</div>{r.cliente_nome && <p className="text-sm font-medium text-emerald-700">{r.cliente_nome}</p>}{tab === 'agente' && <div className="flex gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />WhatsApp</span><span className="flex items-center gap-1"><Phone className="h-3 w-3" />Áudio e chamadas planejados</span></div>}<p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{r.conteudo}</p><p className="mt-auto text-xs text-slate-400">Versão {r.versao || 1} • {fmt(r.updated_date || r.created_date)}</p><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setDetails(r)}>Detalhes</Button>{tab !== 'historico' && <Button variant="outline" size="sm" onClick={() => open(r)}>{tab === 'agente' ? 'Treinamento e permissões' : 'Editar'}</Button>}{['conhecimento','aprendizado'].includes(tab) && r.status === 'pendente' && <><Button size="sm" disabled={busy} onClick={() => perform({ acao:'revisar',id:r.id,versao:r.versao,status:'aprovado',registro:r })}>Aprovar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => perform({ acao:'revisar',id:r.id,versao:r.versao,status:'rejeitado',registro:r })}>Rejeitar</Button></>}</div></article>)}</div>}
      </>}
    </>}
    {form && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3"><section role="dialog" aria-modal="true" aria-labelledby="ia-editor-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900"><header className="flex items-center justify-between border-b p-5"><h2 id="ia-editor-title" className="text-lg font-semibold">{form.id ? 'Editar' : 'Cadastrar'} • {TABS.find((t) => t[0] === form.tipo)?.[1]}</h2><Button variant="ghost" size="icon" aria-label="Fechar editor" disabled={busy} onClick={() => setForm(null)}><X className="h-5 w-5" /></Button></header><form onSubmit={save} className="space-y-4 overflow-y-auto p-5">
      <Field label="Nome / título"><input required maxLength={180} className={inputClass} value={form.titulo} onChange={(e) => patch('titulo',e.target.value)} /></Field>
      {form.tipo === 'agente' && <><Field label="Função"><select className={inputClass} value={form.dados.papel} onChange={(e) => patchData('papel',e.target.value)}><option value="qualificador">Qualificador</option><option value="vendedor">Vendedor</option><option value="follow_up">Follow-up com mensagens e voz</option></select></Field><Field label="Conexão de WhatsApp planejada"><select className={inputClass} value={form.dados.connection_id || ''} onChange={(e) => patchData('connection_id',e.target.value)}><option value="">Selecionar depois</option>{data.conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome} • {c.status || 'Estado não informado'}</option>)}</select></Field><fieldset className="rounded-lg border p-3"><legend className="px-1 text-sm font-medium">Permissões planejadas</legend><div className="grid gap-2 sm:grid-cols-2">{Object.entries(PERMS).map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={(form.dados.permissoes || []).includes(key)} onChange={(e) => patchData('permissoes',e.target.checked ? [...(form.dados.permissoes || []),key] : (form.dados.permissoes || []).filter((p) => p !== key))} />{label}</label>)}</div></fieldset></>}
      {form.tipo === 'memoria' && <><Field label="Vincular ao cliente"><div className="flex gap-2"><input className={inputClass} placeholder="Nome ou telefone (mínimo 2 caracteres)" value={busca} onChange={(e) => setBusca(e.target.value)} /><Button type="button" variant="outline" disabled={busy || busca.trim().length < 2} onClick={searchClients}>Buscar</Button></div></Field>{clientes.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border">{clientes.map((c) => <button type="button" key={c.id} className="block w-full p-2 text-left text-sm hover:bg-emerald-50" onClick={() => setForm((f) => ({ ...f,cliente_id:c.id,cliente_nome:c.nome }))}>{c.nome} • {c.telefone}</button>)}</div>}<p className="text-sm">Cliente selecionado: <strong>{form.cliente_nome || 'Nenhum'}</strong></p><div className="grid gap-3 sm:grid-cols-2">{[['objetivo','Objetivo / veículo'],['urgencia','Urgência / prazo'],['recursos','Recursos próprios e disponibilidade'],['parcela','Parcela confortável'],['negociacao','Negociação / referência'],['proxima_acao','Próxima ação e data']].map(([k,label]) => <Field key={k} label={label}><input className={inputClass} value={form.dados[k] || ''} onChange={(e) => patchData(k,e.target.value)} /></Field>)}</div><Field label="Situação da informação"><select className={inputClass} value={form.dados.confirmacao || 'a_confirmar'} onChange={(e) => patchData('confirmacao',e.target.value)}><option value="a_confirmar">A confirmar</option><option value="confirmado">Confirmado pelo cliente</option><option value="antigo">Antigo — revisar antes de usar</option></select></Field></>}
      {form.tipo === 'configuracao' ? <><VozAgentesConfig dados={form.dados} onChange={patchData} /><div className="grid grid-cols-3 gap-3">{[['hora_inicio','Início (0–23h)',0,23],['hora_fim','Fim (0–23h)',0,23],['limite_tentativas','Tentativas por ciclo',1,10]].map(([k,label,min,max]) => <Field key={k} label={label}><input type="number" required min={min} max={max} className={inputClass} value={form.dados[k]} onChange={(e) => patchData(k,Number(e.target.value))} /></Field>)}</div><p className="text-sm text-slate-500">Horário de Brasília. Pausa por atendimento humano e revisão de aprendizados serão obrigatórias. O motor de execução será conectado na próxima etapa.</p></> : <Field label={form.tipo === 'agente' ? 'Treinamento base e critérios de transferência' : form.tipo === 'memoria' ? 'Resumo do atendimento / dúvidas e objeções' : 'Conteúdo'}><textarea required rows={9} maxLength={30000} className={inputClass} value={form.conteudo} onChange={(e) => patch('conteudo',e.target.value)} /></Field>}
      <Field label="Origem / referência (documento, conversa ou orientação)"><input maxLength={600} className={inputClass} value={form.origem || ''} onChange={(e) => patch('origem',e.target.value)} /></Field>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Clique no indicador Desativado / Ativo em teste no canto do cartão para controlar o atendimento. Salvar treinamento não amplia o público do teste nem habilita áudio ou chamadas. Alterações no conhecimento voltam para revisão.</p><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>Cancelar</Button><Button type="submit" disabled={busy || (form.tipo === 'memoria' && !form.cliente_id)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar</Button></div>
    </form></section></div>}
    {details && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3"><section role="dialog" aria-modal="true" aria-labelledby="ia-details-title" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><h2 id="ia-details-title" className="text-lg font-semibold">{details.titulo}</h2><Button variant="ghost" size="icon" aria-label="Fechar detalhes" onClick={() => setDetails(null)}><X className="h-5 w-5" /></Button></div><p className="mt-2 text-xs text-slate-500">{details.autor_nome || 'Sistema'} • {fmt(details.updated_date || details.created_date)} • Versão {details.versao}</p><p className="mt-4 whitespace-pre-wrap text-sm">{details.conteudo}</p>{details.origem && <p className="mt-4 text-sm text-slate-500">Origem: {details.origem}</p>}{details.tipo === 'historico' ? <><h3 className="mt-4 font-medium">Registro da versão</h3><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">{JSON.stringify(parse(details),null,2)}</pre>{currentHistoryTarget && parse(details).anterior && <Button className="mt-4" disabled={busy} onClick={() => { if (window.confirm('Restaurar este conteúdo? A versão atual ficará no histórico e o registro continuará sem ativação automática.')) void perform({ acao:'restaurar',id:currentHistoryTarget.id,versao:currentHistoryTarget.versao,historico_id:details.id }); }}><ArrowLeft className="mr-2 h-4 w-4" />Restaurar conteúdo anterior</Button>}</> : <dl className="mt-4 space-y-2 text-sm">{Object.entries(parse(details)).filter(([k]) => k !== 'ativo').map(([k,v]) => <div key={k}><dt className="font-medium">{k.replaceAll('_',' ')}</dt><dd className="whitespace-pre-wrap text-slate-500">{Array.isArray(v) ? v.map((p) => PERMS[p] || p).join(', ') : String(v)}</dd></div>)}</dl>}</section></div>}
  </div>;
}
