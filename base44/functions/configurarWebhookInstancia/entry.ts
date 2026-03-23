import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { instance_name, empresa_id } = body;

  if (!instance_name) return Response.json({ error: 'instance_name obrigatório' }, { status: 400 });

  // Buscar credenciais da empresa
  const empId = empresa_id || '699696c2c9f5bffc2e67402b';
  const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empId });
  const empresa = empresas[0];
  if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

  const evolutionUrl = (empresa.evolution_url || '').replace(/\/$/, '');
  const evolutionKey = empresa.evolution_api_key;

  if (!evolutionUrl || !evolutionKey) {
    return Response.json({ error: 'Evolution não configurado na empresa' }, { status: 400 });
  }

  const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${instance_name}`;

  console.log(`🔧 Configurando webhook para instância: ${instance_name}`);
  console.log(`📡 URL: ${webhookUrl}`);

  // Primeiro verificar se a instância existe
  const checkRes = await fetch(`${evolutionUrl}/instance/fetchInstances`, {
    headers: { 'apikey': evolutionKey }
  });
  
  let instanciaExiste = false;
  if (checkRes.ok) {
    const instancias = await checkRes.json();
    const lista = Array.isArray(instancias) ? instancias : (instancias.data || []);
    instanciaExiste = lista.some(i => i.instance?.instanceName === instance_name || i.name === instance_name || i.instanceName === instance_name);
    console.log(`📋 Instâncias encontradas: ${lista.map(i => i.instance?.instanceName || i.name || i.instanceName).join(', ')}`);
  }

  if (!instanciaExiste) {
    return Response.json({ 
      error: `Instância "${instance_name}" não encontrada no servidor Evolution`,
      dica: 'Verifique o nome exato da instância no painel Evolution'
    }, { status: 404 });
  }

  // Configurar webhook
  const res = await fetch(`${evolutionUrl}/webhook/set/${instance_name}`, {
    method: 'POST',
    headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      enabled: true,
      webhookBase64: false,
      webhookByEvents: false,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE']
    })
  });

  const result = await res.json();
  console.log(`📡 Resposta Evolution: ${JSON.stringify(result)}`);

  return Response.json({
    ok: res.ok,
    status: res.status,
    instance_name,
    webhook_url: webhookUrl,
    resultado: result
  });
});