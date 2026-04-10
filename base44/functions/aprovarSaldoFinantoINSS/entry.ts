import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const FINANTOBANK_BASE_URL = 'https://finanto.joinbank.com.br';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { finantobank_id, proposta_id, amount, document, benefit_number } = body;

    if (!finantobank_id || !proposta_id || !amount || !document || !benefit_number) {
      return Response.json({ error: 'Campos obrigatórios: finantobank_id, proposta_id, amount, document, benefit_number' }, { status: 400 });
    }

    const accessToken = Deno.env.get('FINANTOBANK_ACCESS_TOKEN');
    if (!accessToken) return Response.json({ error: 'Token do FinantoBank não configurado' }, { status: 500 });

    const resp = await fetch(`${FINANTOBANK_BASE_URL}/inss/balance-approval/${finantobank_id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        document: document.replace(/\D/g, ''),
        benefit_number,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // Atualizar proposta com erro
      await base44.entities.Proposta.update(proposta_id, {
        api_ultimo_erro: `Aprovação falhou: ${JSON.stringify(data)}`,
        data_ultima_atualizacao_finantobank: new Date().toISOString(),
      });
      return Response.json({ error: 'Erro na aprovação de saldo', details: data }, { status: resp.status });
    }

    const aprovado = data.status === 'SUCCESS' || data.status === 'APPROVED' || resp.ok;

    // Atualizar proposta no CRM
    await base44.entities.Proposta.update(proposta_id, {
      finantobank_saldo_aprovado: aprovado,
      status_finantobank: data.status || 'aprovado',
      status: aprovado ? 'Saldo Aprovado' : 'Aprovação Pendente',
      status_atual: aprovado ? 'saldo_aprovado' : 'aprovacao_pendente',
      data_ultima_atualizacao_finantobank: new Date().toISOString(),
      payload_ultima_resposta_finantobank: JSON.stringify(data),
      data_ultima_atualizacao_api: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      aprovado,
      status: data.status,
      detalhes: data,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});