import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function normalizarTel(tel) {
  if (!tel) return null;
  const n = tel.replace(/\D/g, '');
  if (!n.startsWith('55') || n.length < 12) return null;
  if (n.length === 13 && n.charAt(2) === '9') return n.slice(0, 2) + n.slice(3);
  return n;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const empresaId = body.empresa_id || '699696c2c9f5bffc2e67402b';
    const telefonesAVerificar = body.telefones || [];

    console.log(`🔍 Diagnosticando sincronização de ${telefonesAVerificar.length} números...`);

    // Buscar configuração da Evolution
    const empresas = await base44.asServiceRole.entities.Empresa.filter({ id: empresaId }).catch(() => []);
    if (!empresas?.[0]?.evolution_url || !empresas?.[0]?.evolution_api_key) {
      return Response.json({ erro: 'Evolution não configurada' }, { status: 400 });
    }

    const emp = empresas[0];
    const evolutionUrl = emp.evolution_url.replace(/\/$/, '');
    const evolutionKey = emp.evolution_api_key;
    const instanceName = emp.evolution_instance_name;

    // Buscar contatos da Evolution
    let contatosEvolution = [];
    try {
      const resContatos = await fetch(`${evolutionUrl}/contact/findContacts/${instanceName}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5000, where: {} })
      });

      if (resContatos.ok) {
        const dataContatos = await resContatos.json();
        const rawContatos = Array.isArray(dataContatos) ? dataContatos : (dataContatos.contacts?.records || dataContatos.contacts || []);

        for (const c of rawContatos) {
          const jid = c.jid || c.id || '';
          if (!jid || jid.includes('@g.us') || jid.includes('@broadcast') || jid.includes('@lid')) continue;

          const tel = jid.replace(/@s\.whatsapp\.net|@c\.us/g, '').replace(/\D/g, '');
          if (!tel.startsWith('55') || (tel.length !== 12 && tel.length !== 13)) continue;

          const telNorm = tel.length === 13 && tel.charAt(2) === '9' ? tel.slice(0, 2) + tel.slice(3) : tel;

          contatosEvolution.push({
            jid,
            tel: telNorm,
            pushName: c.pushName || c.name || '',
            senderName: c.senderName || ''
          });
        }
      }
      console.log(`📞 ${contatosEvolution.length} contatos obtidos da Evolution`);
    } catch (e) {
      console.warn(`⚠️ Erro ao buscar contatos Evolution: ${e.message}`);
    }

    // Buscar conversas do Bate-Papo
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    ).catch(() => []);

    const contatosCRM = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id: empresaId },
      '-created_date',
      10000
    ).catch(() => []);

    console.log(`💬 ${conversas.length} conversas no Bate-Papo | 📋 ${contatosCRM.length} contatos no CRM`);

    // Análise dos números do usuário
    let resultado = {
      total_para_verificar: telefonesAVerificar.length,
      encontrados_evolution: 0,
      encontrados_batepapo: 0,
      encontrados_crm: 0,
      detalhes: []
    };

    for (const item of telefonesAVerificar) {
      const partes = item.trim().split(/\s+/);
      let tel = partes[0].replace(/\D/g, '');
      const nomeExtra = partes.slice(1).join(' ').trim();

      // Validar telefone
      if (!tel.startsWith('55')) {
        resultado.detalhes.push({
          original: item,
          status: '❌ INVÁLIDO',
          motivo: 'Número não começa com 55'
        });
        continue;
      }

      if (tel.length !== 12 && tel.length !== 13) {
        resultado.detalhes.push({
          original: item,
          status: '❌ INVÁLIDO',
          motivo: `Comprimento ${tel.length} (esperado 12 ou 13)`
        });
        continue;
      }

      // Normalizar
      const telNorm = tel.length === 13 && tel.charAt(2) === '9' ? tel.slice(0, 2) + tel.slice(3) : tel;

      // Procurar na Evolution
      const contatoEvo = contatosEvolution.find(c => c.tel === telNorm);
      const emEvo = !!contatoEvo;
      if (emEvo) resultado.encontrados_evolution++;

      // Procurar na conversa
      const conversa = conversas.find(c => normalizarTel(c.cliente_telefone) === telNorm);
      const emBatepapo = !!conversa;
      if (emBatepapo) resultado.encontrados_batepapo++;

      // Procurar no CRM
      const contato = contatosCRM.find(c => normalizarTel(c.telefone) === telNorm);
      const emCRM = !!contato;
      if (emCRM) resultado.encontrados_crm++;

      // Montar status
      let status = '';
      if (emBatepapo && emCRM && emEvo) {
        status = '✅ OK (Evolution → Bate-Papo → CRM)';
      } else if (emBatepapo && emEvo) {
        status = '⚠️ Bate-Papo OK, CRM faltando';
      } else if (emBatepapo) {
        status = '⚠️ Só Bate-Papo (Evolution não encontrada)';
      } else if (emEvo) {
        status = '❌ Só Evolution (não sincronizado)';
      } else {
        status = '❌ NÃO ENCONTRADO';
      }

      resultado.detalhes.push({
        telefone: telNorm,
        nome_extra: nomeExtra,
        status,
        evolution: emEvo ? { pushName: contatoEvo.pushName, senderName: contatoEvo.senderName } : null,
        batepapo: emBatepapo ? {
          nome: conversa.cliente_nome,
          ultima_msg: conversa.ultima_mensagem?.substring(0, 50)
        } : null,
        crm: emCRM ? { nome: contato.nome } : null
      });
    }

    resultado.resumo = `✅ Evolution: ${resultado.encontrados_evolution}/${resultado.total_para_verificar} | 💬 Bate-Papo: ${resultado.encontrados_batepapo}/${resultado.total_para_verificar} | 📋 CRM: ${resultado.encontrados_crm}/${resultado.total_para_verificar}`;

    return Response.json(resultado);
  } catch (error) {
    console.error('Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});