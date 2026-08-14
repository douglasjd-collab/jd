import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  FileText,
  Users,
  Filter as FilterIcon,
  Eye,
  CalendarClock,
  ListChecks,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  Image as ImageIcon,
  Video,
  Upload,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import PublicoBuilder from './PublicoBuilder';
import { selecionarTelefonesParaCampanha, carregarTelefonesPorCliente } from './telefonesCliente';
import { aplicarFiltrosPublico, modoTelefoneParaCampanha, carregarTelefonesBloqueados, resumoFiltros } from './campanhaFiltros';
import TemplatePreview from '@/components/templates/TemplatePreview';

// Aceita variações de status que meaning "aprovado": 'aprovado' (padrão CRM),
// 'APPROVED' (retorno cru da Meta), 'approved' (D-API lowercased), 'Aprovado'.
const STATUS_APROVADO_RE = /^(aprovado|approved)$/i;
const isTemplateAprovado = (s = '') => STATUS_APROVADO_RE.test(String(s || ''));

const STEPS = [
  { id: 1, label: 'Template', icon: FileText },
  { id: 2, label: 'Público', icon: Users },
  { id: 3, label: 'Filtros', icon: FilterIcon },
  { id: 4, label: 'Prévia', icon: Eye },
  { id: 5, label: 'Agendamento', icon: CalendarClock },
  { id: 6, label: 'Confirmar', icon: ListChecks },
];

const normalizeTel = (s = '') => s.replace(/\D/g, '');

export default function NovaCampanhaModal({ open, onOpenChange, empresaId, user }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [syncError, setSyncError] = useState(null);

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    template_id: '',
    conn_selecionada: '',
    canal_tipo: 'oficial',
    mensagem_tipo: 'texto',
    mensagem_texto: '',
    midia_url: '',
    midia_nome: '',
    publico_consorcio_ativo: false,
    administradora_id: '',
    origens: [],
    clientes_sub: 'todos',
    destino_telefones: 'principal',
    funis_selecionados: [],
    tags_selecionadas: [],
    listas_selecionadas: [],
    parceiros_selecionados: [],
    personalizado_regras: [],
    filtro_cidade: '',
    filtro_uf: '',
    filtro_com_nome: false,
    filtro_sem_nome: false,
    filtro_telefone_valido: false,
    filtro_apenas_whatsapp: false,
    filtro_vendedor_id: '',
    filtro_parceiro_id: '',
    agendamento: 'agora',
    agendada_para_data: '',
    agendada_para_hora: '',
    velocidade_envio: 60,
    pausa_apos: '',
    duracao_pausa_min: '',
  });

  useEffect(() => {
    if (open) {
      setStep(1);
      setPreview(null);
      setSyncError(null);
      setForm({
        nome: '',
        descricao: '',
        template_id: '',
        conn_selecionada: '',
        origens: [],
        clientes_sub: 'todos',
        destino_telefones: 'principal',
        funis_selecionados: [],
        tags_selecionadas: [],
        listas_selecionadas: [],
        parceiros_selecionados: [],
        personalizado_regras: [],
        filtro_cidade: '',
        filtro_uf: '',
        filtro_com_nome: false,
        filtro_sem_nome: false,
        filtro_telefone_valido: false,
        filtro_apenas_whatsapp: false,
        filtro_vendedor_id: '',
        filtro_parceiro_id: '',
        agendamento: 'agora',
        agendada_para_data: '',
        agendada_para_hora: '',
        velocidade_envio: 60,
        pausa_apos: '',
        duracao_pausa_min: '',
      });
    }
  }, [open]);

  const connectionIsOfficial = (connection) => {
    if (!connection) return false;
    try {
      const cfg = JSON.parse(connection.config_json || '{}');
      return cfg.isOfficial === true || cfg.is_official === true || cfg.mode === 'cloud_api';
    } catch {
      return connection.provider_type === 'meta_oficial';
    }
  };

  // Lista os dois canais: Meta/Cloud API oficial e JD/D-API não oficial.
  const { data: connectionsList = [] } = useQuery({
    queryKey: ['campanha-connections', empresaId, open],
    queryFn: () => base44.entities.WhatsappConnection.filter(
      { empresa_id: empresaId, status: 'conectado', is_active: true },
      'nome',
      100
    ),
    enabled: !!empresaId && open,
    staleTime: 60_000,
  });

  const conexoesOficiais = (connectionsList || []).filter(connectionIsOfficial);
  const conexoesNaoOficiais = (connectionsList || []).filter((c) => !connectionIsOfficial(c));
  const conexoesDoCanal = form.canal_tipo === 'nao_oficial' ? conexoesNaoOficiais : conexoesOficiais;
  const temMultiplasConexoes = conexoesDoCanal.length > 1;

  // Sincroniza com a Meta e em seguida busca templates aprovados da empresa.
  // Antes de mostrar "Nenhum template aprovado encontrado", sempre tentamos
  // sincronizar com a Meta para garantir que templates cujo status mudou
  // (Em análise → Aprovado) reflitam no seletor da campanha.
  const { data: templates = [], isLoading: loadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['campanha-templates-sync', empresaId],
    queryFn: async () => {
      setSyncingTemplates(true);
      setSyncError(null);
      let diagInfo = null;
      try {
        const synRes = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
          action: 'sync_templates_from_meta',
        });
        const d = synRes?.data;
        if (d && d.success === false) {
          throw new Error(d.error || 'Falha na sincronização com a Meta');
        }
        diagInfo = d || null;
      } catch (e) {
        const msg = e?.message || 'Falha desconhecida';
        setSyncError(`Não foi possível sincronizar os templates da API Oficial. Tente novamente. Detalhe: ${msg}`);
        // Não abortamos: ainda tentamos listar o que já temos no banco do CRM.
      } finally {
        setSyncingTemplates(false);
      }
      // Lista do CRM — usa filtro amplo (sem status) para tolerar variações
      // de status e normaliza pelo lado do cliente.  Isso cobre: status em
      // português, em inglês, com letra maiúscula etc.
      const all = await base44.entities.WhatsappTemplate.filter(
        { empresa_id: empresaId },
        '-created_date',
        500
      );
      const aprovados = (all || []).filter((t) => isTemplateAprovado(t.status));
      void diagInfo;
      return aprovados;
    },
    enabled: !!empresaId && open,
    staleTime: 30_000,
  });

  // Pré-seleciona a conexão única automaticamente quando não há múltiplas.
  useEffect(() => {
    if (!open) return;
    if (!conexoesDoCanal.length) return;
    if (!form.conn_selecionada || !conexoesDoCanal.some((c) => c.id === form.conn_selecionada)) {
      setForm((f) => ({ ...f, conn_selecionada: conexoesDoCanal[0]?.id || '', template_id: '' }));
    }
  }, [connectionsList, form.canal_tipo, open, form.conn_selecionada]);

  const templateSelecionado = useMemo(
    () => templates.find((t) => t.id === form.template_id),
    [templates, form.template_id]
  );

  // Carregar clientes base (sem filtro ainda — aplicado na prévia)
  const clientesDisponiveis = useMemo(async () => [], []);

  const calcularPrevia = async () => {
    if (!empresaId) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const sub = form.clientes_sub || 'todos';
      const filtro = { empresa_id: empresaId };
      if (sub === 'ativos') filtro.status = 'ativo';
      if (sub === 'inativos') filtro.status = 'inativo';
      const clientes = await base44.entities.Cliente.filter(filtro, null, 2000);
      const telsMap = await carregarTelefonesPorCliente(empresaId);
      const bloqueados = await carregarTelefonesBloqueados(empresaId);
      let baseClientes = clientes;
      if (sub === 'sem_whatsapp') baseClientes = baseClientes.filter((c) => normalizeTel(c.celular || '').length < 10);
      if (sub === 'com_whatsapp') baseClientes = baseClientes.filter((c) => normalizeTel(c.celular || '').length >= 10);
      const filtrados = aplicarFiltrosPublico(baseClientes, form);
      const comTelefone = filtrados.filter((c) =>
        selecionarTelefonesParaCampanha(c, modoTelefoneParaCampanha(form), telsMap.get(c.id) || []).length > 0
      );
      const telsPorCliente = comTelefone.map((c) => selecionarTelefonesParaCampanha(c, modoTelefoneParaCampanha(form), telsMap.get(c.id) || []));
      const totalTelefones = telsPorCliente.reduce((s, arr) => s + arr.length, 0);
      const antesFiltros = baseClientes.length;
      const removidosFiltros = antesFiltros - filtrados.length;
      const telefonesUnicosSet = new Set();
      let invalidos = 0;
      let bloqueadosRemovidos = 0;
      telsPorCliente.forEach((arr) => arr.forEach((t) => {
        if (t.length < 10) { invalidos++; return; }
        if (bloqueados.has(t)) { bloqueadosRemovidos++; return; }
        telefonesUnicosSet.add(t);
      }));
      const duplicados = totalTelefones - invalidos - bloqueadosRemovidos - telefonesUnicosSet.size;
      setPreview({
        clientes_selecionados: filtrados.length,
        clientes_removidos_filtros: removidosFiltros,
        total_clientes: comTelefone.length,
        telefones_invalidos: invalidos,
        telefones_duplicados: duplicados,
        bloqueados_removidos: bloqueadosRemovidos,
        total_telefones: totalTelefones,
        total_final_envios: telefonesUnicosSet.size,
        // Compat com resumo final (Step6)
        prontos_envio: telefonesUnicosSet.size,
      });
    } catch (e) {
      toast.error('Erro ao calcular prévia: ' + (e.message || 'desconhecido'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const podeAvancar = useMemo(() => {
    if (step === 1) return !!form.template_id && !!form.nome;
    if (step === 2) {
      if (!form.origens || form.origens.length === 0) return false;
      // Cada fonte selecionada precisa de ao menos 1 seleção interna
      if (form.origens.includes('funis') && (form.funis_selecionados || []).length === 0) return false;
      if (form.origens.includes('tags') && (form.tags_selecionadas || []).length === 0) return false;
      if (form.origens.includes('listas') && (form.listas_selecionadas || []).length === 0) return false;
      if (form.origens.includes('parceiros') && (form.parceiros_selecionados || []).length === 0) return false;
      if (
        form.origens.includes('personalizados') &&
        (form.personalizado_regras || []).filter((r) => r.field && r.op && r.value !== '' && r.value != null).length === 0
      ) return false;
      return true;
    }
    if (step === 4) return preview !== null && preview.prontos_envio > 0;
    if (step === 5) return form.agendamento === 'agora' || (form.agendada_para_data && form.agendada_para_hora);
    return true;
  }, [step, form, preview]);

  const avancar = () => {
    if (!podeAvancar) return;
    if (step === 3) {
      calcularPrevia();
    }
    setStep((s) => Math.min(6, s + 1));
  };
  const voltar = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setSaving(true);
    try {
      const sub = form.clientes_sub || 'todos';
      const filtro = { empresa_id: empresaId };
      if (sub === 'ativos') filtro.status = 'ativo';
      if (sub === 'inativos') filtro.status = 'inativo';
      const clientes = await base44.entities.Cliente.filter(filtro, null, 2000);
      const telsMap = await carregarTelefonesPorCliente(empresaId);
      const bloqueados = await carregarTelefonesBloqueados(empresaId);
      let baseClientes = clientes;
      if (sub === 'sem_whatsapp') baseClientes = baseClientes.filter((c) => normalizeTel(c.celular || '').length < 10);
      if (sub === 'com_whatsapp') baseClientes = baseClientes.filter((c) => normalizeTel(c.celular || '').length >= 10);
      const filtrados = aplicarFiltrosPublico(baseClientes, form);
      const comTelefone = filtrados.filter((c) =>
        selecionarTelefonesParaCampanha(c, modoTelefoneParaCampanha(form), telsMap.get(c.id) || []).length > 0
      );
      const vistos = new Set();
      const destinatariosExpandidos = [];
      for (const c of comTelefone) {
        const tels = selecionarTelefonesParaCampanha(c, modoTelefoneParaCampanha(form), telsMap.get(c.id) || []);
        for (const tel of tels) {
          if (bloqueados.has(tel)) continue;
          if (vistos.has(tel)) continue;
          vistos.add(tel);
          destinatariosExpandidos.push({ c, tel });
        }
      }
      if (destinatariosExpandidos.length === 0) {
        toast.error('Nenhum destinatário válido encontrado');
        setSaving(false);
        return;
      }
      const t = templateSelecionado;
      let agendadaPara = null;
      if (form.agendamento === 'agendar') {
        agendadaPara = new Date(`${form.agendada_para_data}T${form.agendada_para_hora}:00`).toISOString();
      }
      const configJson = JSON.stringify({
        publico: {
          origens: form.origens,
          clientes_sub: form.clientes_sub,
          funis: form.funis_selecionados,
          tags: form.tags_selecionadas,
          listas: form.listas_selecionadas,
          parceiros: form.parceiros_selecionados,
          personalizado_regras: form.personalizado_regras,
        },
        filtros: {
          cidade: form.filtro_cidade,
          uf: form.filtro_uf,
          com_nome: form.filtro_com_nome,
          sem_nome: form.filtro_sem_nome,
          telefone_valido: form.filtro_telefone_valido,
          apenas_whatsapp: form.filtro_apenas_whatsapp,
          vendedor_id: form.filtro_vendedor_id,
          parceiro_id: form.filtro_parceiro_id,
        },
      });
      const campanha = await base44.entities.Campanha.create({
        empresa_id: empresaId,
        criador_id: user.id,
        criador_nome: user.full_name || user.email,
        nome: form.nome,
        descricao: form.descricao,
        canal: 'whatsapp_meta_oficial',
        template_id: t?.id,
        template_nome: t?.name,
        template_category: t?.category,
        template_language: t?.language,
        template_components_json: t?.components_json,
        status: form.agendamento === 'agendar' ? 'agendada' : 'rascunho',
        total_destinatarios: vistos.size,
        velocidade_envio: Number(form.velocidade_envio) || 60,
        pausa_apos: form.pausa_apos ? Number(form.pausa_apos) : null,
        duracao_pausa_min: form.duracao_pausa_min ? Number(form.duracao_pausa_min) : null,
        agendada_para: agendadaPara,
        config_json: configJson,
      });

      const destinatarios = destinatariosExpandidos.map(({ c, tel }) => ({
        empresa_id: empresaId,
        campanha_id: campanha.id,
        cliente_id: c.id,
        cliente_nome: c.nome_completo || c.pj_razao_social || '',
        telefone: tel,
        status: 'na_fila',
        origem: 'clientes_filtro',
      }));
      if (destinatarios.length > 0) {
        await base44.entities.CampanhaDestinatario.bulkCreate(destinatarios);
      }

      toast.success(
        form.agendamento === 'agendar'
          ? `Campanha agendada para ${form.agendada_para_data} ${form.agendada_para_hora}`
          : `Campanha criada com ${vistos.size} telefone(s) na fila (${comTelefone.length} clientes)`
      );
      qc.invalidateQueries(['campanhas-lista', empresaId]);
      qc.invalidateQueries(['campanhas-dashboard', empresaId]);
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao criar campanha: ' + (e.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>

        <Stepper step={step} />

        <div className="min-h-[260px] max-h-[60vh] overflow-y-auto pr-1 -mr-1">
          {step === 1 && (
            <Step1
              form={form}
              setForm={setForm}
              templates={templates}
              loading={loadingTemplates}
              syncing={syncingTemplates}
              syncError={syncError}
              onSync={refetchTemplates}
              connections={connectionsList || []}
              multiplasConexoes={temMultiplasConexoes}
            />
          )}
          {step === 2 && (
            <PublicoBuilder form={form} setForm={setForm} empresaId={empresaId} user={user} />
          )}
          {step === 3 && <Step3 form={form} setForm={setForm} empresaId={empresaId} />}
          {step === 4 && <Step4 preview={preview} loading={loadingPreview} onRecalc={calcularPrevia} />}
          {step === 5 && <Step5 form={form} setForm={setForm} />}
          {step === 6 && <Step6 form={form} template={templateSelecionado} preview={preview} user={user} />}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="outline" onClick={voltar} disabled={step === 1}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar
          </Button>
          {step < 6 ? (
            <Button onClick={avancar} disabled={!podeAvancar}>
              Avançar <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
              Confirmar e Criar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }) {
  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const ativo = step === s.id;
        const feito = step > s.id;
        return (
          <React.Fragment key={s.id}>
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              ativo ? 'bg-emerald-600 text-white' : feito ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {feito ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className="w-4 h-px bg-slate-200" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Step1({ form, setForm, templates, loading, syncing, syncError, onSync, connections, multiplasConexoes }) {
  // Se há múltiplas conexões oficiais conectadas, lista apenas os templates
  // da conexão escolhida. Caso contrário (1 só conexão), mostra todos os
  // aprovados da empresa (já pré-filtrados pelo hook).
  const templatesVisiveis = multiplasConexoes && form.conn_selecionada
    ? (templates || []).filter((t) => t.connection_id === form.conn_selecionada)
    : (templates || []);

  const selecionado = templatesVisiveis.find((t) => t.id === form.template_id) || null;

  let botoesSel = [];
  try { botoesSel = selecionado ? JSON.parse(selecionado.buttons_json || '[]') : []; } catch {}
  let variaveisSel = [];
  try { variaveisSel = selecionado ? JSON.parse(selecionado.variables_json || '[]') : []; } catch {}

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Nome da campanha *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Renovação Empréstimo Julho" />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Opcional" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="block">Template aprovado *</Label>
        <button
          type="button"
          onClick={() => onSync()}
          disabled={syncing}
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          title="Sincronizar templates da API Oficial (Meta/D-API) e atualizar a lista"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Sincronizar com a Meta
        </button>
      </div>

      {syncError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{syncError}</span>
          </CardContent>
        </Card>
      )}

      {multiplasConexoes && (
        <div>
          <Label>Canal de envio *</Label>
          <select
            value={form.conn_selecionada || ''}
            onChange={(e) => setForm({ ...form, conn_selecionada: e.target.value, template_id: '' })}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecione a conexão oficial…</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome || c.session_id} {c.phone_number ? `· ${c.phone_number}` : ''} · {c.provider_type === 'dapi' ? 'API Oficial (D-API)' : 'API Oficial (Meta)'}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">Listaremos apenas os templates APROVADOS desta conexão.</p>
        </div>
      )}

      {loading || syncing ? (
        <div className="flex items-center gap-2 text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Sincronizando templates da API Oficial…
        </div>
      ) : (multiplasConexoes && !form.conn_selecionada) ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="py-4 text-sm text-slate-600">
            Selecione um canal de envio acima para listar os templates aprovados vinculados a essa conexão.
          </CardContent>
        </Card>
      ) : templatesVisiveis.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4 text-sm text-amber-700">
            Nenhum template aprovado encontrado{multiplasConexoes ? ' para a conexão selecionada.' : '.'} Clique em <strong>"Sincronizar com a Meta"</strong> ou crie/aprove templates na aba <strong>Templates</strong> antes de criar uma campanha.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto pr-1">
          {templatesVisiveis.map((t) => (
            <button
              key={t.id}
              onClick={() => setForm({ ...form, template_id: t.id })}
              className={`text-left p-3 rounded-lg border transition ${
                form.template_id === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-slate-800 text-sm truncate">{t.display_name || t.name}</p>
                {form.template_id === t.id && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t.category} · {t.language} · {(t.type || t.header_type || 'TEXT').toUpperCase()}
              </p>
              {t.body_text && (
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.body_text}</p>
              )}
              {t.connection_nome && (
                <p className="text-[10px] text-slate-400 mt-1 truncate">🔗 {t.connection_nome}</p>
              )}
            </button>
          ))}
        </div>
      )}

      {selecionado && (
        <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-4 border rounded-lg p-3 bg-slate-50">
          <div>
            <p className="text-xs text-slate-500 mb-1 font-semibold">Pré-visualização</p>
            <TemplatePreview
              headerText={selecionado.type === 'TEXT' ? (selecionado.header_text || '') : ''}
              tipo={selecionado.type || selecionado.header_type || 'TEXT'}
              headerMediaUrl={selecionado.header_media_url || ''}
              bodyText={selecionado.body_text || ''}
              footerText={selecionado.footer_text || ''}
              buttons={botoesSel}
              examples={variaveisSel}
            />
          </div>
          <div className="text-xs text-slate-600 space-y-1">
            <p><strong className="text-slate-700">Nome técnico:</strong> {selecionado.name}</p>
            <p><strong className="text-slate-700">Categoria:</strong> {selecionado.category}</p>
            <p><strong className="text-slate-700">Idioma:</strong> {selecionado.language}</p>
            <p><strong className="text-slate-700">Tipo:</strong> {selecionado.type || selecionado.header_type || 'TEXT'}</p>
            {selecionado.connection_nome && (
              <p><strong className="text-slate-700">Conexão:</strong> {selecionado.connection_nome}</p>
            )}
            {selecionado.header_media_url && (
              <p className="break-all">
                <strong className="text-slate-700">Mídia do cabeçalho:</strong>{' '}
                <a href={selecionado.header_media_url} target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">abrir arquivo</a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Step3({ form, setForm, empresaId }) {
  const [vendedores, setVendedores] = useState([]);
  const [parceiros, setParceiros] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      base44.entities.Colaborador.filter(
        { empresa_id: empresaId, status: 'ativo' },
        'nome',
        500
      ),
      base44.entities.Colaborador.filter(
        { empresa_id: empresaId, perfil: 'parceiro', status: 'ativo' },
        'nome',
        500
      ),
    ])
      .then(([all, pars]) => {
        if (cancelled) return;
        const vends = (all || []).filter((c) =>
          ['vendedor', 'colaborador_vendedor'].includes(c.perfil)
        );
        setVendedores(vends);
        setParceiros(pars || []);
      })
      .catch(() => {
        if (!cancelled) {
          setVendedores([]);
          setParceiros([]);
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [empresaId]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="block mb-1">Filtros</Label>
        <p className="text-xs text-slate-500 mb-3">
          Filtros opcionais para refinar o público de primeiro contato. Você pode avançar sem preencher nada.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Cidade</Label>
          <Input value={form.filtro_cidade} onChange={(e) => setForm({ ...form, filtro_cidade: e.target.value })} placeholder="Ex: Águas Belas" />
        </div>
        <div>
          <Label>UF</Label>
          <Input value={form.filtro_uf} onChange={(e) => setForm({ ...form, filtro_uf: e.target.value.toUpperCase() })} placeholder="Ex: PE" maxLength={2} />
        </div>
        <div>
          <Label>Vendedor responsável</Label>
          <select
            value={form.filtro_vendedor_id || ''}
            onChange={(e) => setForm({ ...form, filtro_vendedor_id: e.target.value })}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Parceiro / origem do contato</Label>
          <select
            value={form.filtro_parceiro_id || ''}
            onChange={(e) => setForm({ ...form, filtro_parceiro_id: e.target.value })}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">Todos os parceiros</option>
            {parceiros.map((p) => (
              <option key={p.id} value={p.id}>{p.nome || p.email}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <ToggleCheck
          checked={!!form.filtro_com_nome}
          onChange={(v) => setForm({ ...form, filtro_com_nome: v, filtro_sem_nome: v ? false : form.filtro_sem_nome })}
          label="Com nome cadastrado"
        />
        <ToggleCheck
          checked={!!form.filtro_sem_nome}
          onChange={(v) => setForm({ ...form, filtro_sem_nome: v, filtro_com_nome: v ? false : form.filtro_com_nome })}
          label="Sem nome cadastrado"
        />
        <ToggleCheck
          checked={!!form.filtro_telefone_valido}
          onChange={(v) => setForm({ ...form, filtro_telefone_valido: v })}
          label="Com telefone válido"
        />
        <ToggleCheck
          checked={!!form.filtro_apenas_whatsapp}
          onChange={(v) => setForm({ ...form, filtro_apenas_whatsapp: v })}
          label="Apenas telefones WhatsApp"
        />
      </div>

      {/* Regras automáticas (informativo — não são filtros) */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Regras automáticas (sempre aplicadas)
        </p>
        <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
          <li>Remover telefones duplicados</li>
          <li>Excluir números inválidos (menos de 10 dígitos)</li>
          <li>Excluir contatos bloqueados que solicitaram não receber mensagens</li>
          <li>Impedir dois envios para o mesmo telefone nesta campanha</li>
        </ul>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando vendedores e parceiros…
        </div>
      )}
    </div>
  );
}

function ToggleCheck({ checked, onChange, label }) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm transition',
        checked ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:bg-slate-50'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-emerald-600"
      />
      {label}
    </label>
  );
}

function Step4({ preview, loading, onRecalc }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="block mb-1">Prévia dos destinatários</Label>
          <p className="text-sm text-slate-500">Clique em "Atualizar prévia" para calcular.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRecalc} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
          Atualizar prévia
        </Button>
      </div>
      {preview && !loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Clientes selecionados" value={preview.clientes_selecionados ?? 0} color="text-slate-700" />
          <Stat label="Removidos pelos filtros" value={preview.clientes_removidos_filtros ?? 0} color="text-red-600" />
          <Stat label="Total de clientes" value={preview.total_clientes ?? 0} color="text-blue-600" />
          <Stat label="Telefones inválidos" value={preview.telefones_invalidos ?? 0} color="text-amber-600" />
          <Stat label="Telefones duplicados" value={preview.telefones_duplicados ?? 0} color="text-amber-600" />
          <Stat label="Contatos bloqueados" value={preview.bloqueados_removidos ?? 0} color="text-red-500" />
          <Stat label="Total de telefones" value={preview.total_telefones ?? 0} color="text-slate-700" />
          <Stat label="Total final de envios" value={preview.total_final_envios ?? 0} color="text-emerald-700" highlight />
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculando…
        </div>
      ) : (
        <div className="text-center text-slate-400 py-10">
          Prévia ainda não calculada.
        </div>
      )}
    </div>
  );
}

function Step5({ form, setForm }) {
  return (
    <div className="space-y-4">
      <Label className="block">Agendamento</Label>
      <div className="flex gap-2">
        <button
          onClick={() => setForm({ ...form, agendamento: 'agora' })}
          className={`flex-1 p-3 rounded-lg border text-sm font-medium ${
            form.agendamento === 'agora' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'
          }`}
        >
          Enviar agora
        </button>
        <button
          onClick={() => setForm({ ...form, agendamento: 'agendar' })}
          className={`flex-1 p-3 rounded-lg border text-sm font-medium ${
            form.agendamento === 'agendar' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200'
          }`}
        >
          Agendar
        </button>
      </div>

      {form.agendamento === 'agendar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Data</Label>
            <Input type="date" value={form.agendada_para_data} onChange={(e) => setForm({ ...form, agendada_para_data: e.target.value })} />
          </div>
          <div>
            <Label>Hora</Label>
            <Input type="time" value={form.agendada_para_hora} onChange={(e) => setForm({ ...form, agendada_para_hora: e.target.value })} />
          </div>
          <p className="text-xs text-slate-400 md:col-span-2">Fuso horário: America/Sao_Paulo (configurável no futuro).</p>
        </div>
      )}

      <div className="border-t pt-4">
        <Label className="block mb-2">Controle de velocidade</Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Mensagens por minuto</Label>
            <Input type="number" value={form.velocidade_envio} onChange={(e) => setForm({ ...form, velocidade_envio: e.target.value })} />
          </div>
          <div>
            <Label>Pausar após N envios</Label>
            <Input type="number" value={form.pausa_apos} onChange={(e) => setForm({ ...form, pausa_apos: e.target.value })} placeholder="0 = sem pausa" />
          </div>
          <div>
            <Label>Duração da pausa (min)</Label>
            <Input type="number" value={form.duracao_pausa_min} onChange={(e) => setForm({ ...form, duracao_pausa_min: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step6({ form, template, preview, user }) {
  return (
    <div className="space-y-3">
      <Label className="block">Resumo</Label>
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-2 text-sm">
          <Row label="Nome" value={form.nome || '-'} />
          <Row label="Template" value={template?.display_name || template?.name || '-'} />
          <Row label="Canal" value="WhatsApp API Oficial" />
          <Row label="Público (fontes)" value={resumoPublico(form)} />
          <Row label="Filtros" value={resumoFiltros(form)} />
          <Row label="Prontos p/ envio" value={preview?.prontos_envio ?? '-'} />
          <Row label="Agendamento" value={form.agendamento === 'agora' ? 'Imediato' : `${form.agendada_para_data} ${form.agendada_para_hora}`} />
          <Row label="Velocidade" value={`${form.velocidade_envio || 60} msg/min`} />
          {form.pausa_apos && <Row label="Pausa" value={`Após ${form.pausa_apos} envios · ${form.duracao_pausa_min || 0} min`} />}
          <Row label="Empresa" value={empresaIdShort(user)} />
          <Row label="Responsável" value={user?.full_name || user?.email} />
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        A campanha será criada com destinatários em fila. O disparo será processado pela próxima iteração (função backend de execução).
      </p>
    </div>
  );
}

function Stat({ label, value, color, highlight }) {
  return (
    <div className={`rounded-lg border border-slate-200 p-3 ${highlight ? 'bg-emerald-50 border-emerald-200' : ''}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 font-medium text-right">{value}</span>
    </div>
  );
}
function empresaIdShort(user) {
  const id = user?.empresa_id || '-';
  return typeof id === 'string' && id.length > 8 ? id.slice(0, 8) + '…' : id;
}

function resumoPublico(form) {
  const partes = [];
  if (form.origens?.includes('clientes')) {
    const subMap = {
      todos: 'Todos os clientes',
      ativos: 'Ativos',
      inativos: 'Inativos',
      com_whatsapp: 'Com WhatsApp',
      sem_whatsapp: 'Sem WhatsApp',
      sem_atendimento: 'Sem atendimento',
      com_propostas: 'Com propostas',
      sem_propostas: 'Sem propostas',
    };
    partes.push(`Clientes: ${subMap[form.clientes_sub] || 'Todos'}`);
  }
  if (form.origens?.includes('funis') && form.funis_selecionados?.length) {
    partes.push(`${form.funis_selecionados.length} funil(is)`);
  }
  if (form.origens?.includes('tags') && form.tags_selecionadas?.length) {
    partes.push(`${form.tags_selecionadas.length} tag(s)`);
  }
  if (form.origens?.includes('listas') && form.listas_selecionadas?.length) {
    partes.push(`${form.listas_selecionadas.length} lista(s)`);
  }
  if (form.origens?.includes('parceiros') && form.parceiros_selecionados?.length) {
    partes.push(`${form.parceiros_selecionados.length} parceiro(s)`);
  }
  if (form.origens?.includes('personalizados') && form.personalizado_regras?.length) {
    partes.push(`${form.personalizado_regras.length} regra(s)`);
  }
  return partes.length ? partes.join(' · ') : '—';
}