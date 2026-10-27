import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';

// O webhook da D-API não avisa em tempo real quando o contato desiste da
// chamada. Esta verificação consulta o estado da chamada direto na API para o
// popup parar de tocar no momento em que ela deixa de existir.
const ENCERRADAS = [
  'ended', 'end', 'finished', 'terminated', 'rejected', 'reject', 'declined',
  'missed', 'not_answered', 'notanswered', 'no_answer', 'noanswer', 'timeout',
  'failed', 'failure', 'cancelled', 'canceled', 'closed', 'hangup', 'hung_up'
];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { connectionId, callId } = await req.json().catch(() => ({}));
    if (!connectionId || !callId) {
      return Response.json({ error: 'connectionId e callId são obrigatórios' }, { status: 400 });
    }

    const conexao = await base44.asServiceRole.entities.WhatsappConnection
      .get(connectionId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!conexao) return Response.json({ error: 'Conexão não encontrada' }, { status: 404 });

    const empresaUsuario = user.data?.empresa_id || user.empresa_id || null;
    const isAdminGlobal = ['master', 'super_admin'].includes(user.data?.perfil || user.perfil || '');
    if (empresaUsuario && !isAdminGlobal && conexao.empresa_id !== empresaUsuario) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { baseUrl, apiKey } = resolverConexaoDapi(conexao);
    const resposta = await fetch(`${baseUrl}/api/v1/calls/${encodeURIComponent(callId)}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(8000)
    });
    const corpo = await resposta.json().catch(() => ({}));

    // A API só mantém a chamada enquanto ela existe: 404 significa que já caiu.
    if (resposta.status === 404) {
      await encerrar(base44, conexao, callId);
      return Response.json({ ativa: false, status: 'encerrada' });
    }
    if (!resposta.ok) {
      return Response.json({ ativa: null, status: 'indisponivel' });
    }

    const bruto = String(
      corpo?.call?.status || corpo?.call?.state || corpo?.data?.status ||
      corpo?.status || corpo?.state || ''
    ).trim().toLowerCase();

    if (!bruto) return Response.json({ ativa: null, status: 'desconhecido' });

    if (ENCERRADAS.includes(bruto) || bruto.includes('end') || bruto.includes('reject')) {
      await encerrar(base44, conexao, callId);
      return Response.json({ ativa: false, status: bruto });
    }

    return Response.json({ ativa: true, status: bruto });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

async function encerrar(base44: any, conexao: any, callId: string) {
  try {
    await base44.asServiceRole.entities.ChamadaVozWhatsapp.updateMany(
      {
        empresa_id: conexao.empresa_id,
        connection_id: conexao.id,
        call_id: String(callId),
        status: { $in: ['recebida', 'visualizada'] }
      },
      { $set: { status: 'encerrada' } }
    );
  } catch (_) {
    // registro já atualizado por outro caminho
  }
}