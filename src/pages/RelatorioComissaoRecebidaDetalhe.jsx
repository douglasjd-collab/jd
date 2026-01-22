import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";

import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Download, Calendar, DollarSign, FileText } from "lucide-react";
import { format } from "date-fns";

const moneyBR = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function RelatorioComissaoRecebidaDetalhe() {
  const params = new URLSearchParams(window.location.search);
  const relatorioId = params.get("id");

  const { data: relatorio, isLoading: loadingRelatorio, error: errorRelatorio } = useQuery({
    queryKey: ["relatorio-recebimento", relatorioId],
    queryFn: async () => {
      if (!relatorioId) return null;
      const res = await base44.entities.RelatorioRecebimento.filter({ id: relatorioId });
      return res?.[0] || null;
    },
    enabled: !!relatorioId,
  });

  const { data: itens = [], isLoading: loadingItens } = useQuery({
    queryKey: ["recebimentos-relatorio", relatorioId],
    queryFn: async () => {
      if (!relatorioId) return [];
      const res = await base44.entities.RecebimentoComissao.filter(
        { relatorio_recebimento_id: relatorioId },
        '-created_date'
      );
      return res || [];
    },
    enabled: !!relatorioId,
  });

  const baixarPdf = async () => {
    try {
      if (relatorio?.pdf_url) {
        window.open(relatorio.pdf_url, "_blank");
      } else {
        toast.info("Gerando PDF do relatório...");
        // TODO: Implementar função backend para gerar PDF
        // const resp = await base44.functions.invoke('gerarPdfRelatorioRecebimento', { 
        //   relatorioId: relatorioId,
        //   itens: itens 
        // });
        // if (resp?.data?.url) window.open(resp.data.url, "_blank");
        
        toast.success("Recurso de PDF em desenvolvimento");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  if (!relatorioId) {
    return (
      <div className="p-8">
        <div className="text-center text-red-600">
          Nenhum relatório selecionado. ID inválido.
        </div>
      </div>
    );
  }

  const isLoading = loadingRelatorio || loadingItens;

  return (
    <div className="space-y-6">
      <PageHeader
        title={relatorio ? `Relatório ${relatorio.protocolo}` : "Carregando..."}
        subtitle={
          relatorio?.data_recebimento
            ? `Recebimento de ${format(new Date(relatorio.data_recebimento), 'dd/MM/yyyy')}`
            : ""
        }
        backTo={createPageUrl("RelatoriosComissaoRecebida")}
      >
        <Button 
          onClick={baixarPdf}
          className="bg-[#10353C] hover:bg-[#1a4a56]"
          disabled={!relatorio}
        >
          <Download className="w-4 h-4 mr-2" />
          Baixar PDF
        </Button>
      </PageHeader>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-700">Total de Itens</p>
                <p className="text-2xl font-bold text-blue-800">
                  {isLoading ? "..." : (relatorio?.qtd_itens || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-sm text-emerald-700">Valor Recebido</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {isLoading ? "..." : moneyBR(relatorio?.total_recebido_adm || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-purple-700">A Pagar aos Vendedores</p>
                <p className="text-2xl font-bold text-purple-800">
                  {isLoading ? "..." : moneyBR(relatorio?.total_a_pagar || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Informações do Relatório */}
      {relatorio && (
        <Card>
          <CardHeader>
            <CardTitle>Informações do Relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-4 flex-wrap text-sm">
              <div>
                <span className="text-slate-600">Protocolo:</span>
                <span className="ml-2 font-semibold">{relatorio.protocolo}</span>
              </div>
              <div>
                <span className="text-slate-600">Data:</span>
                <span className="ml-2 font-semibold">
                  {relatorio.data_recebimento
                    ? format(new Date(relatorio.data_recebimento), 'dd/MM/yyyy')
                    : '-'}
                </span>
              </div>
              {relatorio.administradora_nome && (
                <div>
                  <span className="text-slate-600">Administradora:</span>
                  <span className="ml-2 font-semibold">{relatorio.administradora_nome}</span>
                </div>
              )}
              <div>
                <Badge 
                  className={
                    relatorio.origem === 'importacao'
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-green-100 text-green-700'
                  }
                >
                  {relatorio.origem === 'importacao' ? 'Importação' : 'Manual'}
                </Badge>
              </div>
            </div>
            {relatorio.observacoes && (
              <div className="text-sm">
                <span className="text-slate-600">Observações:</span>
                <p className="mt-1 text-slate-700 italic">{relatorio.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabela de Recebimentos */}
      <Card>
        <CardHeader>
          <CardTitle>Recebimentos Incluídos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando detalhes...
            </div>
          )}

          {errorRelatorio && (
            <div className="text-sm text-red-600">
              Erro ao carregar relatório. Verifique o console.
            </div>
          )}

          {!isLoading && !itens.length && (
            <div className="text-sm opacity-70">
              Nenhum recebimento vinculado a este relatório.
            </div>
          )}

          {!isLoading && itens.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Grupo/Cota</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Valor Recebido</TableHead>
                    <TableHead className="text-right">% Comissão</TableHead>
                    <TableHead className="text-right">A Pagar</TableHead>
                    <TableHead>Status Pgto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.contrato || '-'}</TableCell>
                      <TableCell>
                        {r.grupo && r.cota ? `${r.grupo}/${r.cota}` : '-'}
                      </TableCell>
                      <TableCell>{r.cliente_nome || '-'}</TableCell>
                      <TableCell>{r.vendedor_nome || '-'}</TableCell>
                      <TableCell className="text-right font-medium">
                        {moneyBR(r.valor_recebido)}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.percentual_comissao || 100}%
                      </TableCell>
                      <TableCell className="text-right font-medium text-emerald-600">
                        {moneyBR(r.valor_a_pagar)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            r.status_pagamento === 'paga'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-amber-100 text-amber-700'
                          }
                        >
                          {r.status_pagamento === 'paga' ? 'Paga' : 'A Pagar'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Linha de Totais */}
                  <TableRow className="bg-slate-50 font-medium">
                    <TableCell colSpan={4} className="text-right">
                      <strong>TOTAIS:</strong>
                    </TableCell>
                    <TableCell className="text-right">
                      <strong>{moneyBR(relatorio?.total_recebido_adm || 0)}</strong>
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right text-emerald-600">
                      <strong>{moneyBR(relatorio?.total_a_pagar || 0)}</strong>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}