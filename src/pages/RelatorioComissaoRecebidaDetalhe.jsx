import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

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
import { Loader2, ArrowLeft, Download, Calendar, DollarSign } from "lucide-react";

const formatBR = (isoOrDate) => {
  if (!isoOrDate) return "";
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toLocaleDateString("pt-BR");
};

const toNumber = (v) => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const s = String(v)
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const moneyBR = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function RelatorioComissaoRecebidaDetalhe() {
  const params = new URLSearchParams(window.location.search);
  const dataKey = params.get("data") || "sem-data";

  const { data, isLoading, error } = useQuery({
    queryKey: ["comissao-recebida-detalhe", dataKey],
    queryFn: async () => {
      const res = await base44.entities.RecebimentoComissao.filter(
        { status_recebimento: 'recebida' },
        '-data_recebimento'
      );
      return res || [];
    },
  });

  const filtrado = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    
    if (dataKey === "sem-data") {
      return rows.filter((r) => !r?.data_recebimento);
    }

    return rows.filter((r) => {
      if (!r?.data_recebimento) return false;
      const rowDate = new Date(r.data_recebimento).toISOString().slice(0, 10);
      return rowDate === dataKey;
    });
  }, [data, dataKey]);

  const totais = useMemo(() => {
    return filtrado.reduce(
      (acc, r) => ({
        totalValor: acc.totalValor + toNumber(r?.valor_recebido),
        totalAPagar: acc.totalAPagar + toNumber(r?.valor_a_pagar),
        qtd: acc.qtd + 1,
      }),
      { totalValor: 0, totalAPagar: 0, qtd: 0 }
    );
  }, [filtrado]);

  const baixarPdf = async () => {
    try {
      toast.info("Gerando PDF do relatório...");
      
      // TODO: Implementar função backend para gerar PDF
      // const resp = await base44.functions.invoke('gerarPdfComissaoRecebidaDetalhe', { 
      //   data: dataKey,
      //   itens: filtrado 
      // });
      // if (resp?.data?.url) window.open(resp.data.url, "_blank");
      
      toast.success("Recurso de PDF em desenvolvimento");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const dataLabel = dataKey === "sem-data" 
    ? "Sem data de recebimento" 
    : formatBR(dataKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Relatório - ${dataLabel}`}
        subtitle="Detalhes das comissões recebidas nesta data"
        backTo={createPageUrl("RelatoriosComissaoRecebida")}
      >
        <Button 
          onClick={baixarPdf}
          className="bg-[#10353C] hover:bg-[#1a4a56]"
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
              <Calendar className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-700">Total de Recebimentos</p>
                <p className="text-2xl font-bold text-blue-800">{totais.qtd}</p>
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
                  {moneyBR(totais.totalValor)}
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
                  {moneyBR(totais.totalAPagar)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Detalhes */}
      <Card>
        <CardHeader>
          <CardTitle>Recebimentos do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando detalhes...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600">
              Erro ao carregar dados. Verifique o console.
            </div>
          )}

          {!isLoading && !filtrado.length && (
            <div className="text-sm opacity-70">
              Nenhum recebimento encontrado para esta data.
            </div>
          )}

          {!isLoading && filtrado.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Grupo/Cota</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Administradora</TableHead>
                    <TableHead className="text-right">Valor Recebido</TableHead>
                    <TableHead className="text-right">% Comissão</TableHead>
                    <TableHead className="text-right">A Pagar</TableHead>
                    <TableHead>Status Pgto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrado.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.contrato || '-'}</TableCell>
                      <TableCell>
                        {r.grupo && r.cota ? `${r.grupo}/${r.cota}` : '-'}
                      </TableCell>
                      <TableCell>{r.cliente_nome || '-'}</TableCell>
                      <TableCell>{r.vendedor_nome || '-'}</TableCell>
                      <TableCell>{r.administradora_nome || '-'}</TableCell>
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
                    <TableCell colSpan={5} className="text-right">
                      <strong>TOTAIS:</strong>
                    </TableCell>
                    <TableCell className="text-right">
                      <strong>{moneyBR(totais.totalValor)}</strong>
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right text-emerald-600">
                      <strong>{moneyBR(totais.totalAPagar)}</strong>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botões de Ação */}
      <div className="flex justify-between">
        <Link to={createPageUrl("RelatoriosComissaoRecebida")}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Relatórios
          </Button>
        </Link>
        
        <Button 
          onClick={baixarPdf}
          className="bg-[#10353C] hover:bg-[#1a4a56]"
        >
          <Download className="w-4 h-4 mr-2" />
          Baixar este Relatório (PDF)
        </Button>
      </div>
    </div>
  );
}