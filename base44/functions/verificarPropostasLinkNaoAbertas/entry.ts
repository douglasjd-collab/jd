import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { enviarWhatsAppVendedor } from '../../shared/propostaLinkShared.ts';

// Automação agendada (roda a cada 30 min). Encontra links de proposta criados há
// mais de 3h que ainda não foram abertos pelo cliente e para os quais o alerta
// de "não abriu" ainda não foi enviado. Dispara o alerta no WhatsApp do vendedor
// e marca alerta_nao_abriu_enviado=true para não repetir.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    const agora = new Date();
    const tresHorasAtras = new Date(agora.getTime() - 3 * 60 * 60 * 1000);

    const links = await base44.asServiceRole.entities.PropostaLinkSimulacao.filter({
      aberta: false,
      alerta_nao_abriu_enviado: false,
    }, '-created_date', 500);

    let notificados = 0;
    const erros = [];

    for (const link of links || []) {
      // created_date é o built-in de criação do registro
      const criado = link.created_date ? new Date(link.created_date) : null;
      if (!criado || criado > tresHorasAtras) continue; // ainda não completou 3h

      if (!link.vendedor_telefone || !link.empresa_id) continue;

      try {
        const msg =
          '⏰ *Proposta ainda não foi aberta*\n\n' +
          'Cliente: ' + (link.cliente_nome || '-') + '\n' +
          'Vendedor: ' + (link.vendedor_nome || '-') + '\n' +
          'Enviada há mais de 3h: ' + (link.link_url || '') + '\n\n' +
          'O cliente ainda não abriu a simulação de consórcio. Considere fazer um follow-up.';
        await enviarWhatsAppVendedor(base44, link.empresa_id, link.vendedor_telefone, msg);

        await base44.asServiceRole.entities.PropostaLinkSimulacao.update(link.id, {
          alerta_nao_abriu_enviado: true,
          data_alerta_nao_abriu: agora.toISOString(),
        });
        notificados++;
      } catch (e) {
        erros.push({ link_id: link.id, erro: e.message });
      }
    }

    return Response.json({
      success: true,
      notificados,
      total_verificados: (links || []).length,
      erros: erros.length > 0 ? erros : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}