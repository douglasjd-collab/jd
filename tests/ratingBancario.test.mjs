import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function carregar(path,deps={}) {
 const exports={}; const context=vm.createContext({exports,module:{exports},require:name=>{
  if(name in deps)return deps[name]; if(name.startsWith('npm:'))return {createClientFromRequest:()=>{throw Error('No live SDK in tests');}};throw Error(name);
 },console,Date,Intl,Number,String,Math,JSON,Set,Map,Promise,Response,Deno:{serve:()=>{}}});
 vm.runInContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 return exports;
}
const shared=carregar('base44/shared/ratingShared.ts');
const service=carregar('base44/shared/ratingServicoShared.ts',{'./ratingShared.ts':shared});
const processor=carregar('base44/functions/processarRatingBancario/entry.ts',{'../../shared/ratingShared.ts':shared});
const empresa=shared.EMPRESA_RATING, produto=shared.RATING;
function setup(){
 let seq=0;const tables={},sent=[];
 const matches=(r,q)=>Object.entries(q||{}).every(([k,v])=>{
  if(v&&typeof v==='object')return Object.entries(v).every(([op,x])=>op==='$in'?x.includes(r[k]):op==='$gt'?r[k]>x:op==='$ne'?r[k]!==x:op==='$gte'?r[k]>=x:r[k]===x);
  return r[k]===v;
 });
 const db=new Proxy({}, {get:(_,name)=>({
   filter:async(q,sort,limit)=>{let rows=(tables[name]||[]).filter(r=>matches(r,q)); if(sort)rows.sort((a,b)=>String(a[sort.replace(/^-/,'')]||'').localeCompare(String(b[sort.replace(/^-/,'')]||''))*(sort[0]==='-'?-1:1));return structuredClone(rows.slice(0,limit||5000));},
   get:async id=>{const r=(tables[name]||[]).find(r=>r.id===id);if(!r)throw Error('Not found '+name+' '+id);return structuredClone(r);},
   create:async data=>{const id='row'+String(++seq).padStart(5,'0'); const row={...structuredClone(data),id,created_date:new Date(Date.UTC(2026,10,16,12,0,0,seq)).toISOString()};(tables[name]||=[]).push(row);return structuredClone(row);},
   update:async(id,data)=>{const r=(tables[name]||[]).find(r=>r.id===id);if(!r)throw Error('Not found update '+name);Object.assign(r,structuredClone(data));return structuredClone(r);}
 })});
 const api={asServiceRole:{entities:db,functions:{invoke:async(name,payload)=>{sent.push({name,...payload});return {data:{success:true,messageId:'sent'+sent.length}};}}}};
 const base='2026-11-13T12:00:00.000Z';
 tables.EtapaFunil=[{id:'etapa',empresa_id:empresa,produto,status:'ativa',tipo:'aberta',nome:'Em Atendimento'},{id:'ganho',empresa_id:empresa,produto,status:'ativa',tipo:'ganho',nome:'Ganho'},{id:'planejamento',empresa_id:empresa,produto:shared.PLANEJAMENTO,status:'ativa',tipo:'planejamento',nome:'Planejamento de Compra'}];
 tables.Oportunidade=[{id:'o1',empresa_id:empresa,produto,etapa_id:'etapa',etapa_nome:'Em Atendimento',status:'aberta',titulo:'Cliente',cliente_id:'c1',cliente_nome:'Cliente',telefone_lead:'5587999999999',vendedor_id:'u1',created_date:base,data_ultima_movimentacao:base}];
 tables.AutomacaoFunil=[{id:'auto1',empresa_id:empresa,funil:produto,motor:'rating_v1',etapa_id:'etapa',nome:'Primeiro contato',ativo:true,canal:'whatsapp',condicao_rating:'sem_resposta',horario_envio:'08:00',horario_fim:'18:00',tempo_disparo:24,tipo_tempo:'horas',inicio_vigencia_em:base,created_date:base,mensagem:'Olá, {{primeiro_nome}}',ordem:1}];
 tables.ConversaWhatsapp=[{id:'cv',empresa_id:empresa,cliente_telefone:'5587999999999',connection_id:'conn'}];
 tables.WhatsappConnection=[{id:'conn',empresa_id:empresa,provider_type:'dapi',is_active:true,status:'conectado'}];
 tables.CategoriaReceita=[{id:'cat',empresa_id:empresa,nome:'Rating Bancário'}];
 const user={id:'u1',full_name:'Vendedor'};
 return {tables,db,api,sent,user,agora:new Date('2026-11-16T12:00:00.000Z')};
}
test('horário de Brasília, fim do expediente e finais de semana',()=>{
 const a={horario_envio:'08:00',horario_fim:'18:00'};
 assert.equal(shared.dentroJanelaRating(a,new Date('2026-11-16T11:00Z')),true);
 assert.equal(shared.dentroJanelaRating(a,new Date('2026-11-16T21:00Z')),false);
 assert.equal(shared.dentroJanelaRating(a,new Date('2026-11-15T12:00Z')),false);
 assert.match(shared.proximaJanelaRating(a,new Date('2026-11-14T12:00Z')),/^2026-11-16T11:/);
});
test('ativação não dispara cobranças retroativas; retorno à etapa cria novo ciclo',()=>{
 const x=setup(),o=x.tables.Oportunidade[0],a=x.tables.AutomacaoFunil[0];
 a.inicio_vigencia_em=x.agora.toISOString();
 assert.equal(shared.proximaAcaoRating(o,[a],[]).data,'2026-11-17T12:00:00.000Z');
 const ciclo=shared.cicloRating(o);o.data_ultima_movimentacao='2026-11-16T13:00:00Z';
 assert.notEqual(shared.cicloRating(o),ciclo);
});
test('envio é registrado uma vez e a segunda tentativa não dispara em rajada',async()=>{
 const x=setup();x.tables.AutomacaoFunil.push({...x.tables.AutomacaoFunil[0],id:'auto2',tempo_disparo:72,ordem:2});
 await processor.processarRating(x.api,x.agora);
 await processor.processarRating(x.api,x.agora);
 assert.equal(x.sent.length,1);assert.equal(x.tables.MensagemWhatsapp.length,1);
 assert.equal(x.tables.HistoricoAutomacao.filter(h=>h.status==='enviado').length,1);
 assert.equal(x.tables.Oportunidade[0].rating_followup_proximo_em,'2026-11-18T12:00:00.000Z');
});
test('resposta do cliente é detectada mesmo quando a última mensagem é do vendedor',async()=>{
 const x=setup();x.tables.MensagemWhatsapp=[{id:'m1',empresa_id:empresa,conversa_id:'cv',remetente:'cliente',data_envio:'2026-11-16T11:00:00Z'},{id:'m2',empresa_id:empresa,conversa_id:'cv',remetente:'vendedor',usuario_id:'u1',data_envio:'2026-11-16T11:01:00Z'}];
 await processor.processarRating(x.api,x.agora);
 assert.equal(x.sent.length,0);assert.equal(x.tables.Oportunidade[0].rating_followup_pausado,true);assert.match(x.tables.AlertaFunilContato[0].motivo,/Cliente respondeu/);
});
test('humano assumindo e pendências completas suspendem mensagens',async()=>{
 const x=setup();x.tables.ConversaWhatsapp[0].responsavel_id='u1';x.tables.ConversaWhatsapp[0].responsavel_expira_em='2026-11-16T13:00:00Z';
 await processor.processarRating(x.api,x.agora);assert.equal(x.sent.length,0);assert.match(x.tables.Oportunidade[0].rating_followup_motivo,/assumiu/);
 const y=setup();y.tables.AutomacaoFunil[0].condicao_rating='pendencias';Object.assign(y.tables.Oportunidade[0],{rating_pagamento_status:'pago',rating_documentacao:'completa'});
 await processor.processarRating(y.api,y.agora);assert.equal(y.sent.length,0);
});
test('Ganho, Perdido, pausa manual e dry-run não enviam mensagens',async()=>{
 for(const status of ['ganha','perdida']){const x=setup();x.tables.Oportunidade[0].status=status;await processor.processarRating(x.api,x.agora);assert.equal(x.sent.length,0);}
 const x=setup();x.tables.Oportunidade[0].rating_followup_pausa_manual=true;await processor.processarRating(x.api,x.agora);assert.equal(x.sent.length,0);
 const y=setup();const antes=JSON.stringify(y.tables);await processor.processarRating(y.api,y.agora,true);assert.equal(JSON.stringify(y.tables),antes);
});
test('alertas internos não enviam WhatsApp e não se duplicam',async()=>{
 const x=setup();x.tables.AutomacaoFunil[0].canal='interno';
 await processor.processarRating(x.api,x.agora);await processor.processarRating(x.api,x.agora);
 assert.equal(x.sent.length,0);assert.equal(x.tables.AlertaFunilContato.length,1);assert.equal(x.tables.HistoricoAutomacao[0].status,'alerta');
});
const dados={rating_valor_servico:900,rating_documentacao:'completa',rating_resultado:'Resultado apresentado e orientações entregues.',rating_resultado_apresentado:true};
test('Ganho exige apresentação e uma escolha financeira explícita',async()=>{
 const x=setup(),o=x.tables.Oportunidade[0];
 await assert.rejects(service.salvarServicoRating(x.db,o,x.user,{acao:'concluir',dados:{...dados,rating_resultado_apresentado:false}},x.agora),/apresentação/);
 await assert.rejects(service.salvarServicoRating(x.db,o,x.user,{acao:'concluir',dados},x.agora),/Vincule/);
 assert.equal(x.tables.Receita,undefined);assert.equal(o.status,'aberta');
});
test('conclusão repetida cria uma única receita pendente e preserva o crédito futuro',async()=>{
 const x=setup(),o=structuredClone(x.tables.Oportunidade[0]);
 await service.salvarServicoRating(x.db,o,x.user,{acao:'concluir',dados,criar_cobranca:true},x.agora);
 await service.salvarServicoRating(x.db,o,x.user,{acao:'concluir',dados,criar_cobranca:true},x.agora);
 assert.equal(x.tables.Receita.length,1);assert.equal(x.tables.Receita[0].status,'pendente');
 assert.equal(x.tables.Oportunidade[0].status,'ganha');assert.equal(x.tables.Oportunidade[0].valor_estimado,900);
});
test('pagamento já recebido é vinculado sem gerar uma segunda receita',async()=>{
 const x=setup();x.tables.Receita=[{id:'r1',empresa_id:empresa,cliente_id:'c1',valor:900,status:'recebida'}];
 await service.salvarServicoRating(x.db,x.tables.Oportunidade[0],x.user,{acao:'concluir',dados,receita_id:'r1'},x.agora);
 assert.equal(x.tables.Receita.length,1);assert.equal(x.tables.Oportunidade[0].rating_pagamento_status,'pago');
});
test('planejamento separado reutiliza o cliente e a repetição não duplica oportunidade',async()=>{
 const x=setup();await service.salvarServicoRating(x.db,x.tables.Oportunidade[0],x.user,{acao:'concluir',dados,criar_cobranca:true},x.agora);
 const rating=structuredClone(x.tables.Oportunidade[0]);
 const a=await service.salvarServicoRating(x.db,rating,x.user,{acao:'planejar'},x.agora);
 const b=await service.salvarServicoRating(x.db,rating,x.user,{acao:'planejar'},x.agora);
 assert.equal(a.planejamento_id,b.planejamento_id);assert.equal(x.tables.Oportunidade.length,2);
 const p=x.tables.Oportunidade[1];assert.equal(p.cliente_id,'c1');assert.equal(p.status,'aberta');assert.equal(p.valor_estimado,0);assert.equal(p.rating_origem_id,'o1');assert.equal(x.tables.Receita.length,1);
});
test('execuções concorrentes elegem apenas uma reserva',async()=>{
 const x=setup();const data={empresa_id:empresa,oportunidade_id:'o1',automacao_id:'auto1',chave_execucao:'unica'};
 const r=await Promise.all([processor.reservarRating(x.db,data),processor.reservarRating(x.db,data)]);
 assert.equal(r.filter(Boolean).length,1);
});
test('falha de envio bloqueia repetição automática e alerta o responsável',async()=>{
 const x=setup();x.api.asServiceRole.functions.invoke=async()=>{throw Error('Timeout de envio');};
 await processor.processarRating(x.api,x.agora);await processor.processarRating(x.api,x.agora);
 assert.equal(x.tables.HistoricoAutomacao.length,1);assert.equal(x.tables.HistoricoAutomacao[0].status,'erro');assert.equal(x.tables.Oportunidade[0].rating_followup_pausado,true);
});
