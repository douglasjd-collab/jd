import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { 
  Search, 
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  Package,
  ChevronRight,
  Filter,
  Calculator
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

export default function PlanosCanopusPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedVariacao, setSelectedVariacao] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tipoSimulacaoDialog, setTipoSimulacaoDialog] = useState(false);
  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;

      let empresaId = me.empresa_id;
      if (!empresaId) {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: me.id, status: 'ativo' },
          '-created_date',
          1
        );
        if (colabs?.length) empresaId = colabs[0].empresa_id;
      }

      setUser({
        ...me,
        empresa_id: empresaId,
        perfil: me.perfil || me.role || 'vendedor'
      });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ['planos-canopus', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      const res = await base44.entities.PlanoCanopus.filter(
        { empresa_id: user.empresa_id },
        '-ultima_sincronizacao',
        1000
      );
      return Array.isArray(res) ? res : (res?.items ?? []);
    },
    enabled: !!user?.empresa_id
  });

  // Agrupar planos por código (sem prazo) - ANTES dos early returns
  const groupedPlanos = React.useMemo(() => {
    const groups = {};
    
    planos.forEach(plano => {
      // Extrair código base do nome_bem (ex: "CR4072 - AUTOMÓVEL LEVE" -> "CR4072")
      const codigo = plano.nome_bem?.split(' - ')[0]?.trim() || plano.external_hash?.split('_')[0];
      if (!codigo) return;
      
      if (!groups[codigo]) {
        groups[codigo] = {
          codigo,
          nome_bem: plano.nome_bem,
          valor_bem: plano.valor_bem,
          produto_id: plano.produto_id,
          plano: plano.plano,
          tipo_venda: plano.tipo_venda,
          status: plano.status,
          variacoes: []
        };
      }
      
      groups[codigo].variacoes.push({
        id: plano.id,
        prazo_meses: plano.prazo_meses,
        parcela: plano.parcela,
        plano: plano.plano,
        tipo_venda: plano.tipo_venda
      });
    });
    
    // Ordenar variações por prazo
    Object.values(groups).forEach(group => {
      group.variacoes.sort((a, b) => (b.prazo_meses || 0) - (a.prazo_meses || 0));
    });
    
    return Object.values(groups);
  }, [planos]);

  const filteredPlanos = React.useMemo(() => {
    const filtered = groupedPlanos.filter(g => {
      // Filtro de busca
      if (search) {
        const s = search.toLowerCase();
        const matchSearch = (
          g.nome_bem?.toLowerCase().includes(s) ||
          g.codigo?.toLowerCase().includes(s) ||
          g.plano?.toLowerCase().includes(s)
        );
        if (!matchSearch) return false;
      }
      
      // Filtro de valor
      const valor = g.valor_bem || 0;
      const min = valorMin ? parseFloat(valorMin) / 100 : 0;
      const max = valorMax ? parseFloat(valorMax) / 100 : Infinity;
      if (min && valor < min) return false;
      if (max < Infinity && valor > max) return false;
      
      return true;
    });
    
    // Ordenar por valor (crescente)
    return filtered.sort((a, b) => (a.valor_bem || 0) - (b.valor_bem || 0));
  }, [groupedPlanos, search, valorMin, valorMax]);

  const produtoLabel = (id) => {
    const map = { '101': 'Automóveis', '102': 'Imóveis', '103': 'Motos' };
    return map[id] || id;
  };

  const handleOpenDialog = (group) => {
    setSelectedGroup(group);
    setDialogOpen(true);
  };

  const handleAbrirSimulador = (variacao) => {
    setSelectedVariacao(variacao);
    setTipoSimulacaoDialog(true);
  };

  const handleSelecionarTipoSimulacao = (tipo) => {
    if (!selectedVariacao || !selectedGroup) return;
    
    // Salvar dados no localStorage para o simulador
    const dadosPlano = {
      valor_credito: selectedGroup.valor_bem,
      parcela: selectedVariacao.parcela,
      prazo: selectedVariacao.prazo_meses,
      nome_bem: selectedGroup.nome_bem,
      plano: selectedGroup.plano
    };
    
    localStorage.setItem('planoSelecionado', JSON.stringify(dadosPlano));
    
    // Redirecionar para o simulador apropriado
    if (tipo === 'consorcio') {
      navigate(createPageUrl('SimuladorConsorcio'));
    } else {
      navigate(createPageUrl('SimuladorNormal'));
    }
    
    setTipoSimulacaoDialog(false);
    setDialogOpen(false);
  };

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

  // Verificação de permissão
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!['admin', 'super_admin', 'master'].includes(user.perfil)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="w-16 h-16 text-red-500" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Acesso Negado</h2>
          <p className="text-slate-600 mt-2">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos Canopus"
        subtitle="Planos sincronizados do sistema Canopus"
        backTo="Configuracoes"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Variações</p>
              <p className="text-2xl font-bold text-slate-900">{planos.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <Package className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Planos Únicos</p>
              <p className="text-2xl font-bold text-slate-900">
                {groupedPlanos.length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Produtos</p>
              <p className="text-2xl font-bold text-slate-900">
                {new Set(planos.map(p => p.produto_id)).size}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Buscar por nome do bem, plano ou tipo de venda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Valor mín."
              value={formatCurrencyInput(valorMin)}
              onChange={(e) => setValorMin(parseCurrencyInput(e.target.value))}
              className="w-40"
            />
            <span className="text-slate-400">até</span>
            <Input
              type="text"
              placeholder="Valor máx."
              value={formatCurrencyInput(valorMax)}
              onChange={(e) => setValorMax(parseCurrencyInput(e.target.value))}
              className="w-40"
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
      </Card>

      {/* Tabela de Planos */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filteredPlanos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Database className="w-12 h-12 text-slate-300" />
            <p className="text-slate-500">
              {search ? 'Nenhum plano encontrado' : 'Nenhum plano sincronizado ainda'}
            </p>
            {!search && (
              <p className="text-sm text-slate-400">
                Acesse Importação → Importar Planos
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold">NOME DO BEM</TableHead>
                  <TableHead className="font-semibold text-right">VALOR</TableHead>
                  <TableHead className="font-semibold text-center">PRAZO</TableHead>
                  <TableHead className="font-semibold text-right">1ª PARCELA</TableHead>
                  <TableHead className="font-semibold">PLANO</TableHead>
                  <TableHead className="font-semibold">TIPO DE VENDA</TableHead>
                  <TableHead className="font-semibold text-center">AÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlanos.map((group, index) => (
                  <TableRow 
                    key={group.codigo} 
                    className={`hover:bg-blue-50 cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}
                    onClick={() => handleOpenDialog(group)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">{group.codigo}</span>
                        <span className="text-slate-600">-</span>
                        <span>{group.nome_bem?.split(' - ')[1] || group.nome_bem}</span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {group.variacoes.length} variações
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-900">
                      {formatCurrency(group.valor_bem)}
                    </TableCell>
                    <TableCell className="text-center">
                      {group.variacoes[0]?.prazo_meses || '-'}
                    </TableCell>
                    <TableCell className="text-right text-slate-900">
                      {formatCurrency(group.variacoes[0]?.parcela)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {group.plano?.split('|')[1]?.trim() || group.plano}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {group.tipo_venda}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDialog(group);
                        }}
                      >
                        <ChevronRight className="w-5 h-5 text-blue-600" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Dialog com Variações */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup?.codigo} - {selectedGroup?.nome_bem?.split(' - ')[1] || selectedGroup?.nome_bem}
            </DialogTitle>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-lg font-semibold text-blue-600">
                {formatCurrency(selectedGroup?.valor_bem)}
              </span>
              <Badge>{selectedGroup?.plano?.split('|')[0]?.trim()}</Badge>
              <Badge variant="outline">{selectedGroup?.tipo_venda}</Badge>
            </div>
          </DialogHeader>

          <div className="mt-4">
            <div className="space-y-2">
              {selectedGroup?.variacoes.map((variacao, idx) => (
                <div 
                  key={variacao.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-sm font-medium text-slate-600">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Plano de {variacao.prazo_meses} meses / 1ª parcela de {formatCurrency(variacao.parcela)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Grupo: {selectedGroup.plano?.split('|')[0]?.trim()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAbrirSimulador(variacao)}
                    className="gap-2"
                  >
                    <Calculator className="w-4 h-4" />
                    Simulador
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Tipo de Simulação */}
      <Dialog open={tipoSimulacaoDialog} onOpenChange={setTipoSimulacaoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tipo de Simulação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <p className="text-sm text-slate-600">
              Escolha o tipo de simulação que deseja realizar:
            </p>
            <Button
              onClick={() => handleSelecionarTipoSimulacao('consorcio')}
              className="w-full justify-start h-auto py-4 px-6 bg-orange-50 border-2 border-orange-500 hover:bg-orange-100"
              variant="outline"
            >
              <div className="text-left">
                <p className="font-semibold text-orange-900">Lance Embutido</p>
                <p className="text-xs text-orange-700 mt-1">Simulação com lance embutido no consórcio</p>
              </div>
            </Button>
            <Button
              onClick={() => handleSelecionarTipoSimulacao('normal')}
              className="w-full justify-start h-auto py-4 px-6 bg-blue-50 border-2 border-blue-600 hover:bg-blue-100"
              variant="outline"
            >
              <div className="text-left">
                <p className="font-semibold text-blue-900">Recurso Próprio</p>
                <p className="text-xs text-blue-700 mt-1">Simulação com lance próprio do cliente</p>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}