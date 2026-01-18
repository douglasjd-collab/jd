import React, { useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

function moneyToNumberBR(v) {
  if (!v) return 0;
  const s = v
    .replace(/R\$\s?/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/\s/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

/**
 * Extrai do OCR:
 * - plano (ex: CR4072)
 * - nome_bem (ex: AUTOMÓVEL LEVE)
 * - credito (R$ 25.000,00)
 * - grupo/cota (grupo: 008120)
 * - tipo_venda (ex: 114 - LINEAR)
 * - lista de planos (prazo + 1a parcela)
 */
function parseCanopusModalText(raw) {
  const text = normalizeSpaces(raw);

  // plano e nome_bem do cabeçalho: "CR4072 - AUTOMÓVEL LEVE R$ 25.000,00"
  const cabecalhoMatch = text.match(/^(\w+)\s*-\s*([A-ZÇÃÕÁÉÍÓÚ ]{3,})\s+R\$/);
  const plano = cabecalhoMatch ? cabecalhoMatch[1] : "";
  const nome_bem = cabecalhoMatch ? normalizeSpaces(cabecalhoMatch[2]) : "";

  // crédito: tenta pegar o primeiro "R$ xx.xxx,xx" do topo
  const creditoMatch = text.match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})/);
  const credito = creditoMatch ? moneyToNumberBR(creditoMatch[0]) : 0;

  // tipo venda (ex: "114 - LINEAR" ou "62 - PARCELA GRADUAL")
  const tipoVendaMatch = text.match(/\b(\d{1,3})\s*-\s*([A-ZÇÃÕÁÉÍÓÚ ]{3,})\b/);
  const tipo_venda = tipoVendaMatch ? `${tipoVendaMatch[1]} - ${normalizeSpaces(tipoVendaMatch[2])}` : "";

  // grupo/cota (no print aparece "Grupo: 008120")
  const grupoCotaMatch = text.match(/Grupo:\s*(\d{4,8})/i);
  const grupo_cota = grupoCotaMatch ? grupoCotaMatch[1] : "";

  // linhas do tipo:
  // "Plano de 96 meses / 1ª parcela de R$ 326,78 | Grupo: 008120"
  // OCR às vezes troca "1ª" por "1a" ou "1°"
  const regexPlano = /Plano\s+de\s+(\d{2,3})\s+meses.*?1[ªa°º]?\s*parcela\s+de\s+(R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2}))/gi;

  const itens = [];
  let m;
  while ((m = regexPlano.exec(text)) !== null) {
    const prazo_meses = Number(m[1]) || 0;
    const primeira_parcela = moneyToNumberBR(m[2]);
    if (prazo_meses > 0 && primeira_parcela > 0) {
      itens.push({ prazo_meses, primeira_parcela });
    }
  }

  // remove duplicados (OCR pode repetir)
  const unique = [];
  const seen = new Set();
  for (const it of itens) {
    const key = `${it.prazo_meses}|${it.primeira_parcela}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(it);
    }
  }

  return {
    plano,
    nome_bem,
    credito,
    tipo_venda,
    grupo_cota,
    itens: unique,
    raw_text: raw,
  };
}

export default function ImportacaoPlanosPrint() {
  const [file, setFile] = useState(null);
  const [imgUrl, setImgUrl] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const [resultado, setResultado] = useState(null);

  const preview = useMemo(() => {
    if (!resultado) return null;
    return parseCanopusModalText(resultado);
  }, [resultado]);

  async function runOCR() {
    if (!file) {
      toast.error("Selecione a imagem do print.");
      return;
    }
    setOcrLoading(true);
    try {
      const { data } = await Tesseract.recognize(file, "por", {
        logger: () => {},
      });
      setResultado(data?.text || "");
      toast.success("Leitura do print concluída.");
    } catch (e) {
      console.error(e);
      toast.error("Falha ao ler a imagem. Tente um print mais nítido.");
    } finally {
      setOcrLoading(false);
    }
  }

  async function salvarPlanos() {
    if (!preview) {
      toast.error("Faça a leitura do print primeiro.");
      return;
    }
    if (!preview.plano || !preview.nome_bem) {
      toast.error("Não consegui ler o cabeçalho do print (plano e nome do bem). Tente outro print/zoom.");
      return;
    }
    if (!preview.itens?.length) {
      toast.error("Não consegui encontrar planos no print. Tente outro print/zoom.");
      return;
    }

    setSaveLoading(true);
    try {
      const me = await base44.auth.me();
      const empresa_id = me?.empresa_id;

      if (!empresa_id) {
        toast.error("Empresa não identificada no perfil do usuário.");
        return;
      }

      const payload = {
        empresa_id,
        origem: "CANOPUS",
        produto: "Automóvel",
        plano: preview.plano,
        nome_bem: preview.nome_bem,
        valor_bem: preview.credito,
        tipo_venda: preview.tipo_venda,
        grupo_cota: preview.grupo_cota,
        itens: preview.itens,
      };

      const resp = await base44.functions.invoke("importPlanosFromPrint", payload);

      if (resp?.data?.success) {
        toast.success(resp.data.message || "Planos importados com sucesso.");
        // Limpa formulário
        setFile(null);
        setImgUrl("");
        setResultado(null);
      } else {
        toast.error(resp?.data?.error || "Falha ao importar.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar. Veja o console / logs da function.");
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Importar planos por Print (Canopus)"
        subtitle="Envie o print do modal de planos e o sistema cadastra automaticamente"
      />

      <Card className="p-4 space-y-3">
        <div className="grid gap-2">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f || null);
              if (f) setImgUrl(URL.createObjectURL(f));
              setResultado(null);
            }}
          />
          {imgUrl ? (
            <img src={imgUrl} alt="print" className="max-w-full rounded-md border" />
          ) : null}

          <div className="flex gap-2 flex-wrap">
            <Button onClick={runOCR} disabled={ocrLoading || !file}>
              {ocrLoading ? "Lendo imagem..." : "Ler print (OCR)"}
            </Button>

            <Button onClick={salvarPlanos} disabled={saveLoading || !preview?.itens?.length || !preview?.plano}>
              {saveLoading ? "Salvando..." : "Salvar planos no sistema"}
            </Button>
          </div>
        </div>
      </Card>

      {preview ? (
        <Card className="p-4 space-y-2">
          <div className="text-sm">
            <b>Plano:</b> {preview.plano || "não detectado"}
            <br />
            <b>Nome do bem:</b> {preview.nome_bem || "não detectado"}
            <br />
            <b>Crédito:</b> {preview.credito ? `R$ ${preview.credito.toFixed(2)}` : "não detectado"}
            <br />
            <b>Tipo de venda:</b> {preview.tipo_venda || "não detectado"}
            <br />
            <b>Grupo/Cota:</b> {preview.grupo_cota || "não detectado"}
          </div>

          <div className="text-sm font-semibold">Planos encontrados:</div>
          <div className="text-sm">
            {preview.itens.map((p, idx) => (
              <div key={idx}>
                • {p.prazo_meses} meses — 1ª parcela R$ {p.primeira_parcela.toFixed(2)}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}