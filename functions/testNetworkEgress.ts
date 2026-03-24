Deno.serve(async () => {
  try {
    const r = await fetch("https://httpbin.org/get");
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return Response.json({
      error: e.message,
      stack: e.stack,
    }, { status: 500 });
  }
});