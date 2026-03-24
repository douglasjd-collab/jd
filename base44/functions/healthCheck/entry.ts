Deno.serve(async (req) => {
  return Response.json({
    success: true,
    status: "ok",
    message: "Backend Functions ativo no Base44",
    timestamp: new Date().toISOString()
  });
});