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
import { TrendingUp, CheckCircle2, Loader2, Search, Pencil, History, ChevronDown, MessageCircle } from 'lucide-react';
import ChatPopupModal from '@/components/chat/ChatPopupModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
  const [chatPopup, setChatPopup] = useState(null); // { telefone, nome } contato para o popup
  const [buscandoTelefone, setBuscandoTelefone] = useState(null); // id da venda em busca
  const [comprovante, setComprovante] = useState(null); // comprovante gerado após ofertar
  const queryClient = useQueryClient();

  // Auto-preencher observação ao selecionar lance fixo 30% ou 50%
  useEffect(() => {
    if (tipoLance === 'fixo_30') {
      setObservacao('Lance embutido de 30% ofertado, suas chances de contemplação aumentaram.');
    } else if (tipoLance === 'fixo_50') {
      setObservacao('Lance embutido de 50% ofertado, suas chances de contemplação aumentaram.');
    }
  }, [tipoLance]);

  // Texto do comprovante para envio via WhatsApp
  const gerarTextoComprovante = (c) => {
    const linhas = [
      '*COMPROVANTE DE OFERTA DE LANCE*',
      '',
      `Cliente: ${c.cliente}`,
      `Grupo/Cota: ${c.grupo}/${c.cota}`,
      `Valor da carta: ${formatCurrency(c.valor_carta)}`,
      `Percentual ofertado: ${c.percentual}%`,
      `Tipo de lance: ${tipoLanceLabels[c.tipo_lance] || c.tipo_lance}`,
      `Valor do lance: ${formatCurrency(c.valor_lance)}`,
    ];
    if (c.observacao) linhas.push(`Informação do lance: ${c.observacao}`);
    linhas.push('', `Data: ${c.data}`);
    if (c.usuario) linhas.push(`Registrado por: ${c.usuario}`);
    return linhas.join('\n');
  };

  const [enviandoComprovante, setEnviandoComprovante] = useState(false);
  const enviarComprovanteWhatsApp = async () => {
    if (!comprovante?.telefone) {
      toast.error('Telefone do cliente não encontrado. Cadastre o telefone no cadastro do cliente.');
      return;
    }
    if (!currentUser?.empresa_id) {
      toast.error('Empresa não identificada. Não é possível enviar pelo CRM.');
      return;
    }
    setEnviandoComprovante(true);
    try {
      const tel = String(comprovante.telefone).replace(/\D/g, '');
      // Buscar conversa existente pelo telefone (tenta variações com/sem 9º dígito)
      const variacoes = [tel];
      if (tel.startsWith('55') && tel.length === 12) variacoes.push(tel.slice(0, 4) + '9' + tel.slice(4));
      if (tel.startsWith('55') && tel.length === 13) variacoes.push(tel.slice(0, 4) + tel.slice(5));

      let conversa = null;
      for (const v of variacoes) {
        const convs = await base44.entities.ConversaWhatsapp.filter(
          { empresa_id: currentUser.empresa_id, cliente_telefone: v },
          '-data_ultima_mensagem', 1
        );
        if (convs?.length > 0) { conversa = convs[0]; break; }
      }

      // Criar conversa se não existir
      if (!conversa) {
        let dadosCanal = { tipo_conexao: 'empresa' };
        try {
          const conexoesDapi = await base44.entities.WhatsappConnection.filter({
            empresa_id: currentUser.empresa_id,
            provider_type: 'dapi',
            is_active: true
          }, '-created_date', 1);
          const conexaoDapi = conexoesDapi?.[0];
          if (conexaoDapi) {
            dadosCanal = {
              tipo_conexao: 'dapi',
              canal_origem: 'dapi',
              provider: 'dapi',
              instancia: conexaoDapi.session_id || 'D-API',
              connection_id: conexaoDapi.id,
              locked_provider: true,
            };
          }
        } catch (_) {}
        conversa = await base44.entities.ConversaWhatsapp.create({
          empresa_id: currentUser.empresa_id,
          cliente_id: '',
          cliente_nome: comprovante.cliente || tel,
          cliente_telefone: tel,
          whatsapp_id: `conv_${Date.now()}`,
          status: 'ativa',
          ultima_mensagem: '',
          data_ultima_mensagem: new Date().toISOString(),
          ...dadosCanal
        });
      }

      const texto = gerarTextoComprovante(comprovante);
      const res = await base44.functions.invoke('enviarMensagemWhatsapp', {
        conversa_id: conversa.id,
        numero_cliente: tel,
        mensagem_texto: texto,
      });
      if (res?.data?.error) throw new Error(res.data.error);
      toast.success('Comprovante enviado pelo WhatsApp do CRM!');
      closeForm();
    } catch (e) {
      console.error('Erro ao enviar comprovante:', e);
      toast.error('Erro ao enviar pelo CRM: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setEnviandoComprovante(false);
    }
  };

  // Buscar telefone do cliente (via Cliente entity) e abrir o popup de chat
  const abrirChatCliente = async (venda) => {
    setBuscandoTelefone(venda.id);
    try {
      let telefone = null;
      // 1. Se a venda já tem cliente_telefone, usar direto
      if (venda.cliente_telefone) {
        telefone = venda.cliente_telefone;
      } else if (venda.cliente_id) {
        // 2. Buscar na entidade Cliente pelo cliente_id
        const clientes = await base44.entities.Cliente.filter({ id: venda.cliente_id }, null, 1);
        if (clientes?.length > 0 && (clientes[0].celular || clientes[0].telefone_fixo)) {
          telefone = clientes[0].celular || clientes[0].telefone_fixo;
        }
      }

      if (!telefone) {
        toast.error('Telefone do cliente não encontrado. Cadastre o telefone no cadastro do cliente.');
        return;
      }

      // Normalizar telefone — garantir que comece com 55
      let telLimpo = String(telefone).replace(/\D/g, '');
      if (telLimpo && !telLimpo.startsWith('55') && telLimpo.length >= 10) {
        telLimpo = '55' + telLimpo;
      }

      setChatPopup({
        telefone: telLimpo,
        nome: venda.cliente_nome || 'Cliente',
      });
    } catch (e) {
      toast.error('Erro ao buscar telefone do cliente: ' + (e.message || ''));
    } finally {
      setBuscandoTelefone(null);
    }
  };

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
    // Rows vêm de Proposta (produto='consorcio') ou Venda (legado)
    if (venda.produto === 'consorcio') {
      await base44.entities.Proposta.update(venda.id, { status: novoStatus });
    } else {
      // Venda legado exige prazo obrigatório — repassar o valor existente
      await base44.entities.Venda.update(venda.id, {
        status: novoStatus,
        prazo: Number(venda.prazo || venda.prazo_meses || 1),
      });
    }
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
    const statusValido = ['ativa', 'pendente', 'aguardando_aprovacao', 'em_atraso'].includes(v.status);
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
    onSuccess: async (_resp, variables) => {
      queryClient.invalidateQueries({ queryKey: ['oferta-lance-data'] });
      // Buscar telefone do cliente para o comprovante
      let telefone = '';
      if (variables.cliente_id) {
        try {
          const clientes = await base44.entities.Cliente.filter({ id: variables.cliente_id }, null, 1);
          if (clientes?.length > 0) {
            telefone = clientes[0].celular || clientes[0].telefone_fixo || clientes[0].pj_celular || '';
          }
        } catch {}
      }
      let telLimpo = String(telefone || '').replace(/\D/g, '');
      if (telLimpo && !telLimpo.startsWith('55') && telLimpo.length >= 10) {
        telLimpo = '55' + telLimpo;
      }
      setComprovante({
        cliente: variables.cliente_nome || '',
        grupo: variables.grupo || '',
        cota: variables.cota || '',
        valor_carta: variables.valor_carta || 0,
        percentual: variables.percentual_lance || 0,
        valor_lance: variables.valor_lance || 0,
        tipo_lance: variables.tipo_lance || 'livre',
        observacao: variables.observacao || '',
        data: new Date().toLocaleString('pt-BR'),
        telefone: telLimpo,
        usuario: variables.usuario_nome || '',
      });
      toast.success('Lance ofertado com sucesso! Comprovante gerado.');
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
    setComprovante(null);
    setTimeout(() => {
      setSelectedVenda(null);
      setPercentual('');
      setTipoLance('livre');
      setObservacao('');
      setComprovante(null);
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={cn(
              "flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium capitalize hover:bg-slate-50 transition-colors",
              row.status === 'em_atraso'
                ? "border-orange-300 bg-orange-100 text-orange-700"
                : "border-slate-200 text-slate-700"
            )}>
              {row.status}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[
              { value: 'ativa', label: 'Ativa' },
              { value: 'pendente', label: 'Pendente' },
              { value: 'cancelada', label: 'Cancelada' },
              { value: 'em_atraso', label: 'Em Atraso' },
              { value: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
              { value: 'doc_pendentes', label: 'Doc. Pendentes' },
              { value: 'contemplada', label: 'Contemplada' },
            ].map(s => (
              <DropdownMenuItem key={s.value} onClick={() => handleAlterarStatus(row, s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
    {
      header: '',
      className: 'w-44',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => handleOfertar(row)}
            className="bg-[#23BE84] hover:bg-[#1da570]"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Ofertar Lance
          </Button>
          <Button
            size="icon"
            variant="outline"
            disabled={buscandoTelefone === row.id}
            onClick={() => abrirChatCliente(row)}
            className="h-8 w-8 shrink-0 border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300"
            title="Conversar no WhatsApp"
          >
            {buscandoTelefone === row.id ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.485 3.51A13.935 13.935 0 0012.06 0C5.503 0 .12 5.382.12 11.94c0 2.104.55 4.16 1.595 5.972L.03 24l4.204-1.102a13.9 13.9 0 005.86 1.261h.004c6.557 0 11.94-5.382 11.94-11.94a11.88 11.88 0 00-3.515-8.46"/>
              </svg>
            )}
          </Button>
        </div>
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
      cell: (row) => (
        <span className={cn(
          "px-1.5 py-0.5 rounded text-xs font-medium",
          currentUser?.perfil === 'admin' ? "bg-[#23BE84]/15 text-[#23BE84]" : "text-slate-700"
        )}>
          {currentUser?.nome_perfil || currentUser?.full_name || '—'}
        </span>
      )
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
            <DialogTitle>{comprovante ? 'Comprovante de Oferta de Lance' : 'Ofertar Lance'}</DialogTitle>
          </DialogHeader>

          {comprovante ? (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg space-y-1.5 text-sm">
                <div><span className="text-slate-500">Cliente: </span><span className="font-medium">{comprovante.cliente}</span></div>
                <div><span className="text-slate-500">Grupo/Cota: </span><span className="font-medium">{comprovante.grupo}/{comprovante.cota}</span></div>
                <div><span className="text-slate-500">Valor da carta: </span><span className="font-medium">{formatCurrency(comprovante.valor_carta)}</span></div>
                <div><span className="text-slate-500">Percentual ofertado: </span><span className="font-medium">{comprovante.percentual}%</span></div>
                <div><span className="text-slate-500">Tipo de lance: </span><span className="font-medium">{tipoLanceLabels[comprovante.tipo_lance] || comprovante.tipo_lance}</span></div>
                <div><span className="text-slate-500">Valor do lance: </span><span className="font-medium">{formatCurrency(comprovante.valor_lance)}</span></div>
                {comprovante.observacao && (
                  <div><span className="text-slate-500">Informação do lance: </span><span className="font-medium">{comprovante.observacao}</span></div>
                )}
                <div><span className="text-slate-500">Data: </span><span className="font-medium">{comprovante.data}</span></div>
                {comprovante.usuario && (
                  <div><span className="text-slate-500">Registrado por: </span><span className="font-medium">{comprovante.usuario}</span></div>
                )}
              </div>

              {comprovante.telefone ? (
                <p className="text-xs text-slate-500">
                  Deseja enviar este comprovante para o cliente via WhatsApp ({comprovante.telefone})?
                </p>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  ⚠️ Telefone do cliente não encontrado. Cadastre o telefone no cadastro do cliente para enviar o comprovante.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={closeForm}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
                  onClick={enviarComprovanteWhatsApp}
                  disabled={!comprovante.telefone || enviandoComprovante}
                >
                  {enviandoComprovante
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <MessageCircle className="w-4 h-4" />}
                  {enviandoComprovante ? 'Enviando...' : 'Enviar pelo WhatsApp'}
                </Button>
              </div>
            </div>
          ) : selectedVenda && (
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

      {/* Popup de conversa WhatsApp — mesmo usado no Bate-Papo */}
      <ChatPopupModal
        open={!!chatPopup}
        onOpenChange={(v) => { if (!v) setChatPopup(null); }}
        contato={chatPopup}
        empresaId={currentUser?.empresa_id}
        user={currentUser}
        criarSeNaoExistir={true}
      />
    </div>
  );
}