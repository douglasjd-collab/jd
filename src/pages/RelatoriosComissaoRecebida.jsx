import React, { useMemo, useState } from "react";
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
import { Loader2, Calendar, FileText, Search, Download } from "lucide-react";

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

export default function RelatoriosComissaoRecebida() {
  const [busca, setBusca] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["comissao-recebida-relatorios"],
    queryFn: async () => {
      const res = await base44.entities.RecebimentoComissao.filter(
        { status_recebimento: 'recebida' },
        '-data_recebimento'
      );
      return res || [];
    },
  });

  const grouped = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];

    const filtered = !busca
      ? rows
      : rows.filter((r) => {
          const search = busca.toLowerCase();
          return (
            String(r?.contrato ?? "").toLowerCase().includes(search) ||
            String(r?.cliente_nome ?? "").toLowerCase().includes(search) ||
            String(r?.vendedor_nome ?? "").toLowerCase().includes(search)
          );
        });

    const map = new Map();

    for (const r of filtered) {
      const key = r?.data_recebimento
        ? new Date(r.data_recebimento).toISOString().slice(0, 10)
        : "sem-data";

      if (!map.has(key)) {
        map.set(key, {
          dataKey: key,
          dataLabel: key === "sem-data" ? "Sem data de recebimento" : formatBR(key),
          itens: [],
          totalValor: 0,
          totalAPagar: 0,
          qtdRecebimentos: 0,
        });
      }

      const bucket = map.get(key);

      const valorRecebido = toNumber(r?.valor_recebido);
      const valorAPagar = toNumber(r?.valor_a_pagar);

      bucket.itens.push({
        ...r,
        _valorRecebido: valorRecebido,
        _valorAPagar: valorAPagar,
      });

      bucket.totalValor += valorRecebido;
      bucket.totalAPagar += valorAPagar;
      bucket.qtdRecebimentos++;
    }

    const arr = Array.from(map.values()).sort((a, b) => {
      if (a.dataKey === "sem-data") return 1;
      if (b.dataKey === "sem-data") return -1;
      return b.dataKey.localeCompare(a.dataKey);
    });

    return arr;
  }, [data, busca]);

  const baixarPdf = async (dataKey) => {
    try {
      toast.info("Gerando PDF do relatório...");
      
      // TODO: Implementar função backend para gerar PDF
      // const resp = await base44.functions.invoke('gerarPdfComissaoRecebida', { data: dataKey });
      // if (resp?.data?.url) window.open(resp.data.url, "_blank");
      
      toast.success("Recurso de PDF em desenvolvimento");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF");
    }
  };

  const totaisGerais = useMemo(() => {
    return grouped.reduce(
      (acc, g) => ({
        totalValor: acc.totalValor + g.totalValor,
        totalAPagar: acc.totalAPagar + g.totalAPagar,
        qtdRecebimentos: acc.qtdRecebimentos + g.qtdRecebimentos,
      }),
      { totalValor: 0, totalAPagar: 0, qtdRecebimentos: 0 }
    );
  }, [grouped]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios - Comissão Recebida"
        subtitle="Comissões recebidas das administradoras agrupadas por data"
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Calendar className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-blue-700">Total de Datas</p>
                <p className="text-2xl font-bold text-blue-800">{grouped.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-emerald-600" />
              <div>
                <p className="text-sm text-emerald-700">Valor Recebido</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {moneyBR(totaisGerais.totalValor)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-purple-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Download className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-sm text-purple-700">A Pagar</p>
                <p className="text-2xl font-bold text-purple-800">
                  {moneyBR(totaisGerais.totalAPagar)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Relatórios por Data
          </CardTitle>

          <div className="flex gap-2 items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
              <Input
                className="pl-9"
                placeholder="Buscar por contrato, cliente ou vendedor..."
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
              Carregando comissões recebidas...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600">
              Erro ao carregar dados. Verifique o console.
            </div>
          )}

          {!isLoading && !grouped.length && (
            <div className="text-sm opacity-70">
              {busca ? "Nenhum resultado encontrado para a busca." : "Nenhuma comissão recebida."}
            </div>
          )}

          <div className="space-y-3">
            {grouped.map((g) => (
              <div
                key={g.dataKey}
                className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-[#10353C] transition-colors"
              >
                <div className="space-y-1">
                  <div className="font-medium text-lg">{g.dataLabel}</div>
                  <div className="text-sm opacity-75 flex flex-wrap gap-3 items-center">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {g.qtdRecebimentos} recebimento{g.qtdRecebimentos !== 1 ? 's' : ''}
                    </Badge>
                    <span>Recebido: <strong>{moneyBR(g.totalValor)}</strong></span>
                    <span>A Pagar: <strong>{moneyBR(g.totalAPagar)}</strong></span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link to={createPageUrl(`RelatorioComissaoRecebidaDetalhe?data=${g.dataKey}`)}>
                    <Button variant="outline">
                      <FileText className="w-4 h-4 mr-2" />
                      Ver relatório
                    </Button>
                  </Link>
                  <Button 
                    onClick={() => baixarPdf(g.dataKey)}
                    className="bg-[#10353C] hover:bg-[#1a4a56]"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Baixar PDF
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