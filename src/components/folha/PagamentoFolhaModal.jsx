import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { moeda, pago, saldo, arredondar } from './folhaCalculos';
export default function PagamentoFolhaModal({ folha, filiais, onClose, onPaid }) {
 const chave = 'pagamento-folha-' + folha.id;
 const pendente = JSON.parse(sessionStorage.getItem(chave) || 'null');
 const [tipo,setTipo] = useState(pendente?.tipo || 'Quinzena');
 const [valor,setValor] = useState(pendente?.valor || String(saldo(folha)));
 const [data,setData] = useState(pendente?.data || new Date().toISOString().slice(0,10));
 const [filial,setFilial] = useState(pendente?.filial_id || folha.filial_id || (filiais.length === 1 ? filiais[0].id : ''));
 const [saving,setSaving] = useState(false);
 const trava = useRef(false);
 const salvar = async () => {
  if (trava.current) return;
  if (!data || !filial || moeda(valor) <= 0) return toast.error('Informe data, filial e valor positivo.');
  trava.current = true; setSaving(true);
  try {
   const atual = await base44.entities.FolhaSalarial.get(folha.id);
   let p = JSON.parse(sessionStorage.getItem(chave) || 'null');
   if (!p) {
    if (moeda(valor) > saldo(atual)) throw new Error('O valor ultrapassa o saldo restante.');
    p = {id:crypto.randomUUID(),tipo,valor:moeda(valor),data,filial_id:filial};
    sessionStorage.setItem(chave,JSON.stringify(p));
   }
   if (!(atual.pagamentos || []).some(x => x.id === p.id)) {
    if (p.valor > saldo(atual)) throw new Error('O saldo mudou. Verifique os pagamentos antes de continuar.');
    const descricao = 'Salário - ' + atual.colaborador_nome + ' - ' + atual.mes_referencia + ' [' + p.id + ']';
    const existentes = await base44.entities.Despesa.filter({empresa_id:atual.empresa_id,descricao});
    const despesa = existentes[0] || await base44.entities.Despesa.create({
     empresa_id:atual.empresa_id,filial_id:p.filial_id,descricao,valor:p.valor,
     data:p.data,data_vencimento:p.data,data_pagamento:p.data,categoria:'Folha Salarial',
     status:'pago',responsavel_id:atual.colaborador_id,responsavel_nome:atual.colaborador_nome,
     observacao:p.tipo + ' / competência ' + atual.mes_referencia
    });
    const pagamentos = [...(atual.pagamentos || []),{...p,despesa_id:despesa.id}];
    const total = arredondar(pago({...atual,pagamentos}));
    await base44.entities.FolhaSalarial.update(atual.id,{
     pagamentos,filial_id:p.filial_id,status:total >= atual.valor_liquido ? 'Paga' : 'Gerada',
     ...(total >= atual.valor_liquido ? {data_pagamento:p.data} : {})
    });
   }
   sessionStorage.removeItem(chave);
   toast.success('Pagamento registrado.'); onPaid(); onClose();
  } catch(e) { toast.error(e.message || 'Não foi possível registrar. Tente novamente para concluir o mesmo pagamento.'); }
  finally { trava.current = false; setSaving(false); }
 };
 return <Dialog open onOpenChange={() => {if(!saving) onClose();}}>
  <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Registrar pagamento</DialogTitle></DialogHeader>
  <p className="text-sm">{folha.colaborador_nome} · {folha.mes_referencia}</p>
  <div className="bg-green-50 p-3 rounded-lg">Já pago: <strong>{pago(folha).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><br/>Saldo: <strong>{saldo(folha).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
  <Label>Tipo</Label><select className="border rounded p-2" value={tipo} disabled={!!pendente || saving} onChange={e => {setTipo(e.target.value); if(e.target.value === 'Saldo') setValor(String(saldo(folha)));}}><option>Quinzena</option><option>Saldo</option><option>Parcial</option></select>
  <Label>Valor pago</Label><Input inputMode="decimal" value={valor} disabled={!!pendente || saving} onChange={e=>setValor(e.target.value)}/>
  <Label>Data do pagamento</Label><Input type="date" value={data} disabled={!!pendente || saving} onChange={e=>setData(e.target.value)}/>
  <Label>Filial responsável *</Label><select className="border rounded p-2" value={filial} disabled={!!pendente || saving} onChange={e=>setFilial(e.target.value)}><option value="">Selecione</option>{filiais.map(f=><option key={f.id} value={f.id}>{f.nome || f.nome_fantasia}</option>)}</select>
  <p className="text-xs text-slate-500">Registra um pagamento já realizado e sua despesa no financeiro. A quinzena reduz o saldo a pagar.</p>
  <Button disabled={saving} onClick={salvar}>{saving ? 'Registrando...' : pendente ? 'Concluir registro pendente' : 'Registrar pagamento'}</Button>
  </DialogContent></Dialog>;
}