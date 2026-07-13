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
    const itemMotivos = {};

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const contratoRaw = String(item.contrato || item.numero_ade || '').trim();
      const cpfRaw = String(item.cpf || '').trim();
      const dataRecebimento = item.data_recebimento || '';
      let propostaEncontrada = null;
      let motivoDivergencia = '';

      // Buscar proposta por contrato, ADE ou CPF
      if (contratoRaw) {
        const filtroBase = { produto: 'emprestimo', ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {}) };
        // Tenta por contrato
        let match = await base44.entities.Proposta.filter({ ...filtroBase, contrato: contratoRaw });
        // Fallback: tenta por emprestimo_numero_ade
        if (match.length === 0) match = await base44.entities.Proposta.filter({ ...filtroBase, emprestimo_numero_ade: contratoRaw });
        // Fallback sem filtro empresa
        if (match.length === 0) match = await base44.entities.Proposta.filter({ contrato: contratoRaw, produto: 'emprestimo' });
        if (match.length === 0) match = await base44.entities.Proposta.filter({ emprestimo_numero_ade: contratoRaw, produto: 'emprestimo' });

        if (match.length === 1) propostaEncontrada = match[0];
        else if (match.length > 1) motivoDivergencia = 'Múltiplas propostas encontradas';
        else motivoDivergencia = 'Proposta não encontrada (contrato/ADE: ' + contratoRaw + ')';
      } else if (cpfRaw) {
        const match = await base44.entities.Proposta.filter({ cliente_cpf: cpfRaw, produto: 'emprestimo', ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {}) });
        if (match.length === 1) propostaEncontrada = match[0];
        else if (match.length > 1) motivoDivergencia = 'Múltiplas propostas encontradas para este CPF';
        else motivoDivergencia = 'Proposta não encontrada pelo CPF';
      } else {
        motivoDivergencia = 'Dados insuficientes (sem contrato nem CPF)';
      }

      if (propostaEncontrada && !motivoDivergencia) {
        // Calcular valor monetário da comissão
        const pctComissao = parseFloat(item.percentual_comissao) || 0;
        let valorRecebido = parseFloat(item.valor_comissao || item.valor) || 0;
        // Se o valor parece ser percentual (< 100) e temos valor_credito, calcula o valor monetário
        if (valorRecebido === 0 && pctComissao > 0 && propostaEncontrada.valor_credito) {
          valorRecebido = parseFloat(((propostaEncontrada.valor_credito * pctComissao) / 100).toFixed(2));
        }

        const hashDuplicidade = `${propostaEncontrada.id}_${dataRecebimento}_${pctComissao || valorRecebido}`;
        const recExistentes = await base44.entities.RecebimentoComissao.filter({ hash_duplicidade: hashDuplicidade });

        if (recExistentes.length > 0) {
          motivoDivergencia = 'Recebimento duplicado';
          propostaEncontrada = null;
          itemMotivos[idx] = motivoDivergencia;
          divergencias++;
        } else {
          const recObj = {
            _itemIdx: idx,
            empresa_id: propostaEncontrada.empresa_id,
            venda_id: propostaEncontrada.id,
            cliente_id: propostaEncontrada.cliente_id || undefined,
            cliente_nome: propostaEncontrada.cliente_nome || undefined,
            vendedor_id: propostaEncontrada.vendedor_id || undefined,
            vendedor_nome: propostaEncontrada.vendedor_nome || undefined,
            administradora_id: propostaEncontrada.administradora_id || selectedEmpresaParceira,
            administradora_nome: item.banco || propostaEncontrada.administradora_nome || empresasParceiras.find(e => e.id === selectedEmpresaParceira)?.nome || undefined,
            contrato: propostaEncontrada.contrato || propostaEncontrada.emprestimo_numero_ade || undefined,
            data_recebimento: dataRecebimento,
            valor_recebido: valorRecebido,
            origem_importacao_id: importacao.id,
            linha_importacao: idx + 1,
            hash_duplicidade: hashDuplicidade,
            percentual_comissao: pctComissao,
            valor_a_pagar: valorRecebido,
            status_recebimento: 'recebida',
            status_pagamento: 'a_pagar',
          };
          const obs = [item.banco, item.convenio, item.tipo_consignado].filter(Boolean).join(' | ');
          if (obs) recObj.observacoes = obs;
          recebimentosParaCriar.push(recObj);
          processados++;
          valorTotal += valorRecebido;
        }
      } else {
        itemMotivos[idx] = motivoDivergencia;
        divergencias++;
      }
    }

          if (recebimentosParaCriar.length > 0) {
          const recebimentosCriados = await base44.entities.RecebimentoComissao.bulkCreate(
            recebimentosParaCriar.map(({ _valor_bruto, _valor_liquido, _valor_parcela, ...r }) => r)
          );

      // Criar ComissaoAPagar para cada recebimento
      const comissoesAPagar = recebimentosCriados.map(rec => ({
        empresa_id: rec.empresa_id,
        recebimento_id: rec.id,
        venda_id: rec.venda_id,
        cliente_id: rec.cliente_id,
        cliente_nome: rec.cliente_nome,
        vendedor_id: rec.vendedor_id,
        vendedor_nome: rec.vendedor_nome,
        administradora_id: rec.administradora_id,
        administradora_nome: rec.administradora_nome,
        contrato: rec.contrato,
        data_recebimento: rec.data_recebimento,
        valor_recebido: rec.valor_recebido,
        percentual_comissao: rec.percentual_comissao,
        valor_a_pagar: rec.valor_a_pagar,
        status_pagamento: 'a_pagar',
      }));
      await base44.entities.ComissaoAPagar.bulkCreate(comissoesAPagar);

      // Atualizar proposta: comissao_banco_recebida + percentual + valor_comissao + data_recebimento + valores financeiros
      const atualizacoesPorVenda = {};
      for (let ri = 0; ri < recebimentosCriados.length; ri++) {
        const rec = recebimentosCriados[ri];
        const itemOriginal = items[ri] || {};
        if (!atualizacoesPorVenda[rec.venda_id]) {
          atualizacoesPorVenda[rec.venda_id] = {
            valor: 0,
            pct: rec.percentual_comissao,
            data: rec.data_recebimento,
            valor_base_comissao: itemOriginal.valor_base_comissao || null,
            valor_bruto: itemOriginal.valor_bruto || null,
            valor_liquido: itemOriginal.valor_liquido || null,
            valor_parcela: itemOriginal.valor_parcela || null,
          };
        }
        atualizacoesPorVenda[rec.venda_id].valor += rec.valor_recebido;
        if (!atualizacoesPorVenda[rec.venda_id].valor_base_comissao && itemOriginal.valor_base_comissao) {
          atualizacoesPorVenda[rec.venda_id].valor_base_comissao = itemOriginal.valor_base_comissao;
        }
        if (!atualizacoesPorVenda[rec.venda_id].valor_bruto && itemOriginal.valor_bruto) {
          atualizacoesPorVenda[rec.venda_id].valor_bruto = itemOriginal.valor_bruto;
        }
        if (!atualizacoesPorVenda[rec.venda_id].valor_liquido && itemOriginal.valor_liquido) {
          atualizacoesPorVenda[rec.venda_id].valor_liquido = itemOriginal.valor_liquido;
        }
        if (!atualizacoesPorVenda[rec.venda_id].valor_parcela && itemOriginal.valor_parcela) {
          atualizacoesPorVenda[rec.venda_id].valor_parcela = itemOriginal.valor_parcela;
        }
      }
      for (const [vendaId, info] of Object.entries(atualizacoesPorVenda)) {
        const p = await base44.entities.Proposta.get(vendaId);
        if (p) {
          const upd = {
            comissao_banco_recebida: true,
            valor_comissao: info.valor,
            comissao_recebida: (p.comissao_recebida || 0) + info.valor,
            data_comissao_recebida: info.data,
            percentual_comissao_vendedor: info.pct || p.percentual_comissao_vendedor,
          };
          if (info.valor_bruto) upd.valor_credito = info.valor_bruto;
          if (info.valor_liquido) upd.valor_liquido = info.valor_liquido;
          if (info.valor_base_comissao) upd.comissao_banco_base_comissao = info.valor_base_comissao;
          if (info.valor_parcela) upd.emprestimo_valor_parcela = info.valor_parcela;
          await base44.entities.Proposta.update(vendaId, upd);
        }
      }
    }

    await base44.entities.Importacao.update(importacao.id, {
      status: 'concluida',
      registros_processados: processados,
      registros_divergencia: divergencias,
      valor_total: valorTotal
    });

    // Registrar receita no financeiro se houver valor processado
    if (valorTotal > 0) {
      await base44.functions.invoke('registrarReceitaImportacao', {
        acao: 'criar',
        importacao_id: importacao.id,
        empresa_id: empresaIdFinal,
        produto: 'emprestimos',
        valor_total: valorTotal,
        data_recebimento: format(new Date(), 'yyyy-MM-dd'),
        arquivo_nome: file_name,
        usuario_id: currentUser?.id,
        usuario_nome: currentUser?.full_name,
      });
    }

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

      const itemMotivos = {}; // guarda motivo por index do item
      for (let idx = 0; idx < previewData.items.length; idx++) {
        const item = previewData.items[idx];
        const contratoRaw = String(item.contrato || item.numero_ade || '').trim();
        const cpfRaw = String(item.cpf || '').trim();
        const dataRecebimento = item.data_recebimento || '';
        let propostaEncontrada = null;
        let motivoDivergencia = '';

        if (contratoRaw) {
          const filtroBase = { produto: 'emprestimo', ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {}) };
          let match = await base44.entities.Proposta.filter({ ...filtroBase, contrato: contratoRaw });
          if (match.length === 0) match = await base44.entities.Proposta.filter({ ...filtroBase, emprestimo_numero_ade: contratoRaw });
          if (match.length === 0) match = await base44.entities.Proposta.filter({ contrato: contratoRaw, produto: 'emprestimo' });
          if (match.length === 0) match = await base44.entities.Proposta.filter({ emprestimo_numero_ade: contratoRaw, produto: 'emprestimo' });

          if (match.length === 1) propostaEncontrada = match[0];
          else if (match.length > 1) motivoDivergencia = 'Múltiplas propostas encontradas';
          else motivoDivergencia = 'Proposta não encontrada (contrato/ADE: ' + contratoRaw + ')';
        } else if (cpfRaw) {
          const match = await base44.entities.Proposta.filter({ cliente_cpf: cpfRaw, produto: 'emprestimo', ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {}) });
          if (match.length === 1) propostaEncontrada = match[0];
          else if (match.length > 1) motivoDivergencia = 'Múltiplas propostas encontradas para este CPF';
          else motivoDivergencia = 'Proposta não encontrada pelo CPF';
        } else {
          motivoDivergencia = 'Dados insuficientes (sem contrato nem CPF)';
        }

        if (propostaEncontrada && !motivoDivergencia) {
          const pctComissao = parseFloat(item.percentual_comissao) || 0;
          // Usa valor_comissao ou valor (compatível com ambos os campos do layout)
          let valorRecebido = parseFloat(item.valor_comissao || item.valor) || 0;
          if (valorRecebido === 0 && pctComissao > 0 && propostaEncontrada.valor_credito) {
            valorRecebido = parseFloat(((propostaEncontrada.valor_credito * pctComissao) / 100).toFixed(2));
          }

          const hashDuplicidade = `${propostaEncontrada.id}_${dataRecebimento}_${pctComissao || valorRecebido}`;
          const recExistentes = await base44.entities.RecebimentoComissao.filter({ hash_duplicidade: hashDuplicidade });

          if (recExistentes.length > 0) {
            motivoDivergencia = 'Recebimento duplicado';
            propostaEncontrada = null;
            itemMotivos[idx] = motivoDivergencia;
            divergencias++;
          } else {
            const recObj = {
              _itemIdx: idx,
              empresa_id: propostaEncontrada.empresa_id,
              venda_id: propostaEncontrada.id,
              cliente_id: propostaEncontrada.cliente_id || undefined,
              cliente_nome: propostaEncontrada.cliente_nome || undefined,
              vendedor_id: propostaEncontrada.vendedor_id || undefined,
              vendedor_nome: propostaEncontrada.vendedor_nome || undefined,
              administradora_id: propostaEncontrada.administradora_id || selectedEmpresaParceira,
              administradora_nome: item.banco || propostaEncontrada.administradora_nome || empresasParceiras.find(e => e.id === selectedEmpresaParceira)?.nome || undefined,
              contrato: propostaEncontrada.contrato || propostaEncontrada.emprestimo_numero_ade || undefined,
              data_recebimento: dataRecebimento,
              valor_recebido: valorRecebido,
              origem_importacao_id: importacao.id,
              linha_importacao: idx + 1,
              hash_duplicidade: hashDuplicidade,
              percentual_comissao: pctComissao,
              valor_a_pagar: valorRecebido,
              status_recebimento: 'recebida',
              status_pagamento: 'a_pagar',
            };
            const obs = [item.banco, item.convenio, item.tipo_consignado].filter(Boolean).join(' | ');
            if (obs) recObj.observacoes = obs;
            recebimentosParaCriar.push(recObj);
            processados++;
            valorTotal += valorRecebido;
          }
        } else {
          itemMotivos[idx] = motivoDivergencia;
          divergencias++;
        }
      }

      // Criar ImportacaoItem para todos os registros (processados + divergências)
      const recPorIdx = {};
      recebimentosParaCriar.forEach(r => { recPorIdx[r._itemIdx] = r; });
      const itensParaCriar = previewData.items.map((item, idx) => {
        const contratoRaw = String(item.contrato || item.numero_ade || '').trim();
        const rec = recPorIdx[idx];
        return {
          importacao_id: importacao.id,
          linha: idx + 1,
          cpf: item.cpf || '',
          nome_completo: item.nome_completo || '',
          contrato: contratoRaw,
          grupo: '',
          cota: '',
          parcela: 0,
          valor_recebido: parseFloat(item.valor_comissao || item.valor) || 0,
          valor_base_comissao: parseFloat(item.valor_base_comissao) || 0,
          percentual_comissao: parseFloat(item.percentual_comissao) || 0,
          banco: item.banco || null,
          data_recebimento: item.data_recebimento || null,
          venda_id: rec?.venda_id || undefined,
          vendedor_nome: rec?.vendedor_nome || undefined,
          status: rec ? 'processado' : 'divergencia',
          motivo_divergencia: rec ? null : (itemMotivos[idx] || 'Não processado'),
        };
      });

      if (itensParaCriar.length > 0) {
        await base44.entities.ImportacaoItem.bulkCreate(itensParaCriar);
      }

      if (recebimentosParaCriar.length > 0) {
        const recebimentosData = recebimentosParaCriar.map(({ _itemIdx, ...rest }) => rest);
        const recebimentosCriados = await base44.entities.RecebimentoComissao.bulkCreate(recebimentosData);

        // Criar ComissaoAPagar para cada recebimento
        const comissoesAPagar = recebimentosCriados.map(rec => {
          const ca = {
            empresa_id: rec.empresa_id,
            recebimento_id: rec.id,
            venda_id: rec.venda_id,
            data_recebimento: rec.data_recebimento,
            valor_recebido: rec.valor_recebido,
            percentual_comissao: rec.percentual_comissao,
            valor_a_pagar: rec.valor_a_pagar,
            status_pagamento: 'a_pagar',
          };
          if (rec.cliente_id) ca.cliente_id = rec.cliente_id;
          if (rec.cliente_nome) ca.cliente_nome = rec.cliente_nome;
          if (rec.vendedor_id) ca.vendedor_id = rec.vendedor_id;
          if (rec.vendedor_nome) ca.vendedor_nome = rec.vendedor_nome;
          if (rec.administradora_id) ca.administradora_id = rec.administradora_id;
          if (rec.administradora_nome) ca.administradora_nome = rec.administradora_nome;
          if (rec.contrato) ca.contrato = rec.contrato;
          return ca;
        });
        await base44.entities.ComissaoAPagar.bulkCreate(comissoesAPagar);

        // Atualizar proposta: comissao_banco_recebida + percentual + valor_comissao + data_recebimento + valores financeiros
        const atualizacoesPorVenda = {};
        for (let ri = 0; ri < recebimentosCriados.length; ri++) {
          const rec = recebimentosCriados[ri];
          const itemOriginal = previewData.items[rec._itemIdx ?? ri] || {};
          if (!atualizacoesPorVenda[rec.venda_id]) {
            atualizacoesPorVenda[rec.venda_id] = {
              valor: 0,
              pct: rec.percentual_comissao,
              data: rec.data_recebimento,
              valor_base_comissao: itemOriginal.valor_base_comissao || null,
              valor_bruto: itemOriginal.valor_bruto || null,
              valor_liquido: itemOriginal.valor_liquido || null,
              valor_parcela: itemOriginal.valor_parcela || null,
            };
          }
          atualizacoesPorVenda[rec.venda_id].valor += rec.valor_recebido;
          if (!atualizacoesPorVenda[rec.venda_id].valor_base_comissao && itemOriginal.valor_base_comissao) {
            atualizacoesPorVenda[rec.venda_id].valor_base_comissao = itemOriginal.valor_base_comissao;
          }
          if (!atualizacoesPorVenda[rec.venda_id].valor_bruto && itemOriginal.valor_bruto) {
            atualizacoesPorVenda[rec.venda_id].valor_bruto = itemOriginal.valor_bruto;
          }
          if (!atualizacoesPorVenda[rec.venda_id].valor_liquido && itemOriginal.valor_liquido) {
            atualizacoesPorVenda[rec.venda_id].valor_liquido = itemOriginal.valor_liquido;
          }
          if (!atualizacoesPorVenda[rec.venda_id].valor_parcela && itemOriginal.valor_parcela) {
            atualizacoesPorVenda[rec.venda_id].valor_parcela = itemOriginal.valor_parcela;
          }
        }
        for (const [vendaId, info] of Object.entries(atualizacoesPorVenda)) {
          const p = await base44.entities.Proposta.get(vendaId);
          if (p) {
            const upd = {
              comissao_banco_recebida: true,
              valor_comissao: info.valor,
              comissao_recebida: (p.comissao_recebida || 0) + info.valor,
              data_comissao_recebida: info.data,
              percentual_comissao_vendedor: info.pct || p.percentual_comissao_vendedor,
            };
            if (info.valor_bruto) upd.valor_credito = info.valor_bruto;
            if (info.valor_liquido) upd.valor_liquido = info.valor_liquido;
            if (info.valor_base_comissao) upd.comissao_banco_base_comissao = info.valor_base_comissao;
            if (info.valor_parcela) upd.emprestimo_valor_parcela = info.valor_parcela;
            await base44.entities.Proposta.update(vendaId, upd);
          }
        }
      }

      await base44.entities.Importacao.update(importacao.id, {
        status: 'concluida',
        registros_processados: processados,
        registros_divergencia: divergencias,
        valor_total: valorTotal
      });

      // Registrar receita no financeiro se houver valor processado
      if (valorTotal > 0) {
        await base44.functions.invoke('registrarReceitaImportacao', {
          acao: 'criar',
          importacao_id: importacao.id,
          empresa_id: empresaIdFinal,
          produto: 'emprestimos',
          valor_total: valorTotal,
          data_recebimento: format(new Date(), 'yyyy-MM-dd'),
          arquivo_nome: files[0]?.name,
          usuario_id: currentUser?.id,
          usuario_nome: currentUser?.full_name,
        });
      }

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
        const p = await base44.entities.Proposta.get(vendaId);
        if (p) {
          const novoTotal = Math.max(0, (p.comissao_recebida || 0) - valorDesconto);
          const recRestantes = await base44.entities.RecebimentoComissao.filter({ venda_id: vendaId });
          await base44.entities.Proposta.update(vendaId, {
            comissao_recebida: novoTotal,
            comissao_banco_recebida: recRestantes.length > 0,
          });
        }
      }

      // Excluir receita financeira vinculada
      await base44.functions.invoke('registrarReceitaImportacao', { acao: 'excluir', importacao_id: impId });
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
                      <TableHead>Nome</TableHead>
                      <TableHead>Contrato/ADE</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Banco</TableHead>
                      <TableHead>Convênio</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>% Com.</TableHead>
                      <TableHead>Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.items.slice(0, 10).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell>{item.data_recebimento || '-'}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{item.nome_completo || '-'}</TableCell>
                        <TableCell>{item.contrato || item.numero_ade || '-'}</TableCell>
                        <TableCell>{item.cpf || '-'}</TableCell>
                        <TableCell>{item.banco || '-'}</TableCell>
                        <TableCell>{item.convenio || '-'}</TableCell>
                        <TableCell>{item.tipo_consignado || '-'}</TableCell>
                        <TableCell>{item.percentual_comissao != null ? `${item.percentual_comissao}%` : '-'}</TableCell>
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
                       <div className="flex items-center justify-end gap-2">
                         <Link to={createPageUrl('ImportacaoDetalhes') + `?id=${imp.id}&produto=emprestimos`}>
                           <Button variant="ghost" size="icon" className="h-8 w-8">
                             <Eye className="w-4 h-4" />
                           </Button>
                         </Link>
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
                       </div>
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