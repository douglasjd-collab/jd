import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let empresaId = body.empresa_id || user.empresa_id;

    if (!empresaId && user.perfil === 'super_admin') {
      const todasEmps = await base44.asServiceRole.entities.Empresa.filter({}, '-created_date', 50).catch(() => []);
      const empComEvo = todasEmps.find(e => e.evolution_url && e.evolution_api_key && e.evolution_instance_name);
      if (empComEvo) empresaId = empComEvo.id;
    }

    if (!empresaId) return Response.json({ error: 'empresa_id required' }, { status: 400 });

    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    const emp = empresas?.[0];
    if (!emp?.evolution_url || !emp?.evolution_api_key || !emp?.evolution_instance_name) {
      return Response.json({ error: 'Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    console.log(`📊 Diagnóstico de Recebimento - Empresa: ${empresaId}`);
    console.log(`Evolution URL: ${evolutionUrl}`);
    console.log(`Instance: ${instanceName}`);

    // 1. Verificar instância
    console.log(`\n1️⃣ Verificando status da instância...`);
    const instRes = await fetch(`${evolutionUrl}/instance/info/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const instData = instRes.ok ? await instRes.json() : null;
    const instanciaStatus = {
      ok: instRes.ok,
      status: instData?.instance?.status || 'desconhecido',
      numero: instData?.instance?.me?.id || 'não encontrado',
      qrcode: instData?.qrcode ? 'SIM' : 'NÃO'
    };

    // 2. Verificar webhook configurado
    console.log(`\n2️⃣ Verificando webhooks...`);
    const webhooksRes = await fetch(`${evolutionUrl}/webhook/find/${instanceName}`, {
      headers: { 'apikey': evolutionKey }
    });
    const webhooksData = webhooksRes.ok ? await webhooksRes.json() : null;
    const webhooks = webhooksData?.webhooks || [];

    // 3. Buscar logs de recebimento recentes
    console.log(`\n3️⃣ Verificando logs de recebimento...`);
    const logsRecentes = await base44.asServiceRole.entities.LogRecebimentoWebhook.filter(
      { empresa_id: empresaId },
      '-created_date',
      10
    ).catch(() => []);

    const logsComErro = logsRecentes.filter(l => l.status === 'erro');
    const logsSucesso = logsRecentes.filter(l => l.status === 'sucesso');

    // 4. Verificar se há mensagens entrando no banco
    console.log(`\n4️⃣ Verificando mensagens no banco de dados...`);
    const mensagensRecentes = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
      { empresa_id: empresaId, remetente: 'cliente' },
      '-data_envio',
      5
    ).catch(() => []);

    // 5. Contar conversas com mensagens recentes
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-data_ultima_mensagem',
      50
    ).catch(() => []);

    const agora = new Date();
    const uma_hora_atras = new Date(agora.getTime() - 60 * 60 * 1000);
    const conversasComMensagensRecentes = conversas.filter(c => 
      c.data_ultima_mensagem && new Date(c.data_ultima_mensagem) > uma_hora_atras
    );

    return Response.json({
      ok: true,
      diagnostico: {
        instancia: instanciaStatus,
        webhooks: {
          total: webhooks.length,
          configurados: webhooks.map(w => ({
            url: w.url?.substring(0, 80) + '...' || 'sem URL',
            eventos: w.events || []
          }))
        },
        logsRecebimento: {
          totalRecentes: logsRecentes.length,
          comSucesso: logsSucesso.length,
          comErro: logsComErro.length,
          errosExemplo: logsComErro.slice(0, 3).map(l => ({
            tipo: l.tipo_evento,
            erro: l.mensagem_erro?.substring(0, 100)
          }))
        },
        mensagens: {
          recentes: mensagensRecentes.length,
          ultimasNovoMinuto: mensagensRecentes.filter(m => 
            new Date(m.data_envio) > new Date(agora.getTime() - 60000)
          ).length
        },
        conversas: {
          total: conversas.length,
          comMensagensUltimaHora: conversasComMensagensRecentes.length
        }
      },
      recomendacoes: [
        !instanciaStatus.ok ? '❌ Instância não respondendo - conecte novamente' : '✅ Instância OK',
        webhooks.length === 0 ? '❌ Nenhum webhook configurado' : `✅ ${webhooks.length} webhook(s) configurado(s)`,
        logsComErro.length > 0 ? `⚠️ ${logsComErro.length} erros no recebimento` : '✅ Sem erros',
        mensagensRecentes.length === 0 ? '❌ Nenhuma mensagem recebida nos últimos minutos' : `✅ ${mensagensRecentes.length} mensagens recentes`,
        conversasComMensagensRecentes.length === 0 ? '❌ Nenhuma conversa com mensagens na última hora' : `✅ ${conversasComMensagensRecentes.length} conversas ativas`
      ]
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});