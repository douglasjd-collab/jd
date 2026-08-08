import { createClientFromRequest } from "npm:@base44/sdk";

const norm = (value: unknown) => String(value ?? "").trim();
const normDigits = (value: unknown) => norm(value).replace(/\D/g, "");
const iguais = (a: unknown, b: unknown) => {
  const sa = norm(a);
  const sb = norm(b);
  if (sa && sb && sa === sb) return true;
  const da = normDigits(a);
  const db = normDigits(b);
  return !!(da && db && da === db);
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (!["admin", "gerente", "master", "super_admin"].includes(user.perfil || user.role)) {
      return Response.json({ error: "Sem permissão para reprocessar importações" }, { status: 403 });
    }

    const { importacao_id } = await req.json();
    if (!importacao_id) return Response.json({ error: "importacao_id é obrigatório" }, { status: 400 });

    const importacao = await base44.asServiceRole.entities.Importacao.get(importacao_id);
    if (!importacao) return Response.json({ error: "Importação não encontrada" }, { status: 404 });
    if ((importacao.produto || "consorcio") !== "consorcio") {
      return Response.json({ error: "Esta rotina está disponível apenas para comissão de consórcio" }, { status: 400 });
    }

    const itens = await base44.asServiceRole.entities.ImportacaoItem.filter(
      { importacao_id, status: "divergencia" },
      "linha",
      1000
    );
    if (!itens.length) {
      return Response.json({ success: true, encontrados: 0, processados: 0, permanecem_divergentes: 0, mensagem: "Não há divergências para reprocessar" });
    }

    const [vendasConsorcio, vendasLegado, configuracoes, recebimentosAdmin] = await Promise.all([
      base44.asServiceRole.entities.VendaConsorcio.filter({ administradora_id: importacao.administradora_id }, null, 5000),
      base44.asServiceRole.entities.Venda.filter({ administradora_id: importacao.administradora_id }, null, 5000),
      base44.asServiceRole.entities.ConfiguracaoComissao.filter({ tipo: "vendedor", status: "ativo" }, "-created_date", 1),
      base44.asServiceRole.entities.RecebimentoComissao.filter({ administradora_id: importacao.administradora_id }, "-created_date", 10000),
    ]);

    const percentualPadrao = Number(configuracoes?.[0]?.percentual ?? 100);
    const todasVendas = [
      ...vendasConsorcio.map((v: any) => ({ ...v, venda_base_id: v.venda_base_id || v.id, venda_consorcio_id: v.id })),
      ...vendasLegado.map((v: any) => ({ ...v, venda_base_id: v.id, venda_legado_id: v.id })),
    ];

    const hashesOutrasImportacoes = new Set(
      recebimentosAdmin
        .filter((r: any) => r.origem_importacao_id !== importacao_id)
        .map((r: any) => r.hash_duplicidade)
        .filter(Boolean)
    );

    let processados = 0;
    let recuperados = 0;
    const detalhes = [];
    const vendasAfetadas = new Set<string>();

    for (const item of itens) {
      try {
        const recebimentoJaCriado = recebimentosAdmin.find((r: any) =>
          r.origem_importacao_id === importacao_id &&
          Number(r.linha_importacao) === Number(item.linha)
        );

        if (recebimentoJaCriado) {
          const comissoes = await base44.asServiceRole.entities.ComissaoAPagar.filter(
            { recebimento_id: recebimentoJaCriado.id },
            "-created_date",
            1
          );
          if (!comissoes.length && recebimentoJaCriado.vendedor_id) {
            await base44.asServiceRole.entities.ComissaoAPagar.create({
              empresa_id: recebimentoJaCriado.empresa_id,
              recebimento_id: recebimentoJaCriado.id,
              venda_id: recebimentoJaCriado.venda_id,
              cliente_id: recebimentoJaCriado.cliente_id,
              cliente_nome: recebimentoJaCriado.cliente_nome,
              vendedor_id: recebimentoJaCriado.vendedor_id,
              vendedor_nome: recebimentoJaCriado.vendedor_nome,
              administradora_id: recebimentoJaCriado.administradora_id,
              administradora_nome: recebimentoJaCriado.administradora_nome,
              grupo: recebimentoJaCriado.grupo,
              cota: recebimentoJaCriado.cota,
              contrato: recebimentoJaCriado.contrato,
              parcela_numero: recebimentoJaCriado.parcela_informada,
              data_recebimento: recebimentoJaCriado.data_recebimento,
              valor_recebido: recebimentoJaCriado.valor_recebido,
              percentual_comissao: recebimentoJaCriado.percentual_comissao,
              valor_a_pagar: recebimentoJaCriado.valor_a_pagar,
              status_pagamento: "a_pagar",
            });
          }
          await base44.asServiceRole.entities.ImportacaoItem.update(item.id, {
            venda_id: recebimentoJaCriado.venda_id,
            status: "processado",
            motivo_divergencia: null,
            vendedor_nome: recebimentoJaCriado.vendedor_nome || null,
          });
          vendasAfetadas.add(recebimentoJaCriado.venda_id);
          recuperados++;
          detalhes.push({ linha: item.linha, contrato: item.contrato, status: "recuperado" });
          continue;
        }

        const contrato = norm(item.contrato);
        let candidatos = contrato
          ? todasVendas.filter((v: any) => norm(v.contrato) === contrato)
          : [];

        if (!contrato && item.grupo && item.cota) {
          candidatos = todasVendas.filter((v: any) =>
            iguais(v.grupo, item.grupo) && iguais(v.cota, item.cota)
          );
        }

        const unicos = new Map<string, any>();
        candidatos.forEach((v: any) => {
          const key = v.venda_base_id || v.id;
          if (!unicos.has(key)) unicos.set(key, v);
        });
        candidatos = [...unicos.values()];

        if (candidatos.length !== 1) {
          const motivo = candidatos.length > 1
            ? "Múltiplas vendas encontradas após reprocessamento"
            : (contrato ? "Venda não encontrada pelo contrato" : "Venda não encontrada por grupo/cota");
          await base44.asServiceRole.entities.ImportacaoItem.update(item.id, { motivo_divergencia: motivo });
          detalhes.push({ linha: item.linha, contrato, status: "divergencia", motivo });
          continue;
        }

        const venda = candidatos[0];
        const vendaId = venda.venda_base_id;
        const dataRecebimento = item.data_recebimento || new Date().toISOString().slice(0, 10);
        const valorRecebido = Number(item.valor_recebido || 0);
        const hash = `${vendaId}_${dataRecebimento}_${valorRecebido}`;

        if (hashesOutrasImportacoes.has(hash)) {
          const motivo = "Recebimento duplicado em outra importação";
          await base44.asServiceRole.entities.ImportacaoItem.update(item.id, { motivo_divergencia: motivo });
          detalhes.push({ linha: item.linha, contrato, status: "divergencia", motivo });
          continue;
        }

        const valorAPagar = valorRecebido * (percentualPadrao / 100);
        const recebimento = await base44.asServiceRole.entities.RecebimentoComissao.create({
          empresa_id: venda.empresa_id || importacao.empresa_id,
          venda_id: vendaId,
          cliente_id: venda.cliente_id,
          cliente_nome: venda.cliente_nome,
          vendedor_id: venda.vendedor_id,
          vendedor_nome: venda.vendedor_nome,
          administradora_id: venda.administradora_id || importacao.administradora_id,
          administradora_nome: venda.administradora_nome || importacao.administradora_nome,
          grupo: venda.grupo || norm(item.grupo),
          cota: venda.cota || norm(item.cota),
          contrato: venda.contrato || contrato,
          data_recebimento: dataRecebimento,
          valor_recebido: valorRecebido,
          parcela_informada: Number(item.parcela || 0) || null,
          origem_importacao_id: importacao_id,
          linha_importacao: Number(item.linha || 0),
          hash_duplicidade: hash,
          percentual_comissao: percentualPadrao,
          valor_a_pagar: valorAPagar,
          status_recebimento: "recebida",
          status_pagamento: "a_pagar",
        });

        if (venda.vendedor_id) {
          await base44.asServiceRole.entities.ComissaoAPagar.create({
            empresa_id: venda.empresa_id || importacao.empresa_id,
            recebimento_id: recebimento.id,
            venda_id: vendaId,
            cliente_id: venda.cliente_id,
            cliente_nome: venda.cliente_nome,
            vendedor_id: venda.vendedor_id,
            vendedor_nome: venda.vendedor_nome,
            administradora_id: venda.administradora_id || importacao.administradora_id,
            administradora_nome: venda.administradora_nome || importacao.administradora_nome,
            grupo: venda.grupo || norm(item.grupo),
            cota: venda.cota || norm(item.cota),
            contrato: venda.contrato || contrato,
            parcela_numero: Number(item.parcela || 0) || null,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            percentual_comissao: percentualPadrao,
            valor_a_pagar: valorAPagar,
            status_pagamento: "a_pagar",
          });
        }

        await base44.asServiceRole.entities.ImportacaoItem.update(item.id, {
          venda_id: vendaId,
          status: "processado",
          motivo_divergencia: null,
          vendedor_nome: venda.vendedor_nome || null,
        });

        vendasAfetadas.add(vendaId);
        processados++;
        detalhes.push({ linha: item.linha, contrato, status: "processado" });
      } catch (erroItem) {
        const motivo = `Erro ao reprocessar: ${erroItem.message}`;
        await base44.asServiceRole.entities.ImportacaoItem.update(item.id, { motivo_divergencia: motivo }).catch(() => {});
        detalhes.push({ linha: item.linha, contrato: item.contrato, status: "erro", motivo });
      }
    }

    for (const vendaId of vendasAfetadas) {
      const recebimentosVenda = await base44.asServiceRole.entities.RecebimentoComissao.filter({ venda_id: vendaId }, null, 10000);
      const totalRecebido = recebimentosVenda.reduce((soma: number, r: any) => soma + Number(r.valor_recebido || 0), 0);
      const vendaConsorcio = vendasConsorcio.find((v: any) => (v.venda_base_id || v.id) === vendaId);
      if (vendaConsorcio) {
        await base44.asServiceRole.entities.VendaConsorcio.update(vendaConsorcio.id, { comissao_total_recebida: totalRecebido });
      }
      const vendaLegado = vendasLegado.find((v: any) => v.id === vendaId);
      if (vendaLegado) {
        await base44.asServiceRole.entities.Venda.update(vendaLegado.id, { comissao_total_recebida: totalRecebido });
      }
    }

    const itensAtualizados = await base44.asServiceRole.entities.ImportacaoItem.filter({ importacao_id }, "linha", 2000);
    const totalProcessados = itensAtualizados.filter((i: any) => i.status === "processado").length;
    const totalDivergencias = itensAtualizados.filter((i: any) => i.status === "divergencia").length;
    const recebimentosImportacao = await base44.asServiceRole.entities.RecebimentoComissao.filter({ origem_importacao_id: importacao_id }, null, 10000);
    const novoValorTotal = recebimentosImportacao.reduce((soma: number, r: any) => soma + Number(r.valor_recebido || 0), 0);

    await base44.asServiceRole.entities.Importacao.update(importacao_id, {
      status: "concluida",
      registros_processados: totalProcessados,
      registros_divergencia: totalDivergencias,
      valor_total: novoValorTotal,
    });

    const receitas = await base44.asServiceRole.entities.Receita.filter({ importacao_id }, "-created_date", 1);
    if (receitas.length) {
      await base44.asServiceRole.entities.Receita.update(receitas[0].id, { valor: novoValorTotal });
    } else if (novoValorTotal > 0) {
      await base44.asServiceRole.entities.Receita.create({
        empresa_id: importacao.empresa_id,
        descricao: `Comissão recebida - ${importacao.arquivo_nome || "Importação"} (Consórcio)`,
        categoria_id: "69797622be76bff3afbfdefd",
        categoria_nome: "Consórcio",
        valor: novoValorTotal,
        data: new Date().toISOString().slice(0, 10),
        data_recebimento: new Date().toISOString().slice(0, 10),
        status: "recebida",
        origem: "Importação Comissão Consórcio",
        importacao_id,
        usuario_id: user.id,
        usuario_nome: user.full_name || user.email,
      });
    }

    return Response.json({
      success: true,
      analisados: itens.length,
      processados,
      recuperados,
      permanecem_divergentes: totalDivergencias,
      total_processados: totalProcessados,
      valor_total: novoValorTotal,
      detalhes,
    });
  } catch (error) {
    console.error("Erro reprocessarDivergenciasImportacao:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
