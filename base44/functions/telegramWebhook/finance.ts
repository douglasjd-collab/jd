
/* Financeiro conversacional: rascunhos e vínculos privados por remetente. */
const finLocks = new Set();
const finEsc = v => String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const finMoney = v => Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const finToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const finNorm = s => stripAccents(String(s)).toLowerCase();
function finAmount(s) {
 const n = String(s).replace(/R\$|\s/g,'');
 const v = Number(n.includes(',') ? n.replaceAll('.','').replace(',','.') : n);
 return Number.isFinite(v) && v > 0 ? Math.round(v*100)/100 : null;
}
function finDate(s) {
 if (finNorm(s)==='hoje') return finToday();
 if (finNorm(s)==='ontem') { const d=new Date(finToday()+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }
 const m=String(s).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 const iso=m ? m[3]+'-'+m[2]+'-'+m[1] : String(s);
 const d=new Date(iso+'T12:00:00Z');
 return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !isNaN(+d) && d.toISOString().slice(0,10)===iso ? iso : null;
}
function finNext(date,i,freq) {
 const d=new Date(date+'T12:00:00Z');
 if(freq==='mensal') { const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+i); const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); }
 else d.setUTCDate(d.getUTCDate()+i*(freq==='semanal'?7:15));
 return d.toISOString().slice(0,10);
}
async function finGet(b,key) {
 const rows=await b.asServiceRole.entities.TelegramFinanceState.filter({key},'-created_date',1);
 const row=rows[0]; if(!row || (row.expires_at && row.expires_at < new Date().toISOString())) return null;
 return JSON.parse(row.data);
}
async function finPut(b,key,data,minutes=60) {
 const e=b.asServiceRole.entities.TelegramFinanceState;
 const rows=await e.filter({key},'-created_date',1);
 const payload={key,data:JSON.stringify(data),expires_at:new Date(Date.now()+minutes*60000).toISOString()};
 if(rows[0]) await e.update(rows[0].id,payload); else await e.create(payload);
}
async function finApi(method,payload) {
 const token=Deno.env.get('TELEGRAM_BOT_TOKEN');
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const j=await r.json(); if(!j.ok) throw new Error('Não foi possível atualizar a mensagem do Telegram.');
 return j.result;
}
async function finRender(b,chat,key,d,text,rows) {
 const markup={inline_keyboard:rows.map(row=>row.map(([label,action])=>({text:label,callback_data:'fin:'+d.nonce+':'+action})))};
 const p={chat_id:chat,text,parse_mode:'HTML',reply_markup:markup};
 if(d.messageId) {
  try { await finApi('editMessageText',{...p,message_id:d.messageId}); }
  catch { const sent=await finApi('sendMessage',p); d.messageId=sent.message_id; }
 } else { const sent=await finApi('sendMessage',p); d.messageId=sent.message_id; }
 await finPut(b,key,d,1440);
}
async function finIdentity(b,actor) {
 const bind=await finGet(b,'bind_'+actor); if(!bind) return null;
 const u=await b.asServiceRole.entities.User.get(bind.usuario_id);
 const cs=await b.asServiceRole.entities.Colaborador.filter({user_id:u.id,empresa_id:bind.empresa_id,status:'ativo'});
 if(u.empresa_id!==bind.empresa_id && !cs.length) return null;
 return {...bind,nome:u.full_name || cs[0]?.nome || '',perfil:u.perfil || u.role,colaborador_id:cs[0]?.id};
}
async function finOptions(b,id,d,kind) {
 const e=b.asServiceRole.entities, personal=d.dest==='pessoal';
 if(kind==='account') return e[personal?'MeuFinanceiroContaBancaria':'ContaBancaria'].filter({empresa_id:id.empresa_id,...(personal?{usuario_id:id.usuario_id}:{}),status:'ativa'},'nome_conta',100);
 if(kind==='category') {
  const data=await e[personal?'MeuFinanceiroCategoria':d.tipo==='receita'?'CategoriaReceita':'CategoriaDespesa'].filter({empresa_id:id.empresa_id,...(personal?{usuario_id:id.usuario_id,tipo:d.tipo}: {status:'ativa'})},'nome',100);
  return data.filter(c=>!c.parent_id);
 }
 return e[kind==='branch'?'Filial':'CentroCusto'].filter({empresa_id:id.empresa_id},'nome',100);
}
async function finShow(b,chat,key,d) {
 const rec=d.tipo==='receita', dest=d.dest==='pessoal'?'👤 Meu Financeiro':'🏢 Movimentações Financeiras';
 const rep=d.repeat==='unico'?'Única':d.repeat==='parcelada'?d.count+' parcelas de '+finMoney(d.valueMode==='total'?d.valor/d.count:d.valor)+' • total '+finMoney(d.valueMode==='total'?d.valor:d.valor*d.count):d.count+' ocorrências • '+d.freq;
 const text='🧾 <b>'+finEsc(d.descricao)+' — '+finMoney(d.valor)+'</b>\n\n'+dest+'\n'+(rec?'🟢 Receita':'🔴 Despesa')+'\n📅 '+d.date.split('-').reverse().join('/')+'\n🏷 '+finEsc(d.category?.nome || 'Selecionar categoria')+'\n🔁 '+rep+'\n💳 '+(d.settled===null?'Situação a informar':d.settled?(rec?'Recebida':'Paga'):(rec?'A receber':'A pagar'))+'\n🏦 '+finEsc(d.account?.nome_conta || 'Conta a selecionar')+(d.branch?'\n📍 '+finEsc(d.branch.nome):'')+(d.cost?'\n📊 '+finEsc(d.cost.nome):'')+(d.error?'\n\n⚠️ '+finEsc(d.error):'');
 d.awaiting=null;
 const rows=[
 [[rec?'✅ Já recebi':'✅ Já paguei','paid'],[rec?'📅 Vou receber':'📅 Vou pagar','pending']],
 [['✏️ Alterar dados','edit'],['🔁 Repetir / Parcelar','repeat']],
 [['🏷 Categoria','category'],['🏦 Conta','account']],
 ...(d.dest==='empresa'?[[['📍 Filial','branch'],['📊 Centro de custo','cost']]]:[]),
 [['✅ Confirmar lançamento','save']],[['❌ Cancelar','cancel']]
 ];
 await finRender(b,chat,key,d,text,rows);
}
async function finPrompt(b,chat,key,d,field,text) {
 d.awaiting=field;
 await finRender(b,chat,key,d,text,[[['↩️ Voltar','back']],[['❌ Cancelar','cancel']]]);
}
async function finChoose(b,chat,key,d,id,kind,page=0) {
 d.options=await finOptions(b,id,d,kind); d.optionKind=kind;
 const start=page*8, rows=d.options.slice(start,start+8).map((c,i)=>[[c.nome_conta || c.nome,'opt_'+(start+i)]]);
 if(start) rows.push([['⬅️ Anterior','page_'+(page-1)]]);
 if(start+8<d.options.length) rows.push([['➡️ Mais','page_'+(page+1)]]);
 if(kind==='category' && d.dest==='pessoal') rows.push([['✏️ Digitar categoria','category_text']]);
 rows.push([['↩️ Voltar','back']]);
 await finRender(b,chat,key,d,(d.options.length?'Selecione:':'Nenhum cadastro disponível neste financeiro. Cadastre no CRM e tente novamente.'),rows);
}
async function finSave(b,id,d,key) {
 if(!d.dest || !d.tipo || !d.descricao || !finAmount(d.valor) || !finDate(d.date)) throw new Error('Confira descrição, valor e data.');
 if(d.settled===null) throw new Error('Informe se já foi pago/recebido ou se está pendente.');
 if(!d.category?.nome) throw new Error('Selecione uma categoria.');
 if(d.settled && !d.account?.id) throw new Error('Selecione a conta do pagamento ou recebimento.');
 if(d.dest==='empresa' && !['master','super_admin','admin','gerente'].includes(id.perfil)) throw new Error('Seu perfil não tem permissão para lançar no financeiro da empresa.');
 if(d.dest==='empresa' && d.tipo==='despesa' && !d.branch) throw new Error('Selecione a filial da despesa.');
 if(d.count<1 || d.count>120) throw new Error('Escolha entre 1 e 120 ocorrências.');
 if(d.repeat==='parcelada' && !d.valueMode) throw new Error('Informe se o valor é total ou por parcela.');
 // Revalida os IDs no escopo escolhido antes de gravar.
 for(const [kind,selected] of [['account',d.account],['branch',d.branch],['cost',d.cost]]) {
  if(selected && !(await finOptions(b,id,d,kind)).some(x=>x.id===selected.id)) throw new Error('O cadastro selecionado não está mais disponível.');
 }
 if(d.category.id && !(await finOptions(b,id,d,'category')).some(x=>x.id===d.category.id)) throw new Error('Categoria indisponível.');
 const e=b.asServiceRole.entities, personal=d.dest==='pessoal', rec=d.tipo==='receita';
 const entity=(personal?'MeuFinanceiro':'')+(rec?'Receita':'Despesa');
 d.saving=true; d.progress=d.progress || []; await finPut(b,key,d,1440);
 const count=d.repeat==='unico'?1:d.count;
 for(let i=0;i<count;i++) {
  if(d.progress[i]) continue;
  const date=finNext(d.date,i,d.freq), paid=d.settled && i===0;
  const totalCents=Math.round(d.valor*100);
  const cents=d.repeat==='parcelada' && d.valueMode==='total'? Math.floor(totalCents/count)+(i<totalCents%count?1:0):totalCents;
  if(cents<1) throw new Error('O valor de cada parcela deve ser de pelo menos R$ 0,01.');
  const marker='Telegram '+d.nonce+' #'+i;
  const existing=await e[entity].filter({empresa_id:id.empresa_id,usuario_id:id.usuario_id,observacao:marker},'-created_date',1);
  const data={
   empresa_id:id.empresa_id,usuario_id:id.usuario_id,usuario_nome:id.nome,
   descricao:d.descricao+(d.repeat==='parcelada'?' — Parcela '+(i+1)+'/'+count:''),
   valor:cents/100,data:date,status:paid?(rec?'recebida':'pago'):'pendente',
   observacao:marker,
   ...(d.account?{conta_bancaria_id:d.account.id}:{}),
   ...(paid?{[rec?'data_recebimento':'data_pagamento']:d.paymentDate || date}:{}),
   ...(personal?{categoria:d.category.nome,...(d.category.id?{categoria_id:d.category.id}:{}),tipo_lancamento:'unico'}:
     rec?{categoria_id:d.category.id,categoria_nome:d.category.nome,origem:'Telegram'}:{categoria:d.category.nome,despesa_fixa:d.repeat==='recorrente'}),
   ...(!personal && d.branch?{filial_id:d.branch.id,filial_nome:d.branch.nome}:{}),
   ...(!personal && d.cost?{centro_custo_id:d.cost.id,centro_custo_nome:d.cost.nome}:{}),
   ...(!rec && paid && personal?{valor_original:cents/100,valor_pago:cents/100}: {})
  };
  const created=existing[0] || await e[entity].create(data);
  d.progress[i]=created.id; await finPut(b,key,d,1440);
 }
 if(d.settled && !d.balanceDone) {
  const ce=e[personal?'MeuFinanceiroContaBancaria':'ContaBancaria'];
  if(d.balanceTarget===undefined) {
   const account=await ce.get(d.account.id), first=await e[entity].get(d.progress[0]);
   d.balanceTarget=Number(account.saldo_atual || 0)+(rec?1:-1)*first.valor;
   await finPut(b,key,d,1440);
  }
  await ce.update(d.account.id,{saldo_atual:d.balanceTarget});
  d.balanceDone=true; await finPut(b,key,d,1440);
 }
 d.saved=true; d.saving=false; await finPut(b,key,d,1440);
}
async function handleFinancialTelegram(b,body) {
 const cq=body.callback_query, msg=cq?.message || body.message;
 if(!msg) return false;
 const chat=String(msg.chat.id), actor=String(cq?.from?.id || msg.from?.id || '');
 const text=String(msg.text || msg.caption || '').trim(), cmd=String(cq?.data || '');
 const key='draft_'+chat+'_'+actor;
 if(!actor || msg.chat.type!=='private') {
  if(cmd.startsWith('fin:')) { await answerCallback(cq.id,'Use o bot em conversa privada.'); return true; }
  return false;
 }
 if(/^\/vincular\s+/.test(text) && !cq) {
  const token=text.split(/\s+/)[1], pair=await finGet(b,'pair_'+token);
  if(!pair || pair.used) { await sendTelegram(chat,'Código inválido ou expirado. Gere outro em Robôs e Integrações → Telegram.'); return true; }
  await finPut(b,'bind_'+actor,pair,525600);
  pair.used=true; await finPut(b,'pair_'+token,pair,1);
  await sendTelegram(chat,'✅ Usuário vinculado! Envie <b>Mercado 58,50</b> ou <b>Recebi comissão 1.200 hoje</b>.');
  return true;
 }
 let d=await finGet(b,key);
 if(cq && !cmd.startsWith('fin:')) return false;
 if(!cq && body.edited_message) return false;
 if(cq) await answerCallback(cq.id);
 if(cq && (!d || cmd.split(':')[1]!==d.nonce)) { await sendTelegram(chat,'Este botão expirou. Envie um novo lançamento.'); return true; }
 if(d && (d.saving || d.progress?.length) && !d.saved && (!cq || !cmd.endsWith(':save'))) {
  await sendTelegram(chat,'Há um lançamento em processamento. Use Confirmar novamente para concluir sem duplicar os registros.'); return true;
 }
 const id=await finIdentity(b,actor);
 if(cq && cmd.endsWith(':new')) { await finPut(b,key,{...d,saved:true},1); await sendTelegram(chat,'Envie a descrição e o valor. Exemplo: <b>Mercado 58,50</b>'); return true; }
 if(cq && cmd.endsWith(':cancel') || !cq && /^\/?cancelar$/i.test(text)) {
  if(d) await finPut(b,key,{...d,saved:true},1);
  await sendTelegram(chat,'Lançamento cancelado.'); return true;
 }
 if(cq && d.saved) { await sendTelegram(chat,'Este lançamento já foi concluído. Envie uma nova despesa ou receita.'); return true; }
 if(!cq && d?.awaiting && !d.saved) {
  if(!id) { await sendTelegram(chat,'Vincule seu usuário em Robôs e Integrações → Telegram → Vincular meu financeiro.'); return true; }
  const field=d.awaiting;
  if(field==='description') d.descricao=text.slice(0,250);
  else if(field==='value') { const v=finAmount(text); if(!v) {await sendTelegram(chat,'Digite um valor válido, por exemplo 58,50.'); return true;} d.valor=v; }
  else if(field==='date' || field==='paymentDate') { const date=finDate(text); if(!date) {await sendTelegram(chat,'Use DD/MM/AAAA, hoje ou ontem.'); return true;} d[field]=date; }
  else if(field==='category') d.category={nome:text.slice(0,80)};
  else if(field==='count') { const n=Number(text); if(!Number.isInteger(n)||n<2||n>120){await sendTelegram(chat,'Informe de 2 a 120 ocorrências.');return true;}d.count=n; }
  else if(field==='until') {
   const end=finDate(text); if(!end || end<d.date){await sendTelegram(chat,'Informe uma data final igual ou posterior ao primeiro vencimento.');return true;}
   let n=1; while(n<=120 && finNext(d.date,n,d.freq)<=end)n++;
   if(n>120){await sendTelegram(chat,'O limite é de 120 ocorrências. Escolha uma data anterior.');return true;}d.count=n;
  }
  await finShow(b,chat,key,d); return true;
 }
 if(cq) {
  if(!id) {await sendTelegram(chat,'Vincule seu usuário em Robôs e Integrações → Telegram.');return true;}
  const action=cmd.split(':')[2]; delete d.error;
  if(action==='dest_pessoal' || action==='dest_empresa') {
   d.dest=action.slice(5); d.account=null;d.category=null;d.branch=null;d.cost=null;
   if(d.dest==='empresa' && !['master','super_admin','admin','gerente'].includes(id.perfil)){await sendTelegram(chat,'Seu perfil não permite lançamentos na empresa. Escolha Pessoal.');return true;}
   const cats=await finOptions(b,id,d,'category');
   const guess=cats.find(c=>finNorm(c.nome).includes(finNorm(d.suggestedCategory || 'Alimentação'))); if(guess)d.category=guess;
   await finShow(b,chat,key,d);
  } else if(action==='paid') {d.settled=true; d.paymentDate=d.paymentDate || finToday();await finChoose(b,chat,key,d,id,'account');}
  else if(action==='pending'){d.settled=false;await finPrompt(b,chat,key,d,'date','📅 Qual é o vencimento? Envie DD/MM/AAAA, hoje ou ontem.');}
  else if(['account','category','branch','cost'].includes(action)) await finChoose(b,chat,key,d,id,action);
  else if(action.startsWith('page_')) await finChoose(b,chat,key,d,id,d.optionKind,Number(action.slice(5)));
  else if(action.startsWith('opt_')){
   const selected=d.options?.[Number(action.slice(4))];if(!selected) return true;
   d[d.optionKind]=selected;await finShow(b,chat,key,d);
  } else if(action==='edit') await finRender(b,chat,key,d,'✏️ O que deseja alterar?',[
   [['📝 Descrição','description'],['💵 Valor','value']],[['📅 Vencimento / data','date'],['📆 Data da baixa','paymentDate']],
   [['🟢 Receita','type_receita'],['🔴 Despesa','type_despesa']],
   [['👤 Pessoal','dest_pessoal'],['🏢 Empresa','dest_empresa']],[['↩️ Voltar','back']]]);
  else if(['description','value','date','paymentDate','category_text','count','until'].includes(action)) await finPrompt(b,chat,key,d,action==='category_text'?'category':action,
   ({description:'📝 Digite a descrição:',value:'💵 Digite o valor:',date:'📅 Envie a data (DD/MM/AAAA):',paymentDate:'📆 Envie a data do pagamento/recebimento:',category_text:'🏷 Digite a categoria:',count:'🔁 Quantas ocorrências, incluindo a primeira? (2 a 120)',until:'📅 Repetir até qual data? (DD/MM/AAAA)'})[action]);
  else if(action.startsWith('type_')){d.tipo=action.slice(5);d.category=null;await finShow(b,chat,key,d);}
  else if(action==='repeat') await finRender(b,chat,key,d,'🔁 Como deseja lançar?',[[['1️⃣ Única','rep_unico']],[['🔁 Recorrente','rep_recorrente'],['🧩 Parcelada','rep_parcelada']],[['↩️ Voltar','back']]]);
  else if(action==='rep_unico'){d.repeat='unico';d.count=1;d.freq='mensal';await finShow(b,chat,key,d);}
  else if(action==='rep_parcelada'){d.repeat='parcelada';d.count=2;d.freq='mensal';await finRender(b,chat,key,d,'💵 O valor informado é:',[[['Valor total','mode_total'],['Valor por parcela','mode_parcela']],[['↩️ Voltar','back']]]);}
  else if(action.startsWith('mode_')){d.valueMode=action.slice(5);await finPrompt(b,chat,key,d,'count','Quantas parcelas mensais? (2 a 120)');}
  else if(action==='rep_recorrente'){d.repeat='recorrente';d.count=2;await finRender(b,chat,key,d,'🔁 Escolha a frequência:',[[['Semanal','freq_semanal'],['Quinzenal','freq_quinzenal']],[['Mensal','freq_mensal']],[['↩️ Voltar','back']]]);}
  else if(action.startsWith('freq_')){d.freq=action.slice(5);await finRender(b,chat,key,d,'Quando encerrar a repetição?',[[['Por quantidade','count'],['Por data final','until']],[['↩️ Voltar','back']]]);}
  else if(action==='save'){
   if(finLocks.has(key)) return true;
   finLocks.add(key);
   try {
    await finSave(b,id,d,key);
    await finRender(b,chat,key,d,'✅ <b>Lançamento registrado!</b>\n\n'+finEsc(d.descricao)+' • '+finMoney(d.valor)+'\n'+(d.dest==='pessoal'?'👤 Meu Financeiro':'🏢 Financeiro → Movimentações Financeiras')+'\n'+(d.settled?(d.tipo==='receita'?'Recebida':'Paga'):'Pendente')+(d.count>1?'\n'+d.count+' ocorrências; as futuras ficam pendentes.':''),[[['➕ Novo lançamento','new'],['📋 Ver resumo','summary']],[['📎 Anexar comprovante','attachment']]]);
   }catch(e){d.error=e.message;d.saving=false;await finShow(b,chat,key,d);}
   finally{finLocks.delete(key);}
  } else if(action==='back') await finShow(b,chat,key,d);
  return true;
 }
 // Textos financeiros simples entram antes dos fluxos legados; agenda/leads continuam no fluxo atual.
 if(/^\/(start|help)$|^(ajuda|help)$/i.test(text)) {
  await sendTelegram(chat,'💰 <b>Financeiro rápido</b>\nEnvie <code>Mercado 58,50</code> ou <code>Recebi comissão 1.200 hoje</code>.\nEscolha Pessoal ou Empresa, confira os dados e confirme.\n\nPara vincular: CRM → Robôs e Integrações → Telegram → Vincular meu financeiro.\n\nAgenda, oportunidades e adiantamentos continuam disponíveis.'); return true;
 }
 if(/\b(adiantamento|reuniao|agenda|oportunidade|lead|consorcio|reagendar)\b/.test(finNorm(text))) return false;
 const match=text.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/);
 if(!match && !/^\/?financeiro$/i.test(text)) return false;
 if(!id){await sendTelegram(chat,'Para começar, vincule seu usuário no CRM: <b>Robôs e Integrações → Telegram → Vincular meu financeiro</b>.');return true;}
 if(d && !d.saved){await sendTelegram(chat,'Você tem um lançamento em aberto. Confirme ou cancele antes de iniciar outro.');return true;}
 const parsed=await b.asServiceRole.integrations.Core.InvokeLLM({
  prompt:'Extraia um lançamento financeiro do texto. Não invente valores nem situação. Data local de hoje: '+finToday()+'. Texto: '+text+'. tipo receita somente se entrada explícita; senão despesa. settled true somente se pagamento/recebimento explícito, false se futuro explícito, senão null. dest pessoal ou empresa somente se explícito. repeticao unico, recorrente ou parcelada. Em parcelada valor é o valor citado e valueMode total ou parcela somente se explícito. count inclui primeira ocorrência. Datas ISO.',
  response_json_schema:{type:'object',properties:{descricao:{type:'string'},valor:{type:'number'},tipo:{type:'string'},settled:{type:['boolean','null']},dest:{type:['string','null']},date:{type:['string','null']},categoria:{type:'string'},repeticao:{type:'string'},count:{type:['integer','null']},freq:{type:'string'},valueMode:{type:['string','null']}}}
 });
 d={nonce:crypto.randomUUID().slice(0,8),descricao:parsed.descricao || '',valor:parsed.valor || (match?finAmount(match[1]):0),tipo:parsed.tipo==='receita'?'receita':'despesa',settled:typeof parsed.settled==='boolean'?parsed.settled:null,dest:null,date:finDate(parsed.date)||finToday(),repeat:['recorrente','parcelada'].includes(parsed.repeticao)?parsed.repeticao:'unico',count:parsed.count || 1,freq:['semanal','quinzenal'].includes(parsed.freq)?parsed.freq:'mensal',valueMode:parsed.valueMode,suggestedCategory:parsed.categoria};
 if(d.repeat!=='unico' && (!parsed.count || !d.valueMode && d.repeat==='parcelada')) d.error='Configure Repetir / Parcelar antes de confirmar.';
 await finRender(b,chat,key,d,'💰 <b>Novo lançamento</b>\n\n📝 '+finEsc(d.descricao)+'\n💵 '+finMoney(d.valor)+'\n\nOnde deseja registrar?',[[['👤 Financeiro pessoal','dest_pessoal']],[['🏢 Financeiro da empresa','dest_empresa']],[['❌ Cancelar','cancel']]]);
 return true;
}
