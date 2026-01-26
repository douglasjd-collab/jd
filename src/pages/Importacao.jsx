import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Trash2,
  FileUp
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ImportarPlanosCanopusPDF from '@/components/planos/ImportarPlanosCanopusPDF';

export default function Importacao() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [importPlanosOpen, setImportPlanosOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const deleteImportMutation = useMutation({
    mutationFn: async (importId) => {
      toast.message('Excluindo importação...');
      
      // Excluir RecebimentoComissao relacionados
      const recebimentos = await base44.entities.RecebimentoComissao.filter({
        origem_importacao_id: importId
      });
      
      if (recebimentos.length > 0) {
        toast.message(`Excluindo ${recebimentos.length} recebimentos...`);
        for (const rec of recebimentos) {
          try {
            // Excluir ComissaoAPagar relacionada
            const comissoesAPagar = await base44.entities.ComissaoAPagar.filter({
              recebimento_id: rec.id
            });
            for (const com of comissoesAPagar) {
              await base44.entities.ComissaoAPagar.delete(com.id);
            }
            
            // Excluir RecebimentoComissao
            await base44.entities.RecebimentoComissao.delete(rec.id);
          } catch (e) {
            console.error('Erro ao excluir recebimento:', e);
          }
        }
      }
      
      // Excluir itens de importação
      const itens = await base44.entities.ImportacaoItem.filter({
        importacao_id: importId
      });
      
      if (itens.length > 0) {
        toast.message(`Excluindo ${itens.length} itens...`);
        for (const item of itens) {
          try {
            await base44.entities.ImportacaoItem.delete(item.id);
          } catch (e) {
            console.error('Erro ao excluir item:', e);
          }
        }
      }
      
      // Excluir importação
      await base44.entities.Importacao.delete(importId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['importacoes']);
      queryClient.invalidateQueries(['recebimentos']);
      toast.success('✅ Importação excluída com sucesso');
    },
    onError: (error) => {
      console.error('Erro ao excluir:', error);
      toast.error('Erro ao excluir importação: ' + (error?.message || 'Erro desconhecido'));
    }
  });

  const handleDelete = (importacao) => {
    if (confirm(`Tem certeza que deseja excluir esta importação?\n\n${importacao.registros_processados || 0} recebimentos serão excluídos.\nEsta ação não pode ser desfeita.`)) {
      deleteImportMutation.mutate(importacao.id);
    }
  };

  const { data: importacoes = [], isLoading } = useQuery({
    queryKey: ['importacoes'],
    queryFn: () => base44.entities.Importacao.list('-created_date'),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const { data: vendas = [] } = useQuery({
    queryKey: ['vendas'],
    queryFn: () => base44.entities.Venda.filter({ status: 'ativa' }),
  });

  const { data: parcelas = [] } = useQuery({
    queryKey: ['parcelas'],
    queryFn: () => base44.entities.Parcela.list(),
  });

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);

    try {
      // Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadedFile });

      // Processar CSV com encoding correto
      const result = await base44.functions.invoke('processarCsvComissao', {
        file_url
      });

      if (result.data.status === 'success' && result.data.items) {
        setPreviewData({
          file_url,
          items: result.data.items
        });
        toast.success(`${result.data.total} registros encontrados no arquivo`);
      } else {
        toast.error('Erro ao processar arquivo: ' + (result.data.error || 'Formato inválido'));
      }
    } catch (error) {
      toast.error('Erro ao fazer upload do arquivo');
    } finally {
      setIsProcessing(false);
    }
  };

  const processarImportacao = async () => {
    if (!previewData || !selectedAdmin) return;

    setIsProcessing(true);

    try {
      const admin = administradoras.find(a => a.id === selectedAdmin);
      
      // Criar registro de importação
      const importacao = await base44.entities.Importacao.create({
        administradora_id: selectedAdmin,
        administradora_nome: admin?.nome_fantasia || admin?.razao_social,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.full_name,
        arquivo_nome: file?.name,
        arquivo_url: previewData.file_url,
        total_registros: previewData.items.length,
        status: 'processando'
      });

      // ===== CARREGAR DADOS UMA VEZ =====
      const configVendedor = await base44.entities.ConfiguracaoComissao.filter({ 
        tipo: 'vendedor', 
        status: 'ativo' 
      });
      const percentualPadrao = configVendedor.length > 0 ? configVendedor[0].percentual : 100;

      // Buscar recebimentos existentes de uma vez
      const recebimentosExistentes = await base44.entities.RecebimentoComissao.list();
      const hashesExistentes = new Set(recebimentosExistentes.map(r => r.hash_duplicidade));

      let processados = 0;
      let divergencias = 0;
      let valorTotal = 0;
      const itensParaCriar = [];
      const recebimentosParaCriar = [];
      const comissoesParaCriar = [];
      const vendasParaAtualizar = {};

      // ===== PROCESSAR TODOS OS ITENS =====
      for (const item of previewData.items) {
        const contrato = String(item.contrato || '').trim();
        const grupo = String(item.grupo || '').trim();
        const cota = String(item.cota || '').trim();
        const parcelaInformada = parseInt(item.parcela) || null;
        const valorRecebido = parseFloat(item.valor) || 0;
        const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');

        let vendaEncontrada = null;
        let motivoDivergencia = '';

        // IDENTIFICAÇÃO DA VENDA
        if (contrato) {
          const vendasMatch = vendas.filter(v => 
            v.contrato === contrato && v.administradora_id === selectedAdmin
          );
          if (vendasMatch.length === 1) vendaEncontrada = vendasMatch[0];
          else if (vendasMatch.length > 1) motivoDivergencia = 'Múltiplas vendas encontradas';
          else motivoDivergencia = 'Venda não encontrada';
        } else if (grupo && cota) {
          const vendasMatch = vendas.filter(v => 
            String(v.grupo).trim() === grupo &&
            String(v.cota).trim() === cota &&
            v.administradora_id === selectedAdmin
          );
          if (vendasMatch.length === 1) vendaEncontrada = vendasMatch[0];
          else if (vendasMatch.length > 1) motivoDivergencia = 'Múltiplas vendas encontradas';
          else motivoDivergencia = 'Venda não encontrada';
        } else {
          motivoDivergencia = 'Dados insuficientes';
        }

        // VERIFICAÇÃO DE DUPLICIDADE
        if (vendaEncontrada) {
          const hashDuplicidade = `${vendaEncontrada.id}_${dataRecebimento}_${valorRecebido}`;
          if (hashesExistentes.has(hashDuplicidade)) {
            motivoDivergencia = 'Recebimento duplicado';
            vendaEncontrada = null;
          }
        }

        // CRIAR ITEM DE IMPORTAÇÃO
        itensParaCriar.push({
          importacao_id: importacao.id,
          linha: previewData.items.indexOf(item) + 1,
          cpf: '',
          contrato,
          grupo,
          cota,
          parcela: parcelaInformada || 0,
          valor_recebido: valorRecebido,
          venda_id: vendaEncontrada?.id,
          parcela_id: null,
          status: vendaEncontrada && !motivoDivergencia ? 'processado' : 'divergencia',
          motivo_divergencia: motivoDivergencia || null
        });

        // PREPARAR RECEBIMENTO E COMISSÃO
        if (vendaEncontrada && !motivoDivergencia) {
          const hashDuplicidade = `${vendaEncontrada.id}_${dataRecebimento}_${valorRecebido}`;
          const valorAPagar = valorRecebido * (percentualPadrao / 100);
          
          const recebimentoId = `temp_${previewData.items.indexOf(item)}`;
          
          recebimentosParaCriar.push({
            _tempId: recebimentoId,
            empresa_id: vendaEncontrada.empresa_id,
            venda_id: vendaEncontrada.id,
            cliente_id: vendaEncontrada.cliente_id,
            cliente_nome: vendaEncontrada.cliente_nome,
            vendedor_id: vendaEncontrada.vendedor_id,
            vendedor_nome: vendaEncontrada.vendedor_nome,
            administradora_id: selectedAdmin,
            administradora_nome: admin.nome_fantasia || admin.razao_social,
            grupo: vendaEncontrada.grupo,
            cota: vendaEncontrada.cota,
            contrato: vendaEncontrada.contrato,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            parcela_informada: parcelaInformada,
            origem_importacao_id: importacao.id,
            linha_importacao: previewData.items.indexOf(item) + 1,
            hash_duplicidade: hashDuplicidade,
            percentual_comissao: percentualPadrao,
            valor_a_pagar: valorAPagar,
            status_recebimento: 'recebida',
            status_pagamento: 'a_pagar'
          });

          comissoesParaCriar.push({
            _recebimentoTempId: recebimentoId,
            empresa_id: vendaEncontrada.empresa_id,
            venda_id: vendaEncontrada.id,
            cliente_id: vendaEncontrada.cliente_id,
            cliente_nome: vendaEncontrada.cliente_nome,
            vendedor_id: vendaEncontrada.vendedor_id,
            vendedor_nome: vendaEncontrada.vendedor_nome,
            administradora_id: selectedAdmin,
            administradora_nome: admin.nome_fantasia || admin.razao_social,
            grupo: vendaEncontrada.grupo,
            cota: vendaEncontrada.cota,
            contrato: vendaEncontrada.contrato,
            parcela_numero: parcelaInformada,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            percentual_comissao: percentualPadrao,
            valor_a_pagar: valorAPagar,
            status_pagamento: 'a_pagar'
          });

          // Agrupar updates de vendas
          if (!vendasParaAtualizar[vendaEncontrada.id]) {
            vendasParaAtualizar[vendaEncontrada.id] = {
              comissao_total_recebida: vendaEncontrada.comissao_total_recebida || 0
            };
          }
          vendasParaAtualizar[vendaEncontrada.id].comissao_total_recebida += valorRecebido;

          processados++;
          valorTotal += valorRecebido;
        } else {
          divergencias++;
        }
      }

      // ===== CRIAR EM LOTE =====
      if (itensParaCriar.length > 0) {
        await base44.entities.ImportacaoItem.bulkCreate(itensParaCriar);
      }

      if (recebimentosParaCriar.length > 0) {
        const recebimentosData = recebimentosParaCriar.map(r => {
          const { _tempId, ...data } = r;
          return data;
        });
        const recebimentosCriados = await base44.entities.RecebimentoComissao.bulkCreate(recebimentosData);
        
        // Mapear IDs temporários para IDs reais
        const comissoesData = comissoesParaCriar.map((c, idx) => {
          const { _recebimentoTempId, ...data } = c;
          return {
            ...data,
            recebimento_id: recebimentosCriados[idx].id
          };
        });
        
        if (comissoesData.length > 0) {
          await base44.entities.ComissaoAPagar.bulkCreate(comissoesData);
        }
      }

      // Atualizar vendas em lote
      for (const [vendaId, updateData] of Object.entries(vendasParaAtualizar)) {
        await base44.entities.Venda.update(vendaId, updateData);
      }

      // Atualizar importação
      await base44.entities.Importacao.update(importacao.id, {
        status: 'concluida',
        registros_processados: processados,
        registros_divergencia: divergencias,
        valor_total: valorTotal
      });

      queryClient.invalidateQueries();
      setUploadOpen(false);
      setPreviewData(null);
      setFile(null);
      setSelectedAdmin('');
      
      toast.success(`✅ Importação concluída: ${processados} processados, ${divergencias} divergências`);
    } catch (error) {
      toast.error('Erro ao processar importação');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const columns = [
    {
      header: 'Data',
      cell: (row) => format(new Date(row.created_date), 'dd/MM/yyyy HH:mm')
    },
    {
      header: 'Administradora',
      cell: (row) => row.administradora_nome || '-'
    },
    {
      header: 'Arquivo',
      cell: (row) => row.arquivo_nome || '-'
    },
    {
      header: 'Registros',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-emerald-600 font-medium">{row.registros_processados || 0}</span>
          <span className="text-slate-400">/</span>
          <span className="text-red-600 font-medium">{row.registros_divergencia || 0}</span>
          <span className="text-slate-400">/</span>
          <span>{row.total_registros || 0}</span>
        </div>
      )
    },
    {
      header: 'Valor',
      cell: (row) => formatCurrency(row.valor_total)
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: '',
      className: 'w-24',
      cell: (row) => (
        <div className="flex items-center gap-1">
          <Link to={createPageUrl(`ImportacaoDetalhes?id=${row.id}`)}>
            <Button variant="ghost" size="icon">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => handleDelete(row)}
            disabled={deleteImportMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            {deleteImportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação"
        subtitle="Importe comissões e planos de consórcio"
      />

      {/* Ações de Importação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setUploadOpen(true)}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-50 rounded-xl">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-slate-900 mb-1">Importar Comissões</h3>
                <p className="text-sm text-slate-600">Importe arquivos CSV de comissões recebidas das administradoras</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setImportPlanosOpen(true)}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <FileUp className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-slate-900 mb-1">Importar Planos</h3>
                <p className="text-sm text-slate-600">Importe planos de consórcio via PDF com extração automática</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
            <div>
              <p className="text-sm text-emerald-700">Processados</p>
              <p className="text-2xl font-bold text-emerald-800">
                {importacoes.reduce((acc, i) => acc + (i.registros_processados || 0), 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-red-50">
          <CardContent className="p-4 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-red-700">Divergências</p>
              <p className="text-2xl font-bold text-red-800">
                {importacoes.reduce((acc, i) => acc + (i.registros_divergencia || 0), 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4 flex items-center gap-4">
            <FileSpreadsheet className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-blue-700">Valor Importado</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatCurrency(importacoes.reduce((acc, i) => acc + (i.valor_total || 0), 0))}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={importacoes}
        isLoading={isLoading}
        emptyMessage="Nenhuma importação realizada"
      />

      {/* Upload Modal */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Importação</DialogTitle>
            <DialogDescription>
              Selecione a administradora e faça o upload do arquivo CSV (exporte do Excel como CSV)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Administradora */}
            <div>
              <Label>Administradora *</Label>
              <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
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

            {/* Upload */}
            <div>
              <Label>Arquivo CSV *</Label>
              <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                  disabled={!selectedAdmin}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      <span className="text-slate-500">Processando arquivo...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-slate-400" />
                      <span className="text-slate-500">
                        {file ? file.name : 'Clique para selecionar arquivo CSV'}
                      </span>
                      <span className="text-xs text-slate-400">
                        ⚠️ Apenas arquivos CSV são suportados (não Excel)
                      </span>
                      <span className="text-xs text-slate-400">
                        Colunas: A=Data Recebimento, B=Contrato, C=Grupo, D=Cota, E=Valor, F=Parcela, G=Administradora
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Preview */}
            {previewData && (
              <div>
                <Label>Pré-visualização ({previewData.items.length} registros)</Label>
                <div className="mt-2 border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Contrato</TableHead>
                        <TableHead>Grupo</TableHead>
                        <TableHead>Cota</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Parcela</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.items.slice(0, 10).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>{item.data_recebimento || '-'}</TableCell>
                          <TableCell>{item.contrato || '-'}</TableCell>
                          <TableCell>{item.grupo || '-'}</TableCell>
                          <TableCell>{item.cota || '-'}</TableCell>
                          <TableCell>{formatCurrency(item.valor)}</TableCell>
                          <TableCell>{item.parcela || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {previewData.items.length > 10 && (
                    <p className="p-3 text-center text-sm text-slate-500">
                      ... e mais {previewData.items.length - 10} registros
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Alerta */}
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-800">
                <p className="font-medium">Nova Lógica - Recebimento SEM depender de parcela:</p>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li><strong>Identificação:</strong> Contrato OU (Grupo + Cota) + Administradora</li>
                  <li><strong>Duplicidade:</strong> Verifica venda + data + valor (não permite reimportar)</li>
                  <li><strong>Recebimento:</strong> Cria registro mesmo sem parcela cadastrada</li>
                  <li><strong>Disponível:</strong> Entra em "Comissões a Pagar" (percentual editável)</li>
                </ol>
                <p className="mt-2 font-medium">⚠️ Divergências:</p>
                <ul className="list-disc ml-4 mt-1 space-y-1">
                  <li>Múltiplas vendas encontradas</li>
                  <li>Venda não encontrada</li>
                  <li>Recebimento duplicado</li>
                  <li>Dados insuficientes</li>
                </ul>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setUploadOpen(false);
                setPreviewData(null);
                setFile(null);
              }}>
                Cancelar
              </Button>
              <Button
                onClick={processarImportacao}
                disabled={!previewData || !selectedAdmin || isProcessing}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Processar Importação
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Importar Planos */}
      <ImportarPlanosCanopusPDF
        open={importPlanosOpen}
        onOpenChange={setImportPlanosOpen}
      />
    </div>
  );
}