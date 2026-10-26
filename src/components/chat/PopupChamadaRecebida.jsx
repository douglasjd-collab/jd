import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Volume2, MicOff, Mic, X, BellRing } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import useDapiCall from './useDapiCall';
import { startCallRingback } from './callRingback';

export default function PopupChamadaRecebida({user}) {
 const [allowed,setAllowed]=useState([]),[calls,setCalls]=useState({}),[active,setActive]=useState(null);
 const [soundReady,setSoundReady]=useState(false),[error,setError]=useState('');
 const [connections,setConnections]=useState([]);
 const media=useDapiCall(), context=useRef(null),stop=useRef(null),busy=useRef(false),owned=useRef(null),allowedRef=useRef([]),mediaRef=useRef(media);
 mediaRef.current=media;
 const load=useCallback(async()=>{
  try{const r=await base44.functions.invoke('preferenciasRecebimentoLigacoes',{empresaId:user.empresa_id});
   const ids=r.data.configs.filter(x=>x.user_id===user.id&&x.ativo).map(x=>x.connection_id);
   allowedRef.current=ids;setAllowed(ids);setConnections(r.data.connections||[]);
  }catch{setError('Não foi possível verificar o recebimento de ligações')}
 },[user.id,user.empresa_id]);
 useEffect(()=>{
  void load();
  const off=base44.entities.RecebimentoLigacao.subscribe(ev=>{if(ev.data?.user_id===user.id||ev.type==='delete')void load()});
  return off;
 },[load,user.id]);
 useEffect(()=>{
  setCalls(old=>Object.fromEntries(Object.entries(old).filter(([,c])=>allowed.includes(c.connection_id))));
  if(!allowed.length)return;
  let mounted=true;
  const receive=c=>{
   if(!mounted||!c?.id||c.empresa_id!==user.empresa_id||!allowedRef.current.includes(c.connection_id))return;
   const age=Date.now()-Date.parse(c.oferta_em||c.created_date);
   if(c.status==='recebida'&&age<90000){setCalls(old=>({...old,[c.id]:c}));return}
   setCalls(old=>{const next={...old};delete next[c.id];return next});
   if(c.id===owned.current?.id&&['encerrada','recusada'].includes(c.status)){
    mediaRef.current.encerrar();setActive(null);owned.current=null;busy.current=false;
   }
  };
  const off=base44.entities.ChamadaVozWhatsapp.subscribe(ev=>{
   if(ev.type==='delete'){setCalls(old=>{const n={...old};delete n[ev.id];return n})}
   else if(ev.data?.id)receive(ev.data);
   else base44.entities.ChamadaVozWhatsapp.get(ev.id).then(receive).catch(()=>{});
  });
  // Reconcilia somente ao abrir/reconectar a aba; sem polling.
  const sync=()=>base44.entities.ChamadaVozWhatsapp.filter({empresa_id:user.empresa_id,status:'recebida',created_date:{$gte:new Date(Date.now()-90000).toISOString()}},'-created_date',30).then(rows=>rows.forEach(receive)).catch(()=>{});
  void sync();
  const visible=()=>{if(document.visibilityState==='visible')void sync()};
  document.addEventListener('visibilitychange',visible);
  return ()=>{mounted=false;off();document.removeEventListener('visibilitychange',visible)};
 },[allowed.join(','),user.empresa_id]);
 const call=active||Object.values(calls).sort((a,b)=>String(a.created_date).localeCompare(String(b.created_date)))[0];
 const ringing=!!call&&!active;
 const unlock=async()=>{
  try{
   if(!context.current||context.current.state==='closed')context.current=new (window.AudioContext||window.webkitAudioContext)();
   await context.current.resume();setSoundReady(context.current.state==='running');
  }catch{setError('Não foi possível ativar o som neste navegador')}
 };
 useEffect(()=>{
  if(!allowed.length)return;
  const gesture=()=>{void unlock()};
  window.addEventListener('pointerdown',gesture,{once:true});window.addEventListener('keydown',gesture,{once:true});
  return ()=>{window.removeEventListener('pointerdown',gesture);window.removeEventListener('keydown',gesture)};
 },[allowed.length]);
 useEffect(()=>{
  stop.current?.();stop.current=null;
  if(ringing&&soundReady&&context.current?.state==='running')stop.current=startCallRingback(context.current);
  return ()=>{stop.current?.();stop.current=null};
 },[ringing,call?.id,soundReady]);
 useEffect(()=>{
  if(!ringing)return;
  const t=setTimeout(()=>setCalls(old=>{const n={...old};delete n[call.id];return n}),Math.max(0,90000-(Date.now()-Date.parse(call.oferta_em||call.created_date))));
  return ()=>clearTimeout(t);
 },[ringing,call?.id]);
 useEffect(()=>()=>{stop.current?.();context.current?.close().catch(()=>{})},[]);
 const remove=id=>setCalls(old=>{const n={...old};delete n[id];return n});
 const answer=async()=>{
  if(busy.current||!call)return;
  busy.current=true;owned.current=call;setActive(call);setError('');remove(call.id);
  stop.current?.();
  const ok=await media.atender(call.connection_id,call.call_id);
  if(!ok){owned.current=null;busy.current=false;}
 };
 const hangup=async()=>{
  if(busy.current&&!['connected','error','ended'].includes(media.status))return;
  if(active){media.encerrar();owned.current=null;busy.current=false;setActive(null);return}
  if(!call)return;
  busy.current=true;setError('');
  try{await media.recusar(call.connection_id,call.call_id);remove(call.id)}
  catch(e){setError(e.response?.data?.error||e.message||'Não foi possível desligar')}
  finally{busy.current=false}
 };
 if(!allowed.length)return null;
 if(!call)return !soundReady?<div className="fixed bottom-4 left-4 z-50"><Button size="sm" variant="outline" onClick={unlock}><Volume2 className="w-4 h-4 mr-2"/>Ativar som de ligações</Button></div>:null;
 const connected=media.status==='connected',failed=active&&['error','ended'].includes(media.status);
 const connection=connections.find(c=>c.id===call.connection_id);
 const nome=call.cliente_nome||call.cliente_telefone||'Contato';
 const iniciais=/[a-zÀ-ÿ]/i.test(nome)?nome.trim().split(/\s+/).filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase():'';
 const formatPhone=value=>{
  const digits=String(value||'').replace(/\D/g,'');
  const local=digits.startsWith('55')&&digits.length>11?digits.slice(2):digits;
  if(local.length===11)return '('+local.slice(0,2)+') '+local.slice(2,7)+'-'+local.slice(7);
  if(local.length===10)return '('+local.slice(0,2)+') '+local.slice(2,6)+'-'+local.slice(6);
  return value;
 };
 const dismiss=()=>{if(active&&!failed)return;if(active)void hangup();else remove(call.id)};
 return <Dialog open onOpenChange={open=>{if(!open)dismiss()}}>
  <DialogContent onPointerDownOutside={e=>e.preventDefault()} className="z-[110] w-[calc(100vw-32px)] max-w-[540px] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl sm:p-6 [&>button]:hidden">
   <header className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
     <svg viewBox="0 0 32 32" aria-hidden="true" className="h-11 w-11 shrink-0 text-[#00b85b]" fill="currentColor"><path d="M16 2a14 14 0 0 0-12.1 21L2 30l7.2-1.9A14 14 0 1 0 16 2Z"/><path fill="white" d="M11.1 8.6c-.4-.8-.8-.8-1.1-.8h-.9c-.3 0-.8.1-1.2.6-.4.5-1.6 1.6-1.6 3.8s1.6 4.3 1.9 4.6c.2.3 3.2 4.9 7.8 6.7 3.8 1.5 4.6 1.2 5.4 1.1.8-.1 2.7-1.1 3.1-2.2.4-1.1.4-2 .3-2.2-.1-.2-.4-.3-.9-.6l-3.2-1.5c-.4-.2-.8-.3-1.1.2l-1.5 1.8c-.3.3-.6.4-1 .2a12.1 12.1 0 0 1-3.7-2.3 14.3 14.3 0 0 1-2.5-3.1c-.3-.4 0-.7.2-1l.7-.8.5-.8c.1-.3.1-.6 0-.9l-1.4-3Z"/></svg>
     <DialogTitle className="text-lg font-semibold tracking-tight sm:text-xl">Ligação via WhatsApp</DialogTitle>
    </div>
    <button type="button" aria-label="Fechar aviso de ligação" title={active&&!failed?'Use Desligar para encerrar a ligação':'Fechar aviso'} disabled={!!active&&!failed} onClick={dismiss} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><X className="h-6 w-6"/></button>
   </header>
   <DialogDescription className="sr-only">Chamada de {nome}. Escolha atender ou desligar.</DialogDescription>
   <div className="flex flex-col items-center text-center pt-2 sm:pt-4">
    <div className="mb-3 flex h-24 w-24 items-center justify-center rounded-full bg-[#ccebe1] text-4xl font-bold text-[#00745a] sm:h-28 sm:w-28 sm:text-5xl">{iniciais||<Phone className="h-10 w-10"/>}</div>
    <h2 className="max-w-full break-words text-2xl font-bold leading-tight tracking-tight sm:text-[30px]">{nome}</h2>
    <p className="mt-1 text-xl leading-snug sm:text-[26px]">{formatPhone(call.cliente_telefone)}</p>
    <div className="mt-5 w-full rounded-xl bg-slate-100 px-3 py-3 text-sm text-slate-600 sm:text-base">Número chamado: <span className="font-semibold text-slate-900">{connection?.nome||connection?.numero||'WhatsApp'}{connection?.nome&&connection?.numero?' · '+formatPhone(connection.numero):''}</span></div>
    <div aria-live="polite" className="mt-6 flex items-center justify-center gap-3 font-semibold text-[#008260] sm:text-xl"><BellRing className={'h-8 w-8 '+(ringing?'animate-pulse':'')}/>{connected?'Em ligação':failed?'Ligação encerrada':active?'Atendendo…':'Chamada recebida'}</div>
    <div className="mt-4 flex min-h-7 items-center justify-center gap-2 text-sm text-slate-500 sm:text-base"><Volume2 className="h-5 w-5"/>{ringing&&!soundReady?<button className="font-medium text-emerald-700 underline underline-offset-4" onClick={unlock}>Ativar toque de chamada</button>:soundReady?'Toque ativado':'Toque aguardando ativação'}</div>
    {connected&&<Button variant="outline" className="mt-3" onClick={media.alternarMudo}>{media.mutado?<MicOff className="mr-2 h-4 w-4"/>:<Mic className="mr-2 h-4 w-4"/>}{media.mutado?'Reativar microfone':'Silenciar microfone'}</Button>}
    {(error||media.erro)&&<p role="alert" className="mt-3 text-sm text-red-600">{error||media.erro}</p>}
   </div>
   <div className={'mt-3 grid gap-3 '+(ringing?'grid-cols-2':'grid-cols-1')}>
    <Button disabled={!!active&&!connected&&!failed} className="h-16 rounded-xl bg-[#ed252b] px-3 text-lg font-semibold text-white hover:bg-red-700 sm:h-20 sm:text-xl" onClick={hangup}>{failed?<X className="mr-2 h-6 w-6"/>:<PhoneOff className="mr-2 h-6 w-6"/>}{failed?'Fechar':'Desligar'}</Button>
    {ringing&&<Button className="h-16 rounded-xl bg-[#008566] px-3 text-lg font-semibold text-white hover:bg-emerald-800 sm:h-20 sm:text-xl" onClick={answer}><Phone className="mr-2 h-6 w-6"/>Atender</Button>}
   </div>
  </DialogContent>
 </Dialog>;
}
