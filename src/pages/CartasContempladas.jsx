import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import PageHeader from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Loader2, WalletCards, Banknote, ReceiptText, Percent, RefreshCw, Layers3, ExternalLink, CheckCircle2, Clock3, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const moneyBR = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctBR = (v) => v === null || v === undefined ? "Não informada" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const parseMoney = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
};
const formatInputMoney = (v) => v ? Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";

function FonteBadge({ fonte }) {
  const cfg = fonte.status === "conectada"
    ? { icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-200", texto: `${fonte.quantidade || 0} cartas` }
    : fonte.status === "erro"
      ? { icon: AlertTriangle, cls: "bg-red-50 text-red-700 border-red-200", texto: "Erro na consulta" }
      : { icon: Clock3, cls: "bg-amber-50 text-amber-700 border-amber-200", texto: "Integração pendente" };
  const Icon = cfg.icon;
  return (
    <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${cfg.cls}`}>
      <div className="flex items-center gap-2 min-w-0"><Icon className="w-4 h-4 shrink-0"/><span className="font-semibold text-sm truncate">{fonte.nome}</span></div>
      <span className="text-xs whitespace-nowrap">{cfg.texto}</span>
    </div>
  );
}

function RecommendationCard({ icon: Icon, title, result, tone, onOpen }) {
  const tones = {
    entrada: "border-emerald-200 bg-emerald-50/60 text-emerald-800",
    parcela: "border-blue-200 bg-blue-50/60 text-blue-800",
    taxa: "border-violet-200 bg-violet-50/60 text-violet-800",
  };
  return (
    <Card className={`border-2 ${tones[tone]}`}>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className="w-4 h-4"/>{title}</CardTitle></CardHeader>
      <CardContent>
        {!result ? <p className="text-sm opacity-70">Nenhuma opção com esse critério disponível.</p> : <>
          <p className="text-xs opacity-70">{result.administradora} • {result.quantidade_cartas} {result.quantidade_cartas === 1 ? "carta" : "cartas"}</p>
          <p className="text-xl font-bold mt-1">{moneyBR(tone === "entrada" ? result.entrada : tone === "parcela" ? result.valor_parcela : result.taxa)}</p>
          {tone === "taxa" && <p className="text-xs opacity-70 -mt-1">Taxa média informada</p>}
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <span>Crédito <b>{moneyBR(result.valor_credito)}</b></span><span>Entrada <b>{moneyBR(result.entrada)}</b></span>
            <span>Parcela <b>{moneyBR(result.valor_parcela)}</b></span><span>Prazo <b>{result.parcelas || "—"} meses</b></span>
          </div>
          <Button variant="outline" size="sm" className="w-full mt-3 bg-white/70" onClick={() => onOpen(result)}>Ver composição</Button>
        </>}
      </CardContent>
    </Card>
  );
}

export default function CartasContempladas() {
  const [credito, setCredito] = useState(100000);
  const [categoria, setCategoria] = useState("todas");
  const [maxCartas, setMaxCartas] = useState("3");
  const [tolerancia, setTolerancia] = useState("10");
  const [tipo, setTipo] = useState("contemplados");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);

  const busca = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("buscarCartasContempladas", {
        credito_desejado: Number(credito || 0), categoria, max_cartas: Number(maxCartas), tolerancia_percentual: Number(tolerancia), tipo,
      });
      return res.data;
    },
    onSuccess: (r) => {
      if (!r?.ok) return toast.error(r?.error || "Não foi possível consultar as cartas");
      setData(r);
      if (!r.total_combinacoes) toast.info("Consulta concluída, mas nenhuma combinação ficou dentro da faixa escolhida.");
    },
    onError: (e) => toast.error(e?.response?.data?.error || e?.message || "Erro ao consultar cartas"),
  });

  const resultados = useMemo(() => data?.resultados || [], [data]);
  const buscar = () => {
    if (!credito || Number(credito) <= 0) return toast.error("Informe o crédito desejado");
    busca.mutate();
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Cartas Contempladas" subtitle="Busque e compare cartas em um só lugar. O CRM combina até 3 cartas da mesma administradora." />

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4"><Search className="w-5 h-5 text-red-600"/><h2 className="font-bold text-slate-900">Encontrar melhor carta</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2"><Label>Crédito desejado</Label><div className="relative"><span className="absolute left-3 top-2.5 text-sm text-slate-500">R$</span><Input className="pl-10" value={formatInputMoney(credito)} onChange={(e) => setCredito(parseMoney(e.target.value))} placeholder="100.000,00"/></div></div>
            <div><Label>Categoria</Label><Select value={categoria} onValueChange={setCategoria}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="todas">Todas</SelectItem><SelectItem value="veículo">Veículos</SelectItem><SelectItem value="imóvel">Imóveis</SelectItem><SelectItem value="moto">Motos</SelectItem><SelectItem value="serviço">Serviços</SelectItem></SelectContent></Select></div>
            <div><Label>Máx. de cartas</Label><Select value={maxCartas} onValueChange={setMaxCartas}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="1">1 carta</SelectItem><SelectItem value="2">Até 2 cartas</SelectItem><SelectItem value="3">Até 3 cartas</SelectItem></SelectContent></Select></div>
            <Button className="bg-red-600 hover:bg-red-700" onClick={buscar} disabled={busca.isPending}>{busca.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Search className="w-4 h-4 mr-2"/>}Buscar melhores</Button>
          </div>
          <div className="flex flex-wrap gap-3 mt-4 items-center">
            <div className="flex items-center gap-2"><Label className="text-xs text-slate-500">Faixa do crédito</Label><Select value={tolerancia} onValueChange={setTolerancia}><SelectTrigger className="h-8 w-28"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="5">± 5%</SelectItem><SelectItem value="10">± 10%</SelectItem><SelectItem value="15">± 15%</SelectItem><SelectItem value="20">± 20%</SelectItem></SelectContent></Select></div>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg"><Button size="sm" variant={tipo === "contemplados" ? "default" : "ghost"} className={tipo === "contemplados" ? "bg-slate-900" : ""} onClick={() => setTipo("contemplados")}>Contempladas</Button><Button size="sm" variant={tipo === "desagios" ? "default" : "ghost"} className={tipo === "desagios" ? "bg-slate-900" : ""} onClick={() => setTipo("desagios")}>Deságios</Button></div>
            <p className="text-xs text-slate-500 ml-auto">Combinações somente entre cartas da mesma administradora.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(data?.fontes || [
          {nome:"Fraga & Bitello",status:"conectada",quantidade:0}, {nome:"Play Consórcios",status:"pendente"}, {nome:"Consórcios Digital / Jobs",status:"pendente"}
        ]).map((f, i) => <FonteBadge key={f.fonte || i} fonte={f}/>)}
      </div>

      {data && <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <RecommendationCard icon={Banknote} title="Menor entrada" result={data.recomendacoes?.menor_entrada} tone="entrada" onOpen={setSelected}/>
          <RecommendationCard icon={ReceiptText} title="Menor parcela" result={data.recomendacoes?.menor_parcela} tone="parcela" onOpen={setSelected}/>
          <RecommendationCard icon={Percent} title="Menor taxa" result={data.recomendacoes?.menor_taxa} tone="taxa" onOpen={setSelected}/>
        </div>

        <Card>
          <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base flex items-center gap-2"><WalletCards className="w-5 h-5"/>Resultados encontrados</CardTitle><div className="flex items-center gap-2 text-xs text-slate-500"><Badge variant="outline">{data.total_combinacoes} combinações</Badge><Button variant="ghost" size="sm" onClick={buscar}><RefreshCw className="w-4 h-4 mr-1"/>Atualizar</Button></div></div></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-slate-50 border-y"><tr className="text-left text-slate-500"><th className="p-3">Administradora</th><th className="p-3">Composição</th><th className="p-3">Crédito</th><th className="p-3">Entrada</th><th className="p-3">Parcela</th><th className="p-3">Prazo</th><th className="p-3">Taxa</th><th className="p-3"></th></tr></thead><tbody>
              {resultados.length === 0 ? <tr><td colSpan="8" className="p-8 text-center text-slate-500">Nenhuma combinação encontrada nessa faixa.</td></tr> : resultados.map((r) => <tr key={r.id} className="border-b hover:bg-slate-50"><td className="p-3 font-semibold">{r.administradora}</td><td className="p-3"><Badge variant="outline"><Layers3 className="w-3 h-3 mr-1"/>{r.quantidade_cartas} {r.quantidade_cartas === 1 ? "carta" : "cartas"}</Badge></td><td className="p-3 font-semibold">{moneyBR(r.valor_credito)}</td><td className="p-3">{moneyBR(r.entrada)}</td><td className="p-3">{moneyBR(r.valor_parcela)}</td><td className="p-3">{r.parcelas || "—"} meses</td><td className="p-3">{pctBR(r.taxa)}</td><td className="p-3"><Button size="sm" variant="outline" onClick={() => setSelected(r)}>Detalhes</Button></td></tr>)}
            </tbody></table>
          </CardContent>
        </Card>
      </>}

      {!data && <Card className="border-dashed"><CardContent className="py-12 text-center"><WalletCards className="w-10 h-10 text-slate-300 mx-auto mb-3"/><h3 className="font-semibold text-slate-700">Informe o crédito que o cliente precisa</h3><p className="text-sm text-slate-500 mt-1">Vamos comparar cartas individuais e combinações da mesma administradora.</p></CardContent></Card>}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}><DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Composição da opção</DialogTitle></DialogHeader>{selected && <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 rounded-xl p-4"><div><p className="text-xs text-slate-500">Crédito</p><p className="font-bold">{moneyBR(selected.valor_credito)}</p></div><div><p className="text-xs text-slate-500">Entrada</p><p className="font-bold">{moneyBR(selected.entrada)}</p></div><div><p className="text-xs text-slate-500">Parcela total</p><p className="font-bold">{moneyBR(selected.valor_parcela)}</p></div><div><p className="text-xs text-slate-500">Administradora</p><p className="font-bold">{selected.administradora}</p></div></div>{selected.cartas.map((c, i) => <div key={c.id} className="border rounded-xl p-4"><div className="flex items-center justify-between gap-2 mb-3"><div><p className="font-bold">Carta {i + 1} • {c.administradora}</p><p className="text-xs text-slate-500">Código {c.codigo} • {c.fornecedor_nome}</p></div><Badge className={c.status === "disponivel" ? "bg-emerald-600" : "bg-amber-600"}>{c.status}</Badge></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div><span className="text-slate-500">Crédito</span><p className="font-semibold">{moneyBR(c.valor_credito)}</p></div><div><span className="text-slate-500">Entrada</span><p className="font-semibold">{moneyBR(c.entrada)}</p></div><div><span className="text-slate-500">Parcela</span><p className="font-semibold">{moneyBR(c.valor_parcela)}</p></div><div><span className="text-slate-500">Prazo</span><p className="font-semibold">{c.parcelas} meses</p></div></div></div>)}</div>}</DialogContent></Dialog>
    </div>
  );
}
