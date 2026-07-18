import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select.jsx';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Sparkles, Loader2, Award, TrendingDown, TrendingUp, Minus, AlertTriangle,
  Send, RefreshCw, FileBarChart, Copy, Check, ArrowRight, History
} from 'lucide-react';
import { CATEGORIA_LABELS } from '@/components/utils/gruposConsorcioHelpers';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const MODALIDADES = Object.entries(CATEGORIA_LABELS).map(([value, label]) => ({ value, label }));

const formatarMoeda = (raw) => {
  const num = extrairNumero(raw);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};
const extrairNumero = (str) => {
  const digits = String(str ?? '').replace(/\D/g, '');
  return Number(digits) || 0;
};
const TIPOS_LANCE = [
  { value: 'lance_livre', label: 'Lance Livre' },
  { value: 'lance_limitado', label: 'Lance Limitado' },
  { value: 'lance_fixo_30', label: 'Lance Fixo 30%' },
  { value: 'lance_fixo_50', label: 'Lance Fixo 50%' },
  { value: 'sorteio', label: 'Sorteio' }
];

const TendenciaIcon = ({ tendencia }) => {
  const t = (tendencia || '').toLowerCase();
  if (t.includes('queda') || t.includes('queda')) return <TrendingDown className="w-4 h-4 text-emerald-600" />;
  if (t.includes('alta')) return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (t.includes('estável') || t.includes('estavel')) return <Minus className="w-4 h-4 text-amber-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
};

const CompatibilidadeBadge = ({ nivel }) => {
  const n = (nivel || '').toLowerCase();
  const classe = n === 'alta' ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : n === 'média' || n === 'media' ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-slate-100 text-slate-600 border-slate-300';
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${classe}`}>{nivel}</span>;
};

export default function AgenteRecomendacaoModal({ empresaId, open, onOpenChange, onSelectGrupo }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    modalidade: 'automovel',
    valor_credito: '',
    prazo_desejado: '',
    tipo_lance: 'lance_livre',
    percentual_lance: '',
    lance_embutido: false,
    complementar_recurso: false
  });
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [verAnalise, setVerAnalise] = useState(false);
  const [verComparacao, setVerComparacao] = useState(false);
  const [copiouMsg, setCopiouMsg] = useState(false);
  const [exibirMoedaCredito, setExibirMoedaCredito] = useState(true);

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  const buscarMelhorGrupo = async () => {
    if (!empresaId) {
      toast.error('Empresa não identificada.');
      return;
    }
    if (!form.valor_credito || Number(form.valor_credito) <= 0) {
      toast.error('Informe o valor do crédito desejado.');
      return;
    }
    setLoading(true);
    setResultado(null);
    setVerAnalise(false);
    setVerComparacao(false);
    try {
      const resp = await base44.functions.invoke('recomendarGruposConsorcio', {
        empresa_id: empresaId,
        modalidade: form.modalidade,
        valor_credito: Number(form.valor_credito),
        prazo_desejado: form.prazo_desejado ? Number(form.prazo_desejado) : null,
        tipo_lance: form.tipo_lance,
        percentual_lance: form.percentual_lance ? Number(form.percentual_lance) : null,
        lance_embutido: form.lance_embutido,
        complementar_recurso: form.complementar_recurso
      });
      const data = resp.data || {};
      if (data.sem_grupos) {
        toast.info(data.mensagem || 'Nenhum grupo compatível.');
        setResultado({ sem_grupos: true, mensagem: data.mensagem });
      } else if (data.ok && data.analise) {
        setResultado(data);
        toast.success(`${data.grupos_analisados} grupo(s) analisado(s).`);
      } else {
        toast.error(data.error || 'Erro ao analisar grupos.');
      }
    } catch (e) {
      toast.error('Erro: ' + (e.message || 'Falha na análise'));
    } finally {
      setLoading(false);
    }
  };

  const copiarMensagem = async () => {
    if (!resultado?.analise?.mensagem_cliente) return;
    try {
      await navigator.clipboard.writeText(resultado.analise.mensagem_cliente);
      setCopiouMsg(true);
      toast.success('Mensagem copiada!');
      setTimeout(() => setCopiouMsg(false), 2000);
    } catch (_) {
      toast.error('Não foi possível copiar.');
    }
  };

  const handleSelecionarGrupo = (grupo) => {
    if (onSelectGrupo) onSelectGrupo(grupo);
    onOpenChange(false);
  };

  const handleSimularLance = () => {
    const rec = resultado?.analise?.recomendacao_principal;
    const params = new URLSearchParams({
      grupo_id: rec?.grupo_id || '',
      valor: form.valor_credito || '',
      modalidade: form.modalidade || ''
    });
    navigate(createPageUrl('SimuladorInteligente') + '?' + params.toString());
    onOpenChange(false);
  };

  const a = resultado?.analise;
  const rec = a?.recomendacao_principal;
  const prev = a?.previsao;
  const comp = a?.comparacao || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            Agente de IA — Recomendação de Grupos Ativos
          </DialogTitle>
          <DialogDescription>
            Informe o perfil do cliente para o agente analisar os grupos ativos e recomendar o mais compatível.
          </DialogDescription>
        </DialogHeader>

        {/* Formulário de perfil do cliente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <Select value={form.modalidade} onValueChange={(v) => set('modalidade', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODALIDADES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor do crédito desejado (R$)</Label>
            <Input
              inputMode="numeric"
              placeholder="Ex: 100000"
              value={exibirMoedaCredito && form.valor_credito ? formatarMoeda(form.valor_credito) : form.valor_credito}
              onFocus={() => setExibirMoedaCredito(false)}
              onBlur={() => setExibirMoedaCredito(true)}
              onChange={(e) => set('valor_credito', e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prazo desejado (meses) — opcional</Label>
            <Input type="number" min="0" placeholder="Ex: 180"
              value={form.prazo_desejado} onChange={(e) => set('prazo_desejado', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de lance pretendido</Label>
            <Select value={form.tipo_lance} onValueChange={(v) => set('tipo_lance', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_LANCE.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Percentual disponível para lance (%) — opcional</Label>
            <Input type="number" min="0" max="100" placeholder="Ex: 55"
              value={form.percentual_lance} onChange={(e) => set('percentual_lance', e.target.value)} />
          </div>
          <div className="flex items-center gap-6 pt-6">
            <div className="flex items-center gap-2">
              <Switch id="lance-embutido" checked={form.lance_embutido} onCheckedChange={(v) => set('lance_embutido', v)} />
              <Label htmlFor="lance-embutido" className="text-sm cursor-pointer">Lance embutido</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="complementar" checked={form.complementar_recurso} onCheckedChange={(v) => set('complementar_recurso', v)} />
              <Label htmlFor="complementar" className="text-sm cursor-pointer">Recurso próprio</Label>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-1 flex-wrap gap-2">
          <Button onClick={buscarMelhorGrupo} disabled={loading} className="gap-2 bg-violet-600 hover:bg-violet-700">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analisando...</> : <><Sparkles className="w-4 h-4" /> Buscar melhor grupo</>}
          </Button>
          {resultado && !resultado.sem_grupos && (
            <Button variant="outline" size="sm" onClick={buscarMelhorGrupo} disabled={loading} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> Atualizar análise
            </Button>
          )}
        </div>

        {/* Aviso obrigatório */}
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Importante:</strong> a análise é baseada no histórico das assembleias. Os percentuais podem variar conforme as ofertas realizadas pelos participantes. A recomendação não garante contemplação e não deve ser apresentada ao cliente como promessa.
          </span>
        </div>

        {/* Sem grupos */}
        {resultado?.sem_grupos && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-600">
            {resultado.mensagem}
          </div>
        )}

        {/* Resultado */}
        {rec && (
          <div className="space-y-4">
            {/* Recomendação principal */}
            <div className="p-4 rounded-xl border-2 border-violet-200 bg-violet-50/50 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-violet-600" />
                  <h3 className="font-semibold text-violet-800">Grupo recomendado: {rec.numero_grupo}</h3>
                </div>
                <CompatibilidadeBadge nivel={rec.compatibilidade} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Info label="Valor do crédito" value={`R$ ${(rec.valor_credito || 0).toLocaleString('pt-BR')}`} />
                <Info label="Prazo máx." value={`${rec.prazo_maximo || '—'} meses`} />
                <Info label="Prazo restante" value={`${rec.prazo_restante || '—'} meses`} />
                <Info label="Participantes" value={rec.qtd_participantes ?? '—'} />
                <Info label="Menor lance anterior" value={pct(rec.menor_lance_anterior)} />
                <Info label="Média 3 meses" value={pct(rec.media_3_meses)} />
                <Info label="Contemplados último mês" value={rec.contemplados_ultimo_mes ?? '—'} />
                <Info label="Dif. lance do cliente" value={pct(rec.diferenca_lance)} />
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{rec.explicacao}</p>

              {/* Botões de ação */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setVerAnalise((v) => !v)}>
                  <History className="w-3.5 h-3.5" /> {verAnalise ? 'Ocultar' : 'Ver'} análise completa
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setVerComparacao((v) => !v)}>
                  <FileBarChart className="w-3.5 h-3.5" /> {verComparacao ? 'Ocultar' : 'Comparar'} grupos
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={handleSimularLance}>
                  <ArrowRight className="w-3.5 h-3.5" /> Simular lance
                </Button>
                <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSelecionarGrupo({ id: rec.grupo_id, numero_grupo: rec.numero_grupo })}>
                  <Check className="w-3.5 h-3.5" /> Selecionar este grupo
                </Button>
              </div>
            </div>

            {/* Análise completa */}
            {verAnalise && <AnaliseCompleta resultado={resultado} />}

            {/* Comparação */}
            {verComparacao && comp.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left">
                      <th className="p-2">Posição</th>
                      <th className="p-2">Grupo</th>
                      <th className="p-2">Menor lance anterior</th>
                      <th className="p-2">Média histórica</th>
                      <th className="p-2">Tendência</th>
                      <th className="p-2">Compatibilidade</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {comp.map((c, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="p-2 font-medium">{c.posicao}º</td>
                        <td className="p-2 font-medium">{c.numero_grupo}</td>
                        <td className="p-2">{pct(c.menor_lance_anterior)}</td>
                        <td className="p-2">{pct(c.media_historica)}</td>
                        <td className="p-2"><span className="inline-flex items-center gap-1"><TendenciaIcon tendencia={c.tendencia} /> {c.tendencia}</span></td>
                        <td className="p-2"><CompatibilidadeBadge nivel={c.compatibilidade} /></td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => handleSelecionarGrupo({ id: c.grupo_id, numero_grupo: c.numero_grupo })}>
                            Selecionar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Previsão */}
            {prev && (
              <div className="p-4 rounded-lg border border-blue-200 bg-blue-50/50 space-y-2">
                <div className="flex items-center gap-2">
                  <TendenciaIcon tendencia={prev.tendencia} />
                  <h4 className="font-semibold text-blue-800">
                    Previsão das próximas assembleias: <span className="font-normal">{prev.tendencia}</span>
                  </h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Confiança: {prev.confianca || '—'}</span>
                </div>
                {(prev.faixa_estimada_min != null || prev.faixa_estimada_max != null) && (
                  <p className="text-sm text-slate-700">Faixa estimada: <strong>{pct(prev.faixa_estimada_min)} a {pct(prev.faixa_estimada_max)}</strong></p>
                )}
                {prev.fatores?.length > 0 && (
                  <ul className="text-xs text-slate-600 list-disc pl-5 space-y-0.5">
                    {prev.fatores.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
                <p className="text-xs text-slate-500">Assembleias utilizadas: {prev.qtd_assembleias_usadas || '—'}</p>
                {prev.aviso && <p className="text-xs italic text-slate-500">{prev.aviso}</p>}
                <p className="text-xs text-slate-500 italic">Esta previsão utiliza apenas o histórico do grupo e não representa garantia de contemplação.</p>
              </div>
            )}

            {/* Mensagem para o cliente */}
            {a?.mensagem_cliente && (
              <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                    <Send className="w-4 h-4" /> Mensagem para o cliente
                  </h4>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={copiarMensagem}>
                    {copiouMsg ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                  </Button>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{a.mensagem_cliente}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }) {
  return (
    <div className="p-2 bg-white rounded-md border border-slate-200">
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p className="font-semibold text-slate-800 text-sm">{value}</p>
    </div>
  );
}

function pct(v) {
  if (v == null || v === '' || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function AnaliseCompleta({ resultado }) {
  const grupos = resultado?.grupos_com_historico || [];
  return (
    <div className="space-y-3">
      {grupos.map((g) => (
        <div key={g.grupo_id} className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h5 className="font-medium text-slate-800">Grupo {g.numero_grupo}</h5>
            <span className="text-xs text-slate-500">
              {g.qtd_assembleias_historico || 0} assembleia(s) · {g.qtd_participantes || '—'} participantes
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mt-2">
            <Info label="Menor lance anterior" value={pct(g.menor_lance_anterior)} />
            <Info label="Média 3 meses" value={pct(g.media_3_meses)} />
            <Info label="Média histórica" value={pct(g.media_historica)} />
            <Info label="Tendência calculada" value={g.tendencia_calculada} />
          </div>
          {g.ultimos_lances?.length > 0 && (
            <p className="text-xs text-slate-500 mt-2">
              Últimos lances: {g.ultimos_lances.map((l) => pct(l)).join(' → ')}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}