import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    return new Response(
      JSON.stringify({ ok: true, user: user?.email ?? null }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "crash",
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : null,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});