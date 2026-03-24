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
        error: 'Empresa JD Promotora não encontrada'
      }, { status: 404 });
    }

    console.log('JD Promotora ID:', jdPromotora.id);

    // Buscar todas as vendas
    const todasVendas = await base44.entities.Venda.list('-created_date', 5000);
    console.log('Total de vendas:', todasVendas.length);

    // Diagnosticar
    const semEmpresa = todasVendas.filter(v => !v.empresa_id);
    const comEmpresaErrada = todasVendas.filter(v => v.empresa_id && v.empresa_id !== jdPromotora.id);
    const comEmpresaCorreta = todasVendas.filter(v => v.empresa_id === jdPromotora.id);

    console.log('Sem empresa_id:', semEmpresa.length);
    console.log('Com empresa_id errada:', comEmpresaErrada.length);
    console.log('Com empresa_id correta:', comEmpresaCorreta.length);

    // Corrigir: atualizar todas as vendas sem empresa_id ou com empresa_id errada
    const vendaePraCorrigir = [...semEmpresa, ...comEmpresaErrada];
    let atualizadas = 0;
    const erros = [];

    for (const venda of vendaePraCorrigir) {
      try {
        await base44.entities.Venda.update(venda.id, {
          empresa_id: jdPromotora.id
        });
        atualizadas++;
      } catch (err) {
        console.error(`Erro ao atualizar venda ${venda.id}:`, err.message);
        erros.push({
          venda_id: venda.id,
          cliente: venda.cliente_nome,
          erro: err.message
        });
      }
    }

    return Response.json({
      sucesso: true,
      empresa_id_jd_promotora: jdPromotora.id,
      diagnostico: {
        total_vendas: todasVendas.length,
        sem_empresa_id: semEmpresa.length,
        com_empresa_errada: comEmpresaErrada.length,
        com_empresa_correta: comEmpresaCorreta.length
      },
      correcoes: {
        vendas_corrigidas: atualizadas,
        total_para_corrigir: vendaePraCorrigir.length,
        erros_correcao: erros.length > 0 ? erros : []
      }
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});