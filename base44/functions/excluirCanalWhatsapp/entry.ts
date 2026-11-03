import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { secrets } from 'base44:runtime';

/**
 * excluirCanalWhatsapp — remove definitivamente uma instância de WhatsApp.
 *
 * 1. Encerra/remove a sessão no provedor (D-API) quando ela ainda existe.
 * 2. Apaga as permissões de colaboradores para essa conexão.
 * 3. Apaga o registro da conexão no CRM.
 *
 * Uso: cadastro de usuário (parceiro/vendedor) e tela de conexões.
 */
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const isAdmin = ['master', 'super_admin', 'admin'].includes(user.perfil);
    if (!isAdmin) return Response.json({ error: 'Forbidden - Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const connectionId = body.connection_id;
    if (!connectionId) return Response.json({ error: 'connection_id obrigatório' }, { status: 400 });

    const conexao = await base44.asServiceRole.entities.WhatsappConnection
      .get(connectionId)
      .catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));
    if (!conexao) return Response.json({ error: 'Canal não encontrado' }, { status: 404 });

    if (user.empresa_id && conexao.empresa_id && conexao.empresa_id !== user.empresa_id) {
      return Response.json({ error: 'Canal de outra empresa' }, { status: 403 });
    }

    // 1. Encerrar a sessão no provedor (ignora quando a sessão já não existe)
    let sessaoExcluida = false;
    const sessionId = String(conexao.session_id || '').trim();
    const apiKey = secrets.get('DAPI_USER_API_KEY');
    if (sessionId && apiKey && (conexao.provider_type === 'dapi' || !conexao.provider_type)) {
      const base = String(conexao.base_url || 'https://api.d-api.cloud').replace(/\/+$/, '');
      const alvos = [
        `${base}/api/v1/sessions/${encodeURIComponent(sessionId)}`,
        `${base}/api/v1/cloud/sessions/${encodeURIComponent(sessionId)}`,
      ];
      for (const url of alvos) {
        try {
          const resp = await fetch(url, {
            method: 'DELETE',
            headers: { Authorization: apiKey },
            signal: AbortSignal.timeout(15000),
          });
          if (resp.ok) {
            sessaoExcluida = true;
            break;
          }
        } catch (e) {
          console.error(`[excluirCanalWhatsapp] Falha ao excluir sessão ${sessionId}:`, (e as Error).message);
        }
      }
    }

    // 2. Permissões de colaboradores para esta conexão
    await base44.asServiceRole.entities.PermissaoWhatsappColaborador
      .deleteMany({ connection_id: connectionId })
      .catch(() => null);

    // 3. Registro da conexão no CRM
    await base44.asServiceRole.entities.WhatsappConnection.delete(connectionId);

    return Response.json({
      success: true,
      sessao_excluida: sessaoExcluida,
      nome: conexao.nome || sessionId,
    });
  } catch (error) {
    console.error('[excluirCanalWhatsapp] Erro:', error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}