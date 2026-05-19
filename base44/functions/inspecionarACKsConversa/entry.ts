import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { conversa_id, empresa_id } = body;

  const empresa = await base44.asServiceRole.entities.Empresa.filter({ id: empresa_id }, null, 1);
  const emp = empresa[0];
  const evolutionUrl = (emp?.evolution_url || Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/$/, '');
  const evolutionKey = emp?.evolution_api_key || Deno.env.get('EVOLUTION_API_KEY');
  const instanceName = emp?.evolution_instance_name || Deno.env.get('EVOLUTION_INSTANCE_NAME');

  // Buscar mensagens da conversa com status entregue ou enviada
  const mensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
    { conversa_id, remetente: 'vendedor' }, '-created_date', 10
  );

  const resultados = [];
  for (const msg of mensagens.slice(0, 5)) {
    if (!msg.whatsapp_message_id) continue;
    try {
      const res = await fetch(`${evolutionUrl}/chat/findMessages/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ where: { key: { id: msg.whatsapp_message_id } }, limit: 1 })
      });
      const data = await res.json();
      const msgs = Array.isArray(data) ? data : (data?.messages?.records || data?.messages || []);
      const ev = msgs[0];
      resultados.push({
        id_banco: msg.id,
        whatsapp_id: msg.whatsapp_message_id,
        status_banco: msg.status,
        texto: msg.texto?.substring(0, 30),
        evolution_status: ev?.status,
        evolution_MessageUpdate: ev?.MessageUpdate,
        evolution_keys: ev ? Object.keys(ev) : []
      });
    } catch (e) {
      resultados.push({ whatsapp_id: msg.whatsapp_message_id, erro: e.message });
    }
  }

  return Response.json({ resultados });
});