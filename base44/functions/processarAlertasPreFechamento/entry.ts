import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Permite execução por admin ou por automation (sem user)
    if (user && !['admin', 'master', 'super_admin', 'gerente'].includes(user.perfil)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Verificar configuração de alertas
    const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
      chave: 'alertas_pre_fechamento'
    });
    const configAlerta = configs.length > 0 ? JSON.parse(configs[0].valor || '{}') : {};

    // Se desativado, não processa
    if (configAlerta.ativo === false) {
      return Response.json({ message: 'Alertas de Pré-Fechamento desativados na configuração.', processados: 0 });
    }

    // Buscar todas as etapas do funil
    const todasEtapas = await base44.asServiceRole.entities.EtapaFunil.list();

    // Identificar IDs das etapas de "Pré-Fechamento"
    const etapasPreFechamento = todasEtapas.filter(e =>
      e.nome?.toLowerCase().includes('pré-fechamento') ||
      e.nome?.toLowerCase().includes('pre-fechamento') ||
      e.nome?.toLowerCase().includes('pré fechamento') ||
      e.nome?.toLowerCase().includes('pre fechamento')
    );

    if (etapasPreFechamento.length === 0) {
      return Response.json({ message: 'Nenhuma etapa "Pré-Fechamento" encontrada no funil.', processados: 0 });
    }

    const etapasIds = etapasPreFechamento.map(e => e.id);

    // Buscar oportunidades abertas em etapas de Pré-Fechamento com data_pre_fechamento preenchida
    const todasOportunidades = await base44.asServiceRole.entities.Oportunidade.filter(
      { status: 'aberta' },
      null,
      2000
    );

    const oportunidadesPreFechamento = todasOportunidades.filter(o =>
      etapasIds.includes(o.etapa_id) &&
      o.data_pre_fechamento &&
      o.data_pre_fechamento <= hoje
    );

    console.log(`[PreFechamento] Encontradas ${oportunidadesPreFechamento.length} oportunidades para alertar`);

    let criados = 0;
    let ignorados = 0;
    let whatsappEnviados = 0;

    for (const oport of oportunidadesPreFechamento) {
      // Verificar se já existe alerta ativo para hoje nesta oportunidade
      const alertasExistentes = await base44.asServiceRole.entities.AlertePreFechamento.filter({
        oportunidade_id: oport.id,
        data_alerta: hoje,
        status: 'ativo'
      });

      if (alertasExistentes.length > 0) {
        ignorados++;
        console.log(`[PreFechamento] Alerta já existe para ${oport.titulo} em ${hoje}`);
        continue;
      }

      // Calcular dias de atraso
      const dataPreFech = new Date(oport.data_pre_fechamento);
      const dataHoje = new Date(hoje);
      const diasAtraso = Math.floor((dataHoje - dataPreFech) / (1000 * 60 * 60 * 24));

      // Buscar dados do responsável
      let responsavelTelefone = '';
      let responsavelNome = oport.vendedor_nome || '';
      if (oport.vendedor_id) {
        const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: oport.vendedor_id });
        if (colabs.length > 0) {
          responsavelTelefone = colabs[0].telefone || '';
          responsavelNome = colabs[0].nome || responsavelNome;
        }
      }

      // Criar alerta
      const novoAlerta = await base44.asServiceRole.entities.AlertePreFechamento.create({
        empresa_id: oport.empresa_id,
        oportunidade_id: oport.id,
        oportunidade_titulo: oport.titulo,
        cliente_nome: oport.cliente_nome || oport.titulo,
        cliente_telefone: oport.telefone_lead || oport.cliente_telefone || '',
        valor_estimado: oport.valor_estimado || 0,
        data_pre_fechamento: oport.data_pre_fechamento,
        responsavel_id: oport.vendedor_id || '',
        responsavel_nome: responsavelNome,
        responsavel_telefone: responsavelTelefone,
        data_alerta: hoje,
        dias_atraso: diasAtraso > 0 ? diasAtraso : 0,
        lido: false,
        whatsapp_enviado: false,
        status: 'ativo'
      });
      criados++;

      // Enviar WhatsApp para o responsável (se configurado e tiver telefone)
      const enviarWhatsapp = configAlerta.enviar_whatsapp !== false; // padrão true
      if (enviarWhatsapp && responsavelTelefone) {
        try {
          const telefoneFormatado = responsavelTelefone.replace(/\D/g, '');
          const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(oport.valor_estimado || 0);
          const dataFormatada = oport.data_pre_fechamento.split('-').reverse().join('/');
          const atrasadoTexto = diasAtraso > 0 ? `\n⏰ *${diasAtraso} dia(s) em atraso*` : '\n🟢 Data de hoje';

          const mensagem = `🔔 *ALERTA DE PRÉ-FECHAMENTO*\n\n` +
            `Olá ${responsavelNome}!\n\n` +
            `Você tem um lead pronto para fechar:\n\n` +
            `👤 *Cliente:* ${oport.cliente_nome || oport.titulo}\n` +
            `💰 *Valor:* ${valorFormatado}\n` +
            `📅 *Data Pré-Fechamento:* ${dataFormatada}${atrasadoTexto}\n\n` +
            `⚡ *Acesse o Funil de Vendas e feche essa proposta agora!*`;

          // Buscar configuração de WhatsApp da empresa
          const empresaConfigs = await base44.asServiceRole.entities.Empresa.filter({ id: oport.empresa_id });
          const empresa = empresaConfigs[0];

          if (empresa?.evolution_url && empresa?.evolution_instance_name && empresa?.evolution_api_key) {
            const evolutionUrl = empresa.evolution_url.replace(/\/$/, '');
            const numeroEnvio = telefoneFormatado.startsWith('55') ? telefoneFormatado : '55' + telefoneFormatado;

            const resWhatsapp = await fetch(
              `${evolutionUrl}/message/sendText/${empresa.evolution_instance_name}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': empresa.evolution_api_key
                },
                body: JSON.stringify({
                  number: numeroEnvio,
                  text: mensagem
                })
              }
            );

            if (resWhatsapp.ok) {
              await base44.asServiceRole.entities.AlertePreFechamento.update(novoAlerta.id, {
                whatsapp_enviado: true
              });
              whatsappEnviados++;
              console.log(`[PreFechamento] WhatsApp enviado para ${responsavelNome} (${numeroEnvio})`);
            } else {
              console.log(`[PreFechamento] Falha ao enviar WhatsApp: HTTP ${resWhatsapp.status}`);
            }
          }
        } catch (errWpp) {
          console.log(`[PreFechamento] Erro WhatsApp: ${errWpp.message}`);
        }
      }
    }

    console.log(`[PreFechamento] Resultado: ${criados} criados, ${ignorados} ignorados, ${whatsappEnviados} WhatsApp enviados`);

    return Response.json({
      success: true,
      processados: oportunidadesPreFechamento.length,
      criados,
      ignorados,
      whatsappEnviados,
      data: hoje
    });

  } catch (error) {
    console.error('[PreFechamento] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});