import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { termoId } = await req.json();
    if (!termoId) return Response.json({ error: 'Documento não informado' }, { status: 400 });

    let termo = null;
    try {
      termo = await base44.asServiceRole.entities.TermoAutorizacao.get(termoId);
    } catch {
      termo = null;
    }

    if (!termo) {
      return Response.json({ encontrado: false });
    }

    let empresaNome = '';
    try {
      const empresa = await base44.asServiceRole.entities.Empresa.get(termo.empresa_id);
      empresaNome = empresa?.nome_fantasia || empresa?.nome || '';
    } catch {}

    let status = 'pendente';
    if (termo.status === 'invalidado') status = 'alterado';
    else if (termo.status === 'assinado' && termo.hash_final) status = 'valido';

    return Response.json({
      encontrado: true,
      numero_termo: termo.id,
      versao: termo.versao,
      data_geracao: termo.data_geracao,
      data_assinatura: termo.data_assinatura,
      empresa: empresaNome,
      cliente_nome: termo.cliente_nome,
      hash_documento: termo.hash_arquivo,
      hash_registrado: termo.hash_final,
      status,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});