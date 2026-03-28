import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { telefone } = await req.json();

    if (!telefone) {
      return Response.json({ error: 'Telefone não fornecido' }, { status: 400 });
    }

    console.log(`\n${'='.repeat(100)}`);
    console.log(`🔍 PUXANDO MENSAGENS AGRESSIVAS: ${telefone}`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // CONFIG
    // ════════════════════════════════════════════════════════════════════
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Evolution API não configurada' }, { status: 500 });
    }

    const jid = `${telefone}@s.whatsapp.net`;
    const telefoneLimpo = telefone.replace(/\D/g, '');

    console.log(`URL: ${evolutionUrl}`);
    console.log(`Instance: ${instanceName}`);
    console.log(`JID: ${jid}`);
    console.log(`Telefone limpo: ${telefoneLimpo}\n`);

    // ════════════════════════════════════════════════════════════════════
    // ESTRATÉGIA 1: Fetch do Histórico (getMessage)
    // ════════════════════════════════════════════════════════════════════
    let mensagensEvolution = [];

    try {
      console.log('[TENTATIVA 1] Endpoint: /message/{instance}/getMessage');
      const url1 = `${evolutionUrl}/message/${instanceName}/getMessage`;
      console.log(`GET ${url1}?remoteJid=${jid}`);

      const res1 = await fetch(`${url1}?remoteJid=${jid}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionKey,
        },
      });

      if (res1.ok) {
        const data1 = await res1.json();
        if (data1.messages) {
          mensagensEvolution = data1.messages;
          console.log(`✅ Sucesso! ${mensagensEvolution.length} mensagens encontradas\n`);
        }
      } else {
        console.log(`⚠️ Status ${res1.status}\n`);
      }
    } catch (e) {
      console.log(`❌ Erro: ${e.message}\n`);
    }

    // ════════════════════════════════════════════════════════════════════
    // ESTRATÉGIA 2: Fetch de Chat (chatFind)
    // ════════════════════════════════════════════════════════════════════
    if (mensagensEvolution.length === 0) {
      try {
        console.log('[TENTATIVA 2] Endpoint: /chat/{instance}/findMessages');
        const url2 = `${evolutionUrl}/chat/${instanceName}/findMessages`;
        console.log(`POST ${url2}`);

        const res2 = await fetch(url2, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
          body: JSON.stringify({
            remoteJid: jid,
            limit: 100,
          }),
        });

        if (res2.ok) {
          const data2 = await res2.json();
          if (data2.messages) {
            mensagensEvolution = data2.messages;
            console.log(`✅ Sucesso! ${mensagensEvolution.length} mensagens encontradas\n`);
          }
        } else {
          console.log(`⚠️ Status ${res2.status}\n`);
        }
      } catch (e) {
        console.log(`❌ Erro: ${e.message}\n`);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // ESTRATÉGIA 3: Listar todos os chats e filtrar
    // ════════════════════════════════════════════════════════════════════
    if (mensagensEvolution.length === 0) {
      try {
        console.log('[TENTATIVA 3] Endpoint: /chat/{instance}/findAll (todos os chats)');
        const url3 = `${evolutionUrl}/chat/${instanceName}/findAll`;
        console.log(`GET ${url3}`);

        const res3 = await fetch(url3, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionKey,
          },
        });

        if (res3.ok) {
          const data3 = await res3.json();
          const chats = Array.isArray(data3) ? data3 : data3.chats || data3.data || [];
          console.log(`Encontrados ${chats.length} chats no total`);

          // Procurar pelo JID ou telefone
          const chatAlvo = chats.find(c =>
            c.jid === jid ||
            c.remoteJid === jid ||
            c.id === jid ||
            c.id?.includes(telefoneLimpo) ||
            c.jid?.includes(telefoneLimpo)
          );

          if (chatAlvo) {
            console.log(`✅ Chat encontrado: ${chatAlvo.jid || chatAlvo.remoteJid || chatAlvo.id}`);

            // Agora puxar mensagens deste chat
            try {
              const url3b = `${evolutionUrl}/message/${instanceName}/getMessage`;
              const res3b = await fetch(`${url3b}?remoteJid=${chatAlvo.jid || chatAlvo.remoteJid}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': evolutionKey,
                },
              });

              if (res3b.ok) {
                const data3b = await res3b.json();
                if (data3b.messages) {
                  mensagensEvolution = data3b.messages;
                  console.log(`✅ ${mensagensEvolution.length} mensagens do chat\n`);
                }
              }
            } catch (e) {
              console.log(`❌ Erro ao buscar mensagens do chat: ${e.message}\n`);
            }
          } else {
            console.log(`⚠️ Chat não encontrado para ${jid}\n`);
          }
        } else {
          console.log(`⚠️ Status ${res3.status}\n`);
        }
      } catch (e) {
        console.log(`❌ Erro: ${e.message}\n`);
      }
    }

    // ════════════════════════════════════════════════════════════════════
    // Formatar mensagens
    // ════════════════════════════════════════════════════════════════════
    const mensagensFormatadas = (mensagensEvolution || []).map((msg, idx) => ({
      sequencia: idx + 1,
      id: msg.key?.id || msg.id || `msg_${idx}`,
      de: msg.key?.fromMe ? 'VENDEDOR' : 'CLIENTE',
      remetente: msg.key?.fromMe ? 'vendedor' : 'cliente',
      timestamp: msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000).toLocaleString('pt-BR') : '',
      tipo: msg.message?.conversation ? 'texto' : msg.message?.imageMessage ? 'imagem' : msg.message?.audioMessage ? 'áudio' : 'outro',
      conteudo: msg.message?.conversation || msg.message?.extendedTextMessage?.text || '[Arquivo/Mídia]',
      raw: JSON.stringify(msg, null, 2),
    }));

    console.log(`${'='.repeat(100)}`);
    console.log(`✅ TOTAL ENCONTRADO NA EVOLUTION: ${mensagensFormatadas.length} mensagens`);
    console.log(`${'='.repeat(100)}\n`);

    // ════════════════════════════════════════════════════════════════════
    // Buscar o que está no CRM
    // ════════════════════════════════════════════════════════════════════
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
    const empresaId = empresas[0]?.id;

    let mensagensNCRM = [];
    if (empresaId) {
      const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
        empresa_id: empresaId,
        cliente_telefone: telefoneLimpo,
      }, null, 1);

      if (conversas.length > 0) {
        mensagensNCRM = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
          conversa_id: conversas[0].id,
        }, '-created_date', 1000);
      }
    }

    console.log(`No CRM: ${mensagensNCRM.length} mensagens\n`);

    return Response.json({
      telefone: telefoneLimpo,
      evolution: {
        total: mensagensFormatadas.length,
        mensagens: mensagensFormatadas,
      },
      crm: {
        total: mensagensNCRM.length,
        mensagens: mensagensNCRM,
      },
      diferenca: mensagensFormatadas.length - mensagensNCRM.length,
    });

  } catch (error) {
    console.error('[ERRO CRÍTICO]:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});