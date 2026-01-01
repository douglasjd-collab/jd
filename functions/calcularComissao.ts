Deno.serve(async (req) => {
  try {
    const { valorCredito, taxaAdministracao, tipoEmpresa } = await req.json();

    if (!valorCredito || !taxaAdministracao || !tipoEmpresa) {
      return Response.json({
        error: "Dados obrigatórios não informados"
      }, { status: 400 });
    }

    let fatorEmpresa = 0;

    if (tipoEmpresa === "MEI") fatorEmpresa = 0.25;
    if (tipoEmpresa === "ME") fatorEmpresa = 0.30;
    if (tipoEmpresa === "LTDA") fatorEmpresa = 0.30;

    if (fatorEmpresa === 0) {
      return Response.json({
        error: "Tipo de empresa inválido"
      }, { status: 400 });
    }

    const percentualComissao = taxaAdministracao * fatorEmpresa;
    const valorComissao = valorCredito * (percentualComissao / 100);

    return Response.json({
      percentualComissao,
      valorComissao
    });
  } catch (error) {
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});