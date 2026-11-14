
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const helper=fs.readFileSync('base44/functions/telegramWebhook/finance.ts','utf8');
function setup(){
 const tables={};let seq=0;const sent=[];
 const entities=new Proxy({}, {get:(_,name)=>({
  filter:async q=>(tables[name]||[]).filter(r=>Object.entries(q).every(([k,v])=>r[k]===v)),
  get:async id=>{const row=(tables[name]||[]).find(r=>r.id===id);if(!row)throw Error('Not found');return {...row};},
  create:async data=>{const row={...data,id:String(++seq)};(tables[name] ||= []).push(row);return row;},
  update:async(id,data)=>{const row=(tables[name]||[]).find(r=>r.id===id);Object.assign(row,data);return row;}
 })});
 const b={asServiceRole:{entities,integrations:{Core:{InvokeLLM:async()=>({descricao:'Mercado',valor:58.5,tipo:'despesa',settled:null,repeticao:'unico',categoria:'Alimentação'})}}}};
 const c=vm.createContext({console,Date,Intl,Number,String,Math,JSON,Set,Map,Promise,crypto:globalThis.crypto,Deno:{env:{get:()=> 'test'}},stripAccents:s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,''),sendTelegram:async(_,text)=>sent.push(text),answerCallback:async()=>{},fetch:async(_,options)=>{sent.push(JSON.parse(options.body));return {json:async()=>({ok:true,result:{message_id:1}})}},b});
 vm.runInContext(ts.transpile(helper),c);
 const run=code=>vm.runInContext(code,c);
 return {tables,sent,entities,run,c};
}
async function seed(x){
 x.tables.User=[{id:'u1',empresa_id:'e1',perfil:'admin',full_name:'Douglas'}];
 x.tables.Colaborador=[];
 x.tables.MeuFinanceiroContaBancaria=[{id:'p1',empresa_id:'e1',usuario_id:'u1',status:'ativa',nome_conta:'Pessoal',saldo_atual:200}];
 x.tables.ContaBancaria=[{id:'b1',empresa_id:'e1',status:'ativa',nome_conta:'Empresa',saldo_atual:1000}];
 x.tables.MeuFinanceiroCategoria=[{id:'c1',empresa_id:'e1',usuario_id:'u1',tipo:'despesa',nome:'Alimentação'}];
 x.tables.CategoriaReceita=[{id:'c2',empresa_id:'e1',status:'ativa',nome:'Comissão'}];
 x.tables.Filial=[{id:'f1',empresa_id:'e1',nome:'Sede'}];
 x.tables.CentroCusto=[];
 await x.run("finPut(b,'bind_7',{usuario_id:'u1',empresa_id:'e1'},100)");
}
function draft(extra={}){return {nonce:'test',dest:'pessoal',tipo:'despesa',descricao:'Mercado',valor:58.5,date:'2026-01-31',settled:true,account:{id:'p1'},category:{id:'c1',nome:'Alimentação'},repeat:'unico',repeatReady:true,count:1,freq:'mensal',...extra};}
test('datas inválidas e recorrência mensal sem pular fevereiro',()=>{
 const x=setup();
 assert.equal(x.run("finDate('31/02/2026')"),null);
 assert.equal(x.run("finNext('2026-01-31',1,'mensal')"),'2026-02-28');
 assert.equal(x.run("finNext('2026-01-31',2,'mensal')"),'2026-03-31');
 assert.equal(x.run("finAmount('1.234,56')"),1234.56);
});
test('despesa pessoal paga: grava destino certo e desconta apenas uma vez',async()=>{
 const x=setup();await seed(x);x.c.d=draft();
 await x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'admin'},d,'draft')");
 assert.equal(x.tables.MeuFinanceiroDespesa[0].status,'pago');
 assert.equal(x.tables.MeuFinanceiroContaBancaria[0].saldo_atual,141.5);
 await x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'admin'},d,'draft')");
 assert.equal(x.tables.MeuFinanceiroDespesa.length,1);
 assert.equal(x.tables.MeuFinanceiroContaBancaria[0].saldo_atual,141.5);
 assert.equal(x.tables.Despesa,undefined);
});
test('receita empresa parcelada: soma exata e só primeira ocorrência recebida',async()=>{
 const x=setup();await seed(x);x.c.d=draft({dest:'empresa',tipo:'receita',valor:100,account:{id:'b1'},category:{id:'c2',nome:'Comissão'},repeat:'parcelada',count:3,valueMode:'total'});
 await x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'admin'},d,'draft')");
 const rows=x.tables.Receita;
 assert.equal(Math.round(rows.reduce((s,r)=>s+r.valor,0)*100),10000);
 assert.deepEqual(rows.map(r=>r.status),['recebida','pendente','pendente']);
 assert.equal(x.tables.ContaBancaria[0].saldo_atual,1033.34);
 assert.equal(rows[1].data,'2026-02-28');
});
test('pendente não altera saldo; conta de outro usuário e perfil sem permissão são rejeitados',async()=>{
 const x=setup();await seed(x);x.c.d=draft({settled:false,account:null});
 await x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'admin'},d,'draft')");
 assert.equal(x.tables.MeuFinanceiroContaBancaria[0].saldo_atual,200);
 x.c.d=draft({account:{id:'b1'}});
 await assert.rejects(x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'admin'},d,'draft2')"),/indisponível|disponível/);
 x.c.d=draft({dest:'empresa',tipo:'receita'});
 await assert.rejects(x.run("finSave(b,{usuario_id:'u1',empresa_id:'e1',perfil:'vendedor'},d,'draft3')"),/permissão/);
});
test('fluxo de botões: destino, situação, categoria, confirmação e callback repetido',async()=>{
 const x=setup();await seed(x);
 x.c.msg={update_id:1,message:{chat:{id:7,type:'private'},from:{id:7},text:'Mercado 58,50'}};
 await x.run('financialTelegram(b,msg)');
 let d=await x.run("finGet(b,'draft_7_7')");
 assert.equal(x.tables.MeuFinanceiroDespesa,undefined);
 const click=async action=>{
  x.c.body={callback_query:{id:'cb',from:{id:7},message:{chat:{id:7,type:'private'}},data:'fin:'+d.nonce+':'+action}};
  await x.run('financialTelegram(b,body)');
 };
 await click('dest_pessoal');await click('paid');await click('opt_0');
 await click('save');
 assert.equal(x.tables.MeuFinanceiroDespesa.length,1);
 await click('save');
 assert.equal(x.tables.MeuFinanceiroDespesa.length,1);
 assert.ok(x.sent.some(s=>typeof s==='object' && s.text?.includes('Lançamento registrado')));
});
