import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, DollarSign, Search, Upload, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function RecebimentoComissao() {
  const [formOpen, setFormOpen] = useState(false);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedComissao, setSelectedComissao] = useState(null);
  const [formData, setFormData] = useState({
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    valor_recebido: '',
    percentual_recebido: '',
    data_pagamento: '',
    observacoes: ''
  });
  const [manualFormData, setManualFormData] = useState({
    venda_id: '',
    usuario_id: '',
    numero_parcela: '',
    valor: '',
    percentual: '',
    administradora_id: '',
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    observacoes: ''
  });
  const [contratoSearch, setContratoSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'admin';

  // Buscar comissões previstas
  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-previstas'],
    queryFn: () => base44.entities.Comissao.filter({ status: 'prevista' }),
  });

  const { data: vendas = [] } = useQuery({
    queryKey: ['vendas'],
    queryFn: () => base44.entities.Venda.list(),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.list(),
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => base44.entities.User.filter({ status: 'ativo' }),
  });

  const registrarRecebimentoMutation = useMutation({
    mutationFn: async ({ comissaoId, data }) => {
      // Atualizar comissão
      await base44.entities.Comissao.update(comissaoId, {
        ...data,
        status: 'confirmada'
      });

      // Atualizar saldo do usuário
      const comissao = comissoes.find(c => c.id === comissaoId);
      if (comissao) {
        const usuario = await base44.entities.User.filter({ id: comissao.usuario_id });
        if (usuario.length > 0) {
          const saldoAtual = usuario[0].saldo_comissao || 0;
          await base44.entities.User.update(comissao.usuario_id, {
            saldo_comissao: saldoAtual + parseFloat(data.valor_recebido || 0)
          });
        }
      }

      // HU 08 - Auditoria
      const user = await base44.auth.me();
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: 'Registro de recebimento manual de comissão',
        entidade: 'Comissao',
        entidade_id: comissaoId,
        dados_novos: JSON.stringify(data),
        tipo: 'recebimento'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-previstas'] });
      setFormOpen(false);
      setSelectedComissao(null);
      resetForm();
      toast.success('Recebimento registrado com sucesso!');
    },
  });

  const resetForm = () => {
    setFormData({
      data_recebimento: format(new Date(), 'yyyy-MM-dd'),
      valor_recebido: '',
      percentual_recebido: '',
      data_pagamento: '',
      observacoes: ''
    });
  };

  const resetManualForm = () => {
    setManualFormData({
      venda_id: '',
      usuario_id: '',
      numero_parcela: '',
      valor: '',
      percentual: '',
      administradora_id: '',
      data_recebimento: format(new Date(), 'yyyy-MM-dd'),
      observacoes: ''
    });
    setContratoSearch('');
  };

  const filteredVendas = vendas.filter(v => {
    const searchLower = contratoSearch.toLowerCase();
    return (
      v.grupo?.toLowerCase().includes(searchLower) ||
      v.cota?.toLowerCase().includes(searchLower) ||
      v.contrato?.toLowerCase().includes(searchLower) ||
      v.cliente_nome?.toLowerCase().includes(searchLower)
    );
  });

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];

    if (!validTypes.includes(file.type)) {
      toast.error('Formato de arquivo inválido. Use .xlsx ou .csv');
      return;
    }

    setImportFile(file);
    setIsProcessing(true);

    try {
      // Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      // Extrair dados
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            Data: { type: 'string' },
            Contrato: { type: 'string' },
            Grupo: { type: 'string' },
            Cota: { type: 'string' },
            'Valor Recebido': { type: 'number' },
            'Nº Parcela': { type: 'number' },
            Administradora: { type: 'string' }
          }
        }
      };

      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: schema
      });

      if (result.status === 'error') {
        toast.error(result.details || 'Erro ao processar arquivo');
        setIsProcessing(false);
        return;
      }

      // Validar e processar dados
      const processedData = processImportData(result.output);
      setImportData(processedData);
      setIsProcessing(false);
    } catch (error) {
      toast.error('Erro ao processar arquivo');
      setIsProcessing(false);
    }
  };

  const processImportData = (rawData) => {
    const processed = rawData.map((row, index) => {
      const errors = [];
      let venda = null;
      let administradora = null;

      // Validar data
      if (!row.Data) {
        errors.push('Data obrigatória');
      }

      // Validar valor
      if (!row['Valor Recebido'] || parseFloat(row['Valor Recebido']) <= 0) {
        errors.push('Valor inválido');
      }

      // Validar parcela
      if (!row['Nº Parcela']) {
        errors.push('Número da parcela obrigatório');
      }

      // Validar vínculo (Contrato OU Grupo+Cota)
      if (!row.Contrato && (!row.Grupo || !row.Cota)) {
        errors.push('Informe Contrato ou Grupo+Cota');
      }

      // Buscar administradora
      if (row.Administradora) {
        administradora = administradoras.find(a => 
          a.nome_fantasia?.toLowerCase() === row.Administradora.toLowerCase() ||
          a.razao_social?.toLowerCase() === row.Administradora.toLowerCase()
        );
        if (!administradora) {
          errors.push('Administradora não encontrada');
        }
      } else {
        errors.push('Administradora obrigatória');
      }

      // Buscar venda
      if (row.Contrato) {
        venda = vendas.find(v => v.contrato === row.Contrato);
      } else if (row.Grupo && row.Cota) {
        venda = vendas.find(v => 
          v.grupo === row.Grupo && 
          v.cota === row.Cota &&
          (!administradora || v.administradora_id === administradora.id)
        );
      }

      if (!venda) {
        errors.push('Venda não encontrada');
      }

      // Verificar duplicidade
      if (venda && !errors.length) {
        const isDuplicate = comissoes.some(c => 
          c.venda_id === venda.id &&
          c.observacoes?.includes(`Parcela ${row['Nº Parcela']}`) &&
          parseFloat(c.valor) === parseFloat(row['Valor Recebido']) &&
          c.status === 'confirmada'
        );
        if (isDuplicate) {
          errors.push('Recebimento duplicado');
        }
      }

      return {
        linha: index + 2,
        data: row.Data,
        contrato: row.Contrato || `${row.Grupo}/${row.Cota}`,
        grupo: row.Grupo,
        cota: row.Cota,
        valor: row['Valor Recebido'],
        parcela: row['Nº Parcela'],
        administradora: row.Administradora,
        venda_id: venda?.id,
        administradora_id: administradora?.id,
        vendedor_id: venda?.vendedor_id,
        vendedor_nome: venda?.vendedor_nome,
        errors: errors,
        isValid: errors.length === 0
      };
    });

    return {
      total: processed.length,
      validos: processed.filter(p => p.isValid).length,
      erros: processed.filter(p => !p.isValid).length,
      registros: processed
    };
  };

  const importarRecebimentosMutation = useMutation({
    mutationFn: async (registros) => {
      const user = await base44.auth.me();
      const results = [];

      for (const reg of registros) {
        if (!reg.isValid) continue;

        try {
          const venda = vendas.find(v => v.id === reg.venda_id);
          const usuario = usuarios.find(u => u.id === reg.vendedor_id);

          // Criar comissão
          const comissao = await base44.entities.Comissao.create({
            venda_id: reg.venda_id,
            parcela_id: null,
            usuario_id: reg.vendedor_id,
            usuario_nome: usuario.full_name,
            usuario_perfil: usuario.perfil,
            tipo_comissao: 'parcela',
            tipo: 'receber',
            valor: parseFloat(reg.valor),
            percentual: 0,
            status: 'confirmada',
            data_recebimento: reg.data,
            data_pagamento: reg.data,
            administradora_id: reg.administradora_id,
            observacoes: `Parcela ${reg.parcela} - Importado`
          });

          // Atualizar saldo
          const usuarioData = await base44.entities.User.filter({ id: reg.vendedor_id });
          if (usuarioData.length > 0) {
            const saldoAtual = usuarioData[0].saldo_comissao || 0;
            await base44.entities.User.update(reg.vendedor_id, {
              saldo_comissao: saldoAtual + parseFloat(reg.valor)
            });
          }

          // Auditoria
          await base44.entities.LogAuditoria.create({
            usuario_id: user.id,
            usuario_nome: user.full_name,
            acao: `Importação de recebimento - Linha ${reg.linha}`,
            entidade: 'Comissao',
            entidade_id: comissao.id,
            dados_novos: JSON.stringify(reg),
            tipo: 'recebimento'
          });

          results.push({ linha: reg.linha, success: true });
        } catch (error) {
          results.push({ linha: reg.linha, success: false, error: error.message });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;

      queryClient.invalidateQueries({ queryKey: ['comissoes-previstas'] });
      setImportOpen(false);
      setImportFile(null);
      setImportData(null);

      if (errorCount === 0) {
        toast.success(`${successCount} recebimentos importados com sucesso!`);
      } else {
        toast.warning(`${successCount} importados, ${errorCount} com erro`);
      }
    },
    onError: (error) => {
      toast.error('Erro ao importar recebimentos');
    }
  });

  const handleConfirmarImportacao = () => {
    if (!importData || importData.validos === 0) {
      toast.error('Nenhum registro válido para importar');
      return;
    }

    const registrosValidos = importData.registros.filter(r => r.isValid);
    importarRecebimentosMutation.mutate(registrosValidos);
  };

  const registrarRecebimentoManualMutation = useMutation({
    mutationFn: async (data) => {
      const venda = vendas.find(v => v.id === data.venda_id);
      const usuario = usuarios.find(u => u.id === data.usuario_id);
      
      if (!venda || !usuario) {
        throw new Error('Venda ou usuário não encontrado');
      }

      // Criar comissão diretamente como confirmada
      const comissao = await base44.entities.Comissao.create({
        venda_id: data.venda_id,
        parcela_id: null,
        usuario_id: data.usuario_id,
        usuario_nome: usuario.full_name,
        usuario_perfil: usuario.perfil,
        tipo_comissao: 'parcela',
        tipo: 'receber',
        valor: parseFloat(data.valor),
        percentual: parseFloat(data.percentual || 0),
        status: 'confirmada',
        data_recebimento: data.data_recebimento,
        data_pagamento: data.data_recebimento,
        administradora_id: data.administradora_id || venda.administradora_id,
        observacoes: `Parcela ${data.numero_parcela}${data.observacoes ? ' - ' + data.observacoes : ''}`
      });

      // Atualizar saldo do usuário
      const usuarioData = await base44.entities.User.filter({ id: data.usuario_id });
      if (usuarioData.length > 0) {
        const saldoAtual = usuarioData[0].saldo_comissao || 0;
        await base44.entities.User.update(data.usuario_id, {
          saldo_comissao: saldoAtual + parseFloat(data.valor)
        });
      }

      // Auditoria
      const user = await base44.auth.me();
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Registro manual de comissão - Parcela ${data.numero_parcela} para ${usuario.full_name}`,
        entidade: 'Comissao',
        entidade_id: comissao.id,
        dados_novos: JSON.stringify(data),
        tipo: 'recebimento'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-previstas'] });
      setManualFormOpen(false);
      resetManualForm();
      toast.success('Recebimento registrado com sucesso!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao registrar recebimento');
    }
  });

  const handleRegistrar = () => {
    if (!selectedComissao) {
      toast.error('Selecione uma comissão');
      return;
    }
    if (!formData.valor_recebido || parseFloat(formData.valor_recebido) <= 0) {
      toast.error('Informe o valor recebido');
      return;
    }
    if (!formData.data_pagamento) {
      toast.error('Informe a data de pagamento');
      return;
    }

    registrarRecebimentoMutation.mutate({
      comissaoId: selectedComissao.id,
      data: formData
    });
  };

  const handleRegistrarManual = () => {
    // Validações
    if (!manualFormData.venda_id) {
      toast.error('Selecione um contrato/venda');
      return;
    }
    if (!manualFormData.usuario_id) {
      toast.error('Selecione um vendedor');
      return;
    }
    if (!manualFormData.numero_parcela) {
      toast.error('Informe o número da parcela');
      return;
    }
    if (!manualFormData.valor || parseFloat(manualFormData.valor) <= 0) {
      toast.error('Informe um valor válido');
      return;
    }
    if (!manualFormData.data_recebimento) {
      toast.error('Informe a data de recebimento');
      return;
    }
    if (!manualFormData.administradora_id) {
      toast.error('Selecione a administradora');
      return;
    }

    registrarRecebimentoManualMutation.mutate(manualFormData);
  };

  const getVendaInfo = (vendaId) => {
    const venda = vendas.find(v => v.id === vendaId);
    if (!venda) return '-';
    return `${venda.grupo}/${venda.cota} - ${venda.cliente_nome}`;
  };

  const getAdminNome = (adminId) => {
    const admin = administradoras.find(a => a.id === adminId);
    return admin?.nome_fantasia || admin?.razao_social || '-';
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Filtrar comissões
  const filteredComissoes = comissoes.filter(c => {
    if (!isAdmin && c.usuario_id !== currentUser?.id) return false;
    
    const matchSearch = 
      c.usuario_nome?.toLowerCase().includes(search.toLowerCase()) ||
      getVendaInfo(c.venda_id).toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const columns = [
    {
      header: 'Venda',
      cell: (row) => (
        <div>
          <p className="font-medium text-slate-900">{getVendaInfo(row.venda_id)}</p>
          <p className="text-sm text-slate-500">{getAdminNome(row.administradora_id)}</p>
        </div>
      )
    },
    {
      header: 'Vendedor',
      cell: (row) => row.usuario_nome || '-'
    },
    {
      header: 'Tipo',
      cell: (row) => (
        <StatusBadge 
          status={row.tipo_comissao} 
          className={row.tipo_comissao === 'faturamento' ? 'bg-emerald-100 text-emerald-700' : ''}
        />
      )
    },
    {
      header: 'Valor Previsto',
      cell: (row) => formatCurrency(row.valor)
    },
    {
      header: 'Percentual',
      cell: (row) => `${row.percentual}%`
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: '',
      className: 'w-32',
      cell: (row) => (
        <Button
          size="sm"
          onClick={() => {
            setSelectedComissao(row);
            setFormData({
              data_recebimento: format(new Date(), 'yyyy-MM-dd'),
              valor_recebido: row.valor.toString(),
              percentual_recebido: row.percentual.toString(),
              data_pagamento: '',
              observacoes: ''
            });
            setFormOpen(true);
          }}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <DollarSign className="w-4 h-4 mr-2" />
          Registrar
        </Button>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recebimento de Comissão"
        subtitle="Registre manualmente os recebimentos de comissão"
        actionLabel="Registrar Recebimento"
        actionIcon={DollarSign}
        onAction={() => {
          resetManualForm();
          setManualFormOpen(true);
        }}
      >
        <Button
          onClick={() => setImportOpen(true)}
          variant="outline"
          className="gap-2"
        >
          <Upload className="w-4 h-4" />
          Importar Excel/CSV
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por vendedor ou venda..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredComissoes}
        isLoading={isLoading}
        emptyMessage="Nenhuma comissão prevista encontrada"
      />

      {/* Form Modal */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento de Comissão</DialogTitle>
          </DialogHeader>
          
          {selectedComissao && (
            <div className="space-y-4">
              {/* Info da comissão */}
              <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Venda:</span>
                  <span className="font-medium">{getVendaInfo(selectedComissao.venda_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Vendedor:</span>
                  <span className="font-medium">{selectedComissao.usuario_nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Tipo:</span>
                  <span className="font-medium capitalize">{selectedComissao.tipo_comissao}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Administradora:</span>
                  <span className="font-medium">{getAdminNome(selectedComissao.administradora_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Valor Previsto:</span>
                  <span className="font-bold text-emerald-600">{formatCurrency(selectedComissao.valor)}</span>
                </div>
              </div>

              {/* Formulário */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="data_recebimento">Data de Recebimento *</Label>
                  <Input
                    id="data_recebimento"
                    type="date"
                    value={formData.data_recebimento}
                    onChange={(e) => setFormData({ ...formData, data_recebimento: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="valor_recebido">Valor Recebido (R$) *</Label>
                    <Input
                      id="valor_recebido"
                      type="number"
                      step="0.01"
                      value={formData.valor_recebido}
                      onChange={(e) => setFormData({ ...formData, valor_recebido: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>

                  <div>
                    <Label htmlFor="percentual_recebido">Percentual Recebido (%)</Label>
                    <Input
                      id="percentual_recebido"
                      type="number"
                      step="0.01"
                      value={formData.percentual_recebido}
                      onChange={(e) => setFormData({ ...formData, percentual_recebido: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="data_pagamento">Data de Pagamento *</Label>
                  <Input
                    id="data_pagamento"
                    type="date"
                    value={formData.data_pagamento}
                    onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
                  />
                </div>

                <div>
                  <Label htmlFor="observacoes">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    placeholder="Informações adicionais sobre o recebimento..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleRegistrar}
                  disabled={registrarRecebimentoMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {registrarRecebimentoMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Confirmar Recebimento
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Recebimento Manual */}
      <Dialog open={manualFormOpen} onOpenChange={setManualFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar Recebimento Manual</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="venda_id">Contrato / Venda *</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por grupo, cota, contrato ou cliente..."
                      value={contratoSearch}
                      onChange={(e) => setContratoSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select
                    value={manualFormData.venda_id}
                    onValueChange={(value) => {
                      const venda = vendas.find(v => v.id === value);
                      setManualFormData({ 
                        ...manualFormData, 
                        venda_id: value,
                        usuario_id: venda?.vendedor_id || '',
                        administradora_id: venda?.administradora_id || ''
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um contrato/venda" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVendas.length === 0 ? (
                        <div className="p-2 text-sm text-slate-500 text-center">
                          Nenhuma venda encontrada
                        </div>
                      ) : (
                        filteredVendas.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.contrato || `${v.grupo}/${v.cota}`} - {v.cliente_nome}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {manualFormData.venda_id && (
                <>
                  <div>
                    <Label>Grupo</Label>
                    <Input
                      value={vendas.find(v => v.id === manualFormData.venda_id)?.grupo || '-'}
                      disabled
                    />
                  </div>

                  <div>
                    <Label>Cota</Label>
                    <Input
                      value={vendas.find(v => v.id === manualFormData.venda_id)?.cota || '-'}
                      disabled
                    />
                  </div>
                </>
              )}

              <div className="col-span-2">
                <Label htmlFor="usuario_id">Vendedor *</Label>
                <Select
                  value={manualFormData.usuario_id}
                  onValueChange={(value) => setManualFormData({ ...manualFormData, usuario_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numero_parcela">Nº da Parcela *</Label>
                <Input
                  id="numero_parcela"
                  type="number"
                  value={manualFormData.numero_parcela}
                  onChange={(e) => setManualFormData({ ...manualFormData, numero_parcela: e.target.value })}
                  placeholder="Ex: 1"
                />
              </div>

              <div>
                <Label htmlFor="data_recebimento">Data de Recebimento *</Label>
                <Input
                  id="data_recebimento"
                  type="date"
                  value={manualFormData.data_recebimento}
                  onChange={(e) => setManualFormData({ ...manualFormData, data_recebimento: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="valor">Valor Recebido (R$) *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  value={manualFormData.valor}
                  onChange={(e) => setManualFormData({ ...manualFormData, valor: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div>
                <Label htmlFor="percentual">Percentual (%)</Label>
                <Input
                  id="percentual"
                  type="number"
                  step="0.01"
                  value={manualFormData.percentual}
                  onChange={(e) => setManualFormData({ ...manualFormData, percentual: e.target.value })}
                  placeholder="0,00"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="administradora_id">Administradora *</Label>
                <Select
                  value={manualFormData.administradora_id}
                  onValueChange={(value) => setManualFormData({ ...manualFormData, administradora_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a administradora" />
                  </SelectTrigger>
                  <SelectContent>
                    {administradoras.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.nome_fantasia || a.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="observacoes_manual">Observação</Label>
                <Textarea
                  id="observacoes_manual"
                  value={manualFormData.observacoes}
                  onChange={(e) => setManualFormData({ ...manualFormData, observacoes: e.target.value })}
                  placeholder="Informações adicionais..."
                  rows={3}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setManualFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleRegistrarManual}
                disabled={registrarRecebimentoManualMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {registrarRecebimentoManualMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Confirmar Recebimento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Importação */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Recebimentos (Excel / CSV)</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Upload */}
            {!importData && (
              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center">
                  <Upload className="w-12 h-12 mx-auto text-slate-400 mb-4" />
                  <p className="text-sm text-slate-600 mb-4">
                    Arraste um arquivo ou clique para selecionar
                  </p>
                  <Input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileUpload}
                    className="max-w-xs mx-auto"
                    disabled={isProcessing}
                  />
                  {isProcessing && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-slate-600">Processando arquivo...</span>
                    </div>
                  )}
                </div>

                {/* Instruções */}
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <h4 className="font-semibold text-sm">Formato do arquivo:</h4>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li>• <strong>Data</strong> (obrigatório)</li>
                    <li>• <strong>Contrato</strong> OU <strong>Grupo + Cota</strong> (obrigatório)</li>
                    <li>• <strong>Valor Recebido</strong> (obrigatório)</li>
                    <li>• <strong>Nº Parcela</strong> (obrigatório)</li>
                    <li>• <strong>Administradora</strong> (obrigatório)</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Pré-visualização */}
            {importData && (
              <div className="space-y-4">
                {/* Resumo */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 rounded-lg p-4">
                    <p className="text-sm text-slate-600">Total de Registros</p>
                    <p className="text-2xl font-bold text-slate-900">{importData.total}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-4">
                    <p className="text-sm text-emerald-600">Registros Válidos</p>
                    <p className="text-2xl font-bold text-emerald-700">{importData.validos}</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm text-red-600">Com Erro</p>
                    <p className="text-2xl font-bold text-red-700">{importData.erros}</p>
                  </div>
                </div>

                {/* Tabela de registros */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Linha</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-left">Contrato</th>
                          <th className="px-3 py-2 text-left">Parcela</th>
                          <th className="px-3 py-2 text-left">Valor</th>
                          <th className="px-3 py-2 text-left">Vendedor</th>
                          <th className="px-3 py-2 text-left">Erros</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importData.registros.map((reg) => (
                          <tr key={reg.linha} className="border-t">
                            <td className="px-3 py-2">{reg.linha}</td>
                            <td className="px-3 py-2">
                              {reg.isValid ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              )}
                            </td>
                            <td className="px-3 py-2">{reg.contrato}</td>
                            <td className="px-3 py-2">{reg.parcela}</td>
                            <td className="px-3 py-2">{formatCurrency(reg.valor)}</td>
                            <td className="px-3 py-2">{reg.vendedor_nome || '-'}</td>
                            <td className="px-3 py-2">
                              {reg.errors.length > 0 && (
                                <span className="text-xs text-red-600">
                                  {reg.errors.join(', ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setImportData(null);
                      setImportFile(null);
                    }}
                    disabled={importarRecebimentosMutation.isPending}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={handleConfirmarImportacao}
                    disabled={importarRecebimentosMutation.isPending || importData.validos === 0}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    {importarRecebimentosMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Confirmar Importação ({importData.validos})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}