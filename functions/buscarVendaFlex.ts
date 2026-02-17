// Helper: normaliza grupo/cota (remove não-numéricos)
function normDigits(v: any) {
  const s = String(v ?? "").trim();
  const d = s.replace(/\D/g, "");
  return d.length ? d : null;
}

// Tenta encontrar a venda com flexibilidade de tipos
async function findFirstFlexible(entity: any, filterBase: any, grupo: any, cota: any) {
  // 1. tenta como string
  let venda = await entity.findFirst({ 
    filter: { ...filterBase, grupo: String(grupo), cota: String(cota) } 
  });
  if (venda) return venda;

  // 2. tenta como número
  const gNum = Number(grupo);
  const cNum = Number(cota);
  if (!Number.isNaN(gNum) && !Number.isNaN(cNum)) {
    venda = await entity.findFirst({ 
      filter: { ...filterBase, grupo: gNum, cota: cNum } 
    });
    if (venda) return venda;
  }

  return null;
}

// Busca venda com fallback entre múltiplas tabelas
export async function buscarVendaFlex(base44: any, args: {
  empresa_id: string;
  produto?: "consorcio" | "financiamento" | "emprestimos";
  grupo: any;
  cota: any;
}) {
  const grupo = normDigits(args.grupo);
  const cota = normDigits(args.cota);

  if (!grupo || !cota) {
    return { venda: null, motivo: "Grupo/cota inválidos no arquivo", produtoEncontrado: null };
  }

  const filterBase = { empresa_id: args.empresa_id };

  const tables: Record<string, any> = {
    consorcio: base44.entities.VendaConsorcio,
    financiamento: base44.entities.VendaFinanciamento,
    emprestimos: base44.entities.VendaConsignado,
  };

  // 1) Se veio produto, tenta primeiro a tabela certa
  if (args.produto && tables[args.produto]) {
    const venda = await findFirstFlexible(tables[args.produto], filterBase, grupo, cota);
    if (venda) return { venda, motivo: null, produtoEncontrado: args.produto };
  }

  // 2) Fallback: tenta nas 3
  const [vC, vF, vE] = await Promise.all([
    findFirstFlexible(tables.consorcio, filterBase, grupo, cota),
    findFirstFlexible(tables.financiamento, filterBase, grupo, cota),
    findFirstFlexible(tables.emprestimos, filterBase, grupo, cota),
  ]);

  const found = [
    { produto: "consorcio", venda: vC },
    { produto: "financiamento", venda: vF },
    { produto: "emprestimos", venda: vE },
  ].filter(x => x.venda);

  if (found.length === 1) {
    return { venda: found[0].venda, motivo: null, produtoEncontrado: found[0].produto };
  }
  if (found.length > 1) {
    return { venda: null, motivo: "Ambíguo: encontrado em mais de uma tabela", produtoEncontrado: null };
  }

  return { venda: null, motivo: "Venda não encontrada por grupo/cota (nenhuma tabela)", produtoEncontrado: null };
}