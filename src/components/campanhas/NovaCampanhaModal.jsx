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
import PublicoBuilder from './PublicoBuilder';
import { selecionarTelefonesParaCampanha, carregarTelefonesPorCliente } from './telefonesCliente';

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

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    template_id: '',
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
      const sub = form.clientes_sub || 'todos';
      const filtro = { empresa_id: empresaId };
      if (sub === 'ativos') filtro.status = 'ativo';
      if (sub === 'inativos') filtro.status = 'inativo';
      const clientes = await base44.entities.Cliente.filter(filtro, null, 2000);
      const telsMap = await carregarTelefonesPorCliente(empresaId);
      let filtrados = clientes;
      if (sub === 'sem_whatsapp') filtrados = filtrados.filter((c) => normalizeTel(c.celular || '').length < 10);
      if (sub === 'com_whatsapp') filtrados = filtrados.filter((c) => normalizeTel(c.celular || '').length >= 10);
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
      const comTelefone = filtrados.filter((c) =>
        selecionarTelefonesParaCampanha(c, form.destino_telefones, telsMap.get(c.id) || []).length > 0
      );
      const telsPorCliente = comTelefone.map((c) => selecionarTelefonesParaCampanha(c, form.destino_telefones, telsMap.get(c.id) || []));
      const totalTelefones = telsPorCliente.reduce((s, arr) => s + arr.length, 0);
      const telefonesUnicosSet = new Set();
      telsPorCliente.forEach((arr) => arr.forEach((t) => telefonesUnicosSet.add(t)));
      const duplicados = totalTelefones - telefonesUnicosSet.size;
      setPreview({
        total_encontrados: filtrados.length,
        com_telefone: comTelefone.length,
        clientes_prontos: comTelefone.length,
        prontos_envio: telefonesUnicosSet.size,
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
      let filtrados = clientes;
      if (sub === 'sem_whatsapp') filtrados = filtrados.filter((c) => normalizeTel(c.celular || '').length < 10);
      if (sub === 'com_whatsapp') filtrados = filtrados.filter((c) => normalizeTel(c.celular || '').length >= 10);
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
      const comTelefone = filtrados.filter((c) =>
        selecionarTelefonesParaCampanha(c, form.destino_telefones, telsMap.get(c.id) || []).length > 0
      );
      const vistos = new Set();
      const destinatariosExpandidos = [];
      for (const c of comTelefone) {
        const tels = selecionarTelefonesParaCampanha(c, form.destino_telefones, telsMap.get(c.id) || []);
        for (const tel of tels) {
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
            />
          )}
          {step === 2 && (
            <PublicoBuilder form={form} setForm={setForm} empresaId={empresaId} user={user} />
          )}
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
          <Stat label="Clientes c/ telefone" value={preview.clientes_prontos ?? preview.com_telefone} color="text-blue-600" />
          <Stat label="Telefones prontos p/ envio" value={preview.prontos_envio} color="text-emerald-700 highlight" />
          <Stat label="Telefones duplicados" value={preview.duplicados} color="text-amber-600" />
          <Stat label="Clientes sem telefone" value={preview.sem_telefone} color="text-slate-500" />
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