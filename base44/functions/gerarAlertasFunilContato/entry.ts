import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

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
        lido: false,
        status: 'ativo'
      });
      criados++;
    }

    return Response.json({ success: true, processados: pendentes.length, criados, ignorados, data: hoje });
  } catch (error) {
    console.error('Erro gerarAlertasFunilContato:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});