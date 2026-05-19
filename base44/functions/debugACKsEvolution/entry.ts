import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Função para capturar e logar TODOS os eventos do webhook da Evolution
// e verificar mensagens recentes no banco para diagnóstico
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  if (req.method === 'GET') {
    // Diagnóstico: mostrar mensagens recentes de vendedor e seus IDs
    try {
      const msgs = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
        { remetente: 'vendedor' }, '-created_date', 20
      );
      return Response.json({
        total: msgs.length,
        mensagens: msgs.map(m => ({
          id: m.id,
          whatsapp_message_id: m.whatsapp_message_id,
          status: m.status,
          texto: m.texto?.substring(0, 50),
          created_date: m.created_date
        }))
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 500 });
    }
  }

  if (req.method === 'POST') {
    const rawBody = await req.text();
    console.log('='.repeat(80));
    console.log('📥 DEBUG ACK WEBHOOK | ' + new Date().toISOString());
    console.log('📦 Body completo:');
    console.log(rawBody);
    console.log('='.repeat(80));

    let parsed = null;
    try { parsed = JSON.parse(rawBody); } catch (_) {}

    if (parsed) {
      console.log('📋 Event:', parsed.event);
      console.log('📋 Instance:', parsed.instance);
      console.log('📋 Data type:', Array.isArray(parsed.data) ? 'ARRAY[' + parsed.data.length + ']' : typeof parsed.data);
      if (parsed.data) {
        console.log('📋 Data:', JSON.stringify(parsed.data, null, 2));
      }
    }

    return Response.json({ ok: true, received: true });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
});