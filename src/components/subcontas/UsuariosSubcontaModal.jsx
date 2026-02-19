import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users, UserPlus, Loader2, Trash2, Building2 } from 'lucide-react';

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

export default function UsuariosSubcontaModal({ open, onOpenChange, empresa }) {
  const [adicionarOpen, setAdicionarOpen] = useState(false);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [perfilSelecionado, setPerfilSelecionado] = useState('vendedor');
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  // Usuários vinculados a esta subconta
  const { data: usuariosDaSubconta = [], isLoading, refetch } = useQuery({
    queryKey: ['usuarios-subconta', empresa?.id],
    queryFn: () => base44.entities.Colaborador.filter(
      { empresa_id: empresa?.id },
      '-created_date',
      200
    ),
    enabled: open && !!empresa?.id,
  });

  // Todos os colaboradores sem empresa (pool para adicionar)
  const { data: todosColaboradores = [] } = useQuery({
    queryKey: ['colaboradores-sem-empresa'],
    queryFn: async () => {
      const colabs = await base44.entities.Colaborador.list('-created_date', 500);
      // Retorna colaboradores sem empresa ou com empresa_id vazio
      return colabs.filter(c => !c.empresa_id || c.empresa_id === '');
    },
    enabled: open && adicionarOpen,
  });

  const handleRemover = async (colab) => {
    if (!confirm(`Remover ${colab.nome} da subconta ${empresa?.nome}?`)) return;
    try {
      await base44.asServiceRole.entities.Colaborador.update(colab.id, {
        empresa_id: null,
        empresa_nome: null,
      });
      toast.success(`${colab.nome} removido da subconta`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
    } catch (e) {
      toast.error('Erro ao remover: ' + e.message);
    }
  };

  const handleAdicionar = async () => {
    if (!usuarioSelecionado) {
      toast.error('Selecione um usuário');
      return;
    }
    setLoading(true);
    try {
      const response = await base44.functions.invoke('migrarUsuarios', {
        colaboradorIds: [usuarioSelecionado],
        subcontaDestinoId: empresa.id,
      });
      const result = response.data;
      if (result?.success) {
        toast.success(`Usuário adicionado à ${empresa.nome}`);
        setUsuarioSelecionado('');
        setAdicionarOpen(false);
        refetch();
        queryClient.invalidateQueries({ queryKey: ['empresas'] });
        queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      } else {
        toast.error('Erro: ' + (result?.error || 'desconhecido'));
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!empresa) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#23BE84]" />
            Usuários — {empresa.nome}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-hidden flex-1">
          {/* Header com contador e botão adicionar */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {usuariosDaSubconta.length} / {empresa.limite_usuarios || '∞'} usuários
            </span>
            <Button
              size="sm"
              className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
              onClick={() => setAdicionarOpen(!adicionarOpen)}
            >
              <UserPlus className="w-4 h-4" />
              Adicionar Usuário
            </Button>
          </div>

          {/* Painel de adicionar usuário */}
          {adicionarOpen && (
            <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
              <p className="text-sm font-medium text-slate-700">Selecione um colaborador para adicionar:</p>
              <Select value={usuarioSelecionado} onValueChange={setUsuarioSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o usuário..." />
                </SelectTrigger>
                <SelectContent>
                  {todosColaboradores.length === 0 ? (
                    <div className="p-2 text-sm text-slate-500">Nenhum colaborador sem subconta</div>
                  ) : (
                    todosColaboradores.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome} — {c.email} ({perfilLabels[c.perfil] || c.perfil})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setAdicionarOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-[#23BE84] hover:bg-[#1da570]"
                  onClick={handleAdicionar}
                  disabled={loading || !usuarioSelecionado}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar'}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de usuários */}
          <div className="border rounded-lg divide-y overflow-auto flex-1">
            {isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
              </div>
            ) : usuariosDaSubconta.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                Nenhum usuário vinculado a esta subconta
              </div>
            ) : (
              usuariosDaSubconta.map(u => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {u.nome?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">{u.nome}</p>
                    <p className="text-xs text-slate-500 truncate">{u.email}</p>
                  </div>
                  <Badge className={perfilColors[u.perfil] || perfilColors.vendedor}>
                    {perfilLabels[u.perfil] || 'Vendedor'}
                  </Badge>
                  <Badge className={u.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                    {u.status || 'ativo'}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleRemover(u)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}