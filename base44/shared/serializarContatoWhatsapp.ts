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

// A plataforma recusa $set/$unset em caminho aninhado ("operator is incompatible
// with the field type"), então a trava é gravada no campo INTEIRO
// (processamento_contatos) e a exclusão mútua vem do updated_date: só grava quem
// ainda está na versão do documento que leu (compare-and-swap). Se a trava não
// puder ser adquirida por falha da plataforma, o evento segue sem trava — a
// deduplicação por whatsapp_message_id continua valendo e a mensagem não se perde.
export async function serializarContatoWhatsapp(
  db: any, connection: any, chave: string, executar: () => Promise<any>,
  opcoes: any = {}
) {
  if (!connection?.id || !chave) return executar();
  const agora = opcoes.agora || Date.now;
  const esperar = opcoes.esperar || ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const token = opcoes.token || crypto.randomUUID();
  const prazo = agora() + (opcoes.esperaMs ?? 12000);
  const expiracao = () => agora() + 600000;
  let adquiriu = false;

  const lerMapa = (registro: any) => {
    const bruto = registro?.processamento_contatos;
    return bruto && typeof bruto === 'object' ? { ...bruto } : {};
  };

  while (true) {
    const instante = agora();
    let atual: any = null;
    let mapa: any = {};
    try {
      atual = await db.WhatsappConnection.get(connection.id);
      mapa = lerMapa(atual);
    } catch (e: any) {
      console.error(`⚠️ [Trava contato ${chave}] Falha ao ler conexão — seguindo sem trava:`, e?.message);
      return executar();
    }

    // Travas vencidas de qualquer contato saem no mesmo write (o campo é gravado inteiro).
    for (const [k, v] of Object.entries(mapa)) {
      if (!v || typeof v !== 'object' || !(v as any).expira_em || (v as any).expira_em <= instante) delete mapa[k];
    }

    const travado = mapa[chave];
    if (travado && travado.expira_em > instante) {
      if (agora() >= prazo) throw new Error('timeout: contato WhatsApp em processamento; reenviar evento');
      await esperar(200 + Math.floor(Math.random() * 200));
      continue;
    }

    mapa[chave] = { token, expira_em: expiracao() };
    let resultado: any = null;
    try {
      resultado = await db.WhatsappConnection.updateMany({
        id: connection.id,
        empresa_id: connection.empresa_id,
        updated_date: atual?.updated_date
      }, { $set: { processamento_contatos: mapa } });
    } catch (e: any) {
      console.error(`⚠️ [Trava contato ${chave}] Falha ao gravar trava — seguindo sem trava:`, e?.message);
      return executar();
    }

    if (resultado?.updated === 1) { adquiriu = true; break; }
    if (agora() >= prazo) throw new Error('timeout: contato WhatsApp em processamento; reenviar evento');
    await esperar(200 + Math.floor(Math.random() * 200));
  }

  try {
    return await executar();
  } finally {
    if (adquiriu) {
      // Um processo antigo nunca libera a trava adquirida por outro.
      try {
        const atual = await db.WhatsappConnection.get(connection.id);
        const mapa = lerMapa(atual);
        if (mapa[chave]?.token === token) {
          delete mapa[chave];
          await db.WhatsappConnection.updateMany({
            id: connection.id,
            empresa_id: connection.empresa_id,
            updated_date: atual?.updated_date
          }, { $set: { processamento_contatos: mapa } });
        }
      } catch (e: any) {
        console.error('Falha ao liberar trava WhatsApp; expiração automática ativa.', e?.message);
      }
    }
  }
}