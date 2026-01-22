import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Search, Download, Calendar } from "lucide-react";
import { format } from "date-fns";

const moneyBR = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function RelatoriosComissaoRecebida() {
  const [busca, setBusca] = useState("");

  const { data: relatorios = [], isLoading, error } = useQuery({
    queryKey: ["relatorios-recebimento"],
    queryFn: async () => {
      const res = await base44.entities.RelatorioRecebimento.list('-created_date', 200);
      return res?.items || res || [];
    },
  });

  const filtrados = busca
    ? relatorios.filter((r) =>
        String(r?.protocolo ?? "").toLowerCase().includes(busca.toLowerCase())
      )
    : relatorios;

  const baixarPdf = async (relatorio) => {
    try {
      if (relatorio.pdf_url) {
        window.open(relatorio.pdf_url, "_blank");
      } else {
        toast.info("PDF ainda não gerado. Funcionalidade em desenvolvimento.");
        // TODO: Chamar function backend para gerar PDF
        // const resp = await base44.functions.invoke('gerarPdfRelatorioRecebimento', { relatorioId: relatorio.id });
        // if (resp?.data?.url) window.open(resp.data.url, "_blank");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao acessar PDF");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios - Comissão Recebida"
        subtitle="Cada protocolo representa um recebimento agrupado da administradora"
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-700">Total de Relatórios</p>
                <p className="text-2xl font-bold text-blue-800">{relatorios.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Download className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-sm text-emerald-700">Total Recebido</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {moneyBR(relatorios.reduce((sum, r) => sum + (r.total_recebido_adm || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-purple-700">Total a Pagar</p>
                <p className="text-2xl font-bold text-purple-800">
                  {moneyBR(relatorios.reduce((sum, r) => sum + (r.total_a_pagar || 0), 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Relatórios por Protocolo
          </CardTitle>

          <div className="flex gap-2 items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
              <Input
                className="pl-9"
                placeholder="Buscar por protocolo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm opacity-70">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando relatórios...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600">
              Erro ao carregar dados. Verifique o console.
            </div>
          )}

          {!isLoading && !filtrados.length && (
            <div className="text-sm opacity-70">
              {busca ? "Nenhum resultado encontrado." : "Nenhum relatório criado."}
            </div>
          )}

          <div className="space-y-3">
            {filtrados.map((r) => (
              <div
                key={r.id}
                className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-[#10353C] transition-colors"
              >
                <div className="space-y-1">
                  <div className="font-bold text-lg text-slate-900">
                    Protocolo: {r.protocolo}
                  </div>
                  <div className="text-sm text-slate-600 flex flex-wrap gap-2 items-center">
                    <span>
                      Data: {r.data_recebimento ? format(new Date(r.data_recebimento), 'dd/MM/yyyy') : '-'}
                    </span>
                    {r.administradora_nome && (
                      <span>• {r.administradora_nome}</span>
                    )}
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {r.qtd_itens} item{r.qtd_itens !== 1 ? 'ns' : ''}
                    </Badge>
                    <Badge 
                      className={
                        r.origem === 'importacao'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-green-100 text-green-700'
                      }
                    >
                      {r.origem === 'importacao' ? 'Importação' : 'Manual'}
                    </Badge>
                  </div>
                  <div className="text-sm flex flex-wrap gap-3">
                    <span>
                      Recebido: <strong className="text-blue-700">{moneyBR(r.total_recebido_adm)}</strong>
                    </span>
                    <span>
                      A pagar: <strong className="text-emerald-700">{moneyBR(r.total_a_pagar)}</strong>
                    </span>
                  </div>
                  {r.observacoes && (
                    <div className="text-xs text-slate-500 italic">
                      {r.observacoes}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link to={createPageUrl(`RelatorioComissaoRecebidaDetalhe?id=${r.id}`)}>
                    <Button variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      Abrir
                    </Button>
                  </Link>
                  <Button 
                    onClick={() => baixarPdf(r)}
                    className="bg-[#10353C] hover:bg-[#1a4a56]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}