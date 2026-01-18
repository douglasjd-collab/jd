import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/PageHeader';
import { Search, DollarSign, CheckCircle2, Eye, Receipt } from 'lucide-react';
import { toast } from 'react-hot-toast';
import moment from 'moment';

// Componente separado para cada linha da tabela
function ComissaoRow({ comissao, isAdmin, isSelected, onToggleSelect, onVerRecebimento, editingId, editingValue, editingError, onStartEditing, onSaveEditing, onKeyDown, onEditingValueChange }) {
  const [valorCarta, setValorCarta] = useState(null);
  
  useEffect(() => {
    if (comissao.venda_id) {
      base44.entities.Venda.filter({ id: comissao.venda_id })
        .then(vendas => {
          if (vendas.length > 0) {
            setValorCarta(vendas[0].valorCredito);
          }
        })
        .catch(() => setValorCarta(null));
    }
  }, [comissao.venda_id]);
  
  const isPagar = comissao.status_pagamento === 'a_pagar';
  
  return (
    <tr className="border-b hover:bg-slate-50">
      <td className="p-4">
        {isPagar && isAdmin ? (
          <Checkbox 
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(comissao.id)}
          />
        ) : (
          <div className="w-4" />
        )}
      </td>
      <td className="p-4 text-sm">{comissao.cliente_nome || '-'}</td>
      <td className="p-4 text-sm">
        {comissao.grupo && comissao.cota ? `${comissao.grupo}/${comissao.cota}` : comissao.contrato || '-'}
      </td>
      <td className="p-4 text-sm">
        {comissao.parcela_numero ? `${comissao.parcela_numero}º` : '-'}
      </td>
      <td className="p-4 text-sm text-purple-600 font-medium">
        {valorCarta ? valorCarta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}
      </td>
      <td className="p-4 text-sm">
        {comissao.data_recebimento && moment(comissao.data_recebimento).isValid() 
          ? moment(comissao.data_recebimento).format('DD/MM/YYYY') 
          : '-'}
      </td>
      <td className="p-4 font-semibold text-blue-600">
        {(comissao.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </td>
      <td className="p-4">
        {editingId === comissao.id ? (
          <div className="flex flex-col gap-1">
            <div className={`inline-flex items-center bg-white rounded-md border ${editingError ? 'border-red-500' : 'border-slate-300'} px-2 py-1`}>
              <Input
                type="number"
                value={editingValue}
                onChange={(e) => onEditingValueChange(e.target.value)}
                onBlur={() => onSaveEditing(comissao.id)}
                onKeyDown={(e) => onKeyDown(e, comissao.id)}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="w-12 h-6 text-sm border-0 p-0 focus-visible:ring-0"
                min="0"
                max="100"
              />
              <span className="text-sm font-medium text-slate-600 ml-1">%</span>
            </div>
            {editingError && (
              <span className="text-xs text-red-600">{editingError}</span>
            )}
          </div>
        ) : (
          <div 
            className={`inline-flex items-center rounded-md border px-2 py-1 min-w-[60px] ${
              isPagar && isAdmin
                ? 'bg-white border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors'
                : 'bg-slate-100 border-slate-200 cursor-default'
            }`}
            onClick={() => isPagar && isAdmin && onStartEditing(comissao)}
            title={isPagar && isAdmin ? 'Clique para editar o percentual de comissão' : ''}
          >
            <span className="font-medium text-sm">{comissao.percentual_comissao || 0}%</span>
          </div>
        )}
      </td>
      <td className="p-4 font-bold text-green-600">
        {(comissao.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </td>
      <td className="p-4">
        {comissao.status_pagamento === 'paga' ? (
          <Badge className="bg-green-100 text-green-800">Paga</Badge>
        ) : (
          <Badge className="bg-orange-100 text-orange-800">A Pagar</Badge>
        )}
      </td>
      <td className="p-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onVerRecebimento(comissao)}
          title="Ver recebimento original"
        >
          <Eye className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}

export default function ComissoesPagar() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('a_pagar');
  const [mesFilter, setMesFilter] = useState('todos');
  const [vendedorSelecionado, setVendedorSelecionado] = useState(null);
  const [itensSelecionados, setItensSelecionados] = useState(new Set());
  const [pagarLoteModal, setPagarLoteModal] = useState(false);
  const [verRecebimentoModal, setVerRecebimentoModal] = useState(false);
  const [recebimentoDetalhes, setRecebimentoDetalhes] = useState(null);
  const [formaPagamento, setFormaPagamento] = useState('PIX');
  const [observacao, setObservacao] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingError, setEditingError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    if (me.role === 'super_admin') {
      setUser({ ...me, perfil: 'super_admin', empresa_id: null });
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) {
        const colab = colabs[0];
        setUser({ ...me, perfil: colab.perfil, empresa_id: colab.empresa_id, colaborador_id: colab.id, id: me.id });
      }
    }
  };

  // Buscar vendedores
  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedores', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      return await base44.entities.Colaborador.filter({ 
        empresa_id: user.empresa_id, 
        status: 'ativo',
        perfil: 'vendedor'
      });
    },
    enabled: !!user && ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil),
  });

  // Sincronizar RecebimentoComissao -> ComissaoAPagar
  const sincronizarComissoes = async () => {
    try {
      const recebimentos = await base44.entities.RecebimentoComissao.filter({});
      const comissoesExistentes = await base44.entities.ComissaoAPagar.filter({});
      const recebimentosJaProcessados = new Set(comissoesExistentes.map(c => c.recebimento_id));
      
      const novosRegistros = recebimentos.filter(r => !recebimentosJaProcessados.has(r.id));
      
      for (const rec of novosRegistros) {
        const valorAPagar = rec.valor_recebido * (rec.percentual_comissao || 100) / 100;
        
        await base44.entities.ComissaoAPagar.create({
          empresa_id: rec.empresa_id,
          recebimento_id: rec.id,
          venda_id: rec.venda_id,
          cliente_id: rec.cliente_id,
          cliente_nome: rec.cliente_nome,
          vendedor_id: rec.vendedor_id,
          vendedor_nome: rec.vendedor_nome,
          administradora_id: rec.administradora_id,
          administradora_nome: rec.administradora_nome,
          grupo: rec.grupo,
          cota: rec.cota,
          contrato: rec.contrato,
          parcela_numero: rec.parcela_informada,
          data_recebimento: rec.data_recebimento,
          valor_recebido: rec.valor_recebido,
          percentual_comissao: rec.percentual_comissao || 100,
          valor_a_pagar: valorAPagar,
          status_pagamento: rec.status_pagamento || 'a_pagar'
        });
      }
    } catch (error) {
      console.error('Erro ao sincronizar comissões:', error);
    }
  };

  const { data: comissoes = [], isLoading } = useQuery({
    queryKey: ['comissoes-a-pagar'],
    queryFn: async () => {
      await sincronizarComissoes();
      return await base44.entities.ComissaoAPagar.filter({});
    },
    enabled: !!user,
  });

  const updatePercentualMutation = useMutation({
    mutationFn: async ({ id, percentual }) => {
      const comissao = comissoes.find(c => c.id === id);
      const novoValor = (comissao.valor_recebido * percentual) / 100;
      return await base44.entities.ComissaoAPagar.update(id, {
        percentual_comissao: percentual,
        valor_a_pagar: novoValor
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['comissoes-a-pagar']);
      toast.success('Percentual atualizado!');
    },
  });

  const pagarLoteMutation = useMutation({
    mutationFn: async ({ comissoesIds, data_pagamento, forma_pagamento, observacao }) => {
      const comissoesParaPagar = comissoes.filter(c => comissoesIds.includes(c.id));
      const avisos = [];
      const pagasAgora = [];

      // Gerar código do lote
      const lotes = await base44.entities.PagamentoComissaoLote.filter({ empresa_id: user.empresa_id });
      const loteCode = `EMPAY${String(lotes.length + 1).padStart(4, '0')}`;

      // Pagar cada comissão
      for (const comissao of comissoesParaPagar) {
        if (comissao.status_pagamento !== 'a_pagar') {
          avisos.push(`Item já pago, ignorado: ${comissao.grupo}/${comissao.cota} parcela ${comissao.parcela_numero}`);
          continue;
        }

        await base44.entities.ComissaoAPagar.update(comissao.id, {
          status_pagamento: 'paga',
          data_pagamento,
          forma_pagamento,
          observacao,
        });

        pagasAgora.push(comissao);
      }

      // Buscar valores da carta para o relatório
      const comissoesComValorCarta = await Promise.all(
        pagasAgora.map(async (c) => {
          let valorCarta = null;
          if (c.venda_id) {
            try {
              const vendas = await base44.entities.Venda.filter({ id: c.venda_id });
              if (vendas.length > 0) {
                valorCarta = vendas[0].valorCredito;
              }
            } catch (e) {
              console.error('Erro ao buscar valor carta:', e);
            }
          }
          return { ...c, valorCarta };
        })
      );

      // Gerar relatório HTML
      const relatorioHtml = gerarRelatorioHtml(comissoesComValorCarta, vendedorSelecionado, data_pagamento, forma_pagamento, user);

      // Registrar o lote
      const totalPago = pagasAgora.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
      
      await base44.entities.PagamentoComissaoLote.create({
        empresa_id: user.empresa_id,
        lote_code: loteCode,
        vendedor_id: vendedorSelecionado.id,
        vendedor_nome: vendedorSelecionado.nome,
        data_pagamento,
        forma_pagamento,
        total_itens: pagasAgora.length,
        total_pago: totalPago,
        observacao,
        gerado_por_id: user.colaborador_id,
        gerado_por_nome: user.full_name,
        comissoes_ids: JSON.stringify(pagasAgora.map(c => c.id)),
        relatorio_html: relatorioHtml,
        email_enviado: false,
        email_vendedor: vendedorSelecionado.email || null,
      });

      // Enviar e-mail ao vendedor
      if (vendedorSelecionado.email) {
        try {
          await base44.integrations.Core.SendEmail({
            to: vendedorSelecionado.email,
            subject: `Pagamento de comissão - ${moment(data_pagamento).format('DD/MM/YYYY')}`,
            body: relatorioHtml,
          });
          
          // Atualizar status de envio
          const lotesAtualizados = await base44.entities.PagamentoComissaoLote.filter({ lote_code: loteCode });
          if (lotesAtualizados.length > 0) {
            await base44.entities.PagamentoComissaoLote.update(lotesAtualizados[0].id, {
              email_enviado: true
            });
          }
        } catch (emailError) {
          console.error('Erro ao enviar e-mail:', emailError);
          avisos.push('Relatório gerado, mas não foi possível enviar por e-mail.');
        }
      } else {
        avisos.push('Vendedor sem e-mail cadastrado. Relatório gerado, mas não enviado.');
      }

      return { pagasAgora: comissoesComValorCarta, avisos, relatorioHtml };
    },
    onSuccess: ({ pagasAgora, avisos, relatorioHtml }) => {
      queryClient.invalidateQueries(['comissoes-a-pagar']);
      toast.success(`${pagasAgora.length} comissões pagas com sucesso!`);
      if (avisos.length > 0) {
        avisos.forEach(aviso => toast(aviso, { icon: '⚠️' }));
      }
      
      // Abrir relatório em nova janela
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(relatorioHtml);
        win.document.close();
      }
      
      setPagarLoteModal(false);
      setItensSelecionados(new Set());
      setFormaPagamento('PIX');
      setObservacao('');
    },
  });

  const gerarRelatorioHtml = (comissoes, vendedor, dataPagamento, formaPagamento, geradoPor) => {
    const totalPago = comissoes.reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Pagamento de Comissão</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { color: #10353C; margin-bottom: 5px; }
          .info { margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 8px; }
          .info-item { margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #10353C; color: white; }
          .total { font-weight: bold; background-color: #f0f0f0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Relatório de Pagamento de Comissão</h1>
        </div>
        
        <div class="info">
          <div class="info-item"><strong>Vendedor:</strong> ${vendedor.nome}</div>
          <div class="info-item"><strong>Data do Pagamento:</strong> ${moment(dataPagamento).format('DD/MM/YYYY')}</div>
          <div class="info-item"><strong>Forma de Pagamento:</strong> ${formaPagamento}</div>
          <div class="info-item"><strong>Quantidade de itens:</strong> ${comissoes.length}</div>
          <div class="info-item"><strong>Total Pago:</strong> ${totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Grupo/Cota</th>
              <th>Parcela</th>
              <th>Valor da Carta</th>
              <th>Data Rec.</th>
              <th>Valor Recebido</th>
              <th>%</th>
              <th>Valor Pago</th>
            </tr>
          </thead>
          <tbody>
            ${comissoes.map(c => `
              <tr>
                <td>${c.cliente_nome || '-'}</td>
                <td>${c.grupo && c.cota ? `${c.grupo}/${c.cota}` : c.contrato || '-'}</td>
                <td>${c.parcela_numero ? `${c.parcela_numero}º` : '-'}</td>
                <td>${c.valorCarta ? c.valorCarta.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'}</td>
                <td>${c.data_recebimento ? moment(c.data_recebimento).format('DD/MM/YYYY') : '-'}</td>
                <td>${(c.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>${c.percentual_comissao}%</td>
                <td>${(c.valor_a_pagar || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              </tr>
            `).join('')}
            <tr class="total">
              <td colspan="7" style="text-align: right;"><strong>Total Pago:</strong></td>
              <td><strong>${totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></td>
            </tr>
          </tbody>
        </table>
        
        <div class="footer">
          Relatório gerado por ${geradoPor.full_name} em ${moment().format('DD/MM/YYYY HH:mm')}<br>
          Gerado automaticamente pelo sistema
        </div>
      </body>
      </html>
    `;
  };

  const handleVerRecebimento = async (comissao) => {
    if (comissao.recebimento_id) {
      try {
        const recebimentos = await base44.entities.RecebimentoComissao.filter({ id: comissao.recebimento_id });
        if (recebimentos.length > 0) {
          setRecebimentoDetalhes(recebimentos[0]);
          setVerRecebimentoModal(true);
        }
      } catch (e) {
        toast.error('Erro ao carregar recebimento');
      }
    }
  };

  const startEditing = (comissao) => {
    setEditingId(comissao.id);
    setEditingValue(String(comissao.percentual_comissao || 0));
    setEditingError('');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingValue('');
    setEditingError('');
  };

  const saveEditing = (comissaoId) => {
    const percentual = parseFloat(editingValue);
    if (isNaN(percentual) || percentual < 0 || percentual > 100) {
      setEditingError('Percentual inválido (0–100)');
      return;
    }
    updatePercentualMutation.mutate({ id: comissaoId, percentual });
    cancelEditing();
  };

  const handleKeyDown = (e, comissaoId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditing(comissaoId);
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  const handlePagarLote = () => {
    if (itensSelecionados.size === 0) return;
    
    pagarLoteMutation.mutate({
      comissoesIds: Array.from(itensSelecionados),
      data_pagamento: moment().format('YYYY-MM-DD'),
      forma_pagamento: formaPagamento,
      observacao,
    });
  };

  const toggleSelectItem = (id) => {
    const newSet = new Set(itensSelecionados);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setItensSelecionados(newSet);
  };

  const toggleSelectAll = () => {
    const aPagarVisiveis = filtered.filter(c => c.status_pagamento === 'a_pagar');
    if (itensSelecionados.size === aPagarVisiveis.length && aPagarVisiveis.length > 0) {
      setItensSelecionados(new Set());
    } else {
      setItensSelecionados(new Set(aPagarVisiveis.map(c => c.id)));
    }
  };

  const filtered = comissoes.filter((c) => {
    // Filtro por vendedor selecionado
    if (vendedorSelecionado && c.vendedor_id !== vendedorSelecionado.id) {
      return false;
    }

    // Se é vendedor, só vê suas comissões
    if (user?.perfil === 'vendedor' && c.vendedor_id !== user?.id) {
      return false;
    }

    // Filtro por empresa
    if (user?.empresa_id && c.empresa_id !== user?.empresa_id) {
      return false;
    }

    // Filtro por status
    if (statusFilter !== 'todos' && c.status_pagamento !== statusFilter) {
      return false;
    }

    // Filtro por mês
    if (mesFilter !== 'todos' && c.data_recebimento) {
      const mes = moment(c.data_recebimento).format('YYYY-MM');
      if (mes !== mesFilter) return false;
    }

    // Filtro por busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        c.cliente_nome?.toLowerCase().includes(term) ||
        c.grupo?.toLowerCase().includes(term) ||
        c.cota?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const totalAPagar = filtered
    .filter((c) => c.status_pagamento === 'a_pagar')
    .reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  const totalSelecionado = Array.from(itensSelecionados)
    .map(id => comissoes.find(c => c.id === id))
    .filter(Boolean)
    .reduce((acc, c) => acc + (c.valor_a_pagar || 0), 0);

  const mesesDisponiveis = [...new Set(comissoes.map((c) => 
    c.data_recebimento ? moment(c.data_recebimento).format('YYYY-MM') : null
  ).filter(Boolean))].sort().reverse();

  const isAdmin = ['master', 'super_admin', 'admin', 'gerente'].includes(user?.perfil);
  const aPagarVisiveis = filtered.filter(c => c.status_pagamento === 'a_pagar');
  const allSelected = aPagarVisiveis.length > 0 && itensSelecionados.size === aPagarVisiveis.length;

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }

  // Se é vendedor, selecionar automaticamente
  useEffect(() => {
    if (user?.perfil === 'vendedor' && user?.colaborador_id && !vendedorSelecionado) {
      const vendedor = { id: user.id, nome: user.full_name, email: user.email };
      setVendedorSelecionado(vendedor);
    }
  }, [user, vendedorSelecionado]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Comissões a Pagar"
        subtitle="Gerenciar pagamento de comissões aos vendedores"
      />

      {/* Seletor de Vendedor (obrigatório) */}
      {isAdmin && (
        <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="space-y-4">
            <div>
              <Label className="text-lg font-semibold mb-2 block">Vendedor *</Label>
              <Select 
                value={vendedorSelecionado?.id || ''} 
                onValueChange={(id) => {
                  const v = vendedores.find(ven => ven.id === id);
                  setVendedorSelecionado(v);
                  setItensSelecionados(new Set());
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecione um vendedor para visualizar comissões" />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {vendedorSelecionado && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-slate-500 mb-1">Total Selecionado</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {totalSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{itensSelecionados.size} item(ns) selecionado(s)</p>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border">
                  <p className="text-sm text-slate-500 mb-1">Total a Pagar</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {totalAPagar.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{aPagarVisiveis.length} comissão(ões) pendente(s)</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {!vendedorSelecionado && isAdmin && (
        <Card className="p-8 text-center">
          <p className="text-slate-500">Selecione um vendedor para visualizar as comissões</p>
        </Card>
      )}

      {vendedorSelecionado && (
        <>
          {/* Botão Gerar Pagamento */}
          {itensSelecionados.size > 0 && isAdmin && (
            <Card className="p-4 mb-6 bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-900">
                    {itensSelecionados.size} item(ns) selecionado(s)
                  </p>
                  <p className="text-sm text-green-700">
                    Total: {totalSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <Button 
                  onClick={() => setPagarLoteModal(true)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Receipt className="w-4 h-4 mr-2" />
                  Gerar Pagamento
                </Button>
              </div>
            </Card>
          )}

          {/* Filters */}
          <Card className="p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Buscar por cliente, grupo ou cota..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="a_pagar">A Pagar</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                </SelectContent>
              </Select>
              <Select value={mesFilter} onValueChange={setMesFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {mesesDisponiveis.map((mes) => (
                    <SelectItem key={mes} value={mes}>
                      {moment(mes).format('MMMM/YYYY')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-semibold text-slate-700">
                      {isAdmin && aPagarVisiveis.length > 0 && (
                        <Checkbox 
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                        />
                      )}
                    </th>
                    <th className="text-left p-4 font-semibold text-slate-700">Cliente</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Grupo/Cota</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Parcela</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Valor da Carta</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Data Rec.</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Valor Recebido</th>
                    <th className="text-left p-4 font-semibold text-slate-700">% Comissão</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Valor a Pagar</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Status</th>
                    <th className="text-left p-4 font-semibold text-slate-700">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">
                        Carregando...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500">
                        Nenhuma comissão encontrada
                      </td>
                    </tr>
                  ) : (
                    filtered.map((comissao) => (
                      <ComissaoRow
                        key={comissao.id}
                        comissao={comissao}
                        isAdmin={isAdmin}
                        isSelected={itensSelecionados.has(comissao.id)}
                        onToggleSelect={toggleSelectItem}
                        onVerRecebimento={handleVerRecebimento}
                        editingId={editingId}
                        editingValue={editingValue}
                        editingError={editingError}
                        onStartEditing={startEditing}
                        onSaveEditing={saveEditing}
                        onKeyDown={handleKeyDown}
                        onEditingValueChange={setEditingValue}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Modal Ver Recebimento */}
      <Dialog open={verRecebimentoModal} onOpenChange={setVerRecebimentoModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Recebimento Original</DialogTitle>
          </DialogHeader>
          {recebimentoDetalhes && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-slate-500">Cliente</Label>
                  <p className="font-medium">{recebimentoDetalhes.cliente_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Vendedor</Label>
                  <p className="font-medium">{recebimentoDetalhes.vendedor_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Administradora</Label>
                  <p className="font-medium">{recebimentoDetalhes.administradora_nome}</p>
                </div>
                <div>
                  <Label className="text-slate-500">Grupo/Cota</Label>
                  <p className="font-medium">
                    {recebimentoDetalhes.grupo}/{recebimentoDetalhes.cota}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Data Recebimento</Label>
                  <p className="font-medium">
                    {recebimentoDetalhes.data_recebimento && moment(recebimentoDetalhes.data_recebimento).isValid()
                      ? moment(recebimentoDetalhes.data_recebimento).format('DD/MM/YYYY')
                      : '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500">Valor Recebido</Label>
                  <p className="font-bold text-blue-600">
                    {(recebimentoDetalhes.valor_recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setVerRecebimentoModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Pagar Lote */}
      <Dialog open={pagarLoteModal} onOpenChange={setPagarLoteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento em Lote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Vendedor:</span>
                <span className="font-semibold">{vendedorSelecionado?.nome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Quantidade de itens:</span>
                <span className="font-medium">{itensSelecionados.size}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-slate-600 font-semibold">Total a Pagar:</span>
                <span className="font-bold text-green-600 text-lg">
                  {totalSelecionado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>

            <div>
              <Label>Forma de Pagamento *</Label>
              <Select value={formaPagamento} onValueChange={setFormaPagamento}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Informações adicionais sobre o pagamento..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarLoteModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handlePagarLote} className="bg-green-600 hover:bg-green-700">
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}