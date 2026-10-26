import React, { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Phone, PhoneOff, Volume2, MicOff, Mic, X } from 'lucide-react';
import useDapiCall from './useDapiCall';
import { startCallRingback } from './callRingback';

export default function PopupChamadaRecebida({user}) {
 const [allowed,setAllowed]=useState([]),[calls,setCalls]=useState({}),[active,setActive]=useState(null);
 const [soundReady,setSoundReady]=useState(false),[error,setError]=useState('');
 const media=useDapiCall(), context=useRef(null),stop=useRef(null),busy=useRef(false),owned=useRef(null),allowedRef=useRef([]),mediaRef=useRef(media);
 mediaRef.current=media;
 const load=useCallback(async()=>{
  try{const r=await base44.functions.invoke('preferenciasRecebimentoLigacoes',{empresaId:user.empresa_id});
   const ids=r.data.configs.filter(x=>x.user_id===user.id&&x.ativo).map(x=>x.connection_id);
   allowedRef.current=ids;setAllowed(ids);
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
 return <section role="dialog" aria-label="Ligação recebida" aria-live="polite" className="fixed bottom-6 right-6 z-[100] w-[min(360px,calc(100vw-32px))] rounded-2xl border bg-white text-slate-900 shadow-2xl p-5">
  <div className="flex items-center gap-3"><span className="rounded-full bg-emerald-100 p-3"><Phone className={'w-6 h-6 text-emerald-700 '+(ringing?'animate-pulse':'')}/></span><div><p className="font-semibold">{connected?'Em ligação':failed?'Ligação encerrada':active?'Atendendo…':'Ligação recebida'}</p><p className="text-sm font-medium">{call.cliente_nome||call.cliente_telefone}</p><p className="text-xs text-slate-500">{call.cliente_telefone}</p></div></div>
  {(error||media.erro)&&<p role="alert" className="mt-3 text-sm text-red-600">{error||media.erro}</p>}
  {ringing&&!soundReady&&<Button size="sm" variant="outline" className="mt-3" onClick={unlock}><Volume2 className="w-4 h-4 mr-2"/>Ativar som</Button>}
  <div className="flex gap-2 mt-4">
   {ringing&&<Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={answer}><Phone className="w-4 h-4 mr-2"/>Atender</Button>}
   {connected&&<Button variant="outline" onClick={media.alternarMudo}>{media.mutado?<MicOff className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}</Button>}
   <Button variant="destructive" disabled={!!active&&!connected&&!failed} className="flex-1" onClick={hangup}>{failed?<X className="w-4 h-4 mr-2"/>:<PhoneOff className="w-4 h-4 mr-2"/>}{failed?'Fechar':'Desligar'}</Button>
  </div>
 </section>;
}
