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

    let criadas = 0;
    let erros = [];

    for (const numero of numeros) {
      try {
        const numeroFormatado = numero.replace(/\D/g, '');
        
        // Verificar se conversa já existe
        const conversasExistentes = await base44.asServiceRole.entities.ConversaWhatsapp.filter({
          empresa_id,
          cliente_telefone: numeroFormatado
        });

        if (conversasExistentes.length === 0) {
          // Criar nova conversa se não existir
          await base44.asServiceRole.entities.ConversaWhatsapp.create({
            empresa_id,
            cliente_id: '',
            cliente_nome: numeroFormatado,
            cliente_telefone: numeroFormatado,
            whatsapp_id: `${numeroFormatado}@c.us`,
            status: 'ativa',
            ultima_mensagem: 'Carregando histórico...',
            data_ultima_mensagem: new Date().toISOString()
          });
          criadas++;
        }
      } catch (e) {
        console.error(`Erro ao processar ${numero}:`, e.message);
        erros.push({ numero, erro: e.message });
      }
    }

    return Response.json({
      ok: true,
      total: numeros.length,
      criadas,
      erros: erros.length
    });
  } catch (error) {
    console.error('Erro geral:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});