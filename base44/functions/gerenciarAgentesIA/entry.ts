import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Administração apenas. Nenhuma ação deste módulo envia mensagens, liga ou chama LLMs.
const ADM = ['master', 'super_admin', 'admin'];
const TYPES = ['agente', 'conhecimento', 'memoria', 'aprendizado', 'historico', 'configuracao'];
const text = (v: unknown, n = 30000) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const fail = (m: string, s = 400) => Response.json({ error: m }, { status: s });
Deno.serve(async (req) => {
  try {
    const api = createClientFromRequest(req);
    const me = await api.auth.me();
    if (!me) return fail('Entre no CRM para continuar.', 401);
    const db = api.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const members = await db.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 100);
    const global = ['master', 'super_admin'].includes(me.perfil) || ['master', 'super_admin'].includes(me.role) ||
      members.some((m: any) => ['master', 'super_admin'].includes(m.perfil));
    const permitted = members.filter((m: any) => ADM.includes(m.perfil) && m.empresa_id);
    if (!global && !permitted.length) return fail('Acesso exclusivo de administradores.', 403);
    const companyRecords = global ? await db.Empresa.list('nome', 100) : [];
    const empresas = global ? companyRecords.map((e: any) => ({ id: e.id, nome: e.nome_fantasia || e.nome })) :
      [...new Map(permitted.map((m: any) => [m.empresa_id, { id: m.empresa_id, nome: m.empresa_nome || 'Empresa' }])).values()];
    const requested = text(body.empresa_id, 100);
    const empresa = requested || permitted.find((m: any) => m.empresa_id === me.empresa_id)?.empresa_id ||
      permitted[0]?.empresa_id || empresas.find((e: any) => /promotora/i.test(e.nome) && /j\s*d/i.test(e.nome))?.id || empresas[0]?.id;
    if (!empresa || !empresas.some((e: any) => e.id === empresa)) return fail('Selecione uma empresa autorizada.', 403);
    const records = db.AgenteIARegistro;
    const action = body.acao || 'listar';
    if (action === 'listar') {
      const all = await records.filter({ empresa_id: empresa }, '-updated_date', 501);
      const cons = await db.WhatsappConnection.filter({ empresa_id: empresa, provider_type: 'dapi', is_active: true }, '-created_date', 100);
      return Response.json({ empresa_id: empresa, empresas, registros: all.slice(0, 500), mais_registros: all.length > 500,
        conexoes: cons.map((c: any) => ({ id: c.id, nome: c.nome || c.session_id || 'WhatsApp', status: c.status })),
        integracao: { chave_presente: Boolean(Deno.env.get('OPENAI_API_KEY_AGENTES')), atendimento_automatico: false, voz_pronta: false } });
    }
    if (action === 'clientes') {
      const q = text(body.busca, 80);
      if (q.length < 2) return Response.json({ clientes: [] });
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const found = await db.Cliente.filter({ empresa_id: empresa, $or: [{ nome: { $regex: safe, $options: 'i' } }, { telefone: { $regex: safe, $options: 'i' } }] }, '-updated_date', 20);
      return Response.json({ clientes: found.map((c: any) => ({ id: c.id, nome: c.nome || c.razao_social || 'Cliente', telefone: c.telefone || '' })) });
    }
    if (action !== 'salvar' && action !== 'revisar' && action !== 'restaurar') return fail('Ação inválida.');
    const id = text(body.id, 100);
    const old = id ? await records.get(id) : null;
    if (id && (!old || old.empresa_id !== empresa)) return fail('Registro não autorizado.', 403);
    if (old && Number(body.versao) !== Number(old.versao || 1)) return fail('Este registro mudou. Atualize a página antes de salvar.', 409);
    let source = body.registro || {};
    if (action === 'restaurar') {
      if (!old || old.tipo === 'historico') return fail('Registro inválido para restauração.');
      const h = await records.get(text(body.historico_id, 100));
      if (h.empresa_id !== empresa || h.tipo !== 'historico' || h.agente_id !== old.id) return fail('Versão não autorizada.', 403);
      source = JSON.parse(h.dados_json || '{}').anterior;
      if (!source) return fail('Esta versão não possui conteúdo restaurável.');
    }
    const tipo = old?.tipo || text(source.tipo, 30);
    if (!TYPES.includes(tipo) || tipo === 'historico') return fail('Tipo inválido.');
    let dados;
    try { dados = JSON.parse(source.dados_json || '{}'); } catch { return fail('Configuração inválida.'); }
    if (!dados || Array.isArray(dados) || typeof dados !== 'object') return fail('Configuração inválida.');
    // Configurações são sempre preparatórias, sem ativação operacional nesta fase.
    dados.ativo = false;
    if (tipo === 'agente') {
      if (!['qualificador', 'vendedor', 'follow_up'].includes(dados.papel)) return fail('Selecione uma função válida.');
      dados.permissoes = Array.isArray(dados.permissoes) ? dados.permissoes.filter((p: string) => ['consultar_cliente','registrar_memoria','consultar_tabelas','simular','consultar_lances','enviar_mensagem','enviar_video','ligar','transferir'].includes(p)) : [];
    }
    if (tipo === 'configuracao') {
      dados.hora_inicio = Number(dados.hora_inicio ?? 8); dados.hora_fim = Number(dados.hora_fim ?? 18);
      dados.limite_tentativas = Number(dados.limite_tentativas ?? 4);
      if (![dados.hora_inicio, dados.hora_fim, dados.limite_tentativas].every(Number.isInteger) ||
        dados.hora_inicio < 0 || dados.hora_fim > 23 || dados.hora_inicio >= dados.hora_fim ||
        dados.limite_tentativas < 1 || dados.limite_tentativas > 10) return fail('Revise horários e limite de tentativas.');
      dados.pausar_ao_humano = true; dados.aprovar_aprendizado = true;
    }
    if (dados.connection_id) {
      const c = await db.WhatsappConnection.get(dados.connection_id);
      if (c.empresa_id !== empresa || c.provider_type !== 'dapi') return fail('Conexão não autorizada.', 403);
    }
    let clienteNome = '';
    const clienteId = text(source.cliente_id || old?.cliente_id, 100);
    if (tipo === 'memoria') {
      if (!clienteId) return fail('Vincule a memória a um cliente cadastrado.');
      const c = await db.Cliente.get(clienteId);
      if (c.empresa_id !== empresa) return fail('Cliente não autorizado.', 403);
      clienteNome = c.nome || c.razao_social || 'Cliente';
    }
    const titulo = text(source.titulo || old?.titulo, 180);
    if (!titulo) return fail('Informe um título.');
    const conteudo = text(source.conteudo ?? old?.conteudo);
    if (tipo !== 'configuracao' && !conteudo) return fail('Informe o conteúdo.');
    if (/sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(conteudo) || /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(JSON.stringify(dados))) return fail('Não salve chaves de API nos registros. Use os segredos do servidor.');
    let status = tipo === 'agente' || tipo === 'configuracao' ? 'desativado' : tipo === 'memoria' ? 'rascunho' : 'pendente';
    if (action === 'revisar') {
      if (!old || !['aprendizado','conhecimento'].includes(tipo) || !['aprovado','rejeitado','arquivado'].includes(body.status)) return fail('Revisão inválida.');
      status = body.status;
    }
    const clean = { empresa_id: empresa, tipo, titulo, conteudo, status, cliente_id: clienteId, cliente_nome: clienteNome,
      origem: text(source.origem || old?.origem, 600), versao: Number(old?.versao || 0) + 1,
      dados_json: JSON.stringify(dados), autor_id: me.id, autor_nome: me.full_name || me.email };
    // Snapshot imutável antes da alteração. Uma revisão nunca apaga a versão anterior.
    await records.create({ empresa_id: empresa, tipo: 'historico', titulo: (old ? 'Atualização: ' : 'Criação: ') + titulo,
      conteudo: action === 'revisar' ? 'Revisão: ' + status : action === 'restaurar' ? 'Versão anterior restaurada' : 'Configuração salva',
      status: 'aprovado', agente_id: old?.id || '', versao: clean.versao,
      dados_json: JSON.stringify({ anterior: old, seguinte: clean }), autor_id: me.id, autor_nome: me.full_name || me.email });
    const saved = old ? await records.update(old.id, clean) : await records.create(clean);
    return Response.json({ success: true, registro: saved });
  } catch (e) {
    console.error('Agentes IA: falha na operação', e?.status || '');
    return fail('Não foi possível concluir. Verifique sua sessão e tente novamente.', 500);
  }
});
