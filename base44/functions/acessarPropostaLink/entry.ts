import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { enviarWhatsAppVendedor } from '../../shared/propostaLinkShared.ts';

// Endpoint PÚBLICO (sem autenticação) — chamado pela página /proposta/:token.
// Retorna o snapshot da simulação para renderização e, na primeira abertura,
// marca o link como aberto e dispara o alerta no WhatsApp do vendedor.

function getIp(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    ''
  );
}

async function registrarAcessoNoHistorico(base44, simulacao, link, numeroAcesso, dataAcesso) {
  const oportunidadeId = simulacao?.oportunidade_id;
  if (!oportunidadeId) return;
  try {
    const oportunidade = await base44.asServiceRole.entities.Oportunidade.get(oportunidadeId);
    if (!oportunidade) return;
    const primeiro = numeroAcesso === 1;
    await base44.asServiceRole.entities.MovimentacaoFunil.create({
      oportunidade_id: oportunidadeId,
      etapa_origem_id: oportunidade.etapa_id || '',
      etapa_origem_nome: oportunidade.etapa_nome || '',
      etapa_destino_id: oportunidade.etapa_id || 'simulacao',
      etapa_destino_nome: oportunidade.etapa_nome || 'Simulação',
      usuario_id: link.vendedor_id || 'sistema',
      usuario_nome: 'Sistema',
      observacao: '[ACESSO_SIMULACAO] ' + (primeiro
        ? 'Cliente abriu o link da simulação pela primeira vez'
        : 'Cliente abriu novamente o link da simulação — ' + numeroAcesso + 'º acesso') +
        ' | ' + dataAcesso
    });
  } catch (e) {
    console.warn('Erro ao registrar acesso no histórico do funil:', e.message);
  }
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { token } = body;
    if (!token) {
      return Response.json({ error: 'token é obrigatório' }, { status: 400 });
    }

    const links = await base44.asServiceRole.entities.PropostaLinkSimulacao.filter(
      { token }, '-created_date', 1
    );
    const link = links?.[0];
    if (!link) {
      return Response.json({ error: 'Link não encontrado ou expirado' }, { status: 404 });
    }

    let simulacao = null;
    try {
      simulacao = JSON.parse(link.simulacao_snapshot_json || '{}');
    } catch {
      simulacao = {};
    }

    const numeroAcesso = link.aberta ? (link.total_aberturas || 1) + 1 : 1;
    const dataAcesso = new Date().toISOString();

    // Cada abertura é registrada no histórico da oportunidade, inclusive reaberturas.
    await registrarAcessoNoHistorico(base44, simulacao, link, numeroAcesso, dataAcesso);

    // Primeira abertura: marcar e notificar vendedor
    if (!link.aberta) {
      const ip = getIp(req);
      const ua = req.headers.get('user-agent') || '';
      try {
        await base44.asServiceRole.entities.PropostaLinkSimulacao.update(link.id, {
          aberta: true,
          data_abertura: dataAcesso,
          abertura_ip: ip,
          abertura_user_agent: ua,
          total_aberturas: 1,
          alerta_abertura_enviado: true,
        });
      } catch (e) {
        console.warn('Erro ao marcar abertura do link:', e.message);
      }

      // Alerta de abertura no WhatsApp do vendedor (best-effort)
      if (link.vendedor_telefone && link.empresa_id) {
        try {
          const msg =
            '✅ *Proposta aberta pelo cliente*\n\n' +
            'Cliente: ' + (link.cliente_nome || '-') + '\n' +
            'Vendedor: ' + (link.vendedor_nome || '-') + '\n' +
            'Link: ' + (link.link_url || '') + '\n\n' +
            'O cliente acabou de abrir a simulação de consórcio enviada.';
          await enviarWhatsAppVendedor(base44, link.empresa_id, link.vendedor_telefone, msg);
        } catch (e) {
          console.warn('Erro ao notificar vendedor (abertura):', e.message);
        }
      }
    } else {
      // Aberturas subsequentes: apenas incrementa contador (best-effort)
      try {
        await base44.asServiceRole.entities.PropostaLinkSimulacao.update(link.id, {
          total_aberturas: numeroAcesso,
        });
      } catch {}
    }

    return Response.json({
      success: true,
      simulacao,
      link_url: link.link_url
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}