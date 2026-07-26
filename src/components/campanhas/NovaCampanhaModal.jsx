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
} from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  { id: 1, label: 'Template', icon: FileText },
  { id: 2, label: 'Público', icon: Users },
  { id: 3, label: 'Filtros', icon: FilterIcon },
  { id: 4, label: 'Prévia', icon: Eye },
  { id: 5, label: 'Agendamento', icon: CalendarClock },
  { id: 6, label: 'Confirmar', icon: ListChecks },
];

const PUBLICOS_CLIENTES = [
  { id: 'todos', label: 'Todos' },
  { id: 'ativos', label: 'Ativos' },
  { id: 'inativos', label: 'Inativos' },
  { id: 'sem_proposta', label: 'Sem proposta' },
  { id: 'com_proposta', label: 'Com proposta' },
];

const normalizeTel = (s = '') => s.replace(/\D/g, '');

export default function NovaCampanhaModal({ open, onOpenChange, empresaId, user }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    template_id: '',
    publico_tipo: 'clientes',
    publico_sub: 'todos',
    origens: ['clientes'],
    filtro_cidade: '',
    filtro_uf: '',
    filtro_sem_atendimento_dias: '',
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
      setForm({
        nome: '',
        descricao: '',
        template_id: '',
        publico_tipo: 'clientes',
        publico_sub: 'todos',
        origens: ['clientes'],
        filtro_cidade: '',
        filtro_uf: '',
        filtro_sem_atendimento_dias: '',
        agendamento: 'agora',
        agendada_para_data: '',
        agendada_para_hora: '',
        velocidade_envio: 60,
        pausa_apos: '',
        duracao_pausa_min: '',
      });
    }
  }, [open]);

  // Templates aprovados da empresa
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['campanha-templates', empresaId],
    queryFn: () =>
      base44.entities.WhatsappTemplate.filter(
        { empresa_id: empresaId, status: 'aprovado' },
        '-created_date',
        200
      ),
    enabled: !!empresaId && open,
  });

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
      const filtro = { empresa_id: empresaId };
      if (form.publico_sub === 'ativos') filtro.status = 'ativo';
      if (form.publico_sub === 'inativos') filtro.status = 'inativo';
      const clientes = await base44.entities.Cliente.filter(filtro, null, 2000);
      let filtrados = clientes;
      if (form.filtro_cidade) {
        filtrados = filtrados.filter((c) =>
          (c.res_cidade || '').toLowerCase().includes(form.filtro_cidade.toLowerCase())
        );
      }
      if (form.filtro_uf) {
        filtrados = filtrados.filter((c) =>
          (c.res_uf || '').toLowerCase() === form.filtro_uf.toLowerCase()
        );
      }
      const comTelefone = filtrados.filter((c) => normalizeTel(c.celular || '').length >= 10);
      const telefones = comTelefone.map((c) => normalizeTel(c.celular));
      const unicos = new Set(telefones);
      const duplicados = telefones.length - unicos.size;
      setPreview({
        total_encontrados: filtrados.length,
        com_telefone: comTelefone.length,
        prontos_envio: unicos.size,
        duplicados,
        sem_telefone: filtrados.length - comTelefone.length,
      });
    } catch (e) {
      toast.error('Erro ao calcular prévia: ' + (e.message || 'desconhecido'));
    } finally {
      setLoadingPreview(false);
    }
  };

  const podeAvancar = useMemo(() => {
    if (step === 1) return !!form.template_id && !!form.nome;
    if (step === 2) return form.origens.length > 0;
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
      const filtro = { empresa_id: empresaId };
      if (form.publico_sub === 'ativos') filtro.status = 'ativo';
      if (form.publico_sub === 'inativos') filtro.status = 'inativo';
      const clientes = await base44.entities.Cliente.filter(filtro, null, 2000);
      let filtrados = clientes;
      if (form.filtro_cidade) {
        filtrados = filtrados.filter((c) =>
          (c.res_cidade || '').toLowerCase().includes(form.filtro_cidade.toLowerCase())
        );
      }
      if (form.filtro_uf) {
        filtrados = filtrados.filter((c) =>
          (c.res_uf || '').toLowerCase() === form.filtro_uf.toLowerCase()
        );
      }
      const comTelefone = filtrados.filter((c) => normalizeTel(c.celular || '').length >= 10);
      const vistos = new Set();
      const unicos = [];
      for (const c of comTelefone) {
        const tel = normalizeTel(c.celular);
        if (vistos.has(tel)) continue;
        vistos.add(tel);
        unicos.push({ c, tel });
      }
      if (unicos.length === 0) {
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
        publico: { tipo: form.publico_tipo, sub: form.publico_sub, origens: form.origens },
        filtros: {
          cidade: form.filtro_cidade,
          uf: form.filtro_uf,
          sem_atendimento_dias: form.filtro_sem_atendimento_dias,
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
        total_destinatarios: unicos.length,
        velocidade_envio: Number(form.velocidade_envio) || 60,
        pausa_apos: form.pausa_apos ? Number(form.pausa_apos) : null,
        duracao_pausa_min: form.duracao_pausa_min ? Number(form.duracao_pausa_min) : null,
        agendada_para: agendadaPara,
        config_json: configJson,
      });

      const destinatarios = unicos.map(({ c, tel }) => ({
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
          : `Campanha criada com ${unicos.length} destinatários na fila`
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

        <div className="min-h-[260px]">
          {step === 1 && (
            <Step1
              form={form}
              setForm={setForm}
              templates={templates}
              loading={loadingTemplates}
            />
          )}
          {step === 2 && <Step2 form={form} setForm={setForm} />}
          {step === 3 && <Step3 form={form} setForm={setForm} />}
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

function Step1({ form, setForm, templates, loading }) {
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

      <div>
        <Label className="mb-2 block">Template aprovado *</Label>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando templates aprovados…
          </div>
        ) : templates.length === 0 ? (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-4 text-sm text-amber-700">
              Nenhum template aprovado encontrado. Crie e aprove templates na aba Templates antes de criar uma campanha.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-auto pr-1">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setForm({ ...form, template_id: t.id })}
                className={`text-left p-3 rounded-lg border transition ${
                  form.template_id === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="font-medium text-slate-800 text-sm truncate">{t.display_name || t.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.category} · {t.language} · {(t.header_type || 'TEXT').toUpperCase()}
                </p>
                {t.body_text && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.body_text}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Step2({ form, setForm }) {
  const origens = [
    { id: 'clientes', label: 'Clientes' },
    { id: 'funis', label: 'Funis' },
    { id: 'tags', label: 'Tags' },
    { id: 'listas', label: 'Listas importadas' },
    { id: 'parceiros', label: 'Parceiros' },
    { id: 'personalizados', label: 'Personalizados' },
  ];
  const toggle = (id) => {
    const tem = form.origens.includes(id);
    setForm({ ...form, origens: tem ? form.origens.filter((o) => o !== id) : [...form.origens, id] });
  };
  return (
    <div className="space-y-4">
      <Label className="block">Origens do público (selecione uma ou várias)</Label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {origens.map((o) => (
          <button
            key={o.id}
            onClick={() => toggle(o.id)}
            className={`p-3 rounded-lg border text-sm text-left transition ${
              form.origens.includes(o.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {form.origens.includes('clientes') && (
        <div className="border-t pt-4">
          <Label className="block mb-2">Filtro de clientes</Label>
          <div className="flex flex-wrap gap-2">
            {PUBLICOS_CLIENTES.map((p) => (
              <button
                key={p.id}
                onClick={() => setForm({ ...form, publico_sub: p.id })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  form.publico_sub === p.id ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-slate-400">
        Demais origens (tags, listas, funis, parceiros) serão liberadas na próxima iteração.
      </p>
    </div>
  );
}

function Step3({ form, setForm }) {
  return (
    <div className="space-y-4">
      <Label className="block">Filtros</Label>
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
          <Label>Sem atendimento há mais de (dias)</Label>
          <Input type="number" value={form.filtro_sem_atendimento_dias} onChange={(e) => setForm({ ...form, filtro_sem_atendimento_dias: e.target.value })} placeholder="Ex: 30" />
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Filtros adicionais (vendedor, tags, inadimplência etc) serão incluídos na próxima versão.
      </p>
    </div>
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
          <Stat label="Total encontrados" value={preview.total_encontrados} color="text-slate-700" />
          <Stat label="Com telefone válido" value={preview.com_telefone} color="text-emerald-600" />
          <Stat label="Prontos para envio" value={preview.prontos_envio} color="text-emerald-700 highlight" />
          <Stat label="Duplicados" value={preview.duplicados} color="text-amber-600" />
          <Stat label="Sem telefone" value={preview.sem_telefone} color="text-slate-500" />
          <Stat label="Sem WhatsApp (estimado)" value="—" color="text-slate-400" />
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
          <Row label="Público" value={`${form.publico_tipo} (${form.publico_sub})`} />
          <Row label="Filtros" value={[form.filtro_cidade, form.filtro_uf, form.filtro_sem_atendimento_dias ? `> ${form.filtro_sem_atendimento_dias} dias` : ''].filter(Boolean).join(' · ') || 'Nenhum'} />
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