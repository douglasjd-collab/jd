import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import AvatarContato from '@/components/chat/AvatarContato';
import { Search, X, MessageSquarePlus, Users, Send, Loader2, CheckSquare, Square } from 'lucide-react';

/**
 * Modal "Encaminhar mensagem para" — busca e seleciona conversas de destino.
 * Aceita múltiplos destinos (cada mensagem selecionada será enviada para todos).
 *
 * Props:
 *  - open: boolean
 *  - onOpenChange: (open) => void
 *  - conversas: array de conversas (ConversaWhatsapp) — fonte de dados
 *  - contatosWhatsapp: { [conversaId]: contato } — fotos/nomes do cache
 *  - isGrupo: (conversa) => boolean
 *  - qtdMensagens: number — qtd de mensagens selecionadas (apenas informativo)
 *  - onConfirm: (destinos: Conversa[]) => Promise<void>
 */
export default function EncaminharMensagensModal({
  open,
  onOpenChange,
  conversas = [],
  contatosWhatsapp = {},
  isGrupo = () => false,
  qtdMensagens = 0,
  onConfirm,
}) {
  const [busca, setBusca] = useState('');
  const [destinosIds, setDestinosIds] = useState(new Set());
  const [enviando, setEnviando] = useState(false);

  const conversasDisponiveis = useMemo(() => {
    // Excluir grupos e conversas sem telefone válido
    return conversas.filter(c => {
      if (!c?.id || !c?.cliente_telefone) return false;
      if (isGrupo(c)) return false;
      const tel = String(c.cliente_telefone).replace(/\D/g, '');
      if (tel.length < 8) return false;
      if (String(c.cliente_telefone).includes('@lid') || String(c.cliente_telefone).startsWith('lid_')) return false;
      if (c.cliente_telefone.startsWith('ig_')) return false; // não encaminhar para Instagram por enquanto
      return true;
    });
  }, [conversas, isGrupo]);

  const conversasFiltradas = useMemo(() => {
    if (!busca.trim()) return conversasDisponiveis;
    const q = busca.toLowerCase();
    return conversasDisponiveis.filter(c => {
      const nome = (contatosWhatsapp[c.id]?.nome || c.cliente_nome || '').toLowerCase();
      const tel = (c.cliente_telefone || '').toLowerCase();
      return nome.includes(q) || tel.includes(q);
    });
  }, [busca, conversasDisponiveis, contatosWhatsapp]);

  const toggleDestino = (id) => {
    setDestinosIds(prev => {
      const nova = new Set(prev);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  };

  const destinosSelecionados = conversasDisponiveis.filter(c => destinosIds.has(c.id));

  const handleConfirm = async () => {
    if (destinosSelecionados.length === 0) return;
    setEnviando(true);
    try {
      await onConfirm(destinosSelecionados);
      // Sucesso: resetar e fechar
      setDestinosIds(new Set());
      setBusca('');
      onOpenChange(false);
    } finally {
      setEnviando(false);
    }
  };

  const handleClose = (v) => {
    if (!enviando) {
      if (!v) {
        setDestinosIds(new Set());
        setBusca('');
      }
      onOpenChange(v);
    }
  };

  // Quantidade total de envios = msg(s) * destino(s)
  const totalEnvios = qtdMensagens * destinosSelecionados.length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <button
            onClick={() => handleClose(false)}
            disabled={enviando}
            className="p-1 rounded-full hover:bg-slate-100 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
          <DialogTitle className="text-base font-semibold">
            Encaminhar mensagem para
          </DialogTitle>
          <div className="flex items-center gap-1.5 text-slate-400">
            <MessageSquarePlus className="w-5 h-5" />
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Busca */}
        <div className="px-4 py-3 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Pesquisar nome ou número"
              className="w-full h-10 pl-10 pr-3 rounded-lg bg-slate-100 border-0 text-sm outline-none placeholder:text-slate-500"
            />
          </div>
        </div>

        {/* Lista de contatos */}
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {conversasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
              <Users className="w-10 h-10 opacity-40" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            conversasFiltradas.map(c => {
              const selecionado = destinosIds.has(c.id);
              const nome = contatosWhatsapp[c.id]?.nome || c.cliente_nome || c.cliente_telefone;
              const sub = c.ultima_mensagem || c.cliente_telefone;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleDestino(c.id)}
                  disabled={enviando}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    selecionado ? 'bg-slate-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="flex-shrink-0 text-slate-600">
                    {selecionado ? <CheckSquare className="w-5 h-5 text-slate-900" /> : <Square className="w-5 h-5" />}
                  </span>
                  <AvatarContato
                    contato={contatosWhatsapp[c.id] || { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url }}
                    className="h-10 w-10"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-slate-900">{nome}</p>
                    <p className="text-xs text-slate-500 truncate">{sub}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer de confirmação */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white">
          <span className="text-xs text-slate-500">
            {destinosSelecionados.length > 0
              ? `${destinosSelecionados.length} conversa(s) • ${qtdMensagens} msg(s) • ${totalEnvios} envio(s)`
              : `${qtdMensagens} msg(s) selecionada(s)`}
          </span>
          <Button
            onClick={handleConfirm}
            disabled={destinosSelecionados.length === 0 || enviando}
            className="gap-2"
            size="sm"
          >
            {enviando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Encaminhando...</>
              : <><Send className="w-4 h-4" /> Encaminhar</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}