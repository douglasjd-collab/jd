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

    // Buscar todos os clientes
    const todosClientes = await base44.entities.Cliente.list('-created_date', 5000);
    console.log('Total de clientes:', todosClientes.length);

    // Diagnosticar
    const semEmpresa = todosClientes.filter(c => !c.empresa_id);
    const comEmpresaErrada = todosClientes.filter(c => c.empresa_id && c.empresa_id !== jdPromotora.id);
    const comEmpresaCorreta = todosClientes.filter(c => c.empresa_id === jdPromotora.id);

    console.log('Sem empresa_id:', semEmpresa.length);
    console.log('Com empresa_id errada:', comEmpresaErrada.length);
    console.log('Com empresa_id correta:', comEmpresaCorreta.length);

    // Corrigir: atualizar todos os clientes sem empresa_id ou com empresa_id errada
    const clientesPraCorrigir = [...semEmpresa, ...comEmpresaErrada];
    let atualizados = 0;
    const erros = [];

    for (const cliente of clientesPraCorrigir) {
      try {
        const updateData = {
          empresa_id: jdPromotora.id
        };
        
        // Se tipo_pessoa está faltando, usar 'Física' como padrão
        if (!cliente.tipo_pessoa) {
          updateData.tipo_pessoa = 'Física';
        }
        
        await base44.entities.Cliente.update(cliente.id, updateData);
        atualizados++;
      } catch (err) {
        console.error(`Erro ao atualizar cliente ${cliente.id}:`, err.message);
        erros.push({
          cliente_id: cliente.id,
          nome: cliente.nome || cliente.nome_completo,
          erro: err.message
        });
      }
    }

    return Response.json({
      sucesso: true,
      empresa_id_jd_promotora: jdPromotora.id,
      diagnostico: {
        total_clientes: todosClientes.length,
        sem_empresa_id: semEmpresa.length,
        com_empresa_errada: comEmpresaErrada.length,
        com_empresa_correta: comEmpresaCorreta.length
      },
      correcoes: {
        clientes_corrigidos: atualizados,
        total_para_corrigir: clientesPraCorrigir.length
      }
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});