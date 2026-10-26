import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Phone, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoRecebimentoLigacoes({ user }) {
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [target,setTarget]=useState(user.id);
 const request=async extra=>{
  setBusy(true);setError('');
  try { const r=await base44.functions.invoke('preferenciasRecebimentoLigacoes',{empresaId:user.empresa_id,...extra});setData(r.data); }
  catch(e){setError(e.response?.data?.error||'Não foi possível carregar as configurações')}
  finally{setBusy(false)}
 };
 useEffect(()=>{if(open)void request({})},[open]);
 const enableSession=async c=>{
  setBusy(true);
  try{await base44.functions.invoke('configurarRecebimentoChamadas',{connectionId:c.id,ativo:true});toast.success('Recebimento ativado na D-API');await request({})}
  catch(e){setError(e.response?.data?.error||'Não foi possível ativar a conexão');setBusy(false)}
 };
 return <>
  <Button variant="outline" size="sm" onClick={()=>setOpen(true)} title="Configurar recebimento de ligações"><Phone className="w-4 h-4 mr-1"/>Ligações</Button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Receber ligações neste CRM</DialogTitle></DialogHeader>
   <p className="text-sm text-slate-600">Escolha quais números devem tocar para cada pessoa. Várias pessoas podem receber o toque; a primeira que atender assume a ligação.</p>
   {data?.admin&&<label className="text-sm font-medium">Pessoa<select className="mt-1 w-full border rounded-md p-2" value={target} onChange={e=>setTarget(e.target.value)}>{data.users.map(u=><option key={u.id} value={u.id}>{u.nome}{u.id===user.id?' (você)':''}</option>)}</select></label>}
   {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
   {busy&&<Loader2 className="w-4 h-4 animate-spin"/>}
   {data?.connections.length===0&&<p className="text-sm">Nenhum número D-API compatível encontrado.</p>}
   <div className="space-y-3 max-h-80 overflow-auto">{data?.connections.map(c=><div className="border rounded-lg p-3" key={c.id}>
    <label className="flex items-center justify-between gap-3 cursor-pointer"><span><strong className="block text-sm">{c.nome||c.numero}</strong><span className="text-xs text-slate-500">{c.numero||'Número conectado'}</span></span><input aria-label={'Receber ligações de '+(c.nome||c.numero)} type="checkbox" disabled={busy} checked={data.configs.some(x=>x.user_id===target&&x.connection_id===c.id&&x.ativo)} onChange={e=>void request({acao:'salvar',userId:target,connectionId:c.id,ativo:e.target.checked})}/></label>
    {!c.recebimento&&<div className="mt-2 text-xs text-amber-700">Confirme que o recebimento está ativado na conexão D-API.{data.admin&&<Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={()=>void enableSession(c)}>Ativar na D-API (reinicia a conexão)</Button>}</div>}
   </div>)}</div>
   <p className="text-xs text-slate-500">Deixe o CRM aberto e desative a extensão D-API durante os testes. O navegador exige uma interação para liberar o toque; use “Ativar som” no CRM.</p>
  </DialogContent></Dialog>
 </>;
}
