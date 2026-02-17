import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function ImportarComissaoVenda({ venda, onSuccess }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      // Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Processar CSV
      const result = await base44.functions.invoke('processarCsvComissao', {
        file_url,
        produto: 'consorcio',
        empresa_id: venda.empresa_id
      });

      if (result.data.status === 'success' && result.data.items) {
        setPreviewData({
          file_url,
          items: result.data.items,
          fileName: file.name
        });
        toast.success(`${result.data.total} registros encontrados no arquivo`);
      } else {
        toast.error('Erro ao processar arquivo');
      }
    } catch (error) {
      toast.error('Erro ao fazer upload do arquivo');
    } finally {
      setLoading(false);
    }
  };

  const processarImportacao = async () => {
    if (!previewData) return;

    setLoading(true);

    try {
      const configVendedor = await base44.entities.ConfiguracaoComissao.filter({
        tipo: 'vendedor',
        status: 'ativo'
      });
      const percentualPadrao = configVendedor.length > 0 ? configVendedor[0].percentual : 100;

      const recebimentosExistentes = await base44.entities.RecebimentoComissao.filter({
        venda_id: venda.id
      });
      const hashesExistentes = new Set(recebimentosExistentes.map(r => r.hash_duplicidade));

      let processados = 0;
      const recebimentosParaCriar = [];

      for (const item of previewData.items) {
        const valorRecebido = parseFloat(item.valor) || 0;
        const dataRecebimento = item.data_recebimento || new Date().toISOString().split('T')[0];
        const parcelaInformada = parseInt(item.parcela) || null;

        // Validar dados mínimos
        if (!item.contrato && !item.grupo && !item.cota) {
          toast.warning('Linha com dados insuficientes será ignorada');
          continue;
        }

        // Verificar duplicidade
        const hashDuplicidade = `${venda.id}_${dataRecebimento}_${valorRecebido}`;
        if (hashesExistentes.has(hashDuplicidade)) {
          toast.warning('Recebimento duplicado será ignorado');
          continue;
        }

        const valorAPagar = valorRecebido * (percentualPadrao / 100);

        recebimentosParaCriar.push({
          empresa_id: venda.empresa_id,
          venda_id: venda.id,
          cliente_id: venda.cliente_id,
          cliente_nome: venda.cliente_nome,
          vendedor_id: venda.vendedor_id,
          vendedor_nome: venda.vendedor_nome,
          administradora_id: venda.administradora_id,
          administradora_nome: venda.administradora_nome,
          grupo: venda.grupo,
          cota: venda.cota,
          contrato: venda.contrato,
          data_recebimento: dataRecebimento,
          valor_recebido: valorRecebido,
          parcela_informada: parcelaInformada,
          hash_duplicidade: hashDuplicidade,
          percentual_comissao: percentualPadrao,
          valor_a_pagar: valorAPagar,
          status_recebimento: 'recebida',
          status_pagamento: 'a_pagar'
        });

        processados++;
      }

      if (recebimentosParaCriar.length > 0) {
        await base44.entities.RecebimentoComissao.bulkCreate(recebimentosParaCriar);
        
        // Atualizar comissão_total_recebida na venda
        const valorTotal = recebimentosParaCriar.reduce((acc, r) => acc + r.valor_recebido, 0);
        await base44.entities.Venda.update(venda.id, {
          comissao_total_recebida: (venda.comissao_total_recebida || 0) + valorTotal
        });
      }

      setPreviewData(null);
      setOpen(false);
      toast.success(`✅ ${processados} recebimentos importados com sucesso!`);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast.error('Erro ao processar importação: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <Upload className="w-4 h-4" />
        Importar Comissões
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Comissões de Recebimento</DialogTitle>
            <DialogDescription>
              Importe um arquivo CSV com recebimentos de comissões para {venda.grupo}/{venda.cota}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info da Venda */}
            <Card className="bg-slate-50 border-0 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Administradora</p>
                  <p className="font-medium">{venda.administradora_nome}</p>
                </div>
                <div>
                  <p className="text-slate-500">Grupo / Cota</p>
                  <p className="font-medium">{venda.grupo} / {venda.cota}</p>
                </div>
                <div>
                  <p className="text-slate-500">Contrato</p>
                  <p className="font-medium">{venda.contrato || '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Cliente</p>
                  <p className="font-medium truncate">{venda.cliente_nome}</p>
                </div>
              </div>
            </Card>

            {/* Upload Area */}
            <div>
              <Label>Arquivo CSV *</Label>
              <div className="mt-2 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-slate-300 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload-comissao"
                  disabled={loading}
                />
                <label htmlFor="file-upload-comissao" className="cursor-pointer block">
                  {loading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      <span className="text-slate-500 text-sm">Processando arquivo...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-slate-400" />
                      <span className="text-slate-600 font-medium">Clique para selecionar arquivo CSV</span>
                      <span className="text-xs text-slate-400">
                        Formato: Data, Contrato, Grupo, Cota, Valor, Parcela
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Preview */}
            {previewData && (
              <div>
                <Label>
                  Pré-visualização ({previewData.items.length} registros)
                </Label>
                <div className="mt-2 border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Parcela</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.items.slice(0, 10).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>{item.data_recebimento || '-'}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(item.valor)}</TableCell>
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

            {/* Info */}
            <Card className="bg-blue-50 border-blue-200 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Como funciona:</p>
                  <ul className="list-disc ml-4 space-y-0.5">
                    <li>Os recebimentos serão vinculados a esta proposta (Grupo {venda.grupo}, Cota {venda.cota})</li>
                    <li>Duplicidade é verificada por venda + data + valor</li>
                    <li>Os recebimentos aparecerão em "Parcelas de Comissão" abaixo</li>
                  </ul>
                </div>
              </div>
            </Card>

            {/* Buttons */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setPreviewData(null);
                }}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                onClick={processarImportacao}
                disabled={!previewData || loading}
                className="bg-[#23BE84] hover:bg-[#1da570]"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Importar Recebimentos
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}