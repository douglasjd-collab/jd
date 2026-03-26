import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, UserCheck, Search, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

// Helpers para parse/serialize do JSON de responsáveis
const parseResponsaveis = (json) => {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
};

export default function ResponsavelModal({ open, onOpenChange, proposta, empresaId, currentUser }) {
  const [search, setSearch] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [selecionados, setSelecionados] = useState([]);
  const queryClient = useQueryClient();

  // Inicializa selecionados com os responsáveis já salvos
  useEffect(() => {
    if (open && proposta) {
      const atuais = parseResponsaveis(proposta.responsaveis_json);
      // Compatibilidade com legado: se não há json mas há responsavel_id, usa ele
      if (atuais.length === 0 && proposta.responsavel_id) {
        setSelecionados([{
          id: proposta.responsavel_id,
          nome: proposta.responsavel_nome,
          foto: proposta.responsavel_foto || null,
        }]);
      } else {
        setSelecionados(atuais);
      }
    }
  }, [open, proposta]);

  const { data: colaboradores = [], isLoading } = useQuery({
    queryKey: ['colaboradores-responsavel', empresaId],
    enabled: !!empresaId && open,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 200),
  });

  const filtrados = colaboradores.filter(c =>
    !search || c.nome?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelecionado = (colab) => {
    setSelecionados(prev => {
      const jaEsta = prev.find(r => r.id === colab.id);
      if (jaEsta) return prev.filter(r => r.id !== colab.id);
      return [...prev, { id: colab.id, nome: colab.nome, foto: colab.foto_perfil || null }];
    });
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const responsaveisJson = JSON.stringify(selecionados);
      // Mantém legado com o primeiro responsável
      const primeiro = selecionados[0] || null;
      await base44.entities.Proposta.update(proposta.id, {
        responsaveis_json: responsaveisJson,
        responsavel_id: primeiro?.id || null,
        responsavel_nome: primeiro?.nome || null,
        responsavel_foto: primeiro?.foto || null,
      });

      const nomes = selecionados.map(r => r.nome).join(', ');
      await base44.entities.HistoricoProposta.create({
        empresa_id: proposta.empresa_id,
        proposta_id: proposta.id,
        tipo: 'responsavel',
        descricao_evento: selecionados.length > 0
          ? `Responsáveis definidos: ${nomes}`
          : 'Responsáveis removidos',
        usuario_nome: currentUser?.nome_perfil || currentUser?.full_name || 'Sistema',
        usuario_id: currentUser?.id || '',
        origem: 'JD',
        data_status: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['historico-proposta', proposta.id] });
      toast.success(selecionados.length > 0 ? `${selecionados.length} responsável(is) definido(s)` : 'Responsáveis removidos');
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao salvar responsáveis');
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
            Responsáveis pela Proposta
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">Clique para selecionar/remover. Múltiplos permitidos.</p>
        </DialogHeader>

        {/* Selecionados */}
        {selecionados.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {selecionados.map(r => (
              <div key={r.id} className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-full pl-1 pr-2 py-0.5">
                {r.foto ? (
                  <img src={r.foto} alt={r.nome} className="w-5 h-5 rounded-full object-cover" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-purple-400 flex items-center justify-center text-white text-[9px] font-bold">
                    {r.nome?.charAt(0)?.toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium text-purple-800">{r.nome.split(' ')[0]}</span>
                <button onClick={() => setSelecionados(prev => prev.filter(x => x.id !== r.id))} className="text-purple-400 hover:text-purple-700">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar colaborador..."
            className="pl-8 text-sm"
          />
        </div>

        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum colaborador encontrado</p>
          ) : (
            filtrados.map(c => {
              const isSelecionado = selecionados.some(r => r.id === c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleSelecionado(c)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm transition-all hover:bg-slate-50 ${isSelecionado ? 'bg-purple-50 ring-1 ring-purple-200' : ''}`}
                >
                  {c.foto_perfil ? (
                    <img src={c.foto_perfil} alt={c.nome} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {c.nome?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 truncate">{c.nome}</p>
                    <p className="text-xs text-slate-400 capitalize">{c.perfil}</p>
                  </div>
                  {isSelecionado && <Check className="w-4 h-4 text-purple-600 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-col">
          <Button
            className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            onClick={salvar}
            disabled={salvando}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : `Salvar (${selecionados.length} selecionado${selecionados.length !== 1 ? 's' : ''})`}
          </Button>
          {selecionados.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setSelecionados([])} className="text-red-600 border-red-200 hover:bg-red-50 w-full text-xs">
              Remover todos
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}