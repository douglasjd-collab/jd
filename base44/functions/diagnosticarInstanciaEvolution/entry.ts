import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { instancia } = payload;

    if (!instancia) {
      return Response.json({ error: 'Instância não informada' }, { status: 400 });
    }

    // Buscar configurações da Evolution (do banco ou env)
    const configs = await base44.entities.ConfiguracaoSistema.filter({ 
      chave: { $in: ['evolution_api_url', 'evolution_api_key'] }
    });
    
    const configMap = {};
    configs.forEach(c => { configMap[c.chave] = c.valor; });

    let apiUrl = configMap['evolution_api_url'];
    let apiKey = configMap['evolution_api_key'];

    // Fallback: usar secrets do ambiente se não estiver no banco
    if (!apiUrl) apiUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!apiKey) apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiUrl || !apiKey) {
      return Response.json({ error: 'Configurações da Evolution não encontradas. Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.' }, { status: 400 });
    }

    // 1. Verificar status da instância
    const statusRes = await fetch(`${apiUrl}/instance/checkInstance?instanceName=${instancia}`, {
      headers: { 'apikey': apiKey }
    });
    const statusData = await statusRes.json();

    // 2. Buscar versão atual do WhatsApp Web na instância
    const versaoRes = await fetch(`${apiUrl}/instance/fetchInstance?instanceName=${instancia}`, {
      headers: { 'apikey': apiKey }
    });
    const versaoData = await versaoRes.json();

    // 3. Verificar versão mais recente disponível
    const versaoAtual = versaoData?.release?.whatsappVersion || '2.3000.1015910647';
    const versaoRecomendada = await buscarVersaoRecomendada();

    // 4. Testar envio de mensagem
    const testeEnvio = {
      sucesso: false,
      erro: null,
    };

    try {
      const testeRes = await fetch(`${apiUrl}/message/sendText`, {
        method: 'POST',
        headers: { 
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instance: instancia,
          number: '5511999999999', // Número fictício para teste
          textMessage: { text: '[TESTE AUTOMÁTICO] Verificação de envio' }
        })
      });
      
      const testeData = await testeRes.json();
      
      if (testeRes.ok && testeData.messageId) {
        testeEnvio.sucesso = true;
      } else {
        testeEnvio.erro = testeData.error?.message || JSON.stringify(testeData);
      }
    } catch (e) {
      testeEnvio.erro = e.message;
    }

    // 5. Determinar ações necessárias
    const acoesRecomendadas = [];
    
    if (!statusData.exists) {
      acoesRecomendadas.push({ tipo: 'reconectar', motivo: 'Instância não existe' });
    } else if (!testeEnvio.sucesso) {
      if (versaoAtual !== versaoRecomendada) {
        acoesRecomendadas.push({ 
          tipo: 'atualizar_whatsapp', 
          motivo: `Versão atual (${versaoAtual}) difere da recomendada (${versaoRecomendada})` 
        });
      }
      acoesRecomendadas.push({ tipo: 'reiniciar', motivo: 'Falha no envio de mensagens' });
    }

    // 6. Salvar diagnóstico no banco
    const diagnostico = {
      instancia,
      data_verificacao: new Date().toISOString(),
      status_conexao: statusData.exists ? 'conectado' : 'desconectado',
      status_envio: testeEnvio.sucesso ? 'ok' : 'bloqueado',
      versao_whatsapp_atual: versaoAtual,
      versao_whatsapp_recomendada: versaoRecomendada,
      ultimo_erro_envio: testeEnvio.erro,
      acoes_recomendadas: acoesRecomendadas,
    };

    await base44.entities.ConfiguracaoSistema.updateMany(
      { chave: `evolution_${instancia}_diagnostico` },
      { $set: { valor: JSON.stringify(diagnostico) } }
    );

    // Se não existir, criar
    const existentes = await base44.entities.ConfiguracaoSistema.filter({ 
      chave: `evolution_${instancia}_diagnostico` 
    });
    
    if (existentes.length === 0) {
      await base44.entities.ConfiguracaoSistema.create({
        chave: `evolution_${instancia}_diagnostico`,
        valor: JSON.stringify(diagnostico)
      });
    }

    return Response.json({
      sucesso: true,
      diagnostico,
      teste_envio: testeEnvio,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function buscarVersaoRecomendada() {
  try {
    // Tentar GitHub primeiro
    const githubRes = await fetch('https://api.github.com/repos/Evolution-API/Evolution-API/releases/latest');
    if (githubRes.ok) {
      const data = await githubRes.json();
      const tag = data.tag_name || '';
      const match = tag.match(/v?(\d+\.\d+\.\d+)/);
      if (match) return match[1];
    }

    // Fallback: versão estável conhecida
    return '2.3000.1015910647';
  } catch {
    return '2.3000.1015910647';
  }
}