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
import { TrendingUp, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function OfertaLance() {
  const [currentUser, setCurrentUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedVenda, setSelectedVenda] = useState(null);
  const [percentual, setPercentual] = useState('');
  const [tipoLance, setTipoLance] = useState('livre');
  const [observacao, setObservacao] = useState('');
  const queryClient = useQueryClient();

  // Competência atual (YYYY-MM)
  const competenciaAtual = format(new Date(), 'yyyy-MM');

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

  // Buscar todas as vendas
  const { data: todasVendas = [], isLoading: loadingVendas } = useQuery({
    queryKey: ['vendas-oferta-lance', currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: async () => {
      const vendas = await base44.entities.Venda.list('-created_date');
      
      // Filtrar por empresa se não for master/super_admin
      if (currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin') {
        return vendas;
      }
      
      return vendas.filter(v => v.empresa_id === currentUser?.empresa_id);
    },
  });

  // Buscar ofertas do mês atual
  const { data: ofertasAtual = [], isLoading: loadingOfertas } = useQuery({
    queryKey: ['ofertas-lance-atual', competenciaAtual, currentUser?.empresa_id],
    enabled: !!currentUser,
    queryFn: async () => {
      const ofertas = await base44.entities.OfertaLance.filter({ competencia: competenciaAtual });
      
      if (currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin') {
        return ofertas;
      }
      
      return ofertas.filter(o => o.empresa_id === currentUser?.empresa_id);
    },
  });

  // Vendas pendentes (sem oferta no mês atual, status ativa ou pendente)
  const vendasPendentes = todasVendas.filter(v => {
    const statusValido = v.status === 'ativa' || v.status === 'pendente';
    const jaOfertado = ofertasAtual.some(o => o.venda_id === v.id);
    return statusValido && !jaOfertado;
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
      queryClient.invalidateQueries({ queryKey: ['vendas-oferta-lance'] });
      queryClient.invalidateQueries({ queryKey: ['ofertas-lance-atual'] });
      toast.success('Lance ofertado com sucesso!');
      closeForm();
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao ofertar lance');
    }
  });

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
        subtitle={`Competência: ${format(new Date(competenciaAtual + '-01'), 'MMMM/yyyy')}`}
      />

      <Tabs defaultValue="pendentes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendentes">
            Pendentes ({vendasPendentes.length})
          </TabsTrigger>
          <TabsTrigger value="ofertados">
            Já Ofertados ({ofertasAtual.length})
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
              data={ofertasAtual}
              isLoading={loadingOfertas}
              emptyMessage="Nenhum lance ofertado neste mês"
            />
          </Card>
        </TabsContent>
      </Tabs>

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
                      const value = e.target.value.replace(/[^\d]/g, '');
                      if (value === '') {
                        setPercentual('');
                      } else {
                        const num = parseFloat(value);
                        if (num >= 0 && num <= 100) {
                          setPercentual(value);
                        }
                      }
                    }}
                    placeholder="30"
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