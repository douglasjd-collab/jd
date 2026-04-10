import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FINANTOBANK_BASE_URL = 'https://finanto.joinbank.com.br';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      amount,
      document,
      type = 'novo',
      installments,
      benefit_number,
      client_name,
      phone,
      email,
      bank_account,
      address,
      source_bank_code,
      empresa_id,
      vendedor_id,
      vendedor_nome,
      cliente_id,
    } = body;

    if (!amount || !document || !installments || !benefit_number || !client_name) {
      return Response.json({ error: 'Campos obrigatórios: amount, document, installments, benefit_number, client_name' }, { status: 400 });
    }

    const accessToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN');
    if (!accessToken) return Response.json({ error: 'Token do FinantoBank não configurado' }, { status: 500 });

    const payload = {
      amount,
      document: document.replace(/\D/g, ''),
      type,
      installments,
      benefit_number,
      client_name,
      phone,
      email,
      bank_account,
      address,
    };
    if (source_bank_code) payload.source_bank_code = source_bank_code;

    const resp = await fetch(`${FINANTOBANK_BASE_URL}/inss/proposal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return Response.json({ error: 'Erro na API do FinantoBank', details: data }, { status: resp.status });
    }

    // Salvar proposta no CRM
    const propostaData = {
      empresa_id,
      produto: 'emprestimo',
      cliente_id: cliente_id || null,
      cliente_nome: client_name,
      cliente_cpf: document.replace(/\D/g, ''),
      vendedor_id: vendedor_id || null,
      vendedor_nome: vendedor_nome || null,
      emprestimo_numero_beneficio: benefit_number,
      emprestimo_prazo: installments,
      valor_credito: amount,
      emprestimo_tipo: 'inss',
      status: 'Simulação FinantoBank',
      status_atual: 'simulacao',
      finantobank_id: String(data.id || data.proposal_id || ''),
      finantobank_tipo: type,
      status_finantobank: data.status || 'simulado',
      finantobank_valor_parcela: data.installment_value || data.installment || null,
      finantobank_taxa: data.fee || data.rate || null,
      finantobank_iof: data.iof || null,
      data_ultima_atualizacao_finantobank: new Date().toISOString(),
      finantobank_saldo_aprovado: false,
      payload_ultima_resposta_finantobank: JSON.stringify(data),
      api_sincronizada: true,
      data_ultima_atualizacao_api: new Date().toISOString(),
    };

    const proposta = await base44.entities.Proposta.create(propostaData);

    return Response.json({
      success: true,
      proposta_id: proposta.id,
      finantobank_id: propostaData.finantobank_id,
      simulacao: data,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});