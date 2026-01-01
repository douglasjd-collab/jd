Deno.serve(async (req) => {
  try {
    const { action, payload } = await req.json();

    if (!action) {
      return Response.json({
        error: "Ação não informada"
      }, { status: 400 });
    }

    // Exemplo de ações RPA
    if (action === "NOTIFICAR_VENDEDOR") {
      // aqui futuramente entra envio de e-mail, webhook, etc
      return Response.json({
        success: true,
        message: "RPA executado com sucesso",
        payload
      });
    }

    return Response.json({
      error: "Ação RPA desconhecida"
    }, { status: 400 });
  } catch (error) {
    return Response.json({
      error: error.message
    }, { status: 500 });
  }
});