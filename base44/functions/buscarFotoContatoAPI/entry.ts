import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * Busca foto do contato via API Evolution
 * SOLUÇÃO 2 - Buscar foto manualmente via API
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { contato_id, telefone, empresa_id } = await req.json();

    if (!empresa_id || (!contato_id && !telefone)) {
      return Response.json({ error: 'contato_id ou telefone obrigatório' }, { status: 400 });
    }

    // Se tem ID, já tem o contato
    if (contato_id) {
      const contato = await base44.entities.ContatoWhatsapp.list();
      const target = contato.find(c => c.id === contato_id);
      if (target) return Response.json({ foto_url: target.foto_url || null });
    }

    // Se tem telefone, buscar ou criar contato
    if (telefone) {
      const telLimpo = telefone.replace(/\D/g, '');
      const variacoes = [telLimpo];
      if (telLimpo.startsWith('55')) {
        variacoes.push(telLimpo.slice(0, 4) + '9' + telLimpo.slice(4));
        variacoes.push(telLimpo.slice(0, 4) + telLimpo.slice(5));
      }

      for (const tel of variacoes) {
        const contatosEncontrados = await base44.entities.ContatoWhatsapp.filter({
          empresa_id,
          telefone: tel
        }, '-created_date', 1);

        if (contatosEncontrados?.length > 0) {
          return Response.json({ foto_url: contatosEncontrados[0].foto_url || null });
        }
      }

      // SOLUÇÃO 1: Criar automaticamente se não existir
      const novoContato = await base44.entities.ContatoWhatsapp.create({
        empresa_id,
        telefone: telLimpo,
        nome: telLimpo, // Usar o próprio número como nome padrão
      });

      return Response.json({ 
        foto_url: null,
        criado: true,
        contato_id: novoContato.id,
        mensagem: 'Contato criado automaticamente'
      });
    }

    return Response.json({ erro: 'Não foi possível localizar o contato' }, { status: 404 });
  } catch (error) {
    console.error('Erro ao buscar foto:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});