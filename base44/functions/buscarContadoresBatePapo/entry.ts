import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { empresa_id, responsavel_id } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id },
      '-data_ultima_mensagem',
      10000
    );
    const agora = Date.now();
    const grupo = c => String(c.cliente_telefone || '').includes('@g.us') || String(c.whatsapp_id || '').includes('@g.us') || String(c.cliente_telefone || '').includes('@broadcast') || String(c.whatsapp_id || '').includes('@broadcast');
    const bloqueada = c => c.bloqueado === true || c.bloqueado === 'true';
    const responsavelAtivo = c => !!c.responsavel_id && !!c.responsavel_expira_em && new Date(c.responsavel_expira_em).getTime() > agora;
    const individual = c => !grupo(c) && !bloqueada(c);
    const espera = c => individual(c) && c.status === 'ativa' && !c.atendimento_prioritario && !responsavelAtivo(c) && c.ultimo_remetente === 'cliente';
    const atendimento = c => individual(c) && c.status === 'ativa' && !espera(c);

    const contadores = {
      todas: conversas.filter(c => !bloqueada(c) && c.status !== 'campanha').length,
      espera: conversas.filter(espera).length,
      ativa: conversas.filter(atendimento).length,
      transferida: conversas.filter(c => individual(c) && c.status === 'encerrada' && responsavelAtivo(c)).length,
      encerrada: conversas.filter(c => individual(c) && c.status === 'encerrada' && !responsavelAtivo(c)).length,
      meu: conversas.filter(c => individual(c) && c.status === 'ativa' && responsavelAtivo(c) && c.responsavel_id === responsavel_id).length,
      grupos: conversas.filter(c => grupo(c) && !bloqueada(c)).length,
      campanhas: conversas.filter(c => individual(c) && c.status === 'campanha').length,
      prioritarios: conversas.filter(c => individual(c) && c.status === 'ativa' && !!c.atendimento_prioritario).length,
    };
    return Response.json({ contadores, parcial: conversas.length >= 10000 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});