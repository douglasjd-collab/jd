// A conexão já existe: uma atualização condicional no mesmo documento é o
// ponto atômico. Nunca adquirir a trava com "consultar e depois criar".
export function chaveContatoWhatsapp(body: any, evento: string): string {
  const d = body?.data || body?.message || body || {};
  const proprio = evento === 'messages.sent' || [d.fromMe, d.key?.fromMe, d.from_me, d.isFromMe]
    .some(v => v === true || v === 1 || v === 'true' || v === '1');
  const destino = proprio ? d.to || d.receiver : d.from;
  const jid = (typeof destino === 'string' ? destino : destino?.jid || destino?.id)
    || d.key?.remoteJid || d.chatId || d.jid || '';
  if (String(jid).includes('@g.us') || String(jid).includes('@broadcast')) return '';
  let telefone = String(jid).split('@')[0].replace(/\D/g, '');
  if (telefone.startsWith('55') && telefone.length === 13) telefone = telefone.slice(0, 4) + telefone.slice(5);
  return telefone ? 'tel_' + telefone : '';
}

export function variantesTelefoneWhatsapp(telefone: string): string[] {
  const t = String(telefone || '').replace(/\D/g, '');
  if (t.startsWith('55') && t.length === 13) return [t, t.slice(0, 4) + t.slice(5)];
  if (t.startsWith('55') && t.length === 12) return [t, t.slice(0, 4) + '9' + t.slice(4)];
  return [t];
}

export async function serializarContatoWhatsapp(
  db: any, connection: any, chave: string, executar: () => Promise<any>,
  opcoes: any = {}
) {
  if (!connection?.id || !chave) return executar();
  const agora = opcoes.agora || Date.now;
  const esperar = opcoes.esperar || ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const token = opcoes.token || crypto.randomUUID();
  const campo = 'processamento_contatos.' + chave;
  const prazo = agora() + (opcoes.esperaMs ?? 12000);
  let adquiriu = false;
  while (true) {
    const instante = agora();
    const resultado = await db.WhatsappConnection.updateMany({
      id: connection.id, empresa_id: connection.empresa_id,
      $or: [
        { [campo + '.expira_em']: { $exists: false } },
        { [campo + '.expira_em']: { $lte: instante } }
      ]
    }, { $set: { [campo]: { token, expira_em: instante + 600000 } } });
    if (resultado.updated === 1) { adquiriu = true; break; }
    if (agora() >= prazo) throw new Error('timeout: contato WhatsApp em processamento; reenviar evento');
    await esperar(200 + Math.floor(Math.random() * 200));
  }
  try {
    return await executar();
  } finally {
    if (adquiriu) {
      // Um processo antigo nunca libera a trava adquirida por outro.
      await db.WhatsappConnection.updateMany({
        id: connection.id, empresa_id: connection.empresa_id, [campo + '.token']: token
      }, { $unset: { [campo]: '' } }).catch(() => {
        console.error('Falha ao liberar trava WhatsApp; expiração automática ativa.');
      });
    }
  }
}
