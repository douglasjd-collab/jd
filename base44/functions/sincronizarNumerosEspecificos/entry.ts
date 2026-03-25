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

    let sincronizadas = 0;
    let criadas = 0;
    let erros = [];

    for (const numero of numeros) {
      try {
        const numeroFormatado = numero.replace(/\D/g, '');
        
        // Chamar função de sincronização existente para cada número
        const respSync = await base44.asServiceRole.functions.invoke('sincronizarTodosChatsCompleto', {
          empresa_id,
          numero: numeroFormatado
        });

        if (respSync?.data?.ok) {
          const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
            empresa_id,
            cliente_telefone: numeroFormatado
          }, '-created_date', 1);

          if (conversas.length > 0) {
            const conversaExistia = conversas[0].created_date && 
              (new Date() - new Date(conversas[0].created_date)) > 5000;
            
            if (conversaExistia) {
              sincronizadas++;
            } else {
              criadas++;
            }
          } else {
            criadas++;
          }
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
      detalhes_erros: erros.length > 0 ? erros.slice(0, 5) : []
    });
  } catch (error) {
    console.error('Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});