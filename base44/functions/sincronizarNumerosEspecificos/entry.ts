import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, numeros } = await req.json();
    if (!empresa_id || !numeros || !Array.isArray(numeros)) {
      return Response.json({ error: 'Missing empresa_id or numeros array' }, { status: 400 });
    }

    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    const instanceName = Deno.env.get('EVOLUTION_INSTANCE_NAME');

    if (!evolutionUrl || !evolutionKey || !instanceName) {
      return Response.json({ error: 'Evolution config missing' }, { status: 500 });
    }

    let sincronizadas = 0;
    let criadas = 0;
    let erros = [];

    for (const numero of numeros) {
      try {
        const numeroFormatado = numero.replace(/\D/g, '');
        
        // Chamar Evolution para sincronizar histórico
        const respEvolution = await fetch(
          `${evolutionUrl}/message/fetchProfile?instance=${instanceName}&remote=${numeroFormatado}@c.us`,
          { headers: { 'apikey': evolutionKey } }
        );

        if (!respEvolution.ok) {
          console.warn(`⚠️ Não conseguiu carregar perfil do ${numeroFormatado}`);
        }

        // Sincronizar mensagens do Evolution
        const respMsgs = await fetch(
          `${evolutionUrl}/chat/messages?instance=${instanceName}&number=${numeroFormatado}&limit=500`,
          { headers: { 'apikey': evolutionKey } }
        );

        const mensagens = respMsgs.ok ? await respMsgs.json() : [];

        // Verificar se conversa já existe
        const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id,
          cliente_telefone: numeroFormatado
        });

        let conversaId;
        if (conversasExistentes.length > 0) {
          conversaId = conversasExistentes[0].id;
          sincronizadas++;
        } else {
          // Criar nova conversa
          const novaConversa = await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id,
            cliente_id: '',
            cliente_nome: numeroFormatado,
            cliente_telefone: numeroFormatado,
            whatsapp_id: `${numeroFormatado}@c.us`,
            status: 'ativa',
            ultima_mensagem: '',
            data_ultima_mensagem: new Date().toISOString()
          });
          conversaId = novaConversa.id;
          criadas++;
        }

        // Inserir mensagens histórico
        if (mensagens && Array.isArray(mensagens)) {
          for (const msg of mensagens) {
            try {
              const msgExiste = await base44.asServiceRole.entities.MensagemWhatsapp.filter({
                conversa_id: conversaId,
                mensagem_id: msg.id
              });

              if (msgExiste.length === 0) {
                await base44.asServiceRole.entities.MensagemWhatsapp.create({
                  conversa_id: conversaId,
                  mensagem_id: msg.id,
                  remetente: msg.fromMe ? 'vendedor' : 'cliente',
                  tipo_conteudo: msg.type || 'texto',
                  texto: msg.body || '',
                  data_envio: msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : new Date().toISOString(),
                  status: 'lida'
                });
              }
            } catch (e) {
              console.error(`Erro ao inserir mensagem para ${numeroFormatado}:`, e);
            }
          }
        }

        // Atualizar última mensagem da conversa
        if (mensagens && mensagens.length > 0) {
          const ultimaMsg = mensagens[mensagens.length - 1];
          await base44.asServiceRole.entities.ConversaWhatsapp.update(conversaId, {
            ultima_mensagem: ultimaMsg.body || '(arquivo)',
            data_ultima_mensagem: ultimaMsg.timestamp ? new Date(ultimaMsg.timestamp * 1000).toISOString() : new Date().toISOString()
          });
        }
      } catch (e) {
        console.error(`Erro ao processar ${numero}:`, e);
        erros.push({ numero, erro: e.message });
      }
    }

    return Response.json({
      ok: true,
      total: numeros.length,
      sincronizadas,
      criadas,
      erros: erros.length,
      detalhes_erros: erros
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});