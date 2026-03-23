import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { vendaData } = await req.json();

        // Se não tem empresa_id e usuário não é master, usar empresa do usuário
        let empresaId = vendaData.empresa_id;
        if (!empresaId && user.empresa_id) {
            empresaId = user.empresa_id;
        }

        // Master precisa informar empresa_id
        if (!empresaId) {
            return Response.json({ error: 'empresa_id é obrigatório' }, { status: 400 });
        }

        // Validar se cliente pertence à empresa (exceto master)
        if (!['master', 'super_admin'].includes(user.perfil)) {
            const cliente = await base44.asServiceRole.entities.Cliente.filter({ id: vendaData.cliente_id });
            if (cliente.length === 0 || cliente[0].empresa_id !== empresaId) {
                return Response.json({ error: 'Cliente não encontrado ou não pertence à sua empresa' }, { status: 400 });
            }
        }

        // Buscar dados denormalizados
        const [cliente, administradora, tabela, vendedor, gerente] = await Promise.all([
            base44.asServiceRole.entities.Cliente.filter({ id: vendaData.cliente_id }).then(r => r[0]),
            base44.asServiceRole.entities.Administradora.filter({ id: vendaData.administradora_id }).then(r => r[0]),
            base44.asServiceRole.entities.TabelaConsorcio.filter({ id: vendaData.tabela_id }).then(r => r[0]),
            base44.asServiceRole.entities.User.filter({ id: vendaData.vendedor_id }).then(r => r[0]),
            vendaData.gerente_id ? base44.asServiceRole.entities.User.filter({ id: vendaData.gerente_id }).then(r => r[0]) : null
        ]);

        // Calcular comissão
        const valorCredito = parseFloat(vendaData.valorCredito) || 0;
        const taxaAdministracao = parseFloat(vendaData.taxaAdministracao) || 0;
        const tipoEmpresa = tabela?.tipoEmpresa;
        
        let percentualComissao = 0;
        if (tipoEmpresa === 'MEI') {
            percentualComissao = taxaAdministracao * 0.25;
        } else if (tipoEmpresa === 'ME' || tipoEmpresa === 'LTDA') {
            percentualComissao = taxaAdministracao * 0.30;
        }
        
        const valorComissao = valorCredito * (percentualComissao / 100);

        // Criar venda
        const novaVenda = await base44.asServiceRole.entities.Venda.create({
            empresa_id: empresaId,
            cliente_id: vendaData.cliente_id,
            cliente_nome: cliente?.nome,
            cliente_cpf: cliente?.cpf,
            administradora_id: vendaData.administradora_id,
            administradora_nome: administradora?.nome_fantasia || administradora?.razao_social,
            tabela_id: vendaData.tabela_id,
            tabela_nome: tabela?.nomeTabela,
            tipoEmpresa: tipoEmpresa,
            grupo: vendaData.grupo,
            cota: vendaData.cota || '',
            contrato: vendaData.contrato || '',
            valorCredito: valorCredito,
            taxaAdministracao: taxaAdministracao,
            percentualComissao: percentualComissao,
            valorComissao: valorComissao,
            vendedor_id: vendaData.vendedor_id,
            vendedor_nome: vendedor?.full_name,
            gerente_id: vendaData.gerente_id || null,
            gerente_nome: gerente?.full_name || null,
            data_venda: vendaData.data_venda,
            status: vendaData.status || 'ativa',
            comissao_total_prevista: valorComissao,
            comissao_total_recebida: 0
        });

        // Buscar configurações de comissão
        const configs = await base44.asServiceRole.entities.ConfiguracaoComissao.filter({ status: 'ativo' });
        const configVendedor = configs.find(c => c.tipo === 'vendedor');
        const configGerente = configs.find(c => c.tipo === 'gerente');

        // Criar comissões previstas
        const comissoes = [];

        // Comissão do vendedor
        if (configVendedor && vendedor) {
            const valorComissaoVendedor = valorComissao * (configVendedor.percentual / 100);
            comissoes.push({
                venda_id: novaVenda.id,
                usuario_id: vendedor.id,
                usuario_nome: vendedor.full_name,
                usuario_perfil: 'vendedor',
                tipo_comissao: 'faturamento',
                tipo: 'pagar',
                valor: valorComissaoVendedor,
                percentual: configVendedor.percentual,
                status: 'prevista'
            });
        }

        // Comissão do gerente
        if (configGerente && gerente) {
            const valorComissaoGerente = valorComissao * (configGerente.percentual / 100);
            comissoes.push({
                venda_id: novaVenda.id,
                usuario_id: gerente.id,
                usuario_nome: gerente.full_name,
                usuario_perfil: 'gerente',
                tipo_comissao: 'faturamento',
                tipo: 'pagar',
                valor: valorComissaoGerente,
                percentual: configGerente.percentual,
                status: 'prevista'
            });
        }

        // Salvar comissões
        for (const comissao of comissoes) {
            await base44.asServiceRole.entities.Comissao.create(comissao);
        }

        // Log de auditoria
        await base44.asServiceRole.entities.LogAuditoria.create({
            usuario_id: user.id,
            usuario_nome: user.full_name,
            acao: `Criou venda ${novaVenda.grupo}/${novaVenda.cota}`,
            entidade: 'Venda',
            entidade_id: novaVenda.id,
            tipo: 'criacao',
            dados_novos: JSON.stringify(novaVenda)
        });

        return Response.json({ success: true, venda: novaVenda });
    } catch (error) {
        console.error('Erro ao criar venda:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});