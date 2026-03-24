import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { empresa_id } = await req.json();

    if (!empresa_id) {
      return Response.json({ error: 'empresa_id is required' }, { status: 400 });
    }

    // Buscar conversas com contatos
    const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
      { empresa_id },
      '-data_ultima_mensagem',
      100
    );

    const contatos = await base44.asServiceRole.entities.ContatoWhatsapp.filter(
      { empresa_id },
      'nome'
    );

    // Analisar cada conversa
    const diagnostico = conversas.map(conversa => {
      const contatoMatch = contatos.find(c => 
        c.telefone === conversa.cliente_telefone || 
        c.telefone.replace(/\D/g, '') === conversa.cliente_telefone.replace(/\D/g, '')
      );

      const whatsappId = conversa.whatsapp_id || '';
      const issues = [];

      // Detectar problemas
      if (!conversa.data_ultima_mensagem) {
        issues.push('SEM_MENSAGENS');
      }

      if (whatsappId.includes('@lid')) {
        issues.push('CONTATO_INVALIDO_@LID');
      }

      if (!contatoMatch && !whatsappId.includes('@g.us')) {
        issues.push('CONTATO_NAO_SINCRONIZADO');
      }

      if (whatsappId.includes('@g.us')) {
        issues.push('GRUPO_NAO_CONTATO');
      }

      // Buscar últimas mensagens
      let ultimasMensagens = [];
      if (conversa.id) {
        ultimasMensagens = await base44.asServiceRole.entities.MensagemWhatsapp.filter(
          { conversa_id: conversa.id },
          '-created_date',
          5
        );
      }

      return {
        conversa_id: conversa.id,
        cliente_nome: conversa.cliente_nome,
        cliente_telefone: conversa.cliente_telefone,
        whatsapp_id: whatsappId,
        status: conversa.status,
        data_ultima_mensagem: conversa.data_ultima_mensagem,
        contatoSincronizado: !!contatoMatch,
        issues: issues.length > 0 ? issues : ['OK'],
        totalMensagens: ultimasMensagens.length,
        ultimasMensagens: ultimasMensagens.map(m => ({
          id: m.id,
          remetente: m.remetente,
          tipo_conteudo: m.tipo_conteudo,
          data_envio: m.data_envio,
          status: m.status
        }))
      };
    });

    // Resumo de problemas
    const comProblemas = diagnostico.filter(d => d.issues[0] !== 'OK');
    const resumo = {
      total_conversas: conversas.length,
      conversas_com_problemas: comProblemas.length,
      problemas_encontrados: {
        sem_mensagens: comProblemas.filter(d => d.issues.includes('SEM_MENSAGENS')).length,
        contato_invalido_lid: comProblemas.filter(d => d.issues.includes('CONTATO_INVALIDO_@LID')).length,
        contato_nao_sincronizado: comProblemas.filter(d => d.issues.includes('CONTATO_NAO_SINCRONIZADO')).length,
        grupos: comProblemas.filter(d => d.issues.includes('GRUPO_NAO_CONTATO')).length
      }
    };

    return Response.json({
      resumo,
      diagnostico: diagnostico.sort((a, b) => {
        if (a.issues[0] === 'OK') return 1;
        if (b.issues[0] === 'OK') return -1;
        return 0;
      })
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});