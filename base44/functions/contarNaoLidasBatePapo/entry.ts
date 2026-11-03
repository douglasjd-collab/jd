import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarAcessoWhatsapp, podeAcessarConversa } from '../../shared/acessoWhatsappShared.ts';

// Contador do badge "Bate - Papo" no menu.
// Regra: conta as mensagens RECEBIDAS do cliente que ainda NÃO foram
// visualizadas no CRM (status diferente de "lida"). Assim que o atendente abre
// a conversa, ela deixa de pesar no contador — mesmo sem responder.
// Também valem as regras de atendimento: só conversas em andamento (status
// ativa) com o cliente aguardando, fora grupos, bloqueadas e disparos de
// campanha; e apenas as conexões liberadas para o usuário.
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

    const db = base44.asServiceRole.entities;
    const acesso = await carregarAcessoWhatsapp({ db, user, empresaId: empresa_id });
    // Falha fechada: sem permissões validadas nada é contado.
    if (acesso.erroLeitura) return Response.json({ total: 0 });

    const filtroConversas = { empresa_id, status: 'ativa', ultimo_remetente: 'cliente' };
    if (!acesso.irrestrito) {
      if (!acesso.conexoesPermitidas.length) return Response.json({ total: 0 });
      filtroConversas.connection_id = { $in: acesso.conexoesPermitidas };
    }

    const conversas = await db.ConversaWhatsapp.filter(filtroConversas, '-data_ultima_mensagem', 5000);

    const ehGrupo = (c) =>
      String(c.cliente_telefone || '').includes('@g.us') ||
      String(c.whatsapp_id || '').includes('@g.us') ||
      String(c.cliente_telefone || '').includes('@broadcast') ||
      String(c.whatsapp_id || '').includes('@broadcast');

    const validas = conversas.filter((c) => {
      if (ehGrupo(c) || c.bloqueado === true || c.bloqueado === 'true') return false;
      if (!acesso.irrestrito && !podeAcessarConversa(acesso, c)) return false;
      return true;
    });

    const ids = validas.map((c) => c.id);
    if (!ids.length) return Response.json({ total: 0 });

    const tempo = (v) => (v ? new Date(v).getTime() : 0);

    // Mensagens do cliente ainda não visualizadas.
    const naoLidas = await db.MensagemWhatsapp.filter(
      {
        empresa_id,
        remetente: 'cliente',
        conversa_id: { $in: ids },
        status: { $ne: 'lida' },
      },
      '-data_envio',
      3000
    );

    // Uma resposta enviada já cobre as mensagens anteriores: elas não voltam a
    // pesar no contador mesmo que o recibo de leitura não tenha sido gravado.
    const respostas = await db.MensagemWhatsapp.filter(
      { empresa_id, remetente: 'vendedor', conversa_id: { $in: ids } },
      '-data_envio',
      3000
    );
    const ultimaResposta = new Map();
    respostas.forEach((m) => {
      if (m.mensagem_tecnica === true || m.status === 'erro') return;
      const t = tempo(m.data_envio);
      const atual = ultimaResposta.get(m.conversa_id) || 0;
      if (t > atual) ultimaResposta.set(m.conversa_id, t);
    });

    const total = naoLidas.filter((m) => {
      if (m.status === 'erro') return false;
      const corte = ultimaResposta.get(m.conversa_id) || 0;
      return tempo(m.data_envio) > corte;
    }).length;

    return Response.json({ total });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});