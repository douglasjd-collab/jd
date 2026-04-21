import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id;

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Buscar os chats com @lid que têm nome
    const res = await fetch(`${evolutionUrl}/chat/findChats/${instanceName}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 500 })
    });

    const data = await res.json();
    const chats = Array.isArray(data) ? data : (data.chats?.records || data.chats || []);
    
    // Listar chats @lid com pushName
    const comNome = chats.filter(c => c.pushName && c.remoteJid?.includes('@lid')).slice(0, 10);
    // Listar chats @s.whatsapp.net com e sem nome
    const whatsappChats = chats.filter(c => c.remoteJid?.includes('@s.whatsapp.net')).slice(0, 5);
    // Estatísticas
    const stats = {
      total: chats.length,
      comLid: chats.filter(c => c.remoteJid?.includes('@lid')).length,
      lidComNome: chats.filter(c => c.pushName && c.remoteJid?.includes('@lid')).length,
      whatsappComNome: chats.filter(c => c.pushName && c.remoteJid?.includes('@s.whatsapp.net')).length,
      whatsappSemNome: chats.filter(c => !c.pushName && c.remoteJid?.includes('@s.whatsapp.net')).length,
    };

    // Ver estrutura completa de um chat @lid com nome
    const exemploDouglas = chats.find(c => c.pushName === 'Douglas');

    return Response.json({ ok: true, stats, comNome, whatsappChats, exemploDouglas });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});