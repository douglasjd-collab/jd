import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, Send, User } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ComentariosModal({ open, onOpenChange, proposta }) {
  const [novoComentario, setNovoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();

  const { data: comentarios = [], isLoading } = useQuery({
    queryKey: ['comentarios-proposta', proposta?.id],
    enabled: !!proposta?.id && open,
    queryFn: () => base44.entities.ComentarioProposta.filter(
      { proposta_id: proposta.id },
      '-created_date'
    ),
  });

  const handleEnviar = async () => {
    if (!novoComentario.trim()) return;
    setEnviando(true);
    try {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const colab = colabs[0];

      await base44.entities.ComentarioProposta.create({
        proposta_id: proposta.id,
        empresa_id: colab?.empresa_id || proposta.empresa_id,
        usuario_id: me.id,
        usuario_nome: colab?.nome || me.full_name,
        texto: novoComentario.trim(),
      });

      setNovoComentario('');
      queryClient.invalidateQueries({ queryKey: ['comentarios-proposta', proposta.id] });
      toast.success('Comentário adicionado!');
    } catch (e) {
      toast.error('Erro ao salvar comentário');
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleEnviar();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-blue-600" />
            Comentários
          </DialogTitle>
          {proposta && (
            <p className="text-sm text-slate-500 mt-1">{proposta.cliente_nome}</p>
          )}
        </DialogHeader>

        {/* Lista de comentários */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[350px] pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : comentarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <MessageCircle className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum comentário ainda</p>
            </div>
          ) : (
            [...comentarios].reverse().map((c) => (
              <div key={c.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {c.usuario_nome?.charAt(0)?.toUpperCase() || <User className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-slate-800">{c.usuario_nome || 'Usuário'}</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {c.created_date
                        ? format(new Date(c.created_date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                        : ''}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed pl-9">{c.texto}</p>
              </div>
            ))
          )}
        </div>

        {/* Novo comentário */}
        <div className="border-t pt-3 space-y-2 mt-2">
          <Textarea
            placeholder="Escreva um comentário... (Ctrl+Enter para enviar)"
            value={novoComentario}
            onChange={(e) => setNovoComentario(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            className="resize-none text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleEnviar}
              disabled={!novoComentario.trim() || enviando}
              className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
              size="sm"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}