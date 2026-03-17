import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, CheckCircle2, Loader2, Search, Pencil, History, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function OfertaLance() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedVenda, setSelectedVenda] = useState(null);
  const [percentual, setPercentual] = useState('');
  const [tipoLance, setTipoLance] = useState('livre');
  const [observacao, setObservacao] = useState('');
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editOferta, setEditOferta] = useState(null);
  const [editPercentual, setEditPercentual] = useState('');
  const [editTipoLance, setEditTipoLance] = useState('livre');
  const [editObservacao, setEditObservacao] = useState('');
  const queryClient = useQueryClient();

  // Competência atual (YYYY-MM) - fevereiro 2026
  const hoje = new Date();
  const competenciaAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();

      if (me.role === 'super_admin') {
        setCurrentUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'super_admin',
        });
        return;
      }

      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        setCurrentUser({
          ...me,
          auth_id: me.id,
          colaborador_id: null,
          empresa_id: null,
          perfil: 'vendedor',
        });
        return;
      }

      const byEmpresa = colabs.find(c => c.empresa_id && c.empresa_id === me.empresa_id);
      const colab = byEmpresa || colabs[0];

      setCurrentUser({
        ...me,
        auth_id: me.id,
        colaborador_id: colab.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
      });
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(currentUser?.perfil);

  const { data: statusList = [] } = useQuery({
    queryKey: ['status-propostas'],
    queryFn: () => base44.entities.StatusProposta.filter({ tipo: 'principal', ativo: true }, 'ordem', 50),
  });

  const handleAlterarStatus = async (venda, novoStatus) => {
    await base44.entities.VendaConsorcio.update(venda.id, { status: novoStatus });
    queryClient.invalidateQueries({ queryKey: ['oferta-lance-data'] });
    toast.success('Status atualizado!');
  };

  // Buscar vendas e ofertas via função backend (contorna problema de empresa_id)
  const { data: dadosLance = { vendas: [], ofertas: [] }, isLoading: loadingVendas } = useQuery({
    queryKey: ['oferta-lance-data', competenciaAtual],
    queryFn: async () => {
      const res = await base44.functions.invoke('ofertaLanceData', { competencia: competenciaAtual });
      console.log('[OfertaLance] Debug:', res.data?.debug);
      return res.data || { vendas: [], ofertas: [] };
    },
  });

  const todasVendas = dadosLance.vendas || [];
  const ofertasAtual = dadosLance.ofertas || [];
  const loadingOfertas = false;

  // Vendas pendentes (sem oferta no mês atual, status ativa/pendente/aguardando_aprovacao)
  const vendasPendentes = todasVendas.filter(v => {
    const statusValido = ['ativa', 'pendente', 'aguardando_aprovacao'].includes(v.status);
    const jaOfertado = ofertasAtual.some(o => o.venda_id === v.id);
    const matchSearch = search === '' || 
      v.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
      v.cliente_cpf?.includes(search) ||
      v.grupo?.includes(search) ||
      v.cota?.includes(search);
    return statusValido && !jaOfertado && matchSearch;
  });

  // Ofertas ofertadas com filtro de busca
  const ofertasFiltered = ofertasAtual.filter(o => {
    return search === '' || 
      o.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
      o.grupo?.includes(search) ||
      o.cota?.includes(search);
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Verificar duplicidade
      const jaExiste = ofertasAtual.some(o => o.venda_id === data.venda_id);
      if (jaExiste) {
        throw new Error('Já existe oferta de lance registrada para esta carta neste mês.');
      }

      return await base44.entities.OfertaLance.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oferta-lance-data'] });
      toast.success('Lance ofertado com sucesso!');
      closeForm();
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao ofertar lance');
    }
  });

  const handleEditarOferta = (oferta) => {
    setEditOferta(oferta);
    setEditPercentual(String(oferta.percentual_lance));
    setEditTipoLance(oferta.tipo_lance || 'livre');
    setEditObservacao(oferta.observacao || '');
    setEditOpen(true);
  };

  const handleSubmitEdicao = async (e) => {
    e.preventDefault();
    const percentualNum = parseFloat(editPercentual);
    if (!percentualNum || percentualNum <= 0 || percentualNum > 100) {
      toast.error('Percentual deve ser entre 0 e 100');
      return;
    }
    const valorNovo = editOferta.valor_carta ? editOferta.valor_carta * (percentualNum / 100) : 0;

    // Montar histórico
    let historico = [];
    try { historico = editOferta.historico_alteracoes ? JSON.parse(editOferta.historico_alteracoes) : []; } catch {}
    historico.push({
      percentual_anterior: editOferta.percentual_lance,
      valor_anterior: editOferta.valor_lance,
      tipo_anterior: editOferta.tipo_lance,
      percentual_novo: percentualNum,
      valor_novo: valorNovo,
      tipo_novo: editTipoLance,
      data_alteracao: new Date().toISOString(),
      usuario_nome: currentUser?.full_name || currentUser?.nome_perfil || '',
    });

    await base44.entities.OfertaLance.update(editOferta.id, {
      percentual_lance: percentualNum,
      valor_lance: valorNovo,
      tipo_lance: editTipoLance,
      observacao: editObservacao || null,
      historico_alteracoes: JSON.stringify(historico),
    });

    queryClient.invalidateQueries({ queryKey: ['oferta-lance-data'] });
    toast.success('Lance atualizado com sucesso!');
    setEditOpen(false);
    setEditOferta(null);
  };

  const handleOfertar = (venda) => {
    setSelectedVenda(venda);
    setPercentual('');
    setTipoLance('livre');
    setObservacao('');
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setTimeout(() => {
      setSelectedVenda(null);
      setPercentual('');
      setTipoLance('livre');
      setObservacao('');
    }, 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const percentualNum = parseFloat(percentual);
    if (!percentualNum || percentualNum <= 0 || percentualNum > 100) {
      toast.error('Percentual deve ser entre 0 e 100');
      return;
    }

    const valorLance = selectedVenda.valorCredito 
      ? selectedVenda.valorCredito * (percentualNum / 100) 
      : 0;

    const data = {
      venda_id: selectedVenda.id,
      cliente_id: selectedVenda.cliente_id,
      cliente_nome: selectedVenda.cliente_nome,
      empresa_id: selectedVenda.empresa_id,
      usuario_id: currentUser.colaborador_id || currentUser.id,
      usuario_nome: currentUser.full_name || currentUser.nome_perfil,
      competencia: competenciaAtual,
      percentual_lance: percentualNum,
      valor_lance: valorLance,
      tipo_lance: tipoLance,
      valor_carta: selectedVenda.valorCredito,
      grupo: selectedVenda.grupo,
      cota: selectedVenda.cota,
      data_oferta: new Date().toISOString(),
      observacao: observacao || null
    };

    createMutation.mutate(data);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const tipoLanceLabels = {
    livre: 'Livre',
    limitado: 'Limitado',
    fixo_30: 'Fixo 30%',
    fixo_50: 'Fixo 50%',
    embutido: 'Embutido',
    outro: 'Outro'
  };

  const columnsPendentes = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.cliente_nome}</p>
          <p className="text-sm text-slate-500">{row.cliente_cpf}</p>
        </div>
      )
    },
    {
      header: 'Grupo/Cota',
      cell: (row) => `${row.grupo} / ${row.cota}`
    },
    {
      header: 'Administradora',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Valor Carta',
      cell: (row) => formatCurrency(row.valorCredito)
    },
    {
      header: 'Vendedor',
      cell: (row) => row.vendedor_nome || '-'
    },
    {
      header: 'Status',
      cell: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.status}
        </Badge>
      )
    },
    {
      header: '',
      className: 'w-32',
      cell: (row) => (
        <Button
          size="sm"
          onClick={() => handleOfertar(row)}
          className="bg-[#23BE84] hover:bg-[#1da570]"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Ofertar Lance
        </Button>
      )
    }
  ];

  const columnsOfertados = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{row.cliente_nome}</p>
        </div>
      )
    },
    {
      header: 'Administradora',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Grupo/Cota',
      cell: (row) => `${row.grupo} / ${row.cota}`
    },
    {
      header: 'Percentual',
      cell: (row) => `${row.percentual_lance}%`
    },
    {
      header: 'Valor Lance',
      cell: (row) => formatCurrency(row.valor_lance)
    },
    {
      header: 'Tipo',
      cell: (row) => tipoLanceLabels[row.tipo_lance] || row.tipo_lance
    },
    {
      header: 'Data',
      cell: (row) => format(new Date(row.data_oferta), 'dd/MM/yyyy HH:mm')
    },
    {
      header: 'Usuário',
      cell: (row) => row.usuario_nome
    },
    {
      header: '',
      className: 'w-24',
      cell: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEditarOferta(row)}
          className="gap-1"
        >
          <Pencil className="w-3 h-3" />
          Alterar
        </Button>
      )
    }
  ];

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#23BE84]"></div>
      </div>
    );
  }

  const valorLancePreview = selectedVenda && percentual 
    ? selectedVenda.valorCredito * (parseFloat(percentual) / 100)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oferta de Lance"
        subtitle={`Competência: ${hoje.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`}
      />

      <Card className="p-4 border-0 shadow-sm mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por cliente, CPF, grupo ou cota..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      <Tabs defaultValue="pendentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendentes">
            Pendentes ({vendasPendentes.length})
          </TabsTrigger>
          <TabsTrigger value="ofertados">
            Já Ofertados ({ofertasFiltered.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pendentes">
          <Card className="p-6">
            <DataTable
              columns={columnsPendentes}
              data={vendasPendentes}
              isLoading={loadingVendas}
              emptyMessage="Nenhuma venda pendente de oferta de lance"
            />
          </Card>
        </TabsContent>

        <TabsContent value="ofertados">
          <Card className="p-6">
            <DataTable
              columns={columnsOfertados}
              data={ofertasFiltered}
              isLoading={loadingOfertas}
              emptyMessage="Nenhum lance ofertado neste mês"
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de Edição de Lance */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Lance</DialogTitle>
          </DialogHeader>
          {editOferta && (
            <form onSubmit={handleSubmitEdicao} className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg space-y-1 text-sm">
                <p className="font-medium">{editOferta.cliente_nome}</p>
                <p className="text-slate-500">Grupo/Cota: {editOferta.grupo}/{editOferta.cota}</p>
                <p className="text-slate-500">Lance atual: <span className="font-semibold text-slate-800">{editOferta.percentual_lance}% — {formatCurrency(editOferta.valor_lance)}</span></p>
              </div>

              {/* Histórico */}
              {(() => {
                let hist = [];
                try { hist = editOferta.historico_alteracoes ? JSON.parse(editOferta.historico_alteracoes) : []; } catch {}
                return hist.length > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-xs font-semibold text-slate-500 mb-1">
                      <History className="w-3 h-3" /> Histórico de alterações
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {hist.map((h, i) => (
                        <div key={i} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5 flex items-center justify-between gap-2">
                          <span className="text-slate-600">
                            <span className="line-through text-red-500">{h.percentual_anterior}%</span>
                            {' → '}
                            <span className="text-green-600 font-medium">{h.percentual_novo}%</span>
                          </span>
                          <span className="text-slate-400 whitespace-nowrap">
                            {format(new Date(h.data_alteracao), 'dd/MM HH:mm')} · {h.usuario_nome}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null;
              })()}

              <div>
                <Label htmlFor="edit-percentual">Novo Percentual *</Label>
                <div className="relative">
                  <Input
                    id="edit-percentual"
                    type="text"
                    value={editPercentual}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^\d,.]/g, '').replace(',', '.');
                      const parts = value.split('.');
                      if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
                      if (parts.length === 2 && parts[1].length > 4) value = parts[0] + '.' + parts[1].substring(0, 4);
                      if (value === '' || value === '.') { setEditPercentual(''); }
                      else { const num = parseFloat(value); if (!isNaN(num) && num >= 0 && num <= 100) setEditPercentual(value); }
                    }}
                    placeholder="Ex: 30.5"
                    className="pr-8"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">%</span>
                </div>
                {editPercentual && editOferta.valor_carta && (
                  <p className="text-xs text-green-700 mt-1 font-medium">
                    Novo valor: {formatCurrency(editOferta.valor_carta * (parseFloat(editPercentual) / 100))}
                  </p>
                )}
              </div>

              <div>
                <Label>Tipo de Lance</Label>
                <Select value={editTipoLance} onValueChange={setEditTipoLance}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Livre</SelectItem>
                    <SelectItem value="limitado">Limitado</SelectItem>
                    <SelectItem value="fixo_30">Fixo 30%</SelectItem>
                    <SelectItem value="fixo_50">Fixo 50%</SelectItem>
                    <SelectItem value="embutido">Embutido</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-obs">Observação</Label>
                <Textarea id="edit-obs" value={editObservacao} onChange={(e) => setEditObservacao(e.target.value)} rows={2} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-[#23BE84] hover:bg-[#1da570]">Salvar Alteração</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Oferta */}
      <Dialog open={formOpen} onOpenChange={closeForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ofertar Lance</DialogTitle>
          </DialogHeader>
          
          {selectedVenda && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <p className="text-sm text-slate-500">Cliente</p>
                <p className="font-medium">{selectedVenda.cliente_nome}</p>
                <p className="text-sm text-slate-500">Grupo/Cota: {selectedVenda.grupo}/{selectedVenda.cota}</p>
                <p className="text-sm text-slate-500">Valor Carta: {formatCurrency(selectedVenda.valorCredito)}</p>
              </div>

              <div>
                <Label htmlFor="percentual">Percentual do Lance *</Label>
                <div className="relative">
                  <Input
                    id="percentual"
                    type="text"
                    value={percentual}
                    onChange={(e) => {
                      let value = e.target.value.replace(/[^\d,.]/g, '');
                      
                      // Substituir vírgula por ponto
                      value = value.replace(',', '.');
                      
                      // Permitir apenas um ponto decimal
                      const parts = value.split('.');
                      if (parts.length > 2) {
                        value = parts[0] + '.' + parts.slice(1).join('');
                      }
                      
                      // Limitar a 4 casas decimais
                      if (parts.length === 2 && parts[1].length > 4) {
                        value = parts[0] + '.' + parts[1].substring(0, 4);
                      }
                      
                      if (value === '' || value === '.') {
                        setPercentual('');
                      } else {
                        const num = parseFloat(value);
                        if (!isNaN(num) && num >= 0 && num <= 100) {
                          setPercentual(value);
                        }
                      }
                    }}
                    placeholder="30 ou 30.5000"
                    className="pr-8"
                    required
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">
                    %
                  </span>
                </div>
              </div>

              <div>
                <Label>Tipo de Lance</Label>
                <Select value={tipoLance} onValueChange={setTipoLance}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Livre</SelectItem>
                    <SelectItem value="limitado">Limitado</SelectItem>
                    <SelectItem value="fixo_30">Fixo 30%</SelectItem>
                    <SelectItem value="fixo_50">Fixo 50%</SelectItem>
                    <SelectItem value="embutido">Embutido</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="observacao">Observação</Label>
                <Textarea
                  id="observacao"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Informações adicionais..."
                  rows={3}
                />
              </div>

              {percentual && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">Valor do Lance (Preview)</p>
                  <p className="text-2xl font-bold text-green-900">
                    {formatCurrency(valorLancePreview)}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={createMutation.isPending || !percentual}
                  className="bg-[#23BE84] hover:bg-[#1da570]"
                >
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Confirmar Oferta
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}