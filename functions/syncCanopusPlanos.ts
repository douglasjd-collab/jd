import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    const body = await req.json().catch(() => ({}));
    
    return Response.json({ ok: true, user: user?.email ?? null, body });
  } catch (e) {
    return Response.json({
      error: "crash",
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    }, { status: 500 });
  }
});