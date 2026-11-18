import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AvatarContato from './AvatarContato';

export default function GruposBloqueadosDialog({
  open,
  onOpenChange,
  contatosWhatsapp = {},
  empresaId,
}) {
  const queryClient = useQueryClient();
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !empresaId) return;
    setLoading(true);
    base44.entities.ConversaWhatsapp.filter({ empresa_id: empresaId, bloqueado: true }, '-updated_date', 200)
      .then(setLista)
      .catch(() => toast.error('Erro ao carregar grupos bloqueados'))
      .finally(() => setLoading(false));
  }, [open, empresaId]);

  const desbloquear = async (conversa) => {
    await base44.entities.ConversaWhatsapp.update(conversa.id, { bloqueado: false });
    setLista(prev => prev.filter(g => g.id !== conversa.id));
    queryClient.setQueriesData({ queryKey: ['conversas-whatsapp', empresaId] }, (antiga) =>
      Array.isArray(antiga)
        ? antiga.map(cv => (cv.id === conversa.id ? { ...cv, bloqueado: false } : cv))
        : antiga
    );
    toast.success('🔓 Grupo desbloqueado');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-orange-500" />
            Grupos Bloqueados
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
              <Unlock className="w-10 h-10 opacity-40" />
              <p className="text-sm">Nenhum grupo bloqueado</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {lista.map((c) => {
                const nome = contatosWhatsapp[c.id]?.nome || c.cliente_nome || c.whatsapp_id || c.cliente_telefone;
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                    <div className="relative flex-shrink-0">
                      <AvatarContato
                        contato={contatosWhatsapp[c.id] || { nome: c.cliente_nome, telefone: c.cliente_telefone, foto_url: c.foto_url }}
                        className="h-10 w-10"
                      />
                      <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center">
                        <Lock className="w-2 h-2 text-white" />
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{nome}</p>
                      <p className="text-xs text-slate-500 truncate">{c.cliente_telefone || c.whatsapp_id}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 gap-1.5 text-xs text-green-600 border-green-300 hover:bg-green-50"
                      onClick={() => desbloquear(c)}
                    >
                      <Unlock className="w-3 h-3" />
                      Desbloquear
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}