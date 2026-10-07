import React, { useState } from 'react';
import { moeda, descontosTotal } from './folhaCalculos';
export default function DescontosFolha({ form, onChange }) {
 const [descricao,setDescricao] = useState('');
 const [valor,setValor] = useState('');
 const itens = Array.isArray(form.descontos_itens) ? form.descontos_itens : moeda(form.descontos) ? [{id:'legado',descricao:'Desconto anterior',valor:moeda(form.descontos)}] : [];
 const atualizar = lista => onChange({...form,descontos_itens:lista,descontos:lista.reduce((s,i)=>s+moeda(i.valor),0)});
 return <div className="space-y-3 rounded-lg border p-3">
 <h3 className="font-semibold">Descontos individualizados</h3>
 {itens.map((item,index)=><div key={item.id} className="flex gap-2">
 <input aria-label="Descrição do desconto" className="border rounded p-2 w-full min-w-0" value={item.descricao} onChange={e=>atualizar(itens.map((i,n)=>n===index?{...i,descricao:e.target.value}:i))}/>
 <input aria-label="Valor do desconto" inputMode="decimal" className="border rounded p-2 w-28" value={item.valor} onChange={e=>atualizar(itens.map((i,n)=>n===index?{...i,valor:e.target.value}:i))}/>
 <button type="button" className="text-red-600" onClick={()=>atualizar(itens.filter((_,n)=>n!==index))}>Excluir</button></div>)}
 <div className="flex gap-2"><input aria-label="Novo desconto" placeholder="Descrição do novo desconto" className="border rounded p-2 w-full min-w-0" value={descricao} onChange={e=>setDescricao(e.target.value)}/>
 <input aria-label="Valor do novo desconto" placeholder="0,00" inputMode="decimal" className="border rounded p-2 w-28" value={valor} onChange={e=>setValor(e.target.value)}/></div>
 <button type="button" className="text-teal-800 font-medium" disabled={!descricao.trim() || moeda(valor)<=0} onClick={()=>{atualizar([...itens,{id:crypto.randomUUID(),descricao:descricao.trim(),valor:moeda(valor)}]);setDescricao('');setValor('');}}>+ Adicionar desconto</button>
 <p className="text-sm">Total: {descontosTotal({...form,descontos_itens:itens}).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p>
 <label className="block text-sm font-medium">INSS — valor informado pela contabilidade</label>
 <input aria-label="Valor do INSS" inputMode="decimal" className="border rounded p-2 w-full" value={form.inss_valor ?? '0'} onChange={e=>onChange({...form,inss_valor:e.target.value})}/>
 <label className="block text-sm">Vigência da configuração</label>
 <input aria-label="Vigência do INSS" type="month" className="border rounded p-2 w-full" value={form.inss_vigencia || ''} onChange={e=>onChange({...form,inss_vigencia:e.target.value})}/>
 <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!form.salvar_inss} onChange={e=>onChange({...form,salvar_inss:e.target.checked})}/>Usar este valor nas próximas folhas do funcionário a partir da vigência</label>
 </div>;
}