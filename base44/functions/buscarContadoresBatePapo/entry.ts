import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { carregarAcessoWhatsapp, podeAcessarConversa } from '../../shared/acessoWhatsappShared.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { empresa_id, responsavel_id } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const isGlobal = ['super_admin', 'master'].includes(user.perfil || '');
    const empresaUsuario = user.empresa_id || user.data?.empresa_id || null;
    if (!isGlobal && empresaUsuario && empresaUsuario !== empresa_id) {
      return Response.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
    }

    const todasConversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id },
      '-data_ultima_mensagem',
      10000
    );

    // "Todos" significa todas as conversas PERMITIDAS ao usuário.
    const acesso = await carregarAcessoWhatsapp({
      db: base44.asServiceRole.entities,
      user,
      empresaId: empresa_id,
    });
    // Falha fechada: contadores nunca somam conversas sem permissão validada.
    if (acesso.erroLeitura) {
      return Response.json({ error: 'Não foi possível validar as permissões' }, { status: 403 });
    }

    const conversas = acesso.irrestrito
      ? todasConversas
      : todasConversas.filter(c => podeAcessarConversa(acesso, c));

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
      transferida: conversas.filter(c => individual(c) && c.status === 'ativa' && c.atendimento_transferido_para_id === c.responsavel_id && responsavelAtivo(c)).length,
      encerrada: conversas.filter(c => individual(c) && c.status === 'encerrada').length,
      meu: conversas.filter(c => individual(c) && c.status === 'ativa' && responsavelAtivo(c) && c.responsavel_id === responsavel_id).length,
      grupos: conversas.filter(c => grupo(c) && !bloqueada(c)).length,
      campanhas: conversas.filter(c => individual(c) && c.status === 'campanha').length,
      prioritarios: conversas.filter(c => individual(c) && c.status === 'ativa' && !!c.atendimento_prioritario).length,
    };
    return Response.json({ contadores, parcial: todasConversas.length >= 10000 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});