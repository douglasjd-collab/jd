import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarConversaAutorizada, carregarAcessoWhatsapp, nivelNaConexao } from '../../shared/acessoWhatsappShared.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Transferência de atendimento entre colaboradores.
// Mantém a conversa ABERTA, na MESMA conexão e com todo o histórico.
// Registra autor, data, origem (conexão/responsável) e destino, concede acesso
// pontual ao destino e retira o acesso operacional do responsável anterior
// quando ele não tem permissão geral (todas) naquela conexão.
// ═══════════════════════════════════════════════════════════════════════════

const TEMPO_ATENDIMENTO_MS = 10 * 60 * 1000;

function jsonArray(bruto: any): any[] {
  try {
    const arr = typeof bruto === 'string' ? JSON.parse(bruto || '[]') : (bruto || []);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { conversa_id, colaborador_id, motivo } = body || {};
    if (!conversa_id || !colaborador_id) {
      return Response.json({ error: 'conversa_id e colaborador_id são obrigatórios' }, { status: 400 });
    }

    const db = base44.asServiceRole.entities;
    const autorizado = await carregarConversaAutorizada({ base44, user, conversaId: conversa_id });
    if ('erro' in autorizado) return Response.json({ error: autorizado.erro }, { status: autorizado.status });
    const conversa = autorizado.conversa;

    const destino = await db.Colaborador.get(colaborador_id).catch((e: any) => (e.status === 404 ? null : Promise.reject(e)));
    if (!destino) return Response.json({ error: 'Colaborador não encontrado' }, { status: 404 });
    if (destino.empresa_id !== conversa.empresa_id) {
      return Response.json({ error: 'Colaborador de outra empresa' }, { status: 403 });
    }
    if (!destino.user_id || destino.user_id === 'pending') {
      return Response.json({ error: 'Colaborador sem usuário vinculado' }, { status: 400 });
    }

    // A conexão é a da conversa — nunca um seletor global.
    const acessoDestino = await carregarAcessoWhatsapp({ db, user: { id: destino.user_id }, empresaId: conversa.empresa_id });
    const nivelDestino = nivelNaConexao(acessoDestino, conversa.connection_id);
    if (nivelDestino === 'sem_acesso') {
      return Response.json({ error: 'O colaborador não tem acesso a esta conexão de WhatsApp' }, { status: 400 });
    }

    const autor = await db.Colaborador.filter({ user_id: user.id }, '-created_date', 5).catch(() => []);
    const autorColaborador = autor.find((c: any) => c.empresa_id === conversa.empresa_id) || autor[0] || null;

    // Acesso pontual: acrescenta o destino e remove o responsável anterior que
    // não possui permissão geral na conexão.
    const pontual = new Set<string>(jsonArray(conversa.acesso_pontual_user_ids_json).map(String));
    pontual.add(String(destino.user_id));
    const responsavelAnteriorUserId = conversa.responsavel_user_id || null;
    if (responsavelAnteriorUserId && responsavelAnteriorUserId !== destino.user_id) {
      const acessoAnterior = await carregarAcessoWhatsapp({ db, user: { id: responsavelAnteriorUserId }, empresaId: conversa.empresa_id });
      if (nivelNaConexao(acessoAnterior, conversa.connection_id) !== 'todas') {
        pontual.delete(String(responsavelAnteriorUserId));
      }
    }

    const registro = {
      autor_id: user.id,
      autor_nome: user.full_name || user.email || '',
      autor_colaborador_id: autorColaborador?.id || null,
      data: new Date().toISOString(),
      motivo: String(motivo || '').slice(0, 300),
      origem_connection_id: conversa.connection_id || null,
      origem_responsavel_id: conversa.responsavel_id || null,
      origem_responsavel_nome: conversa.responsavel_nome || null,
      destino_colaborador_id: destino.id,
      destino_user_id: destino.user_id,
      destino_nome: destino.nome || '',
    };
    const historico = jsonArray(conversa.transferencias_json);
    historico.push(registro);

    const dadosTransferencia = {
      responsavel_id: destino.id,
      responsavel_nome: destino.nome || '',
      responsavel_user_id: destino.user_id,
      // O dono da conversa acompanha a transferência: sem isso o responsável
      // anterior manteria acesso pela posse (usado na autorização e na RLS).
      usuario_responsavel_id: destino.id,
      usuario_responsavel_nome: destino.nome || '',
      usuario_responsavel_user_id: destino.user_id,
      responsavel_expira_em: new Date(Date.now() + TEMPO_ATENDIMENTO_MS).toISOString(),
      atendimento_transferido_para_id: destino.id,
      status: 'ativa',
      acesso_pontual_user_ids_json: JSON.stringify([...pontual]),
      transferencias_json: JSON.stringify(historico.slice(-100)),
    };

    await db.ConversaWhatsapp.update(conversa.id, dadosTransferencia);

    return Response.json({
      success: true,
      conversa: { ...conversa, ...dadosTransferencia },
      responsavel_anterior: conversa.responsavel_nome || null,
      conexao_preservada: conversa.connection_id || null,
      nivel_destino: nivelDestino,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}