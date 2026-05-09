import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Loader2, 
  ChevronRight,
  Filter
} from 'lucide-react';

export default function SelecionarPlanoCanopusModal({ open, onOpenChange, onSelectPlano, empresaId }) {
  const [search, setSearch] = useState('');
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  // Resetar filtros ao abrir o modal
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setValorMin('');
      setValorMax('');
    }
  }, [open]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [variacoesDialogOpen, setVariacoesDialogOpen] = useState(false);

  const { data: planos = [], isLoading, error } = useQuery({
    queryKey: ['planos-canopus-modal', empresaId, open],
    queryFn: async () => {
      // Busca todos planos ativos — sem filtro de empresa para garantir que aparece
      const res = await base44.entities.PlanoCanopus.list('-ultima_sincronizacao', 1000);
      const lista = Array.isArray(res) ? res : (res?.items ?? []);
      // Se tiver empresaId, filtra pelo client-side
      if (empresaId) {
        return lista.filter(p => p.empresa_id === empresaId && p.status === 'ativo');
      }
      return lista.filter(p => p.status === 'ativo');
    },
    enabled: open,
    staleTime: 0,
  });

  const groupedPlanos = useMemo(() => {
    const groups = {};
    
    planos.forEach(plano => {
      const codigo = plano.nome_bem?.split(' - ')[0]?.trim() || plano.external_hash?.split('_')[0];
      if (!codigo) return;
      
      // Agrupar por código + valor_bem para não perder planos com mesmo código mas créditos diferentes (ex: 50% vs 100%)
      const chave = `${codigo}__${plano.valor_bem || 0}`;
      
      if (!groups[chave]) {
        groups[chave] = {
          codigo,
          nome_bem: plano.nome_bem,
          valor_bem: plano.valor_bem,
          produto_id: plano.produto_id,
          plano: plano.plano,
          tipo_venda: plano.tipo_venda,
          variacoes: []
        };
      }
      
      groups[chave].variacoes.push({
        id: plano.id,
        prazo_meses: plano.prazo_meses,
        parcela: plano.parcela,
        plano: plano.plano,
        tipo_venda: plano.tipo_venda
      });
    });
    
    Object.values(groups).forEach(group => {
      group.variacoes.sort((a, b) => (b.prazo_meses || 0) - (a.prazo_meses || 0));
    });
    
    return Object.values(groups);
  }, [planos]);

  const filteredPlanos = useMemo(() => {
    const filtered = groupedPlanos.filter(g => {
      if (search) {
        const s = search.toLowerCase();
        const matchSearch = (
          g.nome_bem?.toLowerCase().includes(s) ||
          g.codigo?.toLowerCase().includes(s) ||
          g.plano?.toLowerCase().includes(s)
        );
        if (!matchSearch) return false;
      }
      
      const valor = g.valor_bem || 0;
      // valorMin e valorMax são strings numéricas simples (ex: "40000")
      const min = valorMin ? parseFloat(valorMin) : 0;
      const max = valorMax ? parseFloat(valorMax) : Infinity;
      if (min && valor < min) return false;
      if (max < Infinity && valor > max) return false;
      
      return true;
    });
    
    // Ordenar por valor (crescente)
    return filtered.sort((a, b) => (a.valor_bem || 0) - (b.valor_bem || 0));
  }, [groupedPlanos, search, valorMin, valorMax]);

  const formatCurrency = (value) => {
    return value?.toLocaleString('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    });
  };

  const formatCurrencyInput = (value) => {
    if (!value) return '';
    const number = parseFloat(value.replace(/\D/g, '')) / 100;
    return number.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  const parseCurrencyInput = (value) => {
    if (!value) return '';
    return value.replace(/\D/g, '');
  };

  const handleSelectVariacao = (group, variacao) => {
    // Extrair número do grupo do campo plano (ex: "9130|..." -> "9130")
    const grupoNumero = group.plano?.split('|')[0]?.trim() || 
                        variacao.plano?.split('|')[0]?.trim() || 
                        group.codigo?.replace(/^\D+/, '') || '';
    
    onSelectPlano({
      credito: group.valor_bem,
      parcela: variacao.parcela,
      prazo: variacao.prazo_meses,
      nome_bem: group.nome_bem,
      grupo: grupoNumero
    });
    setVariacoesDialogOpen(false);
    onOpenChange(false);
    setSearch('');
    setValorMin('');
    setValorMax('');
  };

  const handleOpenVariacoes = (group) => {
    setSelectedGroup(group);
    setVariacoesDialogOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Selecionar Plano Canopus</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-y-auto">
            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-3 sticky top-0 bg-white pb-3 z-10 border-b">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nome, código ou plano..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <Input
                  type="number"
                  placeholder="Valor mín. (R$)"
                  value={valorMin}
                  onChange={(e) => setValorMin(e.target.value)}
                  className="w-36"
                />
                <span className="text-slate-400 text-sm">até</span>
                <Input
                  type="number"
                  placeholder="Valor máx. (R$)"
                  value={valorMax}
                  onChange={(e) => setValorMax(e.target.value)}
                  className="w-36"
                />
                {(valorMin || valorMax) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setValorMin('');
                      setValorMax('');
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>

            {/* Tabela */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
              </div>
            ) : filteredPlanos.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <p>Nenhum plano encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PLANO</TableHead>
                      <TableHead className="text-right">VALOR</TableHead>
                      <TableHead className="text-center">PRAZO</TableHead>
                      <TableHead className="text-right">1ª PARCELA</TableHead>
                      <TableHead className="text-center">VARIAÇÕES</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlanos.map((group) => (
                      <TableRow 
                        key={`${group.codigo}__${group.valor_bem}`}
                        className="hover:bg-slate-50 cursor-pointer"
                        onClick={() => handleOpenVariacoes(group)}
                      >
                        <TableCell className="font-medium">
                          <div>
                            <span className="text-blue-600 font-semibold">{group.codigo}</span>
                            <span className="text-slate-600 ml-1">-</span>
                            <span className="ml-1">{group.nome_bem?.split(' - ')[1] || group.nome_bem}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(group.valor_bem)}
                        </TableCell>
                        <TableCell className="text-center">
                          {group.variacoes[0]?.prazo_meses}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(group.variacoes[0]?.parcela)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{group.variacoes.length}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenVariacoes(group);
                            }}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Variações */}
      <Dialog open={variacoesDialogOpen} onOpenChange={setVariacoesDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup?.codigo} - {selectedGroup?.nome_bem?.split(' - ')[1] || selectedGroup?.nome_bem}
            </DialogTitle>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-lg font-semibold text-blue-600">
                {formatCurrency(selectedGroup?.valor_bem)}
              </span>
              <Badge>{selectedGroup?.plano?.split('|')[0]?.trim()}</Badge>
            </div>
          </DialogHeader>

          <div className="space-y-2">
            {selectedGroup?.variacoes.map((variacao, idx) => (
              <button
                key={variacao.id}
                onClick={() => handleSelectVariacao(selectedGroup, variacao)}
                className="w-full flex items-center justify-between p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-blue-100 rounded-full text-sm font-medium text-blue-700">
                    {idx + 1}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-slate-900">
                      Plano de {variacao.prazo_meses} meses
                    </p>
                    <p className="text-xs text-slate-500">
                      1ª parcela de {formatCurrency(variacao.parcela)}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-600" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}