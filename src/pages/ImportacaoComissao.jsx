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
import { Upload, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function ImportacaoComissao() {
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
  };

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const { data: vendasConsorcio = [] } = useQuery({
    queryKey: ['vendasConsorcio'],
    queryFn: () => base44.entities.VendaConsorcio.list(),
  });

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsProcessing(true);

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: uploadedFile });
      const result = await base44.functions.invoke('processarCsvComissao', { file_url });

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

      const configVendedor = await base44.entities.ConfiguracaoComissao.filter({ 
        tipo: 'vendedor', 
        status: 'ativo' 
      });
      const percentualPadrao = configVendedor.length > 0 ? configVendedor[0].percentual : 100;

      const recebimentosExistentes = await base44.entities.RecebimentoComissao.list();
      const hashesExistentes = new Set(recebimentosExistentes.map(r => r.hash_duplicidade));

      let processados = 0;
      let divergencias = 0;
      let valorTotal = 0;
      const itensParaCriar = [];
      const recebimentosParaCriar = [];
      const comissoesParaCriar = [];
      const vendasParaAtualizar = {};

      for (const item of previewData.items) {
        const contratoRaw = String(item.contrato || '').trim();
        const contrato = contratoRaw && contratoRaw !== '-' ? contratoRaw : '';
        const grupoRaw = String(item.grupo || '').trim();
        const cotaRaw = String(item.cota || '').trim();
        const parcelaInformada = parseInt(item.parcela) || null;
        const valorRecebido = parseFloat(item.valor) || 0;
        const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');

        let vendaConsorcioEncontrada = null;
        let motivoDivergencia = '';

        // Normalizar grupo e cota (remover zeros à esquerda, manter apenas números)
        const grupoNormalizado = grupoRaw ? String(parseInt(grupoRaw) || 0) : '';
        const cotaNormalizada = cotaRaw ? String(parseInt(cotaRaw) || 0) : '';

        console.log('🔍 Processando item:', { 
          contrato, 
          grupoRaw, 
          cotaRaw, 
          grupoNormalizado, 
          cotaNormalizada,
          adminSelecionada: selectedAdmin 
        });

        if (contrato) {
          const vendasMatch = vendasConsorcio.filter(vc => 
            vc.contrato && String(vc.contrato).trim() === contrato && 
            vc.administradora_id === selectedAdmin
          );
          console.log(`📊 Busca por contrato "${contrato}":`, vendasMatch.length, 'encontradas');
          if (vendasMatch.length === 1) vendaConsorcioEncontrada = vendasMatch[0];
          else if (vendasMatch.length > 1) motivoDivergencia = 'Múltiplas vendas encontradas';
          else motivoDivergencia = 'Venda não encontrada pelo contrato';
        } else if (grupoNormalizado && cotaNormalizada) {
          console.log('🔍 Todas as vendas de consórcio disponíveis:', vendasConsorcio.map(vc => ({
            id: vc.id,
            grupo: vc.grupo,
            cota: vc.cota,
            contrato: vc.contrato,
            admin_id: vc.administradora_id,
            grupoNorm: vc.grupo ? String(parseInt(vc.grupo) || 0) : '',
            cotaNorm: vc.cota ? String(parseInt(vc.cota) || 0) : ''
          })));
          
          const vendasMatch = vendasConsorcio.filter(vc => {
            const grupoVenda = vc.grupo ? String(parseInt(vc.grupo) || 0) : '';
            const cotaVenda = vc.cota ? String(parseInt(vc.cota) || 0) : '';
            const match = grupoVenda === grupoNormalizado &&
                   cotaVenda === cotaNormalizada &&
                   vc.administradora_id === selectedAdmin;
            
            console.log(`  Verificando venda ${vc.id}:`, {
              grupoVenda, 
              cotaVenda, 
              admin: vc.administradora_id,
              match
            });
            
            return match;
          });
          
          console.log(`📊 Busca por grupo "${grupoNormalizado}" e cota "${cotaNormalizada}":`, vendasMatch.length, 'encontradas');
          if (vendasMatch.length === 1) vendaConsorcioEncontrada = vendasMatch[0];
          else if (vendasMatch.length > 1) motivoDivergencia = 'Múltiplas vendas encontradas por grupo/cota';
          else motivoDivergencia = 'Venda não encontrada por grupo/cota';
        } else {
          motivoDivergencia = 'Dados insuficientes (sem contrato nem grupo/cota)';
        }

        if (vendaConsorcioEncontrada) {
          const hashDuplicidade = `${vendaConsorcioEncontrada.venda_base_id}_${dataRecebimento}_${valorRecebido}`;
          if (hashesExistentes.has(hashDuplicidade)) {
            motivoDivergencia = 'Recebimento duplicado';
            vendaConsorcioEncontrada = null;
          }
        }

        itensParaCriar.push({
          importacao_id: importacao.id,
          linha: previewData.items.indexOf(item) + 1,
          cpf: '',
          contrato,
          grupo: grupoRaw,
          cota: cotaRaw,
          parcela: parcelaInformada || 0,
          valor_recebido: valorRecebido,
          venda_id: vendaConsorcioEncontrada?.venda_base_id,
          parcela_id: null,
          status: vendaConsorcioEncontrada && !motivoDivergencia ? 'processado' : 'divergencia',
          motivo_divergencia: motivoDivergencia || null
        });

        if (vendaConsorcioEncontrada && !motivoDivergencia) {
          const hashDuplicidade = `${vendaConsorcioEncontrada.venda_base_id}_${dataRecebimento}_${valorRecebido}`;
          const valorAPagar = valorRecebido * (percentualPadrao / 100);
          
          const recebimentoId = `temp_${previewData.items.indexOf(item)}`;
          
          recebimentosParaCriar.push({
            _tempId: recebimentoId,
            empresa_id: vendaConsorcioEncontrada.empresa_id,
            venda_id: vendaConsorcioEncontrada.venda_base_id,
            cliente_id: vendaConsorcioEncontrada.cliente_id,
            cliente_nome: vendaConsorcioEncontrada.cliente_nome,
            vendedor_id: vendaConsorcioEncontrada.vendedor_id,
            vendedor_nome: vendaConsorcioEncontrada.vendedor_nome,
            administradora_id: selectedAdmin,
            administradora_nome: admin.nome_fantasia || admin.razao_social,
            grupo: vendaConsorcioEncontrada.grupo,
            cota: vendaConsorcioEncontrada.cota,
            contrato: vendaConsorcioEncontrada.contrato,
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
            empresa_id: vendaConsorcioEncontrada.empresa_id,
            venda_id: vendaConsorcioEncontrada.venda_base_id,
            cliente_id: vendaConsorcioEncontrada.cliente_id,
            cliente_nome: vendaConsorcioEncontrada.cliente_nome,
            vendedor_id: vendaConsorcioEncontrada.vendedor_id,
            vendedor_nome: vendaConsorcioEncontrada.vendedor_nome,
            administradora_id: selectedAdmin,
            administradora_nome: admin.nome_fantasia || admin.razao_social,
            grupo: vendaConsorcioEncontrada.grupo,
            cota: vendaConsorcioEncontrada.cota,
            contrato: vendaConsorcioEncontrada.contrato,
            parcela_numero: parcelaInformada,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            percentual_comissao: percentualPadrao,
            valor_a_pagar: valorAPagar,
            status_pagamento: 'a_apagar'
          });

          if (!vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id]) {
            vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id] = {
              comissao_total_recebida: vendaConsorcioEncontrada.comissao_total_recebida || 0
            };
          }
          vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id].comissao_total_recebida += valorRecebido;

          processados++;
          valorTotal += valorRecebido;
        } else {
          divergencias++;
        }
      }

      if (itensParaCriar.length > 0) {
        await base44.entities.ImportacaoItem.bulkCreate(itensParaCriar);
      }

      if (recebimentosParaCriar.length > 0) {
        const recebimentosData = recebimentosParaCriar.map(r => {
          const { _tempId, ...data } = r;
          return data;
        });
        const recebimentosCriados = await base44.entities.RecebimentoComissao.bulkCreate(recebimentosData);
        
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

      for (const [vendaBaseId, updateData] of Object.entries(vendasParaAtualizar)) {
        await base44.entities.Venda.update(vendaBaseId, updateData);
      }

      await base44.entities.Importacao.update(importacao.id, {
        status: 'concluida',
        registros_processados: processados,
        registros_divergencia: divergencias,
        valor_total: valorTotal
      });

      queryClient.invalidateQueries();
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação de Comissões"
        subtitle="Importe arquivos CSV de comissões recebidas das administradoras"
        backTo="Importacao"
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6 space-y-6">
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
                      Colunas: A=Data, B=Contrato, C=Grupo, D=Cota, E=Valor, F=Parcela
                    </span>
                  </div>
                )}
              </label>
            </div>
          </div>

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

          <Card className="bg-amber-50 border-amber-200">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Lógica de Importação:</p>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li>Identificação: Contrato OU (Grupo + Cota)</li>
                  <li>Duplicidade: venda + data + valor</li>
                  <li>Recebimento criado sem exigir parcela</li>
                  <li>Disponível em "Comissões a Pagar"</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              onClick={processarImportacao}
              disabled={!previewData || !selectedAdmin || isProcessing}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Processar Importação
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}