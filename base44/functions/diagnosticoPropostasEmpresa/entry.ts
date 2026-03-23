import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Apenas admin e super_admin podem diagnosticar
    if (!user || !['admin', 'super_admin', 'master'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Buscar ID da empresa JD Promotora
    const empresas = await base44.entities.Empresa.list();
    const jdPromotora = empresas.find(e => e.nome && e.nome.includes('JD Promotora'));
    
    if (!jdPromotora) {
      return Response.json({ 
        error: 'Empresa JD Promotora não encontrada',
        empresas: empresas.map(e => ({ id: e.id, nome: e.nome }))
      }, { status: 404 });
    }

    console.log('JD Promotora ID:', jdPromotora.id);

    // Buscar todas as propostas
    const todasPropostas = await base44.entities.Proposta.list('-created_date', 5000);
    console.log('Total de propostas:', todasPropostas.length);

    // Diagnosticar
    const semEmpresa = todasPropostas.filter(p => !p.empresa_id);
    const comEmpresaErrada = todasPropostas.filter(p => p.empresa_id && p.empresa_id !== jdPromotora.id);
    const comEmpresaCorreta = todasPropostas.filter(p => p.empresa_id === jdPromotora.id);

    console.log('Sem empresa_id:', semEmpresa.length);
    console.log('Com empresa_id errada:', comEmpresaErrada.length);
    console.log('Com empresa_id correta:', comEmpresaCorreta.length);

    // Corrigir: atualizar todas as propostas sem empresa_id ou com empresa_id errada
    const propostasPraCorrigir = [...semEmpresa, ...comEmpresaErrada];
    let atualizadas = 0;
    const erros = [];

    for (const proposta of propostasPraCorrigir) {
      try {
        await base44.entities.Proposta.update(proposta.id, {
          empresa_id: jdPromotora.id
        });
        atualizadas++;
      } catch (err) {
        console.error(`Erro ao atualizar proposta ${proposta.id}:`, err.message);
        erros.push({
          proposta_id: proposta.id,
          cliente: proposta.cliente_nome,
          erro: err.message
        });
      }
    }

    return Response.json({
      sucesso: true,
      empresa_id_jd_promotora: jdPromotora.id,
      diagnostico: {
        total_propostas: todasPropostas.length,
        sem_empresa_id: semEmpresa.length,
        com_empresa_errada: comEmpresaErrada.length,
        com_empresa_correta: comEmpresaCorreta.length
      },
      correcoes: {
        propostas_corrigidas: atualizadas,
        total_para_corrigir: propostasPraCorrigir.length,
        erros_correcao: erros.length > 0 ? erros : []
      }
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});