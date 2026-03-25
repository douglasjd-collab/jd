import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Apenas admins podem executar
    if (!['master', 'super_admin', 'admin'].includes(user.perfil)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const empresaId = user.empresa_id || '699696c2c9f5bffc2e67402b';
    const hoje = new Date();
    const umAnoAtras = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());

    // Buscar todas as vendas quitadas/concluídas
    const vendas = await base44.asServiceRole.entities.Venda.filter({ 
      empresa_id: empresaId,
      status: { $in: ['quitada', 'contemplada', 'paga'] }
    }, '-updated_date', 10000);

    let campanhasEnviadas = 0;
    let erros = 0;
    const resultado = {
      ok: true,
      campanhasEnviadas,
      erros,
      detalhes: []
    };

    for (const venda of vendas) {
      try {
        // Verificar se a venda foi atualizada há aprox. 1 ano atrás
        const dataVenda = venda.updated_date ? new Date(venda.updated_date) : new Date(venda.created_date);
        const diasPassados = Math.floor((hoje - dataVenda) / (1000 * 60 * 60 * 24));

        // Se passou entre 360 e 375 dias (± 2 semanas de margem)
        if (diasPassados < 360 || diasPassados > 375) {
          continue;
        }

        // Buscar cliente
        const clientes = await base44.asServiceRole.entities.Cliente.filter({ 
          id: venda.cliente_id 
        });

        if (!clientes || clientes.length === 0) {
          erros++;
          resultado.detalhes.push({
            venda_id: venda.id,
            erro: 'Cliente não encontrado'
          });
          continue;
        }

        const cliente = clientes[0];
        const telefone = cliente.celular || cliente.pj_celular;

        if (!telefone) {
          erros++;
          resultado.detalhes.push({
            venda_id: venda.id,
            cliente_id: cliente.id,
            erro: 'Telefone não encontrado'
          });
          continue;
        }

        // Verificar se já enviou campanha recentemente
        const campanhasExistentes = await base44.asServiceRole.entities.CampanhaLog.filter({
          venda_id: venda.id,
          tipo_campanha: 'aniversario_emprestimo'
        });

        // Filtrar campanhas enviadas nos últimos 30 dias
        const campanhasRecentes = campanhasExistentes.filter(c => {
          const dataCampanha = new Date(c.created_date);
          const diasDesdeEnvio = Math.floor((hoje - dataCampanha) / (1000 * 60 * 60 * 24));
          return diasDesdeEnvio < 30;
        });

        if (campanhasRecentes.length > 0) {
          continue;
        }

        // Preparar mensagem
        const tipoVenda = venda.tipo === 'automovel' ? 'empréstimo' : venda.tipo || 'produto';
        const mensagem = `Olá ${cliente.nome_completo || cliente.pj_razao_social || 'Cliente'}! 👋\n\nFaz um ano que você realizou seu ${tipoVenda} conosco! 🎉\n\nQueremos oferecer uma nova proposta especial para você aumentar seu crédito!\n\nEntre em contato conosco para conhecer as melhores condições. 💼`;

        // Enviar mensagem via WhatsApp
        const respMensagem = await base44.functions.invoke('enviarMensagemWhatsapp', {
          conversa_id: '',
          mensagem_texto: mensagem,
          numero_cliente: telefone,
          empresa_id: empresaId,
          arquivo: null
        });

        if (respMensagem?.data?.success) {
          // Registrar campanha enviada
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id: empresaId,
            cliente_id: cliente.id,
            cliente_nome: cliente.nome_completo || cliente.pj_razao_social,
            cliente_telefone: telefone,
            venda_id: venda.id,
            tipo_campanha: 'aniversario_emprestimo',
            mensagem_enviada: mensagem,
            status: 'enviada',
            data_original_quitacao: venda.updated_date || venda.created_date
          });

          campanhasEnviadas++;
          resultado.detalhes.push({
            venda_id: venda.id,
            cliente_id: cliente.id,
            status: 'sucesso'
          });
        } else {
          erros++;
          resultado.detalhes.push({
            venda_id: venda.id,
            cliente_id: cliente.id,
            erro: 'Falha ao enviar mensagem'
          });
        }
      } catch (e) {
        erros++;
        resultado.detalhes.push({
          venda_id: venda.id,
          erro: e.message
        });
      }
    }

    resultado.campanhasEnviadas = campanhasEnviadas;
    resultado.erros = erros;

    return Response.json(resultado);
  } catch (error) {
    console.error('Erro em verificarEEnviarCampanhas:', error);
    return Response.json({ 
      error: error.message,
      ok: false 
    }, { status: 500 });
  }
});