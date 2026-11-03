import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarAcessoWhatsapp, podeAcessarConversa } from '../../shared/acessoWhatsappShared.ts';

// Contador do badge "Bate - Papo" no menu: soma as mensagens de cliente ainda
// não lidas, mas APENAS nas conversas das conexões liberadas para o usuário.
// Sem isso o badge somava a empresa inteira e expunha movimento de instâncias
// que o colaborador não pode abrir.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const isGlobal = ['super_admin', 'master'].includes(user.perfil || '');
    const empresaUsuario = user.empresa_id || user.data?.empresa_id || null;
    if (!isGlobal && empresaUsuario && empresaUsuario !== empresa_id) {
      return Response.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
    }

    const acesso = await carregarAcessoWhatsapp({
      db: base44.asServiceRole.entities,
      user,
      empresaId: empresa_id,
    });
    // Falha fechada: sem permissões validadas nada é contado.
    if (acesso.erroLeitura) return Response.json({ total: 0 });

    const naoLidas = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id, remetente: 'cliente', status: { $ne: 'lida' } },
      '-data_envio',
      3000
    );

    if (acesso.irrestrito) {
      return Response.json({ total: naoLidas.filter(m => !!m.conversa_id).length });
    }

    // Só as conversas das conexões liberadas entram na conta.
    let conversas = [];
    if (acesso.conexoesPermitidas.length) {
      conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
        { empresa_id, connection_id: { $in: acesso.conexoesPermitidas } },
        '-data_ultima_mensagem',
        3000
      );
    }
    const permitidas = new Map(
      conversas.filter(c => podeAcessarConversa(acesso, c)).map(c => [c.id, c])
    );

    const total = naoLidas.filter(m => {
      if (!m.conversa_id || !permitidas.has(m.conversa_id)) return false;
      const resumo = permitidas.get(m.conversa_id);
      // Resposta já enviada cobre as mensagens anteriores daquela conversa.
      if (resumo?.ultimo_remetente === 'vendedor' && resumo?.data_ultima_mensagem &&
          new Date(m.data_envio).getTime() <= new Date(resumo.data_ultima_mensagem).getTime()) return false;
      return true;
    }).length;

    return Response.json({ total });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});