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

export default function ImportacaoComissao() {
  const [selectedAdmin, setSelectedAdmin] = useState('');
  const [files, setFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [progressoLote, setProgressoLote] = useState(null); // { atual, total, nomeArquivo }
  const [currentUser, setCurrentUser] = useState(null);
  const [currentEmpresa, setCurrentEmpresa] = useState(null);
  const [empresaSelecionada, setEmpresaSelecionada] = useState('');
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

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.filter({ status: 'ativa' }),
  });

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-lista'],
    enabled: !!isSuperAdmin,
    queryFn: () => base44.entities.Empresa.filter({ status: 'ativa' }),
  });

  const { data: importacoes = [] } = useQuery({
    queryKey: ['importacoes-comissao'],
    queryFn: async () => {
      const all = await base44.entities.Importacao.list('-created_date');
      return all;
    },
  });

  const handleFileUpload = async (e) => {
    const uploadedFiles = Array.from(e.target.files || []);
    if (!uploadedFiles.length) return;

    // Se apenas 1 arquivo: comportamento original (preview antes de processar)
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
          produto: 'consorcio',
          empresa_id: empresaIdParaProcessar
        });
        if (result.data.status === 'success' && result.data.items) {
          setPreviewData({ file_url, items: result.data.items });
          toast.success(`${result.data.total} registros encontrados no arquivo`);
        } else {
          toast.error('Erro ao processar arquivo: ' + (result.data.error || 'Formato inválido'));
        }
      } catch (error) {
        toast.error('Erro ao fazer upload do arquivo');
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

        // Processar CSV
        const result = await base44.functions.invoke('processarCsvComissao', {
          file_url,
          produto: 'consorcio',
          empresa_id: empresaIdParaProcessar
        });

        if (!result.data?.items?.length) {
          erros.push(`${uploadedFile.name}: sem registros válidos`);
          continue;
        }

        const items = result.data.items;

        // Processar importação direto (sem preview)
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
      toast.success(`✅ Lote concluído: ${totalProcessados} processados, ${totalDivergencias} divergências, ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValor)}`);
    }
  };

  // Processa um conjunto de itens (de 1 arquivo) sem interação de preview
  const processarImportacaoLote = async ({ file_url, file_name, items, empresaIdFinal, onResult }) => {
    const admin = administradoras.find(a => a.id === selectedAdmin);

    const importacao = await base44.entities.Importacao.create({
      empresa_id: empresaIdFinal,
      produto: 'consorcio',
      administradora_id: selectedAdmin,
      administradora_nome: admin?.nome_fantasia || admin?.razao_social,
      usuario_id: currentUser?.id,
      usuario_nome: currentUser?.full_name,
      arquivo_nome: file_name,
      arquivo_url: file_url,
      total_registros: items.length,
      status: 'processando'
    });

    const configVendedor = await base44.entities.ConfiguracaoComissao.filter({ tipo: 'vendedor', status: 'ativo' });
    const percentualPadrao = configVendedor.length > 0 ? configVendedor[0].percentual : 100;
    const recebimentosExistentes = await base44.entities.RecebimentoComissao.filter({ origem_importacao_id: importacao.id });
    const hashesExistentes = new Set(recebimentosExistentes.map(r => r.hash_duplicidade));

    let processados = 0, divergencias = 0, valorTotal = 0;
    const itensParaCriar = [], recebimentosParaCriar = [], comissoesParaCriar = [], vendasParaAtualizar = {};

    for (const item of items) {
      const contratoRaw = String(item.contrato || '').trim();
      const contrato = contratoRaw && contratoRaw !== '-' ? contratoRaw : '';
      const grupoRaw = String(item.grupo || '').trim();
      const cotaRaw = String(item.cota || '').trim();
      const parcelaInformada = parseInt(item.parcela) || null;
      const valorRecebido = parseFloat(item.valor) || 0;
      const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');
      let vendaConsorcioEncontrada = null, motivoDivergencia = '';

      if (contrato) {
        let vendasMatch = await base44.entities.VendaConsorcio.filter({ contrato, administradora_id: selectedAdmin, ...(empresaIdFinal ? { empresa_id: empresaIdFinal } : {}) });
        if (vendasMatch.length === 0 && empresaIdFinal) vendasMatch = await base44.entities.VendaConsorcio.filter({ contrato, administradora_id: selectedAdmin });
        if (vendasMatch.length === 1) vendaConsorcioEncontrada = vendasMatch[0];
        else if (vendasMatch.length > 1) motivoDivergencia = 'Múltiplas vendas encontradas';
        else motivoDivergencia = 'Venda não encontrada pelo contrato';
      } else if (grupoRaw && cotaRaw) {
        const { venda, motivo } = await encontrarVendaConsorcioPorGrupoCota({ grupoRaw, cotaRaw, administradora_id: selectedAdmin, empresa_id: empresaIdFinal });
        vendaConsorcioEncontrada = venda;
        motivoDivergencia = motivo || '';
      } else {
        motivoDivergencia = 'Dados insuficientes (sem contrato nem grupo/cota)';
      }

      if (vendaConsorcioEncontrada) {
        const hashDuplicidade = `${vendaConsorcioEncontrada.venda_base_id}_${dataRecebimento}_${valorRecebido}`;
        if (hashesExistentes.has(hashDuplicidade)) { motivoDivergencia = 'Recebimento duplicado'; vendaConsorcioEncontrada = null; }
      }

      itensParaCriar.push({
        importacao_id: importacao.id,
        linha: items.indexOf(item) + 1,
        cpf: '', contrato, grupo: grupoRaw, cota: cotaRaw,
        parcela: parcelaInformada || 0, valor_recebido: valorRecebido,
        venda_id: vendaConsorcioEncontrada?.venda_base_id, parcela_id: null,
        status: vendaConsorcioEncontrada && !motivoDivergencia ? 'processado' : 'divergencia',
        motivo_divergencia: motivoDivergencia || null
      });

      if (vendaConsorcioEncontrada && !motivoDivergencia) {
        const hashDuplicidade = `${vendaConsorcioEncontrada.venda_base_id}_${dataRecebimento}_${valorRecebido}`;
        const valorAPagar = valorRecebido * (percentualPadrao / 100);
        const recebimentoId = `temp_${items.indexOf(item)}`;
        recebimentosParaCriar.push({ _tempId: recebimentoId, empresa_id: vendaConsorcioEncontrada.empresa_id, venda_id: vendaConsorcioEncontrada.venda_base_id, cliente_id: vendaConsorcioEncontrada.cliente_id, cliente_nome: vendaConsorcioEncontrada.cliente_nome, vendedor_id: vendaConsorcioEncontrada.vendedor_id, vendedor_nome: vendaConsorcioEncontrada.vendedor_nome, administradora_id: vendaConsorcioEncontrada.administradora_id, administradora_nome: vendaConsorcioEncontrada.administradora_nome || admin?.nome_fantasia || admin?.razao_social, grupo: vendaConsorcioEncontrada.grupo, cota: vendaConsorcioEncontrada.cota, contrato: vendaConsorcioEncontrada.contrato, data_recebimento: dataRecebimento, valor_recebido: valorRecebido, parcela_informada: parcelaInformada, origem_importacao_id: importacao.id, linha_importacao: items.indexOf(item) + 1, hash_duplicidade: hashDuplicidade, percentual_comissao: percentualPadrao, valor_a_pagar: valorAPagar, status_recebimento: 'recebida', status_pagamento: 'a_pagar' });
        comissoesParaCriar.push({ _recebimentoTempId: recebimentoId, empresa_id: vendaConsorcioEncontrada.empresa_id, venda_id: vendaConsorcioEncontrada.venda_base_id, cliente_id: vendaConsorcioEncontrada.cliente_id, cliente_nome: vendaConsorcioEncontrada.cliente_nome, vendedor_id: vendaConsorcioEncontrada.vendedor_id, vendedor_nome: vendaConsorcioEncontrada.vendedor_nome, administradora_id: vendaConsorcioEncontrada.administradora_id, administradora_nome: vendaConsorcioEncontrada.administradora_nome || admin?.nome_fantasia || admin?.razao_social, grupo: vendaConsorcioEncontrada.grupo, cota: vendaConsorcioEncontrada.cota, contrato: vendaConsorcioEncontrada.contrato, parcela_numero: parcelaInformada, data_recebimento: dataRecebimento, valor_recebido: valorRecebido, percentual_comissao: percentualPadrao, valor_a_pagar: valorAPagar, status_pagamento: 'a_apagar' });
        if (!vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id]) vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id] = { comissao_total_recebida: vendaConsorcioEncontrada.comissao_total_recebida || 0 };
        vendasParaAtualizar[vendaConsorcioEncontrada.venda_base_id].comissao_total_recebida += valorRecebido;
        processados++; valorTotal += valorRecebido;
      } else { divergencias++; }
    }

    if (itensParaCriar.length > 0) await base44.entities.ImportacaoItem.bulkCreate(itensParaCriar);
    if (recebimentosParaCriar.length > 0) {
      const recebimentosData = recebimentosParaCriar.map(r => { const { _tempId, ...data } = r; return data; });
      const recebimentosCriados = await base44.entities.RecebimentoComissao.bulkCreate(recebimentosData);
      const comissoesData = comissoesParaCriar.map((c, idx) => { const { _recebimentoTempId, ...data } = c; return { ...data, recebimento_id: recebimentosCriados[idx].id }; });
      if (comissoesData.length > 0) await base44.entities.ComissaoAPagar.bulkCreate(comissoesData);
    }
    for (const [vendaBaseId, updateData] of Object.entries(vendasParaAtualizar)) {
      await base44.entities.Venda.update(vendaBaseId, updateData);
    }
    await base44.entities.Importacao.update(importacao.id, { status: 'concluida', registros_processados: processados, registros_divergencia: divergencias, valor_total: valorTotal });

    if (onResult) onResult(processados, divergencias, valorTotal);
  };

  // Normaliza grupo/cota: tira tudo que não for dígito
  const normDigits = (v) => {
    const s = String(v ?? '').trim();
    const d = s.replace(/\D/g, '');
    return d.length ? d : null;
  };

  // Verifica se dois valores de grupo/cota batem (comparando string limpa e numérico)
  const gruposCotasBatem = (valorDB, valorArquivo) => {
    const db  = String(valorDB  ?? '').trim();
    const arq = String(valorArquivo ?? '').trim();
    if (db === arq) return true;
    const dbD  = normDigits(db);
    const arqD = normDigits(arq);
    if (dbD && arqD && dbD === arqD) return true;
    return false;
  };

  // Busca em cache local de vendas já carregadas — sem requisições adicionais
  const encontrarVendaEmCache = (vendas, { grupoRaw, cotaRaw, contrato, administradora_id }) => {
    const grupoStr = String(grupoRaw ?? '').trim();
    const cotaStr  = String(cotaRaw  ?? '').trim();
    const contratoStr = String(contrato ?? '').trim();

    const matches = vendas.filter(v => {
      if (v.administradora_id !== administradora_id) return false;
      if (contratoStr && contratoStr !== '-') {
        return String(v.contrato ?? '').trim() === contratoStr;
      }
      return gruposCotasBatem(v.grupo, grupoStr) && gruposCotasBatem(v.cota, cotaStr);
    });

    if (matches.length === 1) return { venda: matches[0], motivo: null };
    if (matches.length > 1)  return { venda: null, motivo: 'Múltiplas vendas encontradas por grupo/cota' };
    return { venda: null, motivo: 'Venda não encontrada por grupo/cota' };
  };

  const processarImportacao = async () => {
    if (!previewData || !selectedAdmin) return;

    setIsProcessing(true);

    try {
      const admin = administradoras.find(a => a.id === selectedAdmin);
      
      const empresaIdFinal = isSuperAdmin
        ? (empresaSelecionada || null)
        : (currentUser?.empresa_id || currentEmpresa?.id);

      if (!isSuperAdmin && !empresaIdFinal) {
        toast.error('Empresa não vinculada ao usuário');
        setIsProcessing(false);
        return;
      }
      if (isSuperAdmin && !empresaIdFinal) {
        toast.error('Selecione a empresa para importar');
        setIsProcessing(false);
        return;
      }

       const importacao = await base44.entities.Importacao.create({
         empresa_id: empresaIdFinal,
         produto: 'consorcio',
         administradora_id: selectedAdmin,
         administradora_nome: admin?.nome_fantasia || admin?.razao_social,
         usuario_id: currentUser?.id,
         usuario_nome: currentUser?.full_name,
         arquivo_nome: files[0]?.name,
         arquivo_url: previewData.file_url,
         total_registros: previewData.items.length,
         status: 'processando'
       });

      const [configVendedor, recebimentosExistentes, vendasConsorcio, vendasLegado] = await Promise.all([
        base44.entities.ConfiguracaoComissao.filter({ tipo: 'vendedor', status: 'ativo' }),
        base44.entities.RecebimentoComissao.filter({ administradora_id: selectedAdmin }),
        base44.entities.VendaConsorcio.filter({ administradora_id: selectedAdmin }),
        base44.entities.Venda.filter({ administradora_id: selectedAdmin }),
      ]);

      const percentualPadrao = configVendedor.length > 0 ? configVendedor[0].percentual : 100;
      const hashesExistentes = new Set(recebimentosExistentes.map(r => r.hash_duplicidade));

      // Cache unificado: VendaConsorcio normalizada + Venda legado normalizada
      const todasVendas = [
        ...vendasConsorcio.map(v => ({ ...v, venda_base_id: v.venda_base_id || v.id, comissao_total_recebida: v.comissao_total_recebida || 0 })),
        ...vendasLegado.map(v => ({ ...v, venda_base_id: v.id, comissao_total_recebida: v.comissao_total_recebida || 0 })),
      ];

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

        const { venda, motivo } = encontrarVendaEmCache(todasVendas, {
          grupoRaw,
          cotaRaw,
          contrato,
          administradora_id: selectedAdmin,
        });
        vendaConsorcioEncontrada = venda;
        motivoDivergencia = motivo || (!grupoRaw && !cotaRaw && !contrato ? 'Dados insuficientes (sem contrato nem grupo/cota)' : motivo || '');

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
            administradora_id: vendaConsorcioEncontrada.administradora_id,
            administradora_nome: vendaConsorcioEncontrada.administradora_nome || admin.nome_fantasia || admin.razao_social,
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
            administradora_id: vendaConsorcioEncontrada.administradora_id,
            administradora_nome: vendaConsorcioEncontrada.administradora_nome || admin.nome_fantasia || admin.razao_social,
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

      // Atualiza comissao_total_recebida — tenta VendaConsorcio primeiro (pelo venda_base_id),
      // depois Venda legado. Usa update parcial para não acionar validação de campos obrigatórios.
      for (const [vendaBaseId, updateData] of Object.entries(vendasParaAtualizar)) {
        // Verifica se existe em VendaConsorcio
        const vcMatch = vendasConsorcio.filter(v => v.venda_base_id === vendaBaseId);
        if (vcMatch.length > 0) {
          await base44.entities.VendaConsorcio.update(vcMatch[0].id, { comissao_total_recebida: updateData.comissao_total_recebida });
        } else {
          // Venda legado: busca pelo id diretamente
          const vLegado = vendasLegado.find(v => v.id === vendaBaseId);
          if (vLegado) {
            await base44.entities.Venda.update(vendaBaseId, { comissao_total_recebida: updateData.comissao_total_recebida });
          }
        }
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
        title="IMPC Consórcio"
        subtitle="Importe arquivos CSV de comissões recebidas das administradoras"
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
            <Label>Arquivo(s) CSV *</Label>
            <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={isProcessing || !selectedAdmin || (isSuperAdmin && !empresaSelecionada)}
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
                      Selecione um ou vários arquivos de uma vez. Lote de +20 arquivos suportado.
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
              <Label>
                Pré-visualização ({previewData.items.length} registros)
                <span className="text-xs text-slate-500 ml-2">
                  (Compare GRUPO/COTA aqui com os valores no Menu > Propostas > Consórcio)
                </span>
              </Label>
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
              disabled={!previewData || !selectedAdmin || isProcessing || (isSuperAdmin && !empresaSelecionada)}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Processar Importação
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Importações */}
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
                    <TableHead>Administradora</TableHead>
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
                      <TableCell>{imp.administradora_nome || '-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{imp.arquivo_nome || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-green-600 font-medium">{imp.registros_processados || 0}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-amber-600 font-medium">{imp.registros_divergencia || 0}</span>
                          <span className="text-slate-400">/</span>
                          <span className="text-slate-600">{imp.total_registros || 0}</span>
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
                          <Link to={createPageUrl('ImportacaoDetalhes') + `?id=${imp.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={async () => {
                              if (!confirm('Deseja realmente excluir esta importação?')) return;
                              try {
                                await base44.entities.Importacao.delete(imp.id);
                                queryClient.invalidateQueries(['importacoes-comissao']);
                                toast.success('Importação excluída');
                              } catch (e) {
                                toast.error('Erro ao excluir importação');
                              }
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
      </div>
      );
      }