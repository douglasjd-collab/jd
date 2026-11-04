import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { carregarConversaAutorizada } from '../../shared/acessoWhatsappShared.ts';

const MAX_BYTES = 15 * 1024 * 1024;
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    if (typeof body.url !== 'string') return Response.json({ error: 'URL obrigatória' }, { status: 400 });
    const url = new URL(body.url);
    // Este endpoint só baixa anexos já registrados, nunca URLs arbitrárias.
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['backblazeb2.com', 'supabase.co', 'supabase.in', 'amazonaws.com', 'base44.app']
          .some(d => host.endsWith('.' + d))) {
      return Response.json({ error: 'Origem de arquivo não permitida' }, { status: 400 });
    }
    const variantes = [...new Set([body.url, url.href, decodeURI(url.href)])];
    const db = base44.asServiceRole.entities;
    const mensagens = body.mensagem_id
      ? [await db.MensagemWhatsapp.get(body.mensagem_id)]
      : await db.MensagemWhatsapp.filter({ arquivo_url: { $in: variantes } }, '-created_date', 50);
    let mensagem = null;
    for (const candidata of mensagens || []) {
      if (!candidata || !variantes.includes(candidata.arquivo_url)) continue;
      const acesso = await carregarConversaAutorizada({ base44, user, conversaId: candidata.conversa_id });
      if (!('erro' in acesso)) { mensagem = candidata; break; }
    }
    if (!mensagem) return Response.json({ error: 'Arquivo indisponível ou sem permissão' }, { status: 403 });
    const resposta = await fetch(url.href, { redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) return Response.json({ error: 'Falha ao obter arquivo' }, { status: 502 });
    if (Number(resposta.headers.get('content-length')) > MAX_BYTES) {
      return Response.json({ error: 'Arquivo excede 15 MB' }, { status: 413 });
    }
    const reader = resposta.body?.getReader();
    if (!reader) return Response.json({ error: 'Arquivo vazio' }, { status: 502 });
    const partes: Uint8Array[] = [];
    let tamanho = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      tamanho += value.byteLength;
      if (tamanho > MAX_BYTES) {
        await reader.cancel();
        return Response.json({ error: 'Arquivo excede 15 MB' }, { status: 413 });
      }
      partes.push(value);
    }
    let binario = '';
    for (const parte of partes) {
      for (let i = 0; i < parte.length; i += 8192) {
        binario += String.fromCharCode(...parte.subarray(i, i + 8192));
      }
    }
    return Response.json({
      base64: btoa(binario),
      mime_type: resposta.headers.get('content-type') || 'application/octet-stream'
    });
  } catch (erro: any) {
    console.error('Falha no download do anexo:', erro?.status || erro?.response?.status || '', erro?.message || 'erro desconhecido');
    return Response.json({ error: 'Não foi possível obter o anexo' }, { status: 502 });
  }
}
