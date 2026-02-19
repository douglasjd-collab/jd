import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Users } from 'lucide-react';

const perfilColors = {
  master: 'bg-purple-100 text-purple-700',
  super_admin: 'bg-pink-100 text-pink-700',
  admin: 'bg-blue-100 text-blue-700',
  gerente: 'bg-amber-100 text-amber-700',
  vendedor: 'bg-slate-100 text-slate-700',
};

const perfilLabels = {
  master: 'Master', super_admin: 'Super Admin', admin: 'Admin',
  gerente: 'Gerente', vendedor: 'Vendedor',
};

export default function MigrarUsuariosModal({ open, onOpenChange, usuariosDaJD, onSuccess }) {
  const [subcontaDestino, setSubcontaDestino] = useState('');
  const [selecionados, setSelecionados] = useState([]);
  const [loading, setLoading] = useState(false);

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-destino'],
    queryFn: async () => {
      const response = await base44.functions.invoke('listarEmpresas', {});
      return (response.data?.empresas || []).filter(e => e.status === 'ativa');
    },
    enabled: open,
  });

  const toggleSelecionado = (id) => {
    setSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleTodos = () => {
    if (selecionados.length === usuariosDaJD.length) {
      setSelecionados([]);
    } else {
      setSelecionados(usuariosDaJD.map(u => u.id));
    }
  };

  const handleMigrar = async () => {
    if (!subcontaDestino) {
      toast.error('Selecione a empresa de destino');
      return;
    }
    if (selecionados.length === 0) {
      toast.error('Selecione pelo menos um usuário');
      return;
    }

    setLoading(true);
    try {
      const subconta = empresas.find(e => e.id === subcontaDestino);
      let sucessos = 0;
      let erros = 0;

      for (const id of selecionados) {
        const usuario = usuariosDaJD.find(u => u.id === id);
        if (!usuario) continue;
        try {
          await base44.asServiceRole.entities.Colaborador.update(id, {
            empresa_id: subcontaDestino,
            empresa_nome: subconta.nome,
          });
          // Atualizar User também
          if (usuario.user_id) {
            await base44.asServiceRole.entities.User.update(usuario.user_id, {
              empresa_id: subcontaDestino,
              empresa_nome: subconta.nome,
            }).catch(() => {}); // User pode não existir ainda
          }
          sucessos++;
        } catch {
          erros++;
        }
      }

      toast.success(`${sucessos} usuário(s) migrado(s) para ${subconta.nome}` + (erros ? ` (${erros} erro(s))` : ''));
      setSelecionados([]);
      setSubcontaDestino('');
      onSuccess?.();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#23BE84]" />
            Migrar Usuários para Subconta
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-hidden flex-1">
          {/* Destino */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Empresa de destino</label>
            <Select value={subcontaDestino} onValueChange={setSubcontaDestino}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a subconta de destino..." />
              </SelectTrigger>
              <SelectContent>
                {empresas.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista de usuários */}
          <div className="flex flex-col gap-2 overflow-auto flex-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">
                Usuários da JD Promotora ({usuariosDaJD.length})
              </label>
              <button
                onClick={toggleTodos}
                className="text-xs text-[#23BE84] hover:underline"
              >
                {selecionados.length === usuariosDaJD.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>
            </div>

            <div className="border rounded-lg divide-y overflow-auto max-h-[360px]">
              {usuariosDaJD.map(u => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                  onClick={() => toggleSelecionado(u.id)}
                >
                  <Checkbox
                    checked={selecionados.includes(u.id)}
                    onCheckedChange={() => toggleSelecionado(u.id)}
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{u.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                  <Badge className={perfilColors[u.perfil] || perfilColors.vendedor}>
                    {perfilLabels[u.perfil] || 'Vendedor'}
                  </Badge>
                </div>
              ))}
              {usuariosDaJD.length === 0 && (
                <div className="px-4 py-8 text-center text-slate-500 text-sm">
                  Nenhum usuário da JD Promotora encontrado
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-slate-500">
              {selecionados.length} selecionado(s)
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleMigrar}
                disabled={loading || !subcontaDestino || selecionados.length === 0}
                className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                Migrar {selecionados.length > 0 ? `(${selecionados.length})` : ''}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}