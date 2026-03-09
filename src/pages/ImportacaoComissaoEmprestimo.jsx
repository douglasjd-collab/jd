import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { Upload, Loader2, AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function ImportacaoComissaoEmprestimo() {
  const [selectedLayout, setSelectedLayout] = useState('');
  const [selectedEmpresaParceira, setSelectedEmpresaParceira] = useState('');
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [progressoLote, setProgressoLote] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentEmpresa, setCurrentEmpresa] = useState(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState('');
  const [excluindoImportacao, setExcluindoImportacao] = useState(null);
  const [tipoExclusao, setTipoExclusao] = useState('tudo');
  const [isDeletando, setIsDeletando] = useState(false);
  const queryClient = useQueryClient();

  const isSuperAdmin = currentUser?.perfil === 'super_admin' || currentUser?.role === 'super_admin';

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
    if (user?.empresa_id) {
      const empresa = await base44.entities.Empresa.get(user.empresa_id);
      setCurrentEmpresa(empresa);
    }
  };

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-lista'],
    enabled: !!isSuperAdmin,
    queryFn: () => base44.entities.Empresa.filter({ status: 'ativa' }),
  });

  const empresaIdParam = isSuperAdmin ? empresaSelecionada : (currentUser?.empresa_id || currentEmpresa?.id);

  const { data: empresasParceiras = [] } = useQuery({
    queryKey: ['empresas-parceiras', empresaIdParam],
    enabled: !!empresaIdParam,
    queryFn: async () => {
      return base44.entities.EmpresaParceira.filter({ empresa_id: empresaIdParam });
    },
  });

  const { data: layouts = [] } = useQuery({
    queryKey: ['layouts-emprestimo', selectedEmpresaParceira],
    enabled: !!selectedEmpresaParceira,
    queryFn: () => base44.entities.LayoutImportacao.filter({
      empresa_parceira_id: selectedEmpresaParceira,
      tipo: 'comissao'
    }),
  });

  const { data: importacoes = [] } = useQuery({
    queryKey: ['importacoes-emprestimo'],
    queryFn: async () => {
      const all = await base44.entities.Importacao.filter({ produto: 'emprestimos' });
      return all;
    },
  });

  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files || []);
    if (!uploadedFiles.length) return;

    if (uploadedFiles.length === 1) {
      setFiles(uploadedFiles);
      setIsProcessing(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadedFiles[0] });
        const empresaIdParaProcessar = isSuperAdmin
          ? (empresaSelecionada || null)
          : (currentUser?.empresa_id || currentEmpresa?.id);
        
        const result = await base44.functions.invoke('processarCsvComissao', {
          file_url,
          produto: 'emprestimos',
          empresa_id: empresaIdParaProcessar,
          layout_id: selectedLayout
        });
        
        if (result.data.status === 'success' && result.data.items) {
          setPreviewData({ file_url, items: result.data.items });
          toast.success(`${result.data.total} registros encontrados no arquivo`);
        } else {
          toast.error('Erro ao processar arquivo: ' + (result.data.error || 'Formato inválido'));
        }
      } catch (error) {
        toast.error('Erro ao processar arquivo: ' + (error?.message || 'Tente novamente'));
        console.error('Erro upload/preview:', error);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Múltiplos arquivos: processar em lote automaticamente
    setFiles(uploadedFiles);
    setIsProcessing(true);
    let totalProcessados = 0;
    let totalDivergencias = 0;
    let totalValor = 0;
    const erros = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const uploadedFile = uploadedFiles[i];
      setProgressoLote({ atual: i + 1, total: uploadedFiles.length, nomeArquivo: uploadedFile.name });

      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadedFile });
        const empresaIdParaProcessar = isSuperAdmin
          ? (empresaSelecionada || null)
          : (currentUser?.empresa_id || currentEmpresa?.id);

        const result = await base44.functions.invoke('processarCsvComissao', {
          file_url,
          produto: 'emprestimos',
          empresa_id: empresaIdParaProcessar,
          layout_id: selectedLayout
        });

        if (!result.data?.items?.length) {
          erros.push(`${uploadedFile.name}: sem registros válidos`);
          continue;
        }

        const items = result.data.items;

        await processarImportacaoLote({
          file_url,
          file_name: uploadedFile.name,
          items,
          empresaIdFinal: empresaIdParaProcessar,
          onResult: (p, d, v) => {
            totalProcessados += p;
            totalDivergencias += d;
            totalValor += v;
          }
        });
      } catch (err) {
        console.error(`Erro no arquivo ${uploadedFile.name}:`, err);
        erros.push(`${uploadedFile.name}: ${err.message || 'erro desconhecido'}`);
      }
    }

    setIsProcessing(false);
    setProgressoLote(null);
    setFiles([]);
    queryClient.invalidateQueries();

    if (erros.length) {
      toast.warning(`Lote concluído com erros em ${erros.length} arquivo(s). Processados: ${totalProcessados}`);
    } else {
      toast.success(`✅ Lote concluído: ${totalProcessados} processados, ${totalDivergencias} divergências`);
    }
  };

  const processarImportacaoLote = async ({ file_url, file_name, items, empresaIdFinal, onResult }) => {
    const layout = layouts.find(l => l.id === selectedLayout);
    const empresaParceira = empresasParceiras.find(e => e.id === selectedEmpresaParceira);

    const importacao = await base44.entities.Importacao.create({
      empresa_id: empresaIdFinal,
      produto: 'emprestimos',
      administradora_id: selectedEmpresaParceira,
      administradora_nome: empresaParceira?.nome,
      usuario_id: currentUser?.id,
      usuario_nome: currentUser?.full_name,
      arquivo_nome: file_name,
      arquivo_url: file_url,
      total_registros: items.length,
      status: 'processando'
    });

    let processados = 0, divergencias = 0, valorTotal = 0;
    const recebimentosParaCriar = [];

    for (const item of items) {
      const contratoRaw = String(item.contrato || '').trim();
      const cpfRaw = String(item.cpf || '').trim();
      const valorRecebido = parseFloat(item.valor) || 0;
      const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');
      let propostaEncontrada = null;
      let motivoDivergencia = '';

      // Buscar proposta por contrato ou CPF
      if (contratoRaw) {
        const propostasMatch = await base44.entities.Proposta.filter({
          contrato: contratoRaw,
          produto: 'emprestimo',
          ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {})
        });
        if (propostasMatch.length === 1) {
          propostaEncontrada = propostasMatch[0];
        } else if (propostasMatch.length > 1) {
          motivoDivergencia = 'Múltiplas propostas encontradas';
        } else {
          motivoDivergencia = 'Proposta não encontrada pelo contrato';
        }
      } else if (cpfRaw) {
        const propostasMatch = await base44.entities.Proposta.filter({
          cliente_cpf: cpfRaw,
          produto: 'emprestimo',
          ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {})
        });
        if (propostasMatch.length === 1) {
          propostaEncontrada = propostasMatch[0];
        } else if (propostasMatch.length > 1) {
          motivoDivergencia = 'Múltiplas propostas encontradas para este CPF';
        } else {
          motivoDivergencia = 'Proposta não encontrada pelo CPF';
        }
      } else {
        motivoDivergencia = 'Dados insuficientes (sem contrato nem CPF)';
      }

      if (propostaEncontrada && !motivoDivergencia) {
        const hashDuplicidade = `${propostaEncontrada.id}_${dataRecebimento}_${valorRecebido}`;
        
        // Verificar duplicidade
        const recExistentes = await base44.entities.RecebimentoComissao.filter({
          hash_duplicidade: hashDuplicidade
        });
        
        if (recExistentes.length > 0) {
          motivoDivergencia = 'Recebimento duplicado';
          propostaEncontrada = null;
        } else {
          recebimentosParaCriar.push({
            empresa_id: propostaEncontrada.empresa_id,
            venda_id: propostaEncontrada.id,
            cliente_id: propostaEncontrada.cliente_id,
            cliente_nome: propostaEncontrada.cliente_nome,
            vendedor_id: propostaEncontrada.vendedor_id,
            vendedor_nome: propostaEncontrada.vendedor_nome,
            administradora_id: propostaEncontrada.administradora_id,
            administradora_nome: propostaEncontrada.administradora_nome,
            contrato: propostaEncontrada.contrato,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            origem_importacao_id: importacao.id,
            linha_importacao: items.indexOf(item) + 1,
            hash_duplicidade: hashDuplicidade,
            percentual_comissao: 100,
            valor_a_pagar: valorRecebido,
            status_recebimento: 'recebida',
            status_pagamento: 'a_pagar'
          });
          processados++;
          valorTotal += valorRecebido;
        }
      }

      if (motivoDivergencia) {
        divergencias++;
      }
    }

    if (recebimentosParaCriar.length > 0) {
      await base44.entities.RecebimentoComissao.bulkCreate(recebimentosParaCriar);
    }

    await base44.entities.Importacao.update(importacao.id, {
      status: 'concluida',
      registros_processados: processados,
      registros_divergencia: divergencias,
      valor_total: valorTotal
    });

    if (onResult) onResult(processados, divergencias, valorTotal);
  };

  const processarImportacao = async () => {
    if (!previewData || !selectedLayout || !selectedEmpresaParceira) return;

    setIsProcessing(true);

    try {
      const layout = layouts.find(l => l.id === selectedLayout);
      const empresaParceira = empresasParceiras.find(e => e.id === selectedEmpresaParceira);
      
      const empresaIdFinal = isSuperAdmin
        ? (empresaSelecionada || null)
        : (currentUser?.empresa_id || currentEmpresa?.id);

      if (!isSuperAdmin && !empresaIdFinal) {
        toast.error('Empresa não vinculada ao usuário');
        setIsProcessing(false);
        return;
      }

      const importacao = await base44.entities.Importacao.create({
        empresa_id: empresaIdFinal,
        produto: 'emprestimos',
        administradora_id: selectedEmpresaParceira,
        administradora_nome: empresaParceira?.nome,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.full_name,
        arquivo_nome: files[0]?.name,
        arquivo_url: previewData.file_url,
        total_registros: previewData.items.length,
        status: 'processando'
      });

      let processados = 0;
      let divergencias = 0;
      let valorTotal = 0;
      const recebimentosParaCriar = [];

      for (const item of previewData.items) {
        const contratoRaw = String(item.contrato || '').trim();
        const cpfRaw = String(item.cpf || '').trim();
        const valorRecebido = parseFloat(item.valor) || 0;
        const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');
        let propostaEncontrada = null;
        let motivoDivergencia = '';

        if (contratoRaw) {
          const propostasMatch = await base44.entities.Proposta.filter({
            contrato: contratoRaw,
            produto: 'emprestimo'
          });
          if (propostasMatch.length === 1) {
            propostaEncontrada = propostasMatch[0];
          } else if (propostasMatch.length > 1) {
            motivoDivergencia = 'Múltiplas propostas encontradas';
          } else {
            motivoDivergencia = 'Proposta não encontrada pelo contrato';
          }
        } else if (cpfRaw) {
          const propostasMatch = await base44.entities.Proposta.filter({
            cliente_cpf: cpfRaw,
            produto: 'emprestimo'
          });
          if (propostasMatch.length === 1) {
            propostaEncontrada = propostasMatch[0];
          } else if (propostasMatch.length > 1) {
            motivoDivergencia = 'Múltiplas propostas encontradas para este CPF';
          } else {
            motivoDivergencia = 'Proposta não encontrada pelo CPF';
          }
        } else {
          motivoDivergencia = 'Dados insuficientes (sem contrato nem CPF)';
        }

        if (propostaEncontrada && !motivoDivergencia) {
          const hashDuplicidade = `${propostaEncontrada.id}_${dataRecebimento}_${valorRecebido}`;
          const recExistentes = await base44.entities.RecebimentoComissao.filter({
            hash_duplicidade: hashDuplicidade
          });

          if (recExistentes.length > 0) {
            motivoDivergencia = 'Recebimento duplicado';
            propostaEncontrada = null;
          } else {
            recebimentosParaCriar.push({
              empresa_id: propostaEncontrada.empresa_id,
              venda_id: propostaEncontrada.id,
              cliente_id: propostaEncontrada.cliente_id,
              cliente_nome: propostaEncontrada.cliente_nome,
              vendedor_id: propostaEncontrada.vendedor_id,
              vendedor_nome: propostaEncontrada.vendedor_nome,
              administradora_id: propostaEncontrada.administradora_id,
              administradora_nome: propostaEncontrada.administradora_nome,
              contrato: propostaEncontrada.contrato,
              data_recebimento: dataRecebimento,
              valor_recebido: valorRecebido,
              origem_importacao_id: importacao.id,
              linha_importacao: previewData.items.indexOf(item) + 1,
              hash_duplicidade: hashDuplicidade,
              percentual_comissao: 100,
              valor_a_pagar: valorRecebido,
              status_recebimento: 'recebida',
              status_pagamento: 'a_pagar'
            });
            processados++;
            valorTotal += valorRecebido;
          }
        } else {
          divergencias++;
        }
      }

      if (recebimentosParaCriar.length > 0) {
        await base44.entities.RecebimentoComissao.bulkCreate(recebimentosParaCriar);
      }

      await base44.entities.Importacao.update(importacao.id, {
        status: 'concluida',
        registros_processados: processados,
        registros_divergencia: divergencias,
        valor_total: valorTotal
      });

      queryClient.invalidateQueries();
      setPreviewData(null);
      setFiles([]);
      setSelectedLayout('');
      setSelectedEmpresaParceira('');
      
      toast.success(`✅ Importação concluída: ${processados} processados, ${divergencias} divergências`);
    } catch (error) {
      toast.error('Erro ao processar importação');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const excluirImportacao = async () => {
    if (!excluindoImportacao) return;
    setIsDeletando(true);
    try {
      const impId = excluindoImportacao.id;
      const recebimentos = await base44.entities.RecebimentoComissao.filter({ origem_importacao_id: impId });

      const descontoPorVenda = {};
      for (const rec of recebimentos) {
        descontoPorVenda[rec.venda_id] = (descontoPorVenda[rec.venda_id] || 0) + (rec.valor_recebido || 0);
      }

      for (const rec of recebimentos) {
        const comissoesPorRec = await base44.entities.ComissaoAPagar.filter({ recebimento_id: rec.id });
        for (const com of comissoesPorRec) {
          await base44.entities.ComissaoAPagar.delete(com.id);
        }
        await base44.entities.RecebimentoComissao.delete(rec.id);
      }

      for (const [vendaId, valorDesconto] of Object.entries(descontoPorVenda)) {
        const propostas = await base44.entities.Proposta.filter({ id: vendaId });
        if (propostas.length > 0) {
          const novoTotal = Math.max(0, (propostas[0].comissao_recebida || 0) - valorDesconto);
          await base44.entities.Proposta.update(vendaId, { comissao_recebida: novoTotal });
        }
      }

      await base44.entities.Importacao.delete(impId);
      toast.success('Importação excluída completamente.');

      queryClient.invalidateQueries(['importacoes-emprestimo']);
    } catch (e) {
      toast.error('Erro ao excluir: ' + (e.message || 'tente novamente'));
      console.error(e);
    } finally {
      setIsDeletando(false);
      setExcluindoImportacao(null);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="IMP. Comissão Empréstimo"
        subtitle="Importe recebimentos de comissões de empréstimos dos parceiros"
        backTo="Importacao"
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
          {isSuperAdmin && (
            <div>
              <Label>Empresa / Subconta *</Label>
              <Select value={empresaSelecionada} onValueChange={setEmpresaSelecionada}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Empresa Parceira *</Label>
            <Select value={selectedEmpresaParceira} onValueChange={(v) => { setSelectedEmpresaParceira(v); setSelectedLayout(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa parceira" />
              </SelectTrigger>
              <SelectContent>
                {empresasParceiras.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Layout de Importação *</Label>
            <Select value={selectedLayout} onValueChange={setSelectedLayout}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o layout" />
              </SelectTrigger>
              <SelectContent>
                {layouts.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Arquivo(s) CSV *</Label>
            <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isProcessing || !selectedLayout || !selectedEmpresaParceira || (isSuperAdmin && !empresaSelecionada)}
              />
              <label htmlFor="file-upload" className={`cursor-pointer ${isProcessing ? 'pointer-events-none' : ''}`}>
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-[#23BE84] animate-spin" />
                    {progressoLote ? (
                      <>
                        <span className="text-slate-700 font-medium">
                          Processando {progressoLote.atual} de {progressoLote.total} arquivos...
                        </span>
                        <span className="text-sm text-slate-500 truncate max-w-xs">{progressoLote.nomeArquivo}</span>
                        <div className="w-64 bg-slate-200 rounded-full h-2 mt-1">
                          <div
                            className="bg-[#23BE84] h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(progressoLote.atual / progressoLote.total) * 100}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-500">Processando arquivo...</span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-slate-400" />
                    <span className="text-slate-700 font-medium">
                      {files.length > 0 ? `${files.length} arquivo(s) selecionado(s)` : 'Clique para selecionar arquivo(s) CSV'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Selecione um ou vários arquivos de uma vez
                    </span>
                  </div>
                )}
              </label>
            </div>
          </div>

          {previewData && (
            <div>
              <Label>
                Pré-visualização ({previewData.items.length} registros)
              </Label>
              <div className="mt-2 border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Contrato</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.items.slice(0, 10).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.data_recebimento || '-'}</TableCell>
                        <TableCell>{item.contrato || '-'}</TableCell>
                        <TableCell>{item.cpf || '-'}</TableCell>
                        <TableCell>{formatCurrency(item.valor)}</TableCell>
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

          <div className="flex justify-end gap-3">
            <Button
              onClick={processarImportacao}
              disabled={!previewData || !selectedLayout || !selectedEmpresaParceira || isProcessing || (isSuperAdmin && !empresaSelecionada)}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Processar Importação
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card className="border-0 shadow-sm mt-8">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold mb-4">Histórico de Importações</h3>

          {importacoes.length === 0 ? (
            <p className="text-slate-500 text-center py-8">Nenhuma importação realizada ainda</p>
          ) : (
            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Registros</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importacoes.map((imp) => (
                    <TableRow key={imp.id}>
                      <TableCell className="font-medium">
                        {imp.created_date ? format(new Date(imp.created_date), 'dd/MM/yyyy HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{imp.arquivo_nome || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-green-600 font-medium">{imp.registros_processados || 0}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-amber-600 font-medium">{imp.registros_divergencia || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(imp.valor_total)}</TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            imp.status === 'concluida' ? 'bg-green-100 text-green-800' :
                            imp.status === 'processando' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          }
                        >
                          {imp.status === 'concluida' ? 'Concluída' :
                           imp.status === 'processando' ? 'Processando' : 'Erro'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setTipoExclusao('tudo');
                            setExcluindoImportacao({ id: imp.id, nome: imp.arquivo_nome });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!excluindoImportacao} onOpenChange={(open) => !open && setExcluindoImportacao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Importação</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-slate-700">{excluindoImportacao?.nome}</span>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluindoImportacao(null)} disabled={isDeletando}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={excluirImportacao}
              disabled={isDeletando}
            >
              {isDeletando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}