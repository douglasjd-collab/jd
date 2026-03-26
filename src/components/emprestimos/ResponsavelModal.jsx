import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, UserCheck, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ResponsavelModal({ open, onOpenChange, proposta, empresaId, currentUser }) {
  const [search, setSearch] = useState('');
  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();

  const { data: colaboradores = [], isLoading } = useQuery({
    queryKey: ['colaboradores-responsavel', empresaId],
    enabled: !!empresaId && open,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 200),
  });

  const filtrados = colaboradores.filter(c =>
    !search || c.nome?.toLowerCase().includes(search.toLowerCase())
  );

  const selecionarResponsavel = async (colab) => {
    setSalvando(true);
    try {
      await base44.entities.Proposta.update(proposta.id, {
        responsavel_id: colab.id,
        responsavel_nome: colab.nome,
      });

      // Registrar no histórico
      await base44.entities.HistoricoProposta.create({
        empresa_id: proposta.empresa_id,
        proposta_id: proposta.id,
        tipo: 'responsavel',
        descricao_evento: `Responsável alterado para: ${colab.nome}`,
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || 'Sistema',
        usuario_id: currentUser?.id || '',
        origem: 'JD',
        data_status: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['historico-proposta', proposta.id] });
      toast.success(`Responsável: ${colab.nome}`);
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao definir responsável');
    } finally {
      setSalvando(false);
    }
  };

  const removerResponsavel = async () => {
    setSalvando(true);
    try {
      await base44.entities.Proposta.update(proposta.id, {
        responsavel_id: null,
        responsavel_nome: null,
      });

      await base44.entities.HistoricoProposta.create({
        empresa_id: proposta.empresa_id,
        proposta_id: proposta.id,
        tipo: 'responsavel',
        descricao_evento: 'Responsável removido',
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || 'Sistema',
        usuario_id: currentUser?.id || '',
        origem: 'JD',
        data_status: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success('Responsável removido');
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao remover responsável');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-purple-600" />
            Definir Responsável
          </DialogTitle>
          {proposta?.responsavel_nome && (
            <p className="text-xs text-slate-500 mt-1">
              Atual: <span className="font-medium text-slate-700">{proposta.responsavel_nome}</span>
            </p>
          )}
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar colaborador..."
            className="pl-8 text-sm"
          />
        </div>

        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum colaborador encontrado</p>
          ) : (
            filtrados.map(c => {
              const isAtual = proposta?.responsavel_id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => selecionarResponsavel(c)}
                  disabled={salvando}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all hover:bg-slate-50 ${isAtual ? 'bg-purple-50 ring-1 ring-purple-200' : ''}`}
                >
                  {c.foto_perfil ? (
                    <img
                      src={c.foto_perfil}
                      alt={c.nome}
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                  ) : null}
                  <div
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ display: c.foto_perfil ? 'none' : 'flex' }}
                  >
                    {c.nome?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{c.nome}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.perfil}</p>
                  </div>
                  {isAtual && <span className="text-xs text-purple-600 font-semibold">atual</span>}
                </button>
              );
            })
          )}
        </div>

        {proposta?.responsavel_id && (
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={removerResponsavel} disabled={salvando} className="text-red-600 border-red-200 hover:bg-red-50 w-full">
              Remover responsável
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}