import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const ROLES = ['cliente', 'testemunha1', 'testemunha2', 'representante'];

const TIPO_EVENTO = {
  selfie: 'selfie_enviada',
  rg_frente: 'rg_frente_enviado',
  rg_verso: 'rg_verso_enviado',
};

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

function getIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

function parseEvidencias(sol, role) {
  try {
    return JSON.parse(sol[`${role}_evidencias_json`] || '{}');
  } catch {
    return {};
  }
}

async function sha256FromBase64(base64) {
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const hashBuf = await crypto.subtle.digest('SHA-256', binary);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function uploadImagemBase64(base44, dataUrl, nomeBase) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) throw new Error('Imagem inválida');
  const [, mime, base64] = match;
  const hash = await sha256FromBase64(base64);
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([binary], { type: mime });
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const file = new File([blob], `${nomeBase}_${Date.now()}.${ext}`, { type: mime });
  const { file_url } = await base44.asServiceRole.integrations.Core.UploadFile({ file });
  return { file_url, hash };
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

async function registrarLog(base44, sol, { evento, papel, ip, device, resultado, detalhes }) {
  try {
    await base44.asServiceRole.entities.AssinaturaLogs.create({
      solicitacao_id: sol.id,
      termo_autorizacao_id: sol.termo_autorizacao_id || '',
      proposta_id: sol.proposta_id || '',
      empresa_id: sol.empresa_id || '',
      evento,
      papel: papel || '',
      usuario_nome: sol[`${papel}_nome`] || '',
      ip: ip || '',
      navegador: device?.navegador || '',
      dispositivo: device?.sistema_operacional || '',
      resultado: resultado || 'sucesso',
      detalhes: detalhes || '',
      data_hora: new Date().toISOString(),
    });
  } catch {}
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, token, assinatura_data_url, motivo, tipo, data_url, device, metodo_assinatura } = body;

    if (!token) return Response.json({ error: 'Token inválido' }, { status: 400 });

    const candidatos = await base44.asServiceRole.entities.SolicitacaoAssinatura.filter({});
    const sol = candidatos.find((s) => findByToken(s, token));
    if (!sol) return Response.json({ error: 'Link inválido ou expirado' }, { status: 404 });

    const role = findByToken(sol, token);
    const ip = getIp(req);

    if (action === 'status') {
      const evidenciasRole = parseEvidencias(sol, role);
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
        evidencias: {
          selfie: !!evidenciasRole.selfie_url,
          rg_frente: !!evidenciasRole.rg_frente_url,
          rg_verso: !!evidenciasRole.rg_verso_url,
        },
      });
    }

    if (action === 'registrar_evento') {
      await registrarLog(base44, sol, { evento: body.evento || 'termo_visualizado', papel: role, ip, device, resultado: 'sucesso' });
      if (body.evento === 'termo_visualizado' && sol[`${role}_status`] === 'pendente') {
        await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, { [`${role}_status`]: 'visualizado' });
      }
      return Response.json({ success: true });
    }

    if (action === 'enviar_evidencia') {
      if (!['selfie', 'rg_frente', 'rg_verso'].includes(tipo)) {
        return Response.json({ error: 'Tipo de evidência inválido' }, { status: 400 });
      }
      const { file_url, hash } = await uploadImagemBase64(base44, data_url, `${tipo}_${role}`);
      const evidenciasAtuais = parseEvidencias(sol, role);
      const novasEvidencias = {
        ...evidenciasAtuais,
        [`${tipo}_url`]: file_url,
        [`${tipo}_hash`]: hash,
        [`${tipo}_capturado_em`]: new Date().toISOString(),
        ip,
        navegador: device?.navegador || evidenciasAtuais.navegador || '',
        sistema_operacional: device?.sistema_operacional || evidenciasAtuais.sistema_operacional || '',
        idioma: device?.idioma || evidenciasAtuais.idioma || '',
        resolucao_tela: device?.resolucao_tela || evidenciasAtuais.resolucao_tela || '',
      };
      await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, {
        [`${role}_evidencias_json`]: JSON.stringify(novasEvidencias),
      });
      await registrarLog(base44, sol, { evento: TIPO_EVENTO[tipo], papel: role, ip, device, resultado: 'sucesso' });
      return Response.json({ success: true, hash });
    }

    if (action === 'recusar') {
      await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, {
        [`${role}_status`]: 'recusado',
        status: 'recusado',
        motivo_recusa: motivo || '',
        recusado_por_papel: role,
      });
      await registrarLog(base44, sol, { evento: 'assinatura_recusada', papel: role, ip, device, resultado: 'recusado', detalhes: motivo || '' });
      return Response.json({ success: true });
    }

    if (action === 'assinar') {
      if (!podeAssinar(sol, role)) {
        return Response.json({ error: 'Esta assinatura ainda não está liberada ou já foi concluída.' }, { status: 400 });
      }
      const evidenciasRole = parseEvidencias(sol, role);
      if (!evidenciasRole.selfie_url || !evidenciasRole.rg_frente_url || !evidenciasRole.rg_verso_url) {
        return Response.json({ error: 'Confirme sua identidade (selfie e documento) antes de assinar.' }, { status: 400 });
      }

      const assinaturaUrl = await uploadAssinatura(base44, assinatura_data_url, role);
      const novoStatusGeral = proximoStatus(sol, role);
      await base44.asServiceRole.entities.SolicitacaoAssinatura.update(sol.id, {
        [`${role}_status`]: 'assinado',
        [`${role}_data_assinatura`]: new Date().toISOString(),
        [`${role}_assinatura_url`]: assinaturaUrl,
        status: novoStatusGeral,
      });

      const descricaoMetodo = metodo_assinatura === 'nome_completo'
        ? 'Assinatura preenchida automaticamente com o nome completo'
        : 'Assinatura desenhada manualmente';
      await registrarLog(base44, sol, { evento: 'assinatura_realizada', papel: role, ip, device, resultado: 'sucesso', detalhes: descricaoMetodo });

      if (novoStatusGeral === 'assinado' && sol.termo_autorizacao_id) {
        await base44.asServiceRole.entities.TermoAutorizacao.update(sol.termo_autorizacao_id, {
          status: 'assinado',
          data_assinatura: new Date().toISOString(),
          forma_assinatura: 'eletronica',
        });
        await registrarLog(base44, sol, { evento: 'documento_finalizado', papel: role, ip, device, resultado: 'sucesso' });
      }

      return Response.json({ success: true, status_geral: novoStatusGeral });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});