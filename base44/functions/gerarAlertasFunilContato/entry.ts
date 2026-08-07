import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { enviarWhatsAppVendedor } from '../../shared/propostaLinkShared.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && !['admin', 'master', 'super_admin', 'gerente'].includes(user.perfil)) {
      return Response.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const hoje = new Date().toISOString().split('T')[0];

    const oportunidades = await base44.asServiceRole.entities.Oportunidade.filter({ status: 'aberta' }, null, 2000);
    const pendentes = oportunidades.filter(o => o.data_proximo_contato && o.data_proximo_contato <= hoje);

    let criados = 0;
    let ignorados = 0;

    for (const oport of pendentes) {
      const existentes = await base44.asServiceRole.entities.AlertaFunilContato.filter({
        oportunidade_id: oport.id,
        data_alerta: hoje,
        status: 'ativo'
      });
      if (existentes.length > 0) {
        ignorados++;
        continue;
      }

      let responsavelNome = oport.vendedor_nome || '';
      if (oport.vendedor_id) {
        const colabs = await base44.asServiceRole.entities.Colaborador.filter({ user_id: oport.vendedor_id });
        if (colabs.length > 0) {
          responsavelNome = colabs[0].nome || responsavelNome;
        }
      }

      const clienteTelefone = oport.telefone_lead || oport.cliente_telefone || '';
      let conversaId = '';
      if (clienteTelefone && oport.empresa_id) {
        const convs = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
          { empresa_id: oport.empresa_id, cliente_telefone: clienteTelefone },
          '-data_ultima_mensagem',
          1
        );
        if (convs.length > 0) conversaId = convs[0].id;
      }

      const dataContato = new Date(oport.data_proximo_contato);
      const dataHoje = new Date(hoje);
      const diasAtraso = Math.floor((dataHoje - dataContato) / (1000 * 60 * 60 * 24));

      await base44.asServiceRole.entities.AlertaFunilContato.create({
        empresa_id: oport.empresa_id,
        oportunidade_id: oport.id,
        oportunidade_titulo: oport.titulo,
        cliente_nome: oport.cliente_nome || oport.titulo,
        cliente_telefone: clienteTelefone,
        conversa_id: conversaId,
        motivo: oport.motivo_proximo_contato || 'Retomar contato com o cliente',
        responsavel_id: oport.vendedor_id || '',
        responsavel_nome: responsavelNome,
        data_alerta: hoje,
        dias_atraso: diasAtraso > 0 ? diasAtraso : 0,
        tipo_alerta: 'proximo_contato',
        whatsapp_enviado: false,
        lido: false,
        status: 'ativo'
      });
      criados++;
    }

    // Lembrete individual: no máximo um lead sem data de fechamento por execução.
    // Considera apenas oportunidades paradas há pelo menos 24 horas e evita repetir no mesmo dia.
    let whatsappEnviado = 0;
    let leadNotificado = null;
    const limiteInatividade = Date.now() - 24 * 60 * 60 * 1000;
    const semDataFechamento = oportunidades
      .filter(o => !o.data_fechamento_prevista)
      .filter(o => {
        const ultima = o.data_ultima_movimentacao || o.updated_date || o.created_date;
        return ultima && new Date(ultima).getTime() <= limiteInatividade;
      })
      .sort((a, b) => new Date(a.data_ultima_movimentacao || a.updated_date || a.created_date) - new Date(b.data_ultima_movimentacao || b.updated_date || b.created_date));

    for (const oport of semDataFechamento) {
      const jaAvisadoHoje = await base44.asServiceRole.entities.AlertaFunilContato.filter({
        oportunidade_id: oport.id,
        data_alerta: hoje,
        tipo_alerta: 'sem_data_fechamento'
      }, '-created_date', 1);
      if (jaAvisadoHoje.length > 0) continue;

      const colabs = oport.vendedor_id
        ? await base44.asServiceRole.entities.Colaborador.filter({ user_id: oport.vendedor_id }, '-created_date', 1)
        : [];
      const colab = colabs?.[0];
      if (!colab?.telefone || !oport.empresa_id) continue;

      const clienteNome = oport.cliente_nome || oport.titulo || 'Lead';
      const alerta = await base44.asServiceRole.entities.AlertaFunilContato.create({
        empresa_id: oport.empresa_id,
        oportunidade_id: oport.id,
        oportunidade_titulo: oport.titulo,
        cliente_nome: clienteNome,
        cliente_telefone: oport.telefone_lead || oport.cliente_telefone || '',
        motivo: 'Lead sem data prevista de fechamento',
        responsavel_id: oport.vendedor_id || '',
        responsavel_nome: colab.nome || oport.vendedor_nome || '',
        data_alerta: hoje,
        dias_atraso: 0,
        tipo_alerta: 'sem_data_fechamento',
        whatsapp_enviado: false,
        lido: false,
        status: 'ativo'
      });

      const mensagem =
        '🔔 *LEMBRETE DE LEAD*\n\n' +
        '👤 *' + clienteNome + '* está aguardando você.\n' +
        'Não deixe a venda esfriar.\n\n' +
        'Acesse o Funil de Vendas e faça o acompanhamento.';

      try {
        await enviarWhatsAppVendedor(base44, oport.empresa_id, colab.telefone, mensagem);
        await base44.asServiceRole.entities.AlertaFunilContato.update(alerta.id, {
          whatsapp_enviado: true,
          whatsapp_enviado_em: new Date().toISOString()
        });
        whatsappEnviado = 1;
        leadNotificado = { oportunidade_id: oport.id, cliente_nome: clienteNome };
      } catch (e) {
        console.warn('Erro ao enviar lembrete individual do lead:', e.message);
      }
      break;
    }

    return Response.json({
      success: true,
      processados: pendentes.length,
      criados,
      ignorados,
      whatsappEnviado,
      leadNotificado,
      regra: 'máximo de 1 lead sem data de fechamento por execução',
      data: hoje
    });
  } catch (error) {
    console.error('Erro gerarAlertasFunilContato:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});