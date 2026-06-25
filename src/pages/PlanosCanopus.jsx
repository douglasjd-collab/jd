import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Calculator,
  ClipboardCopy,
  Trash2,
  ShoppingCart
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function PlanosCanopusPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedVariacao, setSelectedVariacao] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [valorMin, setValorMin] = useState('');
  const [valorMax, setValorMax] = useState('');
  const [tipoProduto, setTipoProduto] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [planoParaExcluir, setPlanoParaExcluir] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [buyLoading, setBuyLoading] = useState(false);

  const queryClient = useQueryClient();

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;

      // Se for super_admin pelo role do sistema
      if (me.role === 'super_admin' || me.perfil === 'super_admin') {
        setUser({ ...me, empresa_id: null, perfil: 'super_admin' });
        return;
      }

      // Buscar Colaborador para obter empresa_id e perfil real
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date',
        1
      );

      const colab = colabs?.[0];
      const empresaId = colab?.empresa_id || me.empresa_id || null;
      const perfil = colab?.perfil || me.role || 'vendedor';

      setUser({
        ...me,
        empresa_id: empresaId,
        perfil,
      });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ['planos-canopus', user?.empresa_id, user?.perfil],
    queryFn: async () => {
      if (!user) return [];
      
      // Super admin / master: lista tudo
      if (user.perfil === 'super_admin' || user.perfil === 'master') {
        const res = await base44.entities.PlanoCanopus.list('-ultima_sincronizacao', 2000);
        return Array.isArray(res) ? res : (res?.items ?? []);
      }
      
      // Demais perfis: filtra por empresa_id
      if (!user.empresa_id) return [];
      const res = await base44.entities.PlanoCanopus.filter(
        { empresa_id: user.empresa_id },
        '-ultima_sincronizacao',
        2000
      );
      return Array.isArray(res) ? res : (res?.items ?? []);
    },
    enabled: !!user
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
          variacoes: new Map() // Usar Map para evitar duplicatas por prazo
        };
      }
      
      // Usar prazo_meses como chave para evitar duplicatas
      const prazo = plano.prazo_meses;
      if (prazo && !groups[codigo].variacoes.has(prazo)) {
        groups[codigo].variacoes.set(prazo, {
          id: plano.id,
          prazo_meses: prazo,
          parcela: plano.parcela,
          taxa_adm: plano.taxa_adm,
          plano: plano.plano,
          tipo_venda: plano.tipo_venda,
          nome_bem: plano.nome_bem
        });
      }
    });
    
    // Converter Map para array e ordenar por prazo
    return Object.values(groups).map(group => ({
      ...group,
      variacoes: Array.from(group.variacoes.values())
        .sort((a, b) => (b.prazo_meses || 0) - (a.prazo_meses || 0))
    }));
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
      
      // Filtro de tipo de produto
      if (tipoProduto && tipoProduto !== 'todos' && g.produto_id !== tipoProduto) return false;
      
      // Filtro de grupo
      if (filtroGrupo) {
        const grupoPlano = g.plano?.split('|')[0]?.trim() || '';
        if (!grupoPlano.toLowerCase().includes(filtroGrupo.toLowerCase())) return false;
      }
      
      return true;
    });
    
    // Ordenar por valor (crescente)
    return filtered.sort((a, b) => (a.valor_bem || 0) - (b.valor_bem || 0));
  }, [groupedPlanos, search, valorMin, valorMax, tipoProduto, filtroGrupo]);

  const produtoLabel = (id) => {
    const map = { '101': 'Automóveis', '102': 'Imóveis', '103': 'Motos' };
    return map[id] || id;
  };

  const handleOpenDialog = (group) => {
    setSelectedGroup(group);
    setDialogOpen(true);
  };

  const handleAbrirSimulador = (variacao) => {
    if (!selectedGroup) return;
    const grupoNumero = selectedGroup.plano?.split('|')[0]?.trim() || '';
    // Usar nome_bem da variação se disponível (pode ter "50%" no nome), senão usa o do grupo
    const nomeBemFinal = variacao.nome_bem || selectedGroup.nome_bem || '';
    const dadosPlano = {
      credito: selectedGroup.valor_bem,
      valor_credito: selectedGroup.valor_bem,
      parcela: variacao.parcela,
      prazo: variacao.prazo_meses,
      nome_bem: nomeBemFinal,
      plano: variacao.plano || selectedGroup.plano,
      grupo: grupoNumero
    };
    localStorage.setItem('planoSelecionado', JSON.stringify(dadosPlano));
    navigate(createPageUrl('SimuladorNormal'));
    setDialogOpen(false);
  };

  const copiarVariacao = (variacao) => {
    const texto = `
📋 PLANO CANOPUS

🏷️ Bem: ${selectedGroup?.nome_bem || '-'}
💰 Valor do Crédito: ${formatCurrency(selectedGroup?.valor_bem)}
📅 Prazo: ${variacao.prazo_meses} meses
💳 Parcela: ${formatCurrency(variacao.parcela)}
${variacao.taxa_adm ? `📊 Taxa ADM: ${variacao.taxa_adm}%` : ''}

📑 Plano: ${selectedGroup?.plano || '-'}
🔄 Tipo de Venda: ${selectedGroup?.tipo_venda || '-'}

---
📱 Gerado via CRM Consórcio
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Plano copiado para a área de transferência!');
    }).catch(() => {
      toast.error('Erro ao copiar plano');
    });
  };

  const copiarTodasVariacoes = () => {
    if (!selectedGroup?.variacoes?.length) return;
    
    const textoVariacoes = selectedGroup.variacoes.map((v, idx) => `
${idx + 1}. Plano de ${v.prazo_meses} meses
   💳 Parcela: ${formatCurrency(v.parcela)}${v.taxa_adm ? `\n   📊 Taxa ADM: ${v.taxa_adm}%` : ''}
`).join('\n');

    const texto = `
📋 VARIAÇÕES DO PLANO ${selectedGroup.codigo}

🏷️ Bem: ${selectedGroup.nome_bem || '-'}
💰 Valor do Crédito: ${formatCurrency(selectedGroup.valor_bem)}
📑 Plano: ${selectedGroup.plano || '-'}
🔄 Tipo de Venda: ${selectedGroup.tipo_venda || '-'}

${textoVariacoes}
---
📱 Gerado via CRM Consórcio
    `.trim();

    navigator.clipboard.writeText(texto).then(() => {
      toast.success('Todas as variações copiadas!');
    }).catch(() => {
      toast.error('Erro ao copiar variações');
    });
  };

  const deleteMutation = useMutation({
    mutationFn: async (group) => {
      // Excluir todas as variações do grupo
      const deletePromises = group.variacoes.map(v => 
        base44.entities.PlanoCanopus.delete(v.id)
      );
      await Promise.all(deletePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['planos-canopus']);
      toast.success('Plano excluído com sucesso!');
      setConfirmDeleteOpen(false);
      setPlanoParaExcluir(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir plano: ' + error.message);
    }
  });

  const handleExcluirPlano = (group) => {
    setPlanoParaExcluir(group);
    setConfirmDeleteOpen(true);
  };

  const confirmarExclusao = () => {
    if (planoParaExcluir) {
      deleteMutation.mutate(planoParaExcluir);
    }
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
        <div className="flex flex-col gap-4">
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
            <Select value={tipoProduto} onValueChange={setTipoProduto}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Tipo de Plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="101">Automóveis</SelectItem>
                <SelectItem value="102">Imóveis</SelectItem>
                <SelectItem value="103">Motocicletas</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrar por grupo..."
              value={filtroGrupo}
              onChange={(e) => setFiltroGrupo(e.target.value)}
              className="w-full md:w-48"
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
            {(valorMin || valorMax || tipoProduto || filtroGrupo) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setValorMin('');
                  setValorMax('');
                  setTipoProduto('');
                  setFiltroGrupo('');
                }}
              >
                Limpar Filtros
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
                    className={`hover:bg-blue-50 cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-slate-200'}`}
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
                      <div className="flex items-center justify-center gap-1">
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
                        {['admin', 'super_admin', 'master', 'gerente'].includes(user?.perfil) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExcluirPlano(group);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
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
            <div className="flex items-center justify-between">
              <div className="flex-1">
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
              </div>
              <Button
                onClick={copiarTodasVariacoes}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <ClipboardCopy className="w-4 h-4" />
                Copiar Todas
              </Button>
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
                        {variacao.taxa_adm && ` • Taxa ADM: ${variacao.taxa_adm}%`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copiarVariacao(variacao);
                      }}
                      className="gap-2"
                    >
                      <ClipboardCopy className="w-4 h-4" />
                      Copiar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAbrirSimulador(variacao)}
                      className="gap-2"
                    >
                      <Calculator className="w-4 h-4" />
                      Simulador
                    </Button>
                    <Button
                      className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
                      size="sm"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!selectedGroup || !user) return;
                        setBuyLoading(true);
                        try {
                          // Buscar ou criar tabela de consórcio
                          const administradora_id = 'canopus';
                          const tabelas = await base44.entities.TabelaConsorcio.filter({
                            administradora_id,
                            empresa_id: user.empresa_id,
                            ativo: true
                          });

                          let tabela_id = tabelas.length > 0 ? tabelas[0].id : null;

                          if (!tabela_id) {
                            const newTabela = await base44.entities.TabelaConsorcio.create({
                              empresa_id: user.empresa_id,
                              administradora_id,
                              administradora_nome: 'Canopus',
                              nomeTabela: 'Tabela Canopus',
                              nome: 'Tabela Canopus',
                              tipo_bem: selectedGroup.produto_id === '101' ? 'automovel' : selectedGroup.produto_id === '102' ? 'imovel' : 'motocicleta',
                              prazo: variacao.prazo_meses,
                              taxa_adm: variacao.taxa_adm || 0,
                              valor_minimo: 0,
                              valor_maximo: selectedGroup.valor_bem,
                              ativo: true
                            });
                            tabela_id = newTabela.id;
                          }

                          const params = new URLSearchParams({
                            valor_credito: selectedGroup.valor_bem,
                            prazo: variacao.prazo_meses,
                            taxa_adm: variacao.taxa_adm || 0,
                            administradora_id,
                            administradora_nome: 'Canopus',
                            tabela_id,
                            tipo_bem: selectedGroup.produto_id === '101' ? 'automovel' : selectedGroup.produto_id === '102' ? 'imovel' : 'motocicleta',
                            grupo: selectedGroup.codigo || ''
                          });

                          navigate(createPageUrl(`NovaVenda?${params.toString()}`));
                        } catch (error) {
                          console.error('Erro ao preparar compra:', error);
                          toast.error('Erro ao preparar a compra');
                        } finally {
                          setBuyLoading(false);
                        }
                      }}
                      disabled={buyLoading}
                    >
                      {buyLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                      <ShoppingCart className="w-4 h-4" />
                      Comprar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o plano <strong>{planoParaExcluir?.codigo}</strong> e todas as suas <strong>{planoParaExcluir?.variacoes?.length} variações</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}