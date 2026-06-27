import { createClientFromRequest } from 'npm:@base44/sdk@0.8.34';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json();
    const { instancia, acao } = payload;

    if (!instancia) {
      return Response.json({ error: 'Instância não informada' }, { status: 400 });
    }

    // Buscar configurações da Evolution
    const configs = await base44.entities.ConfiguracaoSistema.filter({ 
      chave: { $in: ['evolution_api_url', 'evolution_api_key'] }
    });
    
    const configMap = {};
    configs.forEach(c => { configMap[c.chave] = c.valor; });

    const apiUrl = configMap['evolution_api_url'];
    const apiKey = configMap['evolution_api_key'];

    if (!apiUrl || !apiKey) {
      return Response.json({ error: 'Configurações da Evolution não encontradas' }, { status: 400 });
    }

    let resultado = { acao, sucesso: false, mensagem: '' };

    // Executar ação solicitada
    if (acao === 'reiniciar') {
      // 1. Desconectar instância
      await fetch(`${apiUrl}/instance/logout/${instancia}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey }
      });

      // Aguardar 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Conectar novamente
      const connectRes = await fetch(`${apiUrl}/instance/connect`, {
        method: 'POST',
        headers: { 
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instanceName: instancia })
      });

      const connectData = await connectRes.json();

      if (connectRes.ok || connectData.status === 'connecting') {
        resultado.sucesso = true;
        resultado.mensagem = 'Instância reiniciada com sucesso. Aguardando conexão...';
        resultado.qr_code = connectData.base64 || null;
      } else {
        resultado.mensagem = 'Falha ao reiniciar: ' + JSON.stringify(connectData);
      }
    }

    else if (acao === 'atualizar_whatsapp') {
      // Atualizar versão do WhatsApp Web na instância
      const versaoRes = await fetch('https://api.github.com/repos/pedroslopez/whatsapp-web.js/releases/latest');
      let versaoAlvo = '2.3000.1015910647'; // Versão estável conhecida
      
      if (versaoRes.ok) {
        const data = await versaoRes.json();
        const match = data.tag_name?.match(/v?(\d+\.\d+\.\d+)/);
        if (match) versaoAlvo = match[1];
      }

      // Atualizar variável de ambiente na instância (se usando EasyPanel)
      const easypanelConfig = await base44.entities.ConfiguracaoSistema.filter({
        chave: { $in: ['easypanel_url', 'easypanel_token', 'easypanel_service', 'easypanel_project'] }
      });

      const epConfig = {};
      easypanelConfig.forEach(c => { epConfig[c.chave] = c.valor; });

      if (epConfig['easypanel_url'] && epConfig['easypanel_token']) {
        // Atualizar via EasyPanel API
        const serviceId = epConfig['easypanel_service'];
        const projectId = epConfig['easypanel_project'];
        const epUrl = epConfig['easypanel_url'].replace(/\/$/, '');
        
        // Buscar variáveis atuais
        const varsRes = await fetch(`${epUrl}/api/services/${serviceId}/environment-variables`, {
          headers: { 
            'Authorization': `Bearer ${epConfig['easypanel_token']}`,
            'Content-Type': 'application/json'
          }
        });

        if (varsRes.ok) {
          const varsData = await varsRes.json();
          const envVars = varsData.data || [];
          
          // Atualizar variável WHATSAPP_VERSION
          const updatedVars = envVars.map(v => 
            v.name === 'WHATSAPP_VERSION' ? { ...v, value: versaoAlvo } : v
          );

          // Se não existir, adicionar
          if (!updatedVars.find(v => v.name === 'WHATSAPP_VERSION')) {
            updatedVars.push({
              name: 'WHATSAPP_VERSION',
              value: versaoAlvo
            });
          }

          // Atualizar serviço
          const updateRes = await fetch(`${epUrl}/api/projects/${projectId}/services/${serviceId}/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${epConfig['easypanel_token']}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              environmentVariables: updatedVars
            })
          });

          if (updateRes.ok) {
            resultado.sucesso = true;
            resultado.mensagem = `Versão do WhatsApp Web atualizada para ${versaoAlvo}. Serviço será reiniciado automaticamente.`;
          } else {
            resultado.mensagem = 'Falha ao atualizar via EasyPanel';
          }
        }
      } else {
        resultado.mensagem = 'EasyPanel não configurado. Atualização manual necessária.';
      }
    }

    else if (acao === 'testar_envio') {
      const { telefone, mensagem } = payload;
      
      if (!telefone) {
        return Response.json({ error: 'Telefone não informado' }, { status: 400 });
      }

      const testeRes = await fetch(`${apiUrl}/message/sendText`, {
        method: 'POST',
        headers: { 
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instance: instancia,
          number: telefone.replace(/\D/g, ''),
          textMessage: { text: mensagem || '[TESTE] Verificação de envio' }
        })
      });

      const testeData = await testeRes.json();

      if (testeRes.ok && testeData.messageId) {
        resultado.sucesso = true;
        resultado.mensagem = 'Mensagem enviada com sucesso!';
        resultado.messageId = testeData.messageId;
      } else {
        resultado.mensagem = 'Falha no envio: ' + (testeData.error?.message || JSON.stringify(testeData));
      }
    }

    else if (acao === 'gerar_qr') {
      const connectRes = await fetch(`${apiUrl}/instance/connect`, {
        method: 'POST',
        headers: { 
          'apikey': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ instanceName: instancia })
      });

      const connectData = await connectRes.json();

      if (connectData.base64) {
        resultado.sucesso = true;
        resultado.mensagem = 'QR Code gerado com sucesso';
        resultado.qr_code = connectData.base64;
      } else {
        resultado.mensagem = 'Falha ao gerar QR Code: ' + JSON.stringify(connectData);
      }
    }

    // Registrar log da ação
    await base44.entities.ConfiguracaoSistema.create({
      chave: `evolution_${instancia}_log_${Date.now()}`,
      valor: JSON.stringify({
        acao,
        resultado: resultado.sucesso ? 'sucesso' : 'falha',
        mensagem: resultado.mensagem,
        usuario: user.full_name || user.email,
        data: new Date().toISOString()
      })
    });

    return Response.json(resultado);

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});