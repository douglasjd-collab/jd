import { createClientFromRequest } from "npm:@base44/sdk@0.8.6";
import cheerio from "npm:cheerio@1.0.0-rc.12";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    const body = await req.json().catch(() => ({}));
    
    const $ = cheerio.load("<html></html>");
    
    return Response.json({ ok: true, user: user?.email ?? null, body, cheerio_loaded: true });
  } catch (e) {
    return Response.json({
      error: "crash",
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : null,
    }, { status: 500 });
  }
});