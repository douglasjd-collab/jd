import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const CANOPUS_USERNAME = Deno.env.get("CANOPUS_USERNAME");
        const CANOPUS_PASSWORD = Deno.env.get("CANOPUS_PASSWORD");

        if (!CANOPUS_USERNAME || !CANOPUS_PASSWORD) {
            return Response.json({ error: 'Credenciais CANOPUS_USERNAME ou CANOPUS_PASSWORD não configuradas.' }, { status: 500 });
        }

        // 1. Realizar Login no Canopus
        const loginUrl = "https://afv.consorciocanopus.com.br/Sistema/login.php";
        const loginFormBody = new URLSearchParams({
            "usuario": CANOPUS_USERNAME,
            "senha": CANOPUS_PASSWORD,
        }).toString();

        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: loginFormBody,
            redirect: 'manual',
        });

        if (!loginResponse.ok && loginResponse.status !== 302) {
            return Response.json({ error: `Falha no login Canopus: ${loginResponse.statusText || loginResponse.status}` }, { status: loginResponse.status });
        }

        const setCookieHeader = loginResponse.headers.get('set-cookie');
        if (!setCookieHeader) {
            return Response.json({ error: 'Não foi possível obter o cookie de sessão após o login.' }, { status: 500 });
        }

        const cookies = setCookieHeader.split(',').map(cookie => cookie.split(';')[0]).join('; ');

        const commonHeaders = {
            'Cookie': cookies,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        // 2. Acessar a página de listagem de vendas
        const salesListPageUrl = "https://afv.consorciocanopus.com.br/Sistema/vendas/listagem_vendas.php";
        const salesListPageResponse = await fetch(salesListPageUrl, { headers: commonHeaders });

        if (!salesListPageResponse.ok) {
            return Response.json({ error: `Falha ao acessar página de vendas: ${salesListPageResponse.statusText}` }, { status: salesListPageResponse.status });
        }
        const salesListHtml = await salesListPageResponse.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(salesListHtml, "text/html");

        if (!doc) {
            return Response.json({ error: 'Falha ao parsear HTML da lista de vendas.' }, { status: 500 });
        }

        const salesToProcess = [];
        const tableRows = doc.querySelectorAll("table.table tbody tr");

        for (const row of tableRows) {
            const columns = row.querySelectorAll("td");
            if (columns.length >= 6) {
                const dataVendaText = columns[0].textContent?.trim() || '';
                const clienteNome = columns[1].textContent?.trim() || '';
                const valorBemText = columns[2].textContent?.trim() || '';
                const contrato = columns[3].textContent?.trim() || '';
                const statusText = columns[5].textContent?.trim() || '';

                const valorBem = parseFloat(valorBemText.replace(/[^0-9,]+/g, "").replace(",", ".")) || 0;

                let status = 'pendente';
                if (statusText.toLowerCase() === 'enviado') {
                    status = 'ativa';
                } else if (statusText.toLowerCase() === 'cancelada') {
                    status = 'cancelada';
                }

                const detailLinkElement = columns[1].querySelector("a");
                const detailRelativeUrl = detailLinkElement ? detailLinkElement.getAttribute("href") : null;

                if (detailRelativeUrl) {
                    const detailUrl = new URL(detailRelativeUrl, salesListPageUrl).href;
                    salesToProcess.push({ dataVendaText, clienteNome, valorBem, contrato, status, detailUrl });
                } else {
                    console.warn(`Link de detalhes não encontrado para a venda: ${contrato}`);
                }
            }
        }

        let createdCount = 0;
        let updatedCount = 0;
        const errors = [];

        for (const saleSummary of salesToProcess) {
            try {
                // 3. Acessar página de detalhes da venda
                const detailPageResponse = await fetch(saleSummary.detailUrl, { headers: commonHeaders });
                if (!detailPageResponse.ok) {
                    throw new Error(`Falha ao acessar detalhes da venda ${saleSummary.contrato}: ${detailPageResponse.statusText}`);
                }
                const detailHtml = await detailPageResponse.text();
                const detailDoc = parser.parseFromString(detailHtml, "text/html");

                if (!detailDoc) {
                    throw new Error('Falha ao parsear HTML dos detalhes da venda.');
                }

                // Extração de detalhes - AJUSTAR SELETORES CONFORME O HTML REAL
                const clienteCPF = findTextContent(detailDoc, "p", "CPF:")?.textContent.replace('CPF:', '').trim() || 'N/A';
                const clienteTelefone = findTextContent(detailDoc, "p", "telefone:")?.textContent.replace(/telefone:/i, '').trim() || 'N/A';
                const clienteEmail = findTextContent(detailDoc, "p", "@")?.textContent.trim() || '';
                const tipoBemElement = detailDoc.querySelector("div.card-body h6");
                const tipoBem = tipoBemElement?.textContent?.split(' ')[0].trim().toLowerCase() || 'automovel';
                const prazoText = detailDoc.querySelector("div.card-body")?.textContent?.match(/(\d+)\s+meses/i)?.[1] || '0';
                const prazo = parseInt(prazoText);

                // 4. Preparar dados para Cliente
                const clientData = {
                    empresa_id: user.empresa_id,
                    external_id: clienteCPF,
                    cpf: clienteCPF,
                    nome_completo: saleSummary.clienteNome,
                    celular: clienteTelefone,
                    email: clienteEmail,
                    tipo_pessoa: clienteCPF.length === 11 ? "Física" : "Jurídica",
                    status: 'ativo',
                };

                // 5. Salvar/Atualizar Cliente
                let clienteId = null;
                const existingClients = await base44.asServiceRole.entities.Cliente.filter({ cpf: clientData.cpf, empresa_id: user.empresa_id });
                if (existingClients.length > 0) {
                    clienteId = existingClients[0].id;
                    await base44.asServiceRole.entities.Cliente.update(clienteId, clientData);
                } else {
                    const newClient = await base44.asServiceRole.entities.Cliente.create(clientData);
                    clienteId = newClient.id;
                }

                // 6. Buscar ou criar Administradora
                let administradoraId = null;
                const administradoras = await base44.asServiceRole.entities.Administradora.filter({ 
                    nome_fantasia: 'Consórcio Canopus', 
                    empresa_id: user.empresa_id 
                });
                if (administradoras.length > 0) {
                    administradoraId = administradoras[0].id;
                } else {
                    const newAdmin = await base44.asServiceRole.entities.Administradora.create({
                        empresa_id: user.empresa_id,
                        razao_social: 'Consórcio Canopus Ltda',
                        nome_fantasia: 'Consórcio Canopus',
                        cnpj: '00000000000000',
                        tipoEmpresa: 'ME',
                        status: 'ativa',
                    });
                    administradoraId = newAdmin.id;
                }

                // 7. Buscar ou criar Tabela
                let tabelaId = null;
                const tabelas = await base44.asServiceRole.entities.TabelaConsorcio.filter({ 
                    nomeTabela: 'Padrão Canopus', 
                    empresa_id: user.empresa_id,
                    administradora_id: administradoraId
                });
                if (tabelas.length > 0) {
                    tabelaId = tabelas[0].id;
                } else {
                    const newTabela = await base44.asServiceRole.entities.TabelaConsorcio.create({
                        empresa_id: user.empresa_id,
                        nomeTabela: 'Padrão Canopus',
                        administradora_id: administradoraId,
                        administradora_nome: 'Consórcio Canopus',
                        tipoEmpresa: 'ME',
                        status: 'ativa',
                    });
                    tabelaId = newTabela.id;
                }

                // 8. Converter data de DD/MM/YYYY para YYYY-MM-DD
                let dataVenda = saleSummary.dataVendaText;
                const dataMatch = saleSummary.dataVendaText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (dataMatch) {
                    dataVenda = `${dataMatch[3]}-${dataMatch[2]}-${dataMatch[1]}`;
                }

                // 9. Preparar dados para Venda
                const saleToSave = {
                    empresa_id: user.empresa_id,
                    external_id: `canopus_${saleSummary.contrato}`,
                    cliente_id: clienteId,
                    cliente_nome: saleSummary.clienteNome,
                    cliente_cpf: clientData.cpf,
                    valorCredito: saleSummary.valorBem,
                    grupo: saleSummary.contrato,
                    tipo: tipoBem === 'automóvel' || tipoBem === 'automovel' ? 'automovel' : 'imovel',
                    data_venda: dataVenda,
                    status: saleSummary.status,
                    vendedor_id: null,
                    vendedor_nome: null,
                    gerente_id: null,
                    gerente_nome: null,
                    administradora_id: administradoraId,
                    administradora_nome: 'Consórcio Canopus',
                    tabela_id: tabelaId,
                    tabela_nome: 'Padrão Canopus',
                    taxaAdministracao: 20,
                    percentualComissao: 0,
                    valorComissao: 0,
                    contrato: saleSummary.contrato,
                };

                // 10. Salvar/Atualizar Venda
                const existingSale = await base44.asServiceRole.entities.Venda.filter({ 
                    external_id: saleToSave.external_id,
                    empresa_id: user.empresa_id
                });
                if (existingSale.length > 0) {
                    await base44.asServiceRole.entities.Venda.update(existingSale[0].id, saleToSave);
                    updatedCount++;
                } else {
                    await base44.asServiceRole.entities.Venda.create(saleToSave);
                    createdCount++;
                }

            } catch (innerError) {
                console.error(`Erro ao processar venda ${saleSummary.contrato}:`, innerError);
                errors.push(`Venda ${saleSummary.contrato}: ${innerError.message}`);
            }
        }

        return Response.json({
            success: true,
            message: `Sincronização concluída. ${createdCount} vendas criadas, ${updatedCount} atualizadas.`,
            totalProcessed: salesToProcess.length,
            created: createdCount,
            updated: updatedCount,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error("Erro geral na sincronização Canopus:", error);
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});

// Função auxiliar para parsing de HTML
function findTextContent(doc, selector, text) {
    const elements = doc.querySelectorAll(selector);
    for (const el of elements) {
        if (el.textContent && el.textContent.includes(text)) {
            return el;
        }
    }
    return null;
}