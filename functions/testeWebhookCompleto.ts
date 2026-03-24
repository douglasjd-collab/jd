import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.empresa_id) {
      return Response.json({ error: 'Empresa não identificada' }, { status: 400 });
    }

    // Simular webhook da Evolution com todos os formatos possíveis
    const testPayloads = [
      {
        name: 'Formato Padrão Evolution',
        payload: {
          event: 'messages.upsert',
          instance: 'TES',
          data: {
            key: {
              id: 'test_msg_001',
              remoteJid: '5585987654321@s.whatsapp.net',
              fromMe: false
            },
            message: {
              conversation: 'Olá, teste de mensagem'
            },
            pushName: 'Cliente Teste',
            timestamp: Date.now()
          }
        }
      },
      {
        name: 'Formato com Base64',
        payload: {
          event: 'messages.upsert',
          instance: 'TES',
          data: Buffer.from(JSON.stringify({
            key: {
              id: 'test_msg_002',
              remoteJid: '5585987654321@s.whatsapp.net',
              fromMe: false
            },
            message: {
              conversation: 'Teste com base64'
            },
            pushName: 'Cliente Teste'
          })).toString('base64')
        }
      },
      {
        name: 'Formato Wrapper',
        payload: {
          data: {
            event: 'messages.upsert',
            instance: 'TES',
            data: {
              key: {
                id: 'test_msg_003',
                remoteJid: '5585987654321@s.whatsapp.net',
                fromMe: false
              },
              message: {
                conversation: 'Teste formato wrapper'
              },
              pushName: 'Cliente Teste'
            }
          }
        }
      }
    ];

    const resultados = [];

    for (const test of testPayloads) {
      try {
        // Fazer POST para o webhook
        const webhookUrl = `https://api.base44.com/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=TES`;
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(test.payload)
        });

        const responseData = await response.json();
        
        resultados.push({
          teste: test.name,
          status: response.status,
          sucesso: response.ok,
          resposta: responseData
        });
      } catch (err) {
        resultados.push({
          teste: test.name,
          status: 'erro',
          sucesso: false,
          erro: err.message
        });
      }
    }

    // Salvar resultados do teste
    await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: user.empresa_id,
      tipo_evento: 'teste_webhook',
      status: 'sucesso',
      conteudo: JSON.stringify(resultados),
      instancia: 'TES',
      timestamp: new Date().toISOString()
    });

    return Response.json({
      sucesso: true,
      mensagem: 'Testes executados',
      testes: resultados,
      proximos_passos: [
        '1. Verifique se as mensagens de teste apareceram em "BatePapo"',
        '2. Se não apareceram, o webhook não está sendo processado corretamente',
        '3. Verifique os logs em "DiagnosticoWebhook"'
      ]
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
});