import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { resolverConexaoDapi } from '../../shared/dapiConexaoShared.ts';

// O webhook da D-API não avisa em tempo real quando o contato desiste da
// chamada. Esta verificação consulta o estado da chamada direto na API
// (POST /api/v1/calls/state) para o popup parar de tocar no instante em que ela
// deixa de existir.
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

    const { baseUrl, apiKey, sessionId } = resolverConexaoDapi(conexao);
    if (!sessionId) return Response.json({ ativa: null, status: 'sem_sessao' });

    const resposta = await fetch(`${baseUrl}/api/v1/calls/state`, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, callId }),
      signal: AbortSignal.timeout(8000)
    });
    if (!resposta.ok) return Response.json({ ativa: null, status: 'indisponivel' });

    const corpo = await resposta.json().catch(() => ({}));
    const dados = corpo?.data || {};
    const estado = String(dados.state || '').trim().toLowerCase();
    const ativa = typeof dados.active === 'boolean' ? dados.active : null;

    if (ativa === false) {
      await encerrar(base44, conexao, callId);
      return Response.json({ ativa: false, status: estado || 'encerrada' });
    }

    return Response.json({ ativa, status: estado || 'desconhecido' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Mantém a oferta marcada como encerrada para os outros atendentes.
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