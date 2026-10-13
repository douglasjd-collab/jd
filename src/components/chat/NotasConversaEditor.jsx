import React, {useState, useEffect} from 'react';
import {StickyNote, X} from 'lucide-react';
import {toast} from 'sonner';
import {Button} from '@/components/ui/button';

export default function NotasConversaEditor({salvar, notaEditando, onFecharEdicao, total, erro}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [visibilidade, setVisibilidade] = useState('interna');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (notaEditando) {
      setTexto(notaEditando.texto); setVisibilidade(notaEditando.visibilidade); setAberto(true);
    }
  }, [notaEditando]);
  const fechar = () => {setAberto(false); setTexto(''); setVisibilidade('interna'); onFecharEdicao();};
  const gravar = async () => {
    setSalvando(true);
    try {await salvar(texto, visibilidade, notaEditando); fechar(); toast.success('Nota salva');}
    catch(e) {toast.error(e.message || 'Não foi possível salvar a nota');}
    finally {setSalvando(false);}
  };
  return <div className="shrink-0 border-t border-amber-200 bg-amber-50 px-3 py-2">
    {!aberto ? <div className="flex items-center justify-between gap-2">
      <Button type="button" variant="ghost" size="sm" className="text-amber-900 gap-2" onClick={() => setAberto(true)}><StickyNote size={16}/>Adicionar nota</Button>
      <span className="text-xs text-amber-800">{total ? total + ' nota(s) no histórico' : 'Uso interno'}</span>
    </div> : <>
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
    </>}
    {erro && <p role="alert" className="text-xs text-red-600 mt-1">Não foi possível carregar as notas. Reabra a conversa para tentar novamente.</p>}
  </div>;
}
