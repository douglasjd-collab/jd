import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import React, {useState, useEffect} from 'react';
import {X} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';

export default function NotasConversaEditor({salvar, notaEditando, referencia, onFecharEdicao, total, erro}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [visibilidade, setVisibilidade] = useState('interna');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (notaEditando) {
      setTexto(notaEditando.texto); setVisibilidade(notaEditando.visibilidade); setAberto(true);
    }
  }, [notaEditando]);
  useEffect(() => {
    if (referencia) {setTexto(''); setVisibilidade('interna'); setAberto(true);}
  }, [referencia]);
  const fechar = () => {setAberto(false); setTexto(''); setVisibilidade('interna'); onFecharEdicao();};
  const gravar = async () => {
    setSalvando(true);
    try {await salvar(texto, visibilidade, notaEditando, referencia); fechar(); toast.success('Nota salva');}
    catch(e) {toast.error(e.message || 'Não foi possível salvar a nota');}
    finally {setSalvando(false);}
  };
  return <Dialog open={aberto} onOpenChange={value => { if (!value && !salvando) fechar(); }}>
    <DialogContent className="max-w-lg bg-amber-50 border-amber-200">
      <DialogHeader><DialogTitle>{notaEditando ? 'Editar anotação' : 'Inserir anotação'}</DialogTitle></DialogHeader>
      {referencia && <blockquote className="border-l-2 border-amber-400 pl-3 text-xs text-amber-800 whitespace-pre-wrap break-words">{referencia.texto || 'Mensagem com mídia'}</blockquote>}
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs font-semibold text-amber-900">{notaEditando ? 'Editar nota' : 'Nova anotação'}</label>
        <button type="button" disabled={salvando} aria-label="Fechar anotação" onClick={fechar}><X size={16}/></button>
      </div>
      <select aria-label="Visibilidade da nota" disabled={salvando} className="rounded border border-amber-300 bg-white p-1 text-xs mb-2" value={visibilidade} onChange={e=>setVisibilidade(e.target.value)}>
        <option value="interna">Nota interna — equipe</option><option value="privada">Somente para mim</option>
      </select>
      <textarea aria-label="Texto da nota" disabled={salvando} maxLength={10000} rows={3} className="w-full rounded-lg border border-amber-300 bg-white p-2 text-sm resize-y" placeholder="Registre um combinado, lembrete ou o que foi resolvido por ligação..." value={texto} onChange={e=>setTexto(e.target.value)}/>
      <div className="flex items-center justify-between gap-2 mt-2"><span className="text-xs text-amber-800">{visibilidade === 'privada' ? 'Visível somente para você.' : 'Visível para a equipe com acesso à conversa.'}</span>
        <Button type="button" size="sm" disabled={salvando || !texto.trim()} onClick={gravar}>{salvando ? 'Salvando...' : 'Salvar nota'}</Button></div>
    {erro && <p role="alert" className="text-xs text-red-600 mt-1">Não foi possível carregar as notas. Reabra a conversa para tentar novamente.</p>}
    </DialogContent>
  </Dialog>;
}
