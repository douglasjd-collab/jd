import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * SOLUÇÃO 3 - Atualização automática a cada X horas
 * Scheduled automation: tenta atualizar foto dos contatos sem foto
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id obrigatório' }, { status: 400 });
    }

    // Buscar todos os contatos da empresa
    const contatos = await base44.entities.ContatoWhatsapp.filter(
      { empresa_id },
      '-updated_date',
      1000
    );

    let atualizados = 0;
    const erros = [];

    // SOLUÇÃO 4: Fallback - contatos sem foto já usam iniciais
    for (const contato of contatos) {
      // Se já tem foto, pular
      if (contato.foto_url) continue;

      // Tentar buscar foto da API
      // Aqui você faria chamada para Evolution API se configurado
      // Por enquanto, apenas marca que foi verificado
      
      try {
        // Exemplo: chamar Evolution API se configurado
        // const foto = await buscarFotoEvolutionAPI(contato.telefone);
        // if (foto) {
        //   await base44.entities.ContatoWhatsapp.update(contato.id, { foto_url: foto });
        //   atualizados++;
        // }
      } catch (err) {
        erros.push({ contato_id: contato.id, erro: err.message });
      }
    }

    console.log(`✅ Verificadas ${contatos.length} contatos | ${atualizados} com foto atualizada`);

    return Response.json({
      ok: true,
      total_contatos: contatos.length,
      atualizados,
      sem_foto: contatos.filter(c => !c.foto_url).length,
      erros: erros.length > 0 ? erros : null
    });
  } catch (error) {
    console.error('Erro ao atualizar fotos:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});