import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ROLES = ['cliente', 'testemunha1', 'testemunha2', 'representante'];

function findByToken(sol, token) {
  for (const role of ROLES) {
    if (sol[`${role}_token`] && sol[`${role}_token`] === token) return role;
  }
  return null;
}

function ordemAtiva(sol) {
  try {
    const ordem = JSON.parse(sol.ordem_json || '[]');
    if (Array.isArray(ordem) && ordem.length) return ordem;
  } catch {}
  return ROLES.filter((r) => sol[`${r}_nome`]);
}

function proximoStatus(sol, roleAssinado) {
  const ordem = ordemAtiva(sol);
  const idx = ordem.indexOf(roleAssinado);
  const proximo = ordem[idx + 1];
  if (!proximo) return 'assinado';
  return `aguardando_${proximo}`;
}

function podeAssinar(sol, role) {
  if (sol.status === 'assinado' || sol.status === 'recusado' || sol.status === 'cancelado') return false;
  if (sol[`${role}_status`] === 'assinado') return false;
  if (!sol.sequencial) return true;
  const ordem = ordemAtiva(sol);
  const idx = ordem.indexOf(role);
  for (let i = 0; i < idx; i++) {
    if (sol[`${ordem[i]}_status`] !== 'assinado') return false;
  }
  return true;
}

async function uploadAssinatura(base44, dataUrl, role) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Assinatura inválida');
  const [, mime, base64] = match;
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([binary], { type: mime });
  const file = new File([blob], `assinatura_${role}_${Date.now()}.png`, { type: mime });
  const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return file_url;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, token, assinatura_data_url, motivo } = await req.json();

    if (!token) return Response.json({ error: 'Token inválido' }, { status: 400 });

    const candidatos = await base44.asServiceRole.entities.SolicitacaoAssinatura.filter({});
    const sol = candidatos.find((s) => findByToken(s, token));
    if (!sol) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    const role = findByToken(sol, token);

    if (action === 'status') {
      return Response.json({
        role,
        status_geral: sol.status,
        sequencial: sol.sequencial,
        ordem: ordemAtiva(sol),
        pode_assinar: podeAssinar(sol, role),
        termo_pdf_url: sol.termo_pdf_url,
        cliente_nome: sol.cliente_nome,
        banco: sol.banco_snapshot,
        tipo_operacao: sol.tipo_operacao_snapshot,
        contrato: sol.contrato_snapshot,
        valor_bruto: sol.valor_bruto_snapshot,
        valor_liquido: sol.valor_liquido_snapshot,
        valor_parcela: sol.valor_parcela_snapshot,
        prazo: sol.prazo_snapshot,
        signer: {
          nome: sol[`${role}_nome`],
          cpf: sol[`${role}_cpf`],
          status: sol[`${role}_status`],
        },
      });
    }

    if (action === 'recusar') {
      await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, {
        [`${role}_status`]: 'recusado',
        status: 'recusado',
        motivo_recusa: motivo || '',
        recusado_por_papel: role,
      });
      return Response.json({ success: true });
    }

    if (action === 'assinar') {
      if (!podeAssinar(sol, role)) {
        return Response.json({ error: 'Esta assinatura ainda não está liberada ou já foi concluída.' }, { status: 400 });
      }
      const assinaturaUrl = await uploadAssinatura(base44, assinatura_data_url, role);
      const novoStatusGeral = proximoStatus(sol, role);
      await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, {
        [`${role}_status`]: 'assinado',
        [`${role}_data_assinatura`]: new Date().toISOString(),
        [`${role}_assinatura_url`]: assinaturaUrl,
        status: novoStatusGeral,
      });

      if (novoStatusGeral === 'assinado' && sol.termo_autorizacao_id) {
        await base44.asServiceRole.entities.TermoAutorizacao.update(sol.termo_autorizacao_id, {
          status: 'assinado',
          data_assinatura: new Date().toISOString(),
          forma_assinatura: 'eletronica',
        });
      }

      return Response.json({ success: true, status_geral: novoStatusGeral });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});