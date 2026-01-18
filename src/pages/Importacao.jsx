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
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Importacao() {
  const [uploadOpen, setUploadOpen] = useState(false);
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

      let processados = 0;
      let divergencias = 0;
      let valorTotal = 0;
      const itensParaCriar = [];

      for (const item of previewData.items) {
        const contrato = String(item.contrato || '').trim();
        const grupo = String(item.grupo || '').trim();
        const cota = String(item.cota || '').trim();
        const numeroParcela = parseInt(item.parcela) || 1;
        const valorRecebido = parseFloat(item.valor) || 0;
        const dataRecebimento = item.data_recebimento || format(new Date(), 'yyyy-MM-dd');

        // VALIDAÇÃO ANTI-DUPLICIDADE (bloquear import repetido)
        // Verifica se já existe comissão com: contrato + grupo + cota + parcela
        const comissoesExistentes = await base44.entities.Comissao.filter({
          tipo_comissao: 'parcela'
        });
        
        let jaImportado = false;
        for (const comissao of comissoesExistentes) {
          const vendaComissao = vendas.find(v => v.id === comissao.venda_id);
          if (!vendaComissao) continue;
          
          // Verificar se já existe com o mesmo contrato+grupo+cota+parcela
          const contratoMatch = vendaComissao.contrato === contrato;
          const grupoMatch = vendaComissao.grupo === grupo;
          const cotaMatch = vendaComissao.cota === cota;
          
          if (contratoMatch && grupoMatch && cotaMatch && comissao.parcela_id) {
            const parcelaComissao = parcelas.find(p => p.id === comissao.parcela_id);
            if (parcelaComissao && parcelaComissao.numero_parcela === numeroParcela) {
              jaImportado = true;
              break;
            }
          }
        }

        if (jaImportado) {
          const itemImportacao = {
            importacao_id: importacao.id,
            linha: previewData.items.indexOf(item) + 1,
            cpf: '',
            contrato,
            grupo,
            cota,
            parcela: numeroParcela,
            valor_recebido: valorRecebido,
            venda_id: null,
            parcela_id: null,
            status: 'divergencia',
            motivo_divergencia: `Comissão já importada: contrato ${contrato}, grupo ${grupo}, cota ${cota}, parcela ${numeroParcela}`
          };
          itensParaCriar.push(itemImportacao);
          divergencias++;
          continue;
        }

        // NOVAS REGRAS DE IDENTIFICAÇÃO
        let vendaEncontrada = null;
        let motivoDivergencia = '';

        // REGRA 1 - PRIORIDADE CONTRATO
        if (contrato) {
          const vendasMatch = vendas.filter(v => 
            v.contrato === contrato &&
            v.administradora_id === selectedAdmin
          );
          
          if (vendasMatch.length === 1) {
            vendaEncontrada = vendasMatch[0];
          } else if (vendasMatch.length > 1) {
            motivoDivergencia = 'Múltiplas vendas encontradas para Contrato + Administradora';
          } else {
            motivoDivergencia = 'Venda não encontrada para o contrato informado';
          }
        }
        // REGRA 2 - PRIORIDADE GRUPO + COTA
        else if (grupo && cota) {
          const vendasMatch = vendas.filter(v => 
            String(v.grupo).trim() === grupo &&
            String(v.cota).trim() === cota &&
            v.administradora_id === selectedAdmin
          );
          
          if (vendasMatch.length === 1) {
            vendaEncontrada = vendasMatch[0];
          } else if (vendasMatch.length > 1) {
            motivoDivergencia = 'Múltiplas vendas encontradas para Grupo + Cota + Administradora';
          } else {
            motivoDivergencia = 'Venda não encontrada para o Grupo e Cota informados';
          }
        }
        // REGRA DE SEGURANÇA - Dados insuficientes
        else {
          motivoDivergencia = 'Dados insuficientes: informe Contrato OU (Grupo + Cota)';
        }

        // Verificar parcela
        let parcelaEncontrada = null;
        if (vendaEncontrada) {
          const parcelasVenda = parcelas.filter(p => 
            p.venda_id === vendaEncontrada.id && 
            p.numero_parcela === numeroParcela
          );

          if (parcelasVenda.length === 1) {
            parcelaEncontrada = parcelasVenda[0];
            
            if (parcelaEncontrada.status === 'recebida') {
              motivoDivergencia = 'Parcela já baixada anteriormente';
              vendaEncontrada = null;
            }
          } else if (parcelasVenda.length === 0) {
            motivoDivergencia = 'Parcela não encontrada';
            vendaEncontrada = null;
          }
        }

        // Criar item de importação
        const itemImportacao = {
          importacao_id: importacao.id,
          linha: previewData.items.indexOf(item) + 1,
          cpf: '',
          contrato,
          grupo,
          cota,
          parcela: numeroParcela,
          valor_recebido: valorRecebido,
          venda_id: vendaEncontrada?.id,
          parcela_id: parcelaEncontrada?.id,
          status: vendaEncontrada && !motivoDivergencia ? 'processado' : 'divergencia',
          motivo_divergencia: motivoDivergencia || null
        };

        itensParaCriar.push(itemImportacao);

        if (vendaEncontrada && !motivoDivergencia) {
          // Baixar parcela
          await base44.entities.Parcela.update(parcelaEncontrada.id, {
            status: 'recebida',
            valor_recebido: valorRecebido,
            data_recebimento: dataRecebimento,
            importacao_id: importacao.id
          });

          // Atualizar comissão recebida na venda
          const novoValorRecebido = (vendaEncontrada.comissao_total_recebida || 0) + valorRecebido;
          await base44.entities.Venda.update(vendaEncontrada.id, {
            comissao_total_recebida: novoValorRecebido
          });

          // GERAR COMISSÃO PARA O VENDEDOR (adiciona ao saldo)
          if (vendaEncontrada.vendedor_id) {
            // Buscar vendedor
            const vendedores = await base44.entities.User.filter({ id: vendaEncontrada.vendedor_id });
            if (vendedores.length > 0) {
              const vendedor = vendedores[0];
              const novoSaldo = (vendedor.saldo_comissao || 0) + valorRecebido;
              
              // Atualizar saldo do vendedor
              await base44.entities.User.update(vendedor.id, {
                saldo_comissao: novoSaldo
              });

              // Criar registro de comissão
              await base44.entities.Comissao.create({
                venda_id: vendaEncontrada.id,
                parcela_id: parcelaEncontrada.id,
                usuario_id: vendedor.id,
                usuario_nome: vendedor.full_name,
                usuario_perfil: vendedor.perfil,
                tipo: 'receber',
                valor: valorRecebido,
                status: 'confirmada'
              });
            }
          }

          processados++;
          valorTotal += valorRecebido;
        } else {
          divergencias++;
        }
      }

      // Criar itens em lote
      if (itensParaCriar.length > 0) {
        await base44.entities.ImportacaoItem.bulkCreate(itensParaCriar);
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
      
      toast.success(`Importação concluída: ${processados} processados, ${divergencias} divergências`);
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
      className: 'w-12',
      cell: (row) => (
        <Link to={createPageUrl(`ImportacaoDetalhes?id=${row.id}`)}>
          <Button variant="ghost" size="icon">
            <Eye className="w-4 h-4" />
          </Button>
        </Link>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importação de Comissões"
        subtitle="Importe arquivos de comissões recebidas das administradoras"
        actionLabel="Nova Importação"
        actionIcon={Upload}
        onAction={() => setUploadOpen(true)}
      />

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
                <p className="font-medium">Regras de identificação:</p>
                <ol className="list-decimal ml-4 mt-2 space-y-1">
                  <li><strong>Se Contrato informado:</strong> Busca por Contrato + Administradora (Grupo e Cota não obrigatórios)</li>
                  <li><strong>Se Grupo e Cota informados:</strong> Busca por Grupo + Cota + Administradora (Contrato não obrigatório)</li>
                </ol>
                <p className="mt-2 font-medium">⚠️ Divergências:</p>
                <ul className="list-disc ml-4 mt-1 space-y-1">
                  <li>Múltiplas vendas encontradas</li>
                  <li>Parcela já baixada</li>
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
    </div>
  );
}