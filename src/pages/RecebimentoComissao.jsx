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
import { Checkbox } from '@/components/ui/checkbox';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, DollarSign, Search, Upload, CheckCircle2, AlertCircle, X, Trash2, Eye, ExternalLink, Wallet, Plus, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

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
    administradora_id: '',
    data_recebimento: format(new Date(), 'yyyy-MM-dd'),
    percentual: '',
    observacoes: ''
  });
  const [parcelas, setParcelas] = useState([
    { numero_parcela: '', valor: '', valor_pagar_vendedor: '' }
  ]);
  const [contratoSearch, setContratoSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedComissoesParaPagar, setSelectedComissoesParaPagar] = useState([]);
  const [pagarFormOpen, setPagarFormOpen] = useState(false);
  const [pagarFormData, setPagarFormData] = useState({
    data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    observacoes: ''
  });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [comissaoParaExcluir, setComissaoParaExcluir] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'admin';
  const podeExcluir = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin' || currentUser?.perfil === 'gerente';

  // Buscar comissões previstas
  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-previstas'],
    queryFn: () => base44.entities.Comissao.filter({ status: 'prevista' }),
  });

  // Buscar comissões recebidas/confirmadas
  const { data: comissoesRecebidas = [] } = useQuery({
    queryKey: ['comissoes-recebidas'],
    queryFn: async () => {
      const todasComissoes = await base44.entities.Comissao.filter({ status: 'confirmada' }, '-created_date', 200);
      
      // Admin/Gerente vê todas (receber e pagar)
      if (isAdmin) {
        return todasComissoes;
      }
      
      // Vendedor vê apenas comissões a pagar (tipo: 'pagar')
      return todasComissoes.filter(c => c.tipo === 'pagar' && c.usuario_id === currentUser?.id);
    },
    enabled: !!currentUser
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
      queryClient.invalidateQueries({ queryKey: ['comissoes-recebidas'] });
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
      administradora_id: '',
      data_recebimento: format(new Date(), 'yyyy-MM-dd'),
      percentual: '',
      observacoes: ''
    });
    setParcelas([
      { numero_parcela: '', valor: '', valor_pagar_vendedor: '' }
    ]);
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
      
      if (processedData.total === 0) {
        toast.error('Nenhum dado encontrado no arquivo');
      } else if (processedData.validos === 0) {
        toast.warning('Nenhum registro válido encontrado');
      } else {
        toast.success(`${processedData.validos} de ${processedData.total} registros válidos`);
      }
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast.error(error.message || 'Erro ao processar arquivo');
      setIsProcessing(false);
    }
  };

  const processImportData = (rawData) => {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
      return {
        total: 0,
        validos: 0,
        erros: 0,
        registros: []
      };
    }

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

          // Buscar ou criar parcela
          const parcelas = await base44.entities.Parcela.filter({ 
            venda_id: reg.venda_id,
            numero_parcela: parseInt(reg.parcela)
          });

          let parcela;
          if (parcelas.length > 0) {
            // Atualizar parcela existente
            parcela = parcelas[0];
            await base44.entities.Parcela.update(parcela.id, {
              status: 'recebida',
              valor_recebido: parseFloat(reg.valor),
              data_recebimento: reg.data
            });
          } else {
            // Criar nova parcela
            parcela = await base44.entities.Parcela.create({
              venda_id: reg.venda_id,
              numero_parcela: parseInt(reg.parcela),
              valor_previsto: parseFloat(reg.valor),
              valor_recebido: parseFloat(reg.valor),
              data_recebimento: reg.data,
              status: 'recebida'
            });
          }

          // Criar comissão
          const comissao = await base44.entities.Comissao.create({
            venda_id: reg.venda_id,
            parcela_id: parcela.id,
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

          // Atualizar total recebido na venda
          const comissoesVenda = await base44.entities.Comissao.filter({ 
            venda_id: reg.venda_id,
            status: 'confirmada'
          });
          const totalRecebido = comissoesVenda.reduce((acc, c) => acc + parseFloat(c.valor), 0);
          await base44.entities.Venda.update(reg.venda_id, {
            comissao_total_recebida: totalRecebido
          });

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
      queryClient.invalidateQueries({ queryKey: ['comissoes-recebidas'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['comissoes'] });
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

  const excluirComissaoMutation = useMutation({
    mutationFn: async ({ recebidoId, pagarId, vendaId }) => {
      const comissoes = [];
      
      // Buscar comissões para logs/auditoria
      if (recebidoId) {
        const recebido = comissoesRecebidas.find(c => c.id === recebidoId);
        if (recebido) comissoes.push(recebido);
      }
      if (pagarId) {
        const pagar = comissoesRecebidas.find(c => c.id === pagarId);
        if (pagar) comissoes.push(pagar);
      }

      // Excluir comissões
      if (recebidoId) {
        await base44.entities.Comissao.delete(recebidoId);
      }
      if (pagarId) {
        const comissaoPagar = comissoesRecebidas.find(c => c.id === pagarId);
        
        // Reverter saldo do vendedor
        if (comissaoPagar) {
          const usuarioData = await base44.entities.User.filter({ id: comissaoPagar.usuario_id });
          if (usuarioData.length > 0) {
            const saldoAtual = usuarioData[0].saldo_comissao || 0;
            await base44.entities.User.update(comissaoPagar.usuario_id, {
              saldo_comissao: saldoAtual - parseFloat(comissaoPagar.valor)
            });
          }
        }
        
        await base44.entities.Comissao.delete(pagarId);
      }

      // Reverter status da parcela se existir
      if (comissoes.length > 0 && comissoes[0].parcela_id) {
        try {
          await base44.entities.Parcela.update(comissoes[0].parcela_id, {
            status: 'pendente',
            valor_recebido: null,
            data_recebimento: null,
            importacao_id: null
          });
        } catch (e) {
          console.log('Erro ao reverter parcela:', e);
        }
      }

      // Atualizar total recebido na venda
      if (vendaId) {
        try {
          const comissoesVenda = await base44.entities.Comissao.filter({ 
            venda_id: vendaId,
            status: 'confirmada'
          });
          const totalRecebido = comissoesVenda
            .filter(c => !comissoes.find(del => del.id === c.id))
            .reduce((acc, c) => acc + parseFloat(c.valor), 0);
          
          await base44.entities.Venda.update(vendaId, {
            comissao_total_recebida: totalRecebido
          });
        } catch (e) {
          console.log('Erro ao atualizar total recebido:', e);
        }
      }

      // Auditoria
      const user = await base44.auth.me();
      for (const comissao of comissoes) {
        await base44.entities.LogAuditoria.create({
          usuario_id: user.id,
          usuario_nome: user.full_name,
          acao: `Exclusão de comissão importada - ${comissao.tipo === 'receber' ? 'Recebimento ADM' : 'Pagamento Vendedor'}`,
          entidade: 'Comissao',
          entidade_id: comissao.id,
          dados_anteriores: JSON.stringify(comissao),
          tipo: 'exclusao'
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-recebidas'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      setDeleteDialogOpen(false);
      setComissaoParaExcluir(null);
      toast.success('Comissão excluída com sucesso');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao excluir comissão');
    }
  });

  const filteredComissoesRecebidas = comissoesRecebidas.filter(c => {
    const matchSearch = 
      c.usuario_nome?.toLowerCase().includes(search.toLowerCase()) ||
      getVendaInfo(c.venda_id).toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const pagarComissoesMutation = useMutation({
    mutationFn: async ({ comissaoIds, data }) => {
      for (const comissaoId of comissaoIds) {
        await base44.entities.Comissao.update(comissaoId, {
          status: 'paga',
          data_pagamento: data.data_pagamento,
          observacoes: data.observacoes
        });
      }

      // Auditoria
      const user = await base44.auth.me();
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Pagamento em lote de ${comissaoIds.length} comissões`,
        entidade: 'Comissao',
        dados_novos: JSON.stringify(data),
        tipo: 'edicao'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-recebidas'] });
      setPagarFormOpen(false);
      setSelectedComissoesParaPagar([]);
      setPagarFormData({
        data_pagamento: format(new Date(), 'yyyy-MM-dd'),
        observacoes: ''
      });
      toast.success('Pagamentos registrados com sucesso!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao registrar pagamentos');
    }
  });

  const handlePagarSelecionadas = () => {
    if (selectedComissoesParaPagar.length === 0) {
      toast.error('Selecione ao menos uma comissão');
      return;
    }
    if (!pagarFormData.data_pagamento) {
      toast.error('Informe a data de pagamento');
      return;
    }

    pagarComissoesMutation.mutate({
      comissaoIds: selectedComissoesParaPagar,
      data: pagarFormData
    });
  };

  const toggleComissaoSelecionada = (comissaoId) => {
    setSelectedComissoesParaPagar(prev => 
      prev.includes(comissaoId)
        ? prev.filter(id => id !== comissaoId)
        : [...prev, comissaoId]
    );
  };

  const toggleTodas = () => {
    const comissoesAPagar = filteredComissoesRecebidas.filter(c => c.tipo === 'pagar');
    if (selectedComissoesParaPagar.length === comissoesAPagar.length) {
      setSelectedComissoesParaPagar([]);
    } else {
      setSelectedComissoesParaPagar(comissoesAPagar.map(c => c.id));
    }
  };

  const totalSelecionado = filteredComissoesRecebidas
    .filter(c => selectedComissoesParaPagar.includes(c.id))
    .reduce((acc, c) => acc + parseFloat(c.valor), 0);

  // Agrupar comissões por venda/parcela para exibir lado a lado
  const comissoesAgrupadas = React.useMemo(() => {
    const grupos = {};
    
    filteredComissoesRecebidas.forEach(c => {
      const match = c.observacoes?.match(/Parcela (\d+)/);
      const parcela = match ? match[1] : 'N/A';
      const key = `${c.venda_id}-${parcela}`;
      
      if (!grupos[key]) {
        grupos[key] = {
          venda_id: c.venda_id,
          parcela: parcela,
          data: c.data_recebimento || c.created_date,
          vendedor_nome: c.usuario_nome,
          vendedor_id: c.usuario_id,
          administradora_id: c.administradora_id,
          recebido: null,
          pagar: null
        };
      }
      
      if (c.tipo === 'receber') {
        grupos[key].recebido = c;
      } else if (c.tipo === 'pagar') {
        grupos[key].pagar = c;
      }
    });
    
    return Object.values(grupos).sort((a, b) => new Date(b.data) - new Date(a.data));
  }, [filteredComissoesRecebidas]);

  // Agrupar comissões por vendedor
  const comissoesPorVendedor = React.useMemo(() => {
    const porVendedor = {};
    
    comissoesAgrupadas.forEach(comissao => {
      const vendedorId = comissao.vendedor_id || 'sem_vendedor';
      if (!porVendedor[vendedorId]) {
        porVendedor[vendedorId] = {
          vendedor_nome: comissao.vendedor_nome || 'Sem vendedor',
          vendedor_id: vendedorId,
          comissoes: []
        };
      }
      porVendedor[vendedorId].comissoes.push(comissao);
    });
    
    // Ordenar vendedores por nome
    return Object.values(porVendedor).sort((a, b) => 
      a.vendedor_nome.localeCompare(b.vendedor_nome)
    );
  }, [comissoesAgrupadas]);

  const historicoColumns = [
    ...(isAdmin ? [{
      header: () => (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedComissoesParaPagar.length === comissoesAgrupadas.filter(g => g.pagar).length && comissoesAgrupadas.filter(g => g.pagar).length > 0}
            onCheckedChange={() => {
              const comissoesAPagar = comissoesAgrupadas.filter(g => g.pagar).map(g => g.pagar.id);
              if (selectedComissoesParaPagar.length === comissoesAPagar.length) {
                setSelectedComissoesParaPagar([]);
              } else {
                setSelectedComissoesParaPagar(comissoesAPagar);
              }
            }}
          />
        </div>
      ),
      className: 'w-12',
      cell: (row) => row.pagar ? (
        <Checkbox
          checked={selectedComissoesParaPagar.includes(row.pagar.id)}
          onCheckedChange={() => toggleComissaoSelecionada(row.pagar.id)}
        />
      ) : null
    }] : []),
    {
      header: 'Data',
      cell: (row) => format(new Date(row.data), 'dd/MM/yyyy')
    },
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
      cell: (row) => row.vendedor_nome || '-'
    },
    {
      header: 'Parcela',
      cell: (row) => row.parcela
    },
    ...(isAdmin ? [{
      header: 'Recebido ADM',
      cell: (row) => row.recebido ? (
        <span className="font-semibold text-blue-600">
          {formatCurrency(row.recebido.valor)}
        </span>
      ) : (
        <span className="text-slate-400">-</span>
      )
    }] : []),
    {
      header: isAdmin ? 'A Pagar Vendedor' : 'Minha Comissão',
      cell: (row) => row.pagar ? (
        <span className="font-semibold text-emerald-600">
          {formatCurrency(row.pagar.valor)}
        </span>
      ) : (
        <span className="text-slate-400">-</span>
      )
    },
    ...(isAdmin ? [{
      header: 'Saldo',
      cell: (row) => {
        const recebido = row.recebido?.valor || 0;
        const pagar = row.pagar?.valor || 0;
        const saldo = recebido - pagar;
        return (
          <span className={`font-semibold ${saldo >= 0 ? 'text-slate-600' : 'text-red-600'}`}>
            {formatCurrency(saldo)}
          </span>
        );
      }
    }] : []),
    {
      header: '',
      className: 'w-32',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(createPageUrl(`VendaDetalhes?id=${row.venda_id}`), '_blank')}
            title="Ver venda"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          {isAdmin && (row.recebido || row.pagar) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm('Tem certeza que deseja excluir este recebimento?')) {
                  // Excluir ambas comissões se existirem
                  if (row.recebido) excluirComissaoMutation.mutate(row.recebido.id);
                  if (row.pagar) excluirComissaoMutation.mutate(row.pagar.id);
                }
              }}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    }
  ];

  const registrarRecebimentoManualMutation = useMutation({
    mutationFn: async (data) => {
      const venda = vendas.find(v => v.id === data.venda_id);
      const usuario = usuarios.find(u => u.id === data.usuario_id);
      
      if (!venda || !usuario) {
        throw new Error('Venda ou usuário não encontrado');
      }

      const user = await base44.auth.me();
      const parcelasProcessadas = [];

      // Processar cada parcela
      for (const parcelaInfo of data.parcelas) {
        // Buscar ou criar parcela
        const parcelasExistentes = await base44.entities.Parcela.filter({ 
          venda_id: data.venda_id,
          numero_parcela: parseInt(parcelaInfo.numero_parcela)
        });

        let parcela;
        if (parcelasExistentes.length > 0) {
          // Atualizar parcela existente
          parcela = parcelasExistentes[0];
          await base44.entities.Parcela.update(parcela.id, {
            status: 'recebida',
            valor_recebido: parseFloat(parcelaInfo.valor),
            data_recebimento: data.data_recebimento
          });
        } else {
          // Criar nova parcela
          parcela = await base44.entities.Parcela.create({
            venda_id: data.venda_id,
            numero_parcela: parseInt(parcelaInfo.numero_parcela),
            valor_previsto: parseFloat(parcelaInfo.valor),
            valor_recebido: parseFloat(parcelaInfo.valor),
            data_recebimento: data.data_recebimento,
            status: 'recebida'
          });
        }

        // Criar comissão de recebimento (da administradora)
        const comissaoRecebimento = await base44.entities.Comissao.create({
          venda_id: data.venda_id,
          parcela_id: parcela.id,
          usuario_id: data.usuario_id,
          usuario_nome: usuario.full_name,
          usuario_perfil: usuario.perfil,
          tipo_comissao: 'parcela',
          tipo: 'receber',
          valor: parseFloat(parcelaInfo.valor),
          percentual: parseFloat(data.percentual || 0),
          status: 'confirmada',
          data_recebimento: data.data_recebimento,
          administradora_id: data.administradora_id || venda.administradora_id,
          observacoes: `Parcela ${parcelaInfo.numero_parcela} - Recebido${data.observacoes ? ' - ' + data.observacoes : ''}`
        });

        // Criar comissão a pagar (ao vendedor) se valor especificado
        if (parcelaInfo.valor_pagar_vendedor && parseFloat(parcelaInfo.valor_pagar_vendedor) > 0) {
          await base44.entities.Comissao.create({
            venda_id: data.venda_id,
            parcela_id: parcela.id,
            usuario_id: data.usuario_id,
            usuario_nome: usuario.full_name,
            usuario_perfil: usuario.perfil,
            tipo_comissao: 'parcela',
            tipo: 'pagar',
            valor: parseFloat(parcelaInfo.valor_pagar_vendedor),
            percentual: parseFloat(data.percentual || 0),
            status: 'confirmada',
            data_recebimento: data.data_recebimento,
            administradora_id: data.administradora_id || venda.administradora_id,
            observacoes: `Parcela ${parcelaInfo.numero_parcela} - A Pagar${data.observacoes ? ' - ' + data.observacoes : ''}`
          });

          // Atualizar saldo do usuário com o valor a pagar
          const usuarioData = await base44.entities.User.filter({ id: data.usuario_id });
          if (usuarioData.length > 0) {
            const saldoAtual = usuarioData[0].saldo_comissao || 0;
            await base44.entities.User.update(data.usuario_id, {
              saldo_comissao: saldoAtual + parseFloat(parcelaInfo.valor_pagar_vendedor)
            });
          }
        }

        parcelasProcessadas.push(parcelaInfo.numero_parcela);
      }

      // Atualizar total recebido na venda
      const comissoesVenda = await base44.entities.Comissao.filter({ 
        venda_id: data.venda_id,
        status: 'confirmada'
      });
      const totalRecebido = comissoesVenda.reduce((acc, c) => acc + parseFloat(c.valor), 0);
      await base44.entities.Venda.update(data.venda_id, {
        comissao_total_recebida: totalRecebido
      });

      // Auditoria
      await base44.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Registro manual de ${parcelasProcessadas.length} parcela(s): ${parcelasProcessadas.join(', ')}`,
        entidade: 'Comissao',
        dados_novos: JSON.stringify(data),
        tipo: 'recebimento'
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comissoes-previstas'] });
      queryClient.invalidateQueries({ queryKey: ['comissoes-recebidas'] });
      queryClient.invalidateQueries({ queryKey: ['parcelas'] });
      queryClient.invalidateQueries({ queryKey: ['comissoes'] });
      setManualFormOpen(false);
      resetManualForm();
      const qtdParcelas = variables.parcelas.length;
      toast.success(`${qtdParcelas} parcela(s) registrada(s) com sucesso!`);
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

  const adicionarParcela = () => {
    setParcelas([...parcelas, { numero_parcela: '', valor: '', valor_pagar_vendedor: '' }]);
  };

  const removerParcela = (index) => {
    if (parcelas.length === 1) {
      toast.error('Deve haver pelo menos uma parcela');
      return;
    }
    setParcelas(parcelas.filter((_, i) => i !== index));
  };

  const atualizarParcela = (index, field, value) => {
    const novasParcelas = [...parcelas];
    novasParcelas[index][field] = value;
    setParcelas(novasParcelas);
  };

  const handleRegistrarManual = () => {
    // Validações básicas
    if (!manualFormData.venda_id) {
      toast.error('Selecione um contrato/venda');
      return;
    }
    if (!manualFormData.usuario_id) {
      toast.error('Selecione um vendedor');
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

    // Validar parcelas
    const parcelasValidas = parcelas.filter(p => 
      p.numero_parcela && p.valor && parseFloat(p.valor) > 0
    );

    if (parcelasValidas.length === 0) {
      toast.error('Informe pelo menos uma parcela válida');
      return;
    }

    // Verificar parcelas duplicadas
    const numerosParcelas = parcelasValidas.map(p => p.numero_parcela);
    const duplicadas = numerosParcelas.filter((item, index) => numerosParcelas.indexOf(item) !== index);
    if (duplicadas.length > 0) {
      toast.error(`Parcelas duplicadas: ${duplicadas.join(', ')}`);
      return;
    }

    // Validar valores a pagar
    for (const parcela of parcelasValidas) {
      if (parcela.valor_pagar_vendedor && parseFloat(parcela.valor_pagar_vendedor) > parseFloat(parcela.valor)) {
        toast.error(`Parcela ${parcela.numero_parcela}: Valor a pagar não pode ser maior que o valor recebido`);
        return;
      }
    }

    // Submeter com as parcelas válidas
    registrarRecebimentoManualMutation.mutate({
      ...manualFormData,
      parcelas: parcelasValidas
    });
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

      {/* Table Comissões Previstas */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Comissões Previstas</h2>
        <DataTable
          columns={columns}
          data={filteredComissoes}
          isLoading={isLoading}
          emptyMessage="Nenhuma comissão prevista encontrada"
        />
      </div>

      {/* Histórico de Recebimentos */}
      <div className="space-y-6 mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            {isAdmin ? 'Histórico de Comissões' : 'Minhas Comissões'}
          </h2>
          {isAdmin && selectedComissoesParaPagar.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-600">
                {selectedComissoesParaPagar.length} selecionada{selectedComissoesParaPagar.length > 1 ? 's' : ''} • 
                <span className="font-semibold text-emerald-600 ml-1">
                  {formatCurrency(totalSelecionado)}
                </span>
              </div>
              <Button
                onClick={() => setPagarFormOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Registrar Pagamento
              </Button>
            </div>
          )}
        </div>

        {comissoesPorVendedor.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            {isAdmin ? "Nenhuma comissão registrada" : "Nenhuma comissão disponível"}
          </div>
        ) : (
          <div className="space-y-6">
            {comissoesPorVendedor.map((vendedorData) => (
              <div key={vendedorData.vendedor_id} className="space-y-3">
                {/* Título do Vendedor */}
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-[#1e3a5f] to-[#2a4a73] rounded-lg border border-[#1e3a5f]/20">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <UserCircle className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-white">
                      {vendedorData.vendedor_nome}
                    </h3>
                    <p className="text-xs text-white/70">
                      {vendedorData.comissoes.length} comissão{vendedorData.comissoes.length > 1 ? 'ões' : ''} • 
                      Total: {formatCurrency(vendedorData.comissoes.reduce((acc, c) => 
                        acc + (c.pagar?.valor || 0), 0
                      ))}
                    </p>
                  </div>
                </div>

                {/* Comissões do Vendedor */}
                <DataTable
                  columns={historicoColumns}
                  data={vendedorData.comissoes}
                  emptyMessage="Nenhuma comissão"
                />
              </div>
            ))}
          </div>
        )}
      </div>

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
                <Label htmlFor="data_recebimento">Data de Recebimento *</Label>
                <Input
                  id="data_recebimento"
                  type="date"
                  value={manualFormData.data_recebimento}
                  onChange={(e) => setManualFormData({ ...manualFormData, data_recebimento: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-base font-semibold">Parcelas *</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={adicionarParcela}
                    className="gap-2"
                  >
                    <DollarSign className="w-4 h-4" />
                    Adicionar Parcela
                  </Button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-4 bg-slate-50">
                  {parcelas.map((parcela, index) => (
                    <div key={index} className="relative p-4 bg-white border rounded-lg space-y-3">
                      {parcelas.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => removerParcela(index)}
                          className="absolute top-2 right-2 h-6 w-6 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Nº Parcela *</Label>
                          <Input
                            type="number"
                            value={parcela.numero_parcela}
                            onChange={(e) => atualizarParcela(index, 'numero_parcela', e.target.value)}
                            placeholder="Ex: 1"
                            className="h-9"
                          />
                        </div>

                        <div className="col-span-2">
                          <Label className="text-xs text-blue-900">💰 Recebido ADM (R$) *</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={parcela.valor}
                            onChange={(e) => atualizarParcela(index, 'valor', e.target.value)}
                            placeholder="0,00"
                            className="h-9 border-blue-300"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-emerald-900">💵 A Pagar Vendedor (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={parcela.valor_pagar_vendedor}
                          onChange={(e) => {
                            const valorPagar = parseFloat(e.target.value) || 0;
                            const valorRecebido = parseFloat(parcela.valor) || 0;
                            
                            if (valorPagar > valorRecebido && valorRecebido > 0) {
                              toast.error('Valor a pagar não pode ser maior que o valor recebido');
                              return;
                            }
                            
                            atualizarParcela(index, 'valor_pagar_vendedor', e.target.value);
                          }}
                          placeholder="0,00"
                          className="h-9 border-emerald-300"
                        />
                      </div>

                      {parcela.valor && parcela.valor_pagar_vendedor && (
                        <div className="text-xs text-slate-600 pt-2 border-t">
                          Saldo: <span className="font-semibold">
                            {formatCurrency(parseFloat(parcela.valor) - parseFloat(parcela.valor_pagar_vendedor))}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 mt-2">
                  📌 Total: {parcelas.filter(p => p.valor && parseFloat(p.valor) > 0).length} parcela(s) • 
                  Recebido: {formatCurrency(parcelas.reduce((acc, p) => acc + (parseFloat(p.valor) || 0), 0))} • 
                  A Pagar: {formatCurrency(parcelas.reduce((acc, p) => acc + (parseFloat(p.valor_pagar_vendedor) || 0), 0))}
                </p>
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

      {/* Modal de Pagamento em Lote */}
      <Dialog open={pagarFormOpen} onOpenChange={setPagarFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento de Comissões</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Resumo das selecionadas */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Comissões Selecionadas:</span>
                <span className="font-medium">{selectedComissoesParaPagar.length}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-2">
                <span className="text-slate-600">Total a Pagar:</span>
                <span className="font-bold text-emerald-600 text-lg">{formatCurrency(totalSelecionado)}</span>
              </div>
            </div>

            {/* Lista de comissões */}
            <div className="max-h-48 overflow-y-auto border rounded-lg p-3 space-y-2">
              {filteredComissoesRecebidas
                .filter(c => selectedComissoesParaPagar.includes(c.id))
                .map(c => (
                  <div key={c.id} className="flex justify-between text-sm p-2 bg-slate-50 rounded">
                    <span>{c.usuario_nome} - {getVendaInfo(c.venda_id)}</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(c.valor)}</span>
                  </div>
                ))}
            </div>

            {/* Formulário */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="data_pagamento_lote">Data de Pagamento *</Label>
                <Input
                  id="data_pagamento_lote"
                  type="date"
                  value={pagarFormData.data_pagamento}
                  onChange={(e) => setPagarFormData({ ...pagarFormData, data_pagamento: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="observacoes_lote">Observações</Label>
                <Textarea
                  id="observacoes_lote"
                  value={pagarFormData.observacoes}
                  onChange={(e) => setPagarFormData({ ...pagarFormData, observacoes: e.target.value })}
                  placeholder="Informações sobre o pagamento..."
                  rows={3}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setPagarFormOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handlePagarSelecionadas}
                disabled={pagarComissoesMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {pagarComissoesMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Confirmar Pagamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}