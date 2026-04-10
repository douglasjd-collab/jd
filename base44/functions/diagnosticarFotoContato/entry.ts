import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * Diagnóstico: testa vários endpoints da Evolution para buscar foto de um contato
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';
    const telefone = body.telefone || '558721510008';

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId });
    if (!empresas?.[0]) return Response.json({ erro: 'Empresa não encontrada' }, { status: 400 });

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url?.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`🔍 Testando Evolution: ${evolutionUrl} | instância: ${instanceName}`);
    console.log(`📱 Telefone: ${telefone}`);

    const resultados = {};

    // Teste 1: fetchProfile POST
    try {
      const r = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefone })
      });
      const json = await r.json().catch(() => null);
      resultados.fetchProfile_POST = { status: r.status, body: json };
      console.log(`Teste 1 fetchProfile POST:`, JSON.stringify(json));
    } catch (e) { resultados.fetchProfile_POST = { erro: e.message }; }

    // Teste 2: getProfilePictureUrl GET com phone
    try {
      const r = await fetch(`${evolutionUrl}/chat/getProfilePictureUrl?instance=${instanceName}&phone=${telefone}`, {
        headers: { 'apikey': evolutionKey }
      });
      const json = await r.json().catch(() => null);
      resultados.getProfilePictureUrl_phone = { status: r.status, body: json };
      console.log(`Teste 2 getProfilePictureUrl phone:`, JSON.stringify(json));
    } catch (e) { resultados.getProfilePictureUrl_phone = { erro: e.message }; }

    // Teste 3: getProfilePictureUrl GET com number
    try {
      const r = await fetch(`${evolutionUrl}/chat/getProfilePictureUrl?instance=${instanceName}&number=${telefone}`, {
        headers: { 'apikey': evolutionKey }
      });
      const json = await r.json().catch(() => null);
      resultados.getProfilePictureUrl_number = { status: r.status, body: json };
      console.log(`Teste 3 getProfilePictureUrl number:`, JSON.stringify(json));
    } catch (e) { resultados.getProfilePictureUrl_number = { erro: e.message }; }

    // Teste 4: fetchProfile v2 style
    try {
      const r = await fetch(`${evolutionUrl}/chat/fetchProfile/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefone })
      });
      const json = await r.json().catch(() => null);
      resultados.chatFetchProfile_POST = { status: r.status, body: json };
      console.log(`Teste 4 chatFetchProfile POST:`, JSON.stringify(json));
    } catch (e) { resultados.chatFetchProfile_POST = { erro: e.message }; }

    // Teste 5: getProfilePicture POST
    try {
      const r = await fetch(`${evolutionUrl}/chat/getProfilePicture/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: telefone })
      });
      const json = await r.json().catch(() => null);
      resultados.getProfilePicture_POST = { status: r.status, body: json };
      console.log(`Teste 5 getProfilePicture POST:`, JSON.stringify(json));
    } catch (e) { resultados.getProfilePicture_POST = { erro: e.message }; }

    // Teste 6: com @s.whatsapp.net
    const jid = `${telefone}@s.whatsapp.net`;
    try {
      const r = await fetch(`${evolutionUrl}/contact/fetchProfile/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: jid })
      });
      const json = await r.json().catch(() => null);
      resultados.fetchProfile_jid = { status: r.status, body: json };
      console.log(`Teste 6 fetchProfile jid:`, JSON.stringify(json));
    } catch (e) { resultados.fetchProfile_jid = { erro: e.message }; }

    return Response.json({
      ok: true,
      evolutionUrl,
      instanceName,
      telefone,
      resultados
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});