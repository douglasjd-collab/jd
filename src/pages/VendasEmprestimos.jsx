import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Banknote, Wallet, Plus, Loader2, Search } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function VendasEmprestimos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [filtroSubtipo, setFiltroSubtipo] = useState('todos');
  const [buscaNome, setBuscaNome] = useState('');
  const [buscaCpf, setBuscaCpf] = useState('');
  const [buscaBanco, setBuscaBanco] = useState('');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const isSuperAdmin = user?.role === 'super_admin' || user?.perfil === 'super_admin';

  const { data: statusPropostas = [] } = useQuery({
    queryKey: ['status-propostas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.StatusProposta.filter({ empresa_id: empresaId, ativo: true }, 'ordem')
  });

  const { data: vendas = [], isLoading } = useQuery({
    queryKey: ['vendas-emprestimos', empresaId, isSuperAdmin],
    enabled: !!user && (isSuperAdmin || !!empresaId),
    queryFn: async () => {
      let vendasBase;
      if (isSuperAdmin) {
        vendasBase = await base44.entities.VendaBase.list('-created_date', 5000);
        vendasBase = vendasBase.filter(v => v.produto === 'EMPRESTIMO_CONSIGNADO' || v.produto === 'EMPRESTIMO_PESSOAL');
      } else {
        const consignados = await base44.entities.VendaBase.filter({ empresa_id: empresaId, produto: 'EMPRESTIMO_CONSIGNADO' });
        const pessoais = await base44.entities.VendaBase.filter({ empresa_id: empresaId, produto: 'EMPRESTIMO_PESSOAL' });
        vendasBase = [...consignados, ...pessoais];
      }

      const vendasComDetalhes = await Promise.all(
        vendasBase.map(async (vb) => {
          let detalhes = null;
          if (vb.produto === 'EMPRESTIMO_CONSIGNADO') {
            const det = await base44.entities.VendaConsignado.filter({ venda_base_id: vb.id });
            detalhes = det[0];
          } else if (vb.produto === 'EMPRESTIMO_PESSOAL') {
            const det = await base44.entities.VendaEmprestimoPessoal.filter({ venda_base_id: vb.id });
            detalhes = det[0];
          }
          
          let cliente_cpf = null;
          if (vb.cliente_id) {
            try {
              const cliente = await base44.entities.Cliente.filter({ id: vb.cliente_id });
              if (cliente.length > 0) {
                cliente_cpf = cliente[0].cpf || cliente[0].pj_cnpj || null;
              }
            } catch (e) {
              console.log('Erro ao buscar CPF do cliente:', e);
            }
          }
          
          return { ...vb, detalhes, cliente_cpf };
        })
      );

      return vendasComDetalhes.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    }
  });

  const vendasFiltradas = vendas.filter(v => {
    // Filtro por status
    if (filtroStatus !== 'todos' && v.status !== filtroStatus) return false;
    
    // Filtro por subtipo (tipo de consignado)
    if (filtroSubtipo !== 'todos') {
      if (v.produto !== 'EMPRESTIMO_CONSIGNADO') return false;
      if (v.tipo !== filtroSubtipo) return false;
    }
    
    // Busca por nome
    if (buscaNome && !v.cliente_nome?.toLowerCase().includes(buscaNome.toLowerCase())) return false;
    
    // Busca por CPF (nos detalhes do cliente)
    if (buscaCpf) {
      const cpfBusca = buscaCpf.replace(/\D/g, '');
      if (!v.cliente_nome?.includes(cpfBusca)) return false;
    }
    
    // Busca por banco
    if (buscaBanco) {
      const banco = v.detalhes?.banco || v.detalhes?.banco_anterior || '';
      if (!banco.toLowerCase().includes(buscaBanco.toLowerCase())) return false;
    }
    
    return true;
  });

  // Gerar cores e labels dinamicamente dos status cadastrados
  const statusColors = {};
  const statusLabels = {};
  const statusOptions = [];

  const corParaClasses = {
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
    orange: 'bg-orange-100 text-orange-800',
    teal: 'bg-teal-100 text-teal-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    emerald: 'bg-emerald-100 text-emerald-800',
    slate: 'bg-slate-100 text-slate-800'
  };

  statusPropostas.forEach(status => {
    statusColors[status.codigo] = corParaClasses[status.cor] || 'bg-slate-100 text-slate-800';
    statusLabels[status.codigo] = status.nome;
    statusOptions.push({ value: status.codigo, label: status.nome });
  });

  const atualizarStatusMutation = useMutation({
    mutationFn: async ({ vendaBaseId, vendaDetalheId, novoStatus, isConsignado }) => {
      await base44.entities.VendaBase.update(vendaBaseId, { status: novoStatus });
      
      if (isConsignado) {
        await base44.entities.VendaConsignado.update(vendaDetalheId, { status: novoStatus });
      } else {
        await base44.entities.VendaEmprestimoPessoal.update(vendaDetalheId, { status: novoStatus });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendas-emprestimos'] });
      toast.success('Status atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar status');
    }
  });

  const handleStatusChange = (venda, novoStatus) => {
    if (venda.status === novoStatus) return;
    
    const isConsignado = venda.produto === 'EMPRESTIMO_CONSIGNADO';
    atualizarStatusMutation.mutate({
      vendaBaseId: venda.id,
      vendaDetalheId: venda.detalhes?.id,
      novoStatus,
      isConsignado
    });
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empréstimos"
        subtitle="Gestão de propostas de empréstimos consignados e pessoais"
      >
        <Link to={createPageUrl('NovaVendaEmprestimo')}>
          <Button className="bg-[#23BE84] hover:bg-[#1da570]">
            <Plus className="w-4 h-4 mr-2" />
            Nova Venda
          </Button>
        </Link>
      </PageHeader>

      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Filtros por Status */}
          <div className="flex flex-wrap gap-3">
            <Button 
              variant={filtroStatus === 'todos' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('todos')}
              className="bg-teal-600 hover:bg-teal-700"
            >
              Todos
            </Button>
            <Button 
              variant={filtroStatus === 'aguardando_cip' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('aguardando_cip')}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              Aguardando CIP
            </Button>
            <Button 
              variant={filtroStatus === 'pendente' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('pendente')}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Pendente
            </Button>
            <Button 
              variant={filtroStatus === 'aguardando_formalizacao' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('aguardando_formalizacao')}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Aguardando Formalização
            </Button>
            <Button 
              variant={filtroStatus === 'em_andamento' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('em_andamento')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Em Andamento
            </Button>
            <Button 
              variant={filtroStatus === 'pago' ? 'default' : 'outline'}
              onClick={() => setFiltroStatus('pago')}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Pago
            </Button>
          </div>

          {/* Filtros por Tipo de Consignado */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <span className="text-sm font-medium text-slate-600 self-center mr-2">Tipo de Consignado:</span>
            <Button 
              size="sm"
              variant={filtroSubtipo === 'todos' ? 'default' : 'outline'}
              onClick={() => setFiltroSubtipo('todos')}
            >
              Todos
            </Button>
            <Button 
              size="sm"
              variant={filtroSubtipo === 'NOVO' ? 'default' : 'outline'}
              onClick={() => setFiltroSubtipo('NOVO')}
            >
              Novo
            </Button>
            <Button 
              size="sm"
              variant={filtroSubtipo === 'REFINANCIAMENTO' ? 'default' : 'outline'}
              onClick={() => setFiltroSubtipo('REFINANCIAMENTO')}
            >
              Refinanciamento
            </Button>
            <Button 
              size="sm"
              variant={filtroSubtipo === 'PORTABILIDADE_PURA' ? 'default' : 'outline'}
              onClick={() => setFiltroSubtipo('PORTABILIDADE_PURA')}
            >
              Portabilidade Pura
            </Button>
            <Button 
              size="sm"
              variant={filtroSubtipo === 'REFIN_PORTABILIDADE' ? 'default' : 'outline'}
              onClick={() => setFiltroSubtipo('REFIN_PORTABILIDADE')}
            >
              Portabilidade + Refin
            </Button>
          </div>

          {/* Campos de Busca */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome..."
                value={buscaNome}
                onChange={(e) => setBuscaNome(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por CPF..."
                value={buscaCpf}
                onChange={(e) => setBuscaCpf(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por banco..."
                value={buscaBanco}
                onChange={(e) => setBuscaBanco(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : vendasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Banknote className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">Nenhum empréstimo cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {vendasFiltradas.map((venda) => {
            const isConsignado = venda.produto === 'EMPRESTIMO_CONSIGNADO';
            const Icon = isConsignado ? Banknote : Wallet;
            const bgColor = isConsignado ? 'from-purple-500 to-purple-600' : 'from-orange-500 to-orange-600';
            
            return (
              <Card 
                key={venda.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onDoubleClick={() => navigate(createPageUrl('VendaEmprestimoDetalhes') + `?id=${venda.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${bgColor} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-base">
                          {venda.cliente_nome}
                          {venda.cliente_cpf && (
                            <span className="text-sm font-normal text-slate-500 ml-2">
                              - {venda.cliente_cpf}
                            </span>
                          )}
                        </h3>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Badge className={`${statusColors[venda.status]} cursor-pointer hover:opacity-80 transition-opacity`}>
                              {statusLabels[venda.status]}
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {statusOptions.map((option) => (
                              <DropdownMenuItem
                                key={option.value}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusChange(venda, option.value);
                                }}
                                className={venda.status === option.value ? 'bg-slate-100 font-medium' : ''}
                              >
                                {option.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-600">
                        <span>{isConsignado ? 'Consignado' : 'Empréstimo Pessoal'} - {venda.tipo}</span>
                        <span className="text-slate-400">|</span>
                        <span><strong>Banco:</strong> {venda.detalhes?.banco || venda.detalhes?.banco_anterior || '-'}</span>
                        <span className="text-slate-400">|</span>
                        <span><strong>Valor Liberado:</strong> {venda.detalhes?.valor_liberado ? `R$ ${venda.detalhes.valor_liberado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</span>
                        <span className="text-slate-400">|</span>
                        <span><strong>Parcela:</strong> {venda.detalhes?.parcela ? `R$ ${venda.detalhes.parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}</span>
                        <span className="text-slate-400">|</span>
                        <span><strong>{isConsignado ? 'Convênio' : 'Contrato'}:</strong> {isConsignado ? (venda.detalhes?.convenio_nome || '-') : (venda.detalhes?.numero_contrato || '-')}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}