import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id } = await req.json();
    if (!empresa_id) return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });

    console.log(`🚀 Sincronizando histórico AGRESSIVO para empresa: ${empresa_id}`);

    // 1. Buscar TODAS as conversas (sem limite)
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id },
      '-created_date',
      10000
    );

    console.log(`📊 Total de conversas: ${conversas.length}`);

    if (conversas.length === 0) {
      return Response.json({ ok: true, mensagem: 'Nenhuma conversa para sincronizar', total: 0 });
    }

    // 2. Sincronizar em PARALELO (máx 5 simultaneamente para não sobrecarregar)
    const batchSize = 5;
    let sincronizadas = 0;
    let erros = 0;

    for (let i = 0; i < conversas.length; i += batchSize) {
      const batch = conversas.slice(i, i + batchSize);
      
      console.log(`⏳ Processando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(conversas.length / batchSize)}`);

      // Executar em paralelo
      const promessas = batch.map(async (conversa) => {
        try {
          if (!conversa.id || !conversa.cliente_telefone) {
            console.warn(`⚠️ Conversa inválida: ${conversa.id}`);
            return;
          }

          // Chamar função de sincronização de histórico
          const resp = await base44.asServiceRole.functions.invoke('importarMensagensConversa', {
            empresa_id,
            telefone: conversa.cliente_telefone,
            conversa_id: conversa.id
          });

          if (resp?.data?.ok) {
            sincronizadas++;
            console.log(`✅ ${conversa.cliente_telefone}: ${resp.data.novasMensagens || 0} mensagens`);
          } else {
            erros++;
            console.warn(`⚠️ ${conversa.cliente_telefone}: ${resp?.data?.erro || 'Erro desconhecido'}`);
          }
        } catch (e) {
          erros++;
          console.error(`❌ Erro sincronizando ${conversa.cliente_telefone}:`, e.message);
        }
      });

      await Promise.all(promessas);

      // Aguardar 1s entre batches para rate limit
      if (i + batchSize < conversas.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const mensagem = `✅ Sincronizado ${sincronizadas}/${conversas.length} conversas | ${erros} erros`;
    console.log(mensagem);

    return Response.json({
      ok: true,
      mensagem,
      total: conversas.length,
      sincronizadas,
      erros
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});