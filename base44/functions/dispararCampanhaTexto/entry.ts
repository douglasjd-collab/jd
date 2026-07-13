import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { empresa_id, contatos, mensagem_texto, nome_campanha, delay_segundos = 7 } = body;

    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    if (!mensagem_texto?.trim()) return Response.json({ error: 'mensagem_texto obrigatório' }, { status: 400 });
    if (!contatos || contatos.length === 0) return Response.json({ error: 'contatos obrigatório' }, { status: 400 });

    // Buscar conexão D-API ativa da empresa — toda campanha/envio automático usa D-API
    const conexoesDapi = await base44.asServiceRole.entities.WhatsappConnection.filter(
      { empresa_id, provider_type: 'dapi', is_active: true },
      '-created_date',
      1
    );
    const conexaoDapi = conexoesDapi[0];
    if (!conexaoDapi) {
      return Response.json({ error: 'Nenhuma conexão D-API ativa encontrada. Configure a D-API em Conexões WhatsApp.' }, { status: 400 });
    }

    let enviados = 0;
    let erros = 0;
    const delayMs = Math.max(1, Number(delay_segundos)) * 1000;

    for (const telefone of contatos) {
      const numeroLimpo = String(telefone).replace(/\D/g, '');
      if (!numeroLimpo || numeroLimpo.length < 10) {
        erros++;
        continue;
      }

      try {
        const respService = await base44.functions.invoke('whatsappService', {
          connectionId: conexaoDapi.id,
          action: 'sendText',
          phoneNumber: numeroLimpo,
          text: mensagem_texto.trim()
        });
        const enviou = !!respService?.data?.success;

        if (enviou) {
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id,
            tipo_campanha: 'dapi',
            cliente_telefone: numeroLimpo,
            cliente_nome: nome_campanha || 'Campanha Texto',
            status: 'enviada',
          });

          const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
            { empresa_id, cliente_telefone: numeroLimpo }, '-data_ultima_mensagem', 1
          );
          if (convs.length > 0) {
            await base44.asServiceRole.entities.ConversaWhatsapp.update(convs[0].id, {
              status: 'campanha',
              origem: 'campanha',
              ultima_mensagem: mensagem_texto.trim().substring(0, 200),
              data_ultima_mensagem: new Date().toISOString(),
              ultimo_remetente: 'vendedor',
              tipo_conexao: 'dapi',
              canal_origem: 'dapi',
              provider: 'dapi',
              connection_id: conexaoDapi.id,
            }).catch(() => {});
          } else {
            await base44.asServiceRole.entities.ConversaWhatsapp.create({
              empresa_id,
              cliente_telefone: numeroLimpo,
              cliente_nome: numeroLimpo,
              status: 'campanha',
              origem: 'campanha',
              tipo_conexao: 'dapi',
              canal_origem: 'dapi',
              provider: 'dapi',
              connection_id: conexaoDapi.id,
              data_ultima_mensagem: new Date().toISOString(),
              ultima_mensagem: mensagem_texto.trim().substring(0, 200),
              ultimo_remetente: 'vendedor',
            }).catch(() => {});
          }

          enviados++;
        } else {
          erros++;
        }
      } catch {
        erros++;
      }

      if (delayMs > 0 && contatos.indexOf(telefone) < contatos.length - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    return Response.json({ ok: true, enviados, erros, total: contatos.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});