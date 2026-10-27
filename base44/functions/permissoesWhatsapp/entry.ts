import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarAcessoWhatsapp, parseMapaPermissoes } from '../../shared/acessoWhatsappShared.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Configuração e leitura das permissões de WhatsApp por colaborador e conexão.
//   modo: 'minhas'  -> mapa do usuário logado (usado pela UI do Bate-papo)
//   modo: 'matriz'  -> colaboradores x conexões (somente administração)
//   modo: 'salvar'  -> grava o nível de um colaborador em uma conexão
// ═══════════════════════════════════════════════════════════════════════════

const NIVEIS = ['sem_acesso', 'atribuidas', 'todas'];

function ehAdministracao(user: any) {
  const perfil = String(user?.perfil || user?.data?.perfil || '');
  return user?.role === 'admin' || ['admin', 'gerente', 'master', 'super_admin'].includes(perfil);
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const modo = body?.modo || 'minhas';
    const empresaId = body?.empresa_id || user.empresa_id || user.data?.empresa_id || '';
    if (!empresaId) return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });

    const db = base44.asServiceRole.entities;

    if (modo === 'minhas') {
      const acesso = await carregarAcessoWhatsapp({ db, user, empresaId });
      return Response.json({
        irrestrito: acesso.irrestrito,
        mapa: acesso.mapa,
        conexoes_permitidas: acesso.conexoesPermitidas,
      });
    }

    const minhaEmpresa = user.empresa_id || user.data?.empresa_id || '';
    const global = ['master', 'super_admin'].includes(String(user.perfil || user.data?.perfil || ''));
    if (!ehAdministracao(user) || (!global && minhaEmpresa && minhaEmpresa !== empresaId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (modo === 'matriz') {
      const [colaboradores, conexoes, configs] = await Promise.all([
        db.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 300),
        db.WhatsappConnection.filter({ empresa_id: empresaId }, '-created_date', 50),
        db.PermissaoWhatsappColaborador.filter({ empresa_id: empresaId, ativo: true }, '-updated_date', 1000),
      ]);

      return Response.json({
        colaboradores: colaboradores
          .filter((c: any) => c.user_id && c.user_id !== 'pending')
          .map((c: any) => ({
            id: c.id,
            user_id: c.user_id,
            nome: c.nome,
            email: c.email,
            perfil: c.perfil,
          })),
        conexoes: conexoes.map((c: any) => ({
          id: c.id,
          nome: c.nome,
          session_id: c.session_id,
          provider_type: c.provider_type,
          phone_number: c.phone_number,
          status: c.status,
        })),
        permissoes: configs.map((p: any) => ({
          colaborador_id: p.colaborador_id,
          connection_id: p.connection_id,
          nivel_acesso: p.nivel_acesso,
          responsavel_padrao: p.responsavel_padrao === true,
        })),
      });
    }

    if (modo === 'salvar') {
      const { colaborador_id, connection_id, nivel_acesso, responsavel_padrao } = body || {};
      if (!colaborador_id || !connection_id) {
        return Response.json({ error: 'colaborador_id e connection_id são obrigatórios' }, { status: 400 });
      }
      if (!NIVEIS.includes(nivel_acesso)) {
        return Response.json({ error: 'nivel_acesso inválido' }, { status: 400 });
      }

      const [colaborador, conexao] = await Promise.all([
        db.Colaborador.get(colaborador_id).catch((e: any) => (e.status === 404 ? null : Promise.reject(e))),
        db.WhatsappConnection.get(connection_id).catch((e: any) => (e.status === 404 ? null : Promise.reject(e))),
      ]);
      if (!colaborador || colaborador.empresa_id !== empresaId) {
        return Response.json({ error: 'Colaborador não encontrado nesta empresa' }, { status: 404 });
      }
      if (!conexao || conexao.empresa_id !== empresaId) {
        return Response.json({ error: 'Conexão não encontrada nesta empresa' }, { status: 404 });
      }
      if (!colaborador.user_id || colaborador.user_id === 'pending') {
        return Response.json({ error: 'Este colaborador ainda não tem usuário vinculado' }, { status: 400 });
      }

      const existentes = await db.PermissaoWhatsappColaborador.filter(
        { empresa_id: empresaId, colaborador_id, connection_id },
        '-updated_date',
        10
      );

      const dados = {
        empresa_id: empresaId,
        colaborador_id,
        colaborador_nome: colaborador.nome || '',
        colaborador_email: colaborador.email || '',
        colaborador_user_id: colaborador.user_id,
        connection_id,
        connection_nome: conexao.nome || conexao.session_id || '',
        nivel_acesso,
        responsavel_padrao: responsavel_padrao === true,
        ativo: true,
        atualizado_por_id: user.id,
        atualizado_por_nome: user.full_name || user.email || '',
      };

      if (existentes.length > 0) {
        await db.PermissaoWhatsappColaborador.update(existentes[0].id, dados);
      } else {
        await db.PermissaoWhatsappColaborador.create(dados);
      }

      // Apenas um responsável padrão por conexão.
      if (dados.responsavel_padrao) {
        const outros = await db.PermissaoWhatsappColaborador.filter(
          { empresa_id: empresaId, connection_id, responsavel_padrao: true },
          '-updated_date',
          50
        );
        const paraLimpar = outros.filter((o: any) => o.colaborador_id !== colaborador_id);
        for (const o of paraLimpar) {
          await db.PermissaoWhatsappColaborador.update(o.id, { responsavel_padrao: false });
        }
      }

      const mapa = await sincronizarMapaUsuario(db, empresaId, colaborador.user_id);
      return Response.json({ success: true, mapa });
    }

    return Response.json({ error: 'modo inválido' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Espelha o mapa de conexões no usuário — é o que a RLS consulta.
async function sincronizarMapaUsuario(db: any, empresaId: string, userId: string) {
  const configs = await db.PermissaoWhatsappColaborador.filter(
    { empresa_id: empresaId, colaborador_user_id: userId, ativo: true },
    '-updated_date',
    500
  );
  const mapa: Record<string, string> = {};
  for (const c of configs) {
    if (c?.connection_id) mapa[c.connection_id] = c.nivel_acesso;
  }
  const restrito = Object.values(mapa).some((n) => n !== 'todas');
  try {
    await db.User.update(userId, {
      whatsapp_permissoes_json: JSON.stringify(mapa),
      whatsapp_restrito: restrito,
    });
  } catch (_) { /* mapa permanece apenas nos registros de permissão */ }
  return parseMapaPermissoes(mapa);
}