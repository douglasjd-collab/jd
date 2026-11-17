import { RATING, PLANEJAMENTO } from './ratingShared.ts';
export async function salvarServicoRating(db: any, o: any, user: any, body: any, agora = new Date()) {
  if(o.produto!==RATING) throw new Error('Esta oportunidade não pertence ao Rating Bancário');
  const acao=body.acao||'salvar';
  const data=body.dados||{};
  const campos:any={};
  for(const k of ['rating_instituicao','rating_documentos_pendentes','rating_resultado']) if(k in data) campos[k]=String(data[k]||'').slice(0,5000);
  if('rating_valor_servico' in data) {
    const valor=Number(data.rating_valor_servico);
    if(!Number.isFinite(valor)||valor<0) throw new Error('Valor do serviço inválido');
    campos.rating_valor_servico=valor;
  }
  if('rating_documentacao' in data) {
    if(!['pendente','completa'].includes(data.rating_documentacao)) throw new Error('Documentação inválida');
    campos.rating_documentacao=data.rating_documentacao;
  }
  if('rating_data_contratacao' in data) campos.rating_data_contratacao=data.rating_data_contratacao||null;
  if('rating_resultado_apresentado' in data) campos.rating_resultado_apresentado=data.rating_resultado_apresentado===true;
  if(o.status==='ganha' && acao==='salvar') throw new Error('Serviço concluído. Ajustes financeiros devem ser feitos na Central Financeira.');
  let atual={...o,...campos};
  if(acao==='pausar'||acao==='retomar') {
    if(o.status!=='aberta') throw new Error('Acompanhamento encerrado');
    return db.Oportunidade.update(o.id,{
      rating_followup_pausado:acao==='pausar',rating_followup_pausa_manual:acao==='pausar',
      rating_followup_motivo:acao==='pausar'?'Pausado pelo responsável':'',
      rating_followup_proximo_em:null,...(acao==='retomar'?{rating_followup_reiniciado_em:agora.toISOString()}:{}),
    });
  }
  if(acao==='planejar') {
    if(o.status!=='ganha'||!o.rating_resultado_apresentado) throw new Error('Conclua e apresente o rating antes de iniciar o planejamento');
    if(!o.cliente_id) throw new Error('Vincule o cadastro do cliente para iniciar o planejamento');
    const existentes=await db.Oportunidade.filter({empresa_id:o.empresa_id,rating_origem_id:o.id},'created_date',100);
    let planejamento=existentes[0];
    if(!planejamento) {
      const etapas=await db.EtapaFunil.filter({empresa_id:o.empresa_id,produto:PLANEJAMENTO,status:'ativa'},'ordem',100);
      const etapa=etapas.find((e:any)=>!['ganho','perdida'].includes(e.tipo));
      if(!etapa) throw new Error('Funil de planejamento não encontrado');
      // Chave persistente: uma continuidade por serviço, mesmo com repetição da ação.
      const chave='rating_planejamento_'+o.id;
      const ja=await db.HistoricoAutomacao.filter({chave_execucao:chave},'created_date',1);
      if(ja.length) throw new Error('Planejamento em processamento. Atualize a oportunidade para conferir.');
      const reserva=await db.HistoricoAutomacao.create({empresa_id:o.empresa_id,oportunidade_id:o.id,automacao_id:'rating_planejamento',automacao_nome:'Iniciar Planejamento de Compra e Crédito',chave_execucao:chave,status:'processando',enviado_em:agora.toISOString()});
      const concorrentes=await db.HistoricoAutomacao.filter({chave_execucao:chave},'created_date',100);
      concorrentes.sort((a:any,b:any)=>String(a.created_date||'').localeCompare(String(b.created_date||''))||String(a.id).localeCompare(String(b.id)));
      if(concorrentes[0]?.id!==reserva.id) throw new Error('Planejamento já solicitado');
      planejamento=await db.Oportunidade.create({
        empresa_id:o.empresa_id,titulo:'Planejamento — '+(o.cliente_nome||o.titulo),cliente_id:o.cliente_id,
        cliente_nome:o.cliente_nome,cliente_telefone:o.cliente_telefone||o.telefone_lead,telefone_lead:o.telefone_lead||o.cliente_telefone,
        produto:PLANEJAMENTO,etapa_id:etapa.id,etapa_nome:etapa.nome,status:'aberta',valor_estimado:0,
        vendedor_id:o.vendedor_id,vendedor_nome:o.vendedor_nome,responsaveis_ids:o.responsaveis_ids||'[]',
        responsaveis_nomes:o.responsaveis_nomes||'[]',responsaveis_fotos:o.responsaveis_fotos||'[]',
        origem:'Rating Bancário',rating_origem_id:o.id,data_ultima_movimentacao:agora.toISOString(),
        data_entrada_planejamento:agora.toISOString(),observacoes:'Continuidade do serviço de rating '+o.id+'. O valor pretendido de crédito deve ser informado separadamente.',
      });
      await db.HistoricoAutomacao.update(reserva.id,{status:'enviado'});
      await db.MovimentacaoFunil.create({oportunidade_id:planejamento.id,etapa_destino_id:etapa.id,etapa_destino_nome:etapa.nome,usuario_id:user.id,usuario_nome:user.full_name||'',observacao:'Originado do rating '+o.id});
    }
    await db.Oportunidade.update(o.id,{rating_planejamento_id:planejamento.id});
    return {planejamento_id:planejamento.id};
  }
  if(!['salvar','concluir'].includes(acao)) throw new Error('Ação inválida');
  if(acao==='concluir') {
    if(o.status==='ganha') return o;
    if(!atual.rating_resultado_apresentado) throw new Error('Confirme a apresentação do resultado ao cliente');
    if(!String(atual.rating_resultado||'').trim()) throw new Error('Registre o resultado ou resumo da entrega');
    if(!(atual.rating_valor_servico>0)) throw new Error('Informe o valor cobrado pelo serviço');
    const etapas=await db.EtapaFunil.filter({empresa_id:o.empresa_id,produto:RATING,status:'ativa',tipo:'ganho'},'ordem',100);
    if(!etapas[0]) throw new Error('Etapa Ganho indisponível');
    let receita=null;
    if(o.rating_receita_id||body.receita_id) {
      receita=await db.Receita.get(o.rating_receita_id||body.receita_id);
      if(receita.empresa_id!==o.empresa_id||receita.status==='cancelada') throw new Error('Receita indisponível');
      if(receita.cliente_id&&o.cliente_id&&receita.cliente_id!==o.cliente_id) throw new Error('A receita pertence a outro cliente');
    } else {
      const anteriores=await db.Receita.filter({empresa_id:o.empresa_id,origem:'rating:'+o.id},'created_date',10);
      receita=anteriores[0];
      if(!receita) {
        if(body.criar_cobranca!==true) throw new Error('Vincule uma receita já lançada ou confirme a criação da cobrança pendente');
        const categorias=await db.CategoriaReceita.filter({empresa_id:o.empresa_id,nome:'Rating Bancário'},null,2);
        if(!categorias[0]) throw new Error('Categoria financeira Rating Bancário indisponível');
        const chave='rating_receita_'+o.id;
        const existente=await db.HistoricoAutomacao.filter({chave_execucao:chave},'created_date',1);
        if(existente.length) throw new Error('Cobrança em conferência. Atualize e vincule a receita existente antes de tentar novamente.');
        const reserva=await db.HistoricoAutomacao.create({empresa_id:o.empresa_id,oportunidade_id:o.id,automacao_id:'rating_receita',automacao_nome:'Cobrança do serviço de Rating',chave_execucao:chave,status:'processando',enviado_em:agora.toISOString()});
        const concorrentes=await db.HistoricoAutomacao.filter({chave_execucao:chave},'created_date',100);
        concorrentes.sort((a:any,b:any)=>String(a.created_date||'').localeCompare(String(b.created_date||''))||String(a.id).localeCompare(String(b.id)));
        if(concorrentes[0]?.id!==reserva.id) throw new Error('Cobrança já solicitada');
        receita=await db.Receita.create({
          empresa_id:o.empresa_id,categoria_id:categorias[0].id,categoria_nome:'Rating Bancário',produto:'Rating Bancário',
          descricao:'Serviço de Rating Bancário — '+(o.cliente_nome||o.titulo),cliente_id:o.cliente_id||'',
          cliente_nome:o.cliente_nome||o.titulo,valor:atual.rating_valor_servico,data:agora.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),
          status:'pendente',origem:'rating:'+o.id,responsavel_id:o.vendedor_id,responsavel_nome:o.vendedor_nome||'',
          usuario_id:user.id,usuario_nome:user.full_name||'',
        });
        await db.HistoricoAutomacao.update(reserva.id,{status:'enviado'});
      }
    }
    campos.rating_receita_id=receita.id;
    campos.rating_pagamento_status=receita.status==='recebida'?'pago':'pendente';
    campos.rating_valor_servico=receita.valor;
    campos.valor_estimado=receita.valor;
    campos.etapa_id=etapas[0].id;campos.etapa_nome=etapas[0].nome;campos.status='ganha';
    campos.rating_concluido_em=agora.toISOString();campos.data_ultima_movimentacao=agora.toISOString();
    campos.rating_followup_pausado=true;campos.rating_followup_motivo='Serviço entregue e concluído';campos.rating_followup_proximo_em=null;
  }
  const salvo=await db.Oportunidade.update(o.id,campos);
  await db.MovimentacaoFunil.create({oportunidade_id:o.id,etapa_origem_id:o.etapa_id,etapa_origem_nome:o.etapa_nome||'',
    etapa_destino_id:campos.etapa_id||o.etapa_id,etapa_destino_nome:campos.etapa_nome||o.etapa_nome||'',
    usuario_id:user.id,usuario_nome:user.full_name||'',observacao:acao==='concluir'?'Rating apresentado e concluído; receita vinculada, sem recebimento automático.':'Dados do serviço de rating atualizados.'});
  return salvo;
}
