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
    canal_tipo: 'nao_oficial',
    mensagem_tipo: 'texto',
    mensagem_texto: '',
    midia_url: '',
    midia_nome: '',
    publico_consorcio_ativo: false,
    publico_produto: '',
    consorcio_situacao: 'em_atraso',
    consorcio_vendedores_ids: [],
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
        canal_tipo: 'nao_oficial',
        mensagem_tipo: 'texto',
        mensagem_texto: '',
        midia_url: '',
        midia_nome: '',
        publico_consorcio_ativo: false,
        publico_produto: '',
        consorcio_situacao: 'em_atraso',
        consorcio_vendedores_ids: [],
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
    enabled: !!empresaId && open && form.canal_tipo === 'oficial',
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

  const carregarClientesBase = async () => {
    if (form.publico_produto === 'consorcio' || form.publico_consorcio_ativo) {
      // Em atraso representa uma cota vigente com pendência financeira.
      // Canceladas e contempladas usam outros status e, por isso, ficam fora automaticamente.
      const vendasElegiveis = await base44.entities.Venda.filter({
        empresa_id: empresaId,
        status: form.consorcio_situacao || 'em_atraso',
        administradora_id: form.administradora_id,
      }, '-created_date', 5000);
      const vendedoresSelecionados = new Set(form.consorcio_vendedores_ids || []);
      const vendasDosVendedores = vendedoresSelecionados.size > 0
        ? (vendasElegiveis || []).filter((v) => vendedoresSelecionados.has(v.vendedor_id))
        : (vendasElegiveis || []);
      const ids = [...new Set(vendasDosVendedores.map((v) => v.cliente_id).filter(Boolean))];
      if (!ids.length) return [];
      const todosClientes = await base44.entities.Cliente.filter({ empresa_id: empresaId }, null, 5000);
      const idsSet = new Set(ids);
      return (todosClientes || []).filter((cliente) => idsSet.has(cliente.id));
    }

    // Tags são vinculadas aos registros de ContatoWhatsapp. Quando Tags é a
    // fonte escolhida, cruzamos esses contatos com Cliente por cliente_id ou telefone.
    // Contatos ainda não cadastrados como Cliente também permanecem aptos ao disparo.
    if ((form.origens || []).includes('tags') && !(form.origens || []).includes('clientes')) {
      const tagsSelecionadas = new Set(form.tags_selecionadas || []);
      if (!tagsSelecionadas.size) return [];

      const [contatosWhatsapp, clientes] = await Promise.all([
        base44.entities.ContatoWhatsapp.filter({ empresa_id: empresaId }, null, 5000),
        base44.entities.Cliente.filter({ empresa_id: empresaId }, null, 5000),
      ]);

      const clientesPorId = new Map((clientes || []).map((cliente) => [cliente.id, cliente]));
      const clientesPorTelefone = new Map();
      (clientes || []).forEach((cliente) => {
        [
          cliente.celular,
          cliente.pj_celular,
          cliente.telefone_fixo,
          cliente.pj_telefone_fixo,
        ].forEach((telefone) => {
          const normalizado = normalizeTel(telefone || '');
          if (normalizado) clientesPorTelefone.set(normalizado, cliente);
        });
      });

      const resultado = [];
      const chavesIncluidas = new Set();

      (contatosWhatsapp || [])
        .filter((contato) =>
          (Array.isArray(contato.tags_ids) ? contato.tags_ids : [])
            .some((tagId) => tagsSelecionadas.has(tagId))
        )
        .forEach((contato) => {
          const telefone = normalizeTel(contato.telefone || '');
          const clienteVinculado = clientesPorId.get(contato.cliente_id)
            || clientesPorTelefone.get(telefone);
          const chave = clienteVinculado?.id || telefone || contato.id;
          if (chavesIncluidas.has(chave)) return;
          chavesIncluidas.add(chave);

          if (clienteVinculado) {
            resultado.push({
              ...clienteVinculado,
              _cliente_id_campanha: clienteVinculado.id,
              _contato_whatsapp_id: contato.id,
            });
          } else {
            resultado.push({
              id: `contato-whatsapp-${contato.id}`,
              _cliente_id_campanha: null,
              _contato_whatsapp_id: contato.id,
              empresa_id: empresaId,
              tipo_pessoa: 'Física',
              nome_completo: contato.nome || 'Sem nome',
              primeiro_nome: (contato.nome || '').trim().split(/\s+/)[0] || '',
              celular: telefone,
              res_cidade: '',
              status: 'ativo',
            });
          }
        });

      return resultado;
    }

    const sub = form.clientes_sub || 'todos';
    const filtro = { empresa_id: empresaId };
    if (sub === 'ativos') filtro.status = 'ativo';
    if (sub === 'inativos') filtro.status = 'inativo';
    let clientes = await base44.entities.Cliente.filter(filtro, null, 5000);
    if (sub === 'sem_whatsapp') clientes = clientes.filter((c) => normalizeTel(c.celular || '').length < 10);
    if (sub === 'com_whatsapp') clientes = clientes.filter((c) => normalizeTel(c.celular || '').length >= 10);
    return clientes;
  };

  const calcularPrevia = async () => {
    if (!empresaId) return;
    setLoadingPreview(true);
    setPreview(null);
    try {
      const baseClientes = await carregarClientesBase();
      const telsMap = await carregarTelefonesPorCliente(empresaId);
      const bloqueados = await carregarTelefonesBloqueados(empresaId);
      const filtrados = aplicarFiltrosPublico(baseClientes, form, telsMap);
      const comTelefone = filtrados.filter((c) =>
        selecionarTelefonesParaCampanha(c, modoTelefoneParaCampanha(form), telsMap.get(c.id) || []).length > 0
      );
      const antesFiltros = baseClientes.length;
      const removidosFiltros = antesFiltros - filtrados.length;
      const telefonesUnicosSet = new Set();
      const destinatarios = [];
      let totalTelefones = 0;
      let invalidos = 0;
      let duplicados = 0;
      let bloqueadosRemovidos = 0;
      let semTelefone = 0;

      filtrados.forEach((cliente) => {
        const nome = cliente.nome_completo || cliente.pj_razao_social || cliente.pj_nome_fantasia || 'Sem nome';
        const cidade = cliente.res_cidade || cliente.com_cidade || '—';
        const telefones = selecionarTelefonesParaCampanha(
          cliente,
          modoTelefoneParaCampanha(form),
          telsMap.get(cliente.id) || []
        );

        if (!telefones.length) {
          semTelefone++;
          destinatarios.push({
            id: `${cliente.id}-sem-telefone`,
            cliente_id: cliente.id,
            nome,
            telefone: '—',
            cidade,
            status: 'removido',
            motivo: 'Sem telefone cadastrado',
          });
          return;
        }

        telefones.forEach((telefone, indice) => {
          totalTelefones++;
          let status = 'apto';
          let motivo = 'Apto para receber';

          if (telefone.length < 10) {
            invalidos++;
            status = 'removido';
            motivo = 'Telefone inválido';
          } else if (bloqueados.has(telefone)) {
            bloqueadosRemovidos++;
            status = 'removido';
            motivo = 'Contato bloqueado';
          } else if (telefonesUnicosSet.has(telefone)) {
            duplicados++;
            status = 'removido';
            motivo = 'Telefone duplicado';
          } else {
            telefonesUnicosSet.add(telefone);
          }

          destinatarios.push({
            id: `${cliente.id}-${telefone}-${indice}`,
            cliente_id: cliente.id,
            nome,
            telefone,
            cidade,
            status,
            motivo,
          });
        });
      });

      setPreview({
        clientes_base: antesFiltros,
        clientes_selecionados: filtrados.length,
        clientes_removidos_filtros: removidosFiltros,
        total_clientes: comTelefone.length,
        clientes_sem_telefone: semTelefone,
        telefones_invalidos: invalidos,
        telefones_duplicados: duplicados,
        bloqueados_removidos: bloqueadosRemovidos,
        total_telefones: totalTelefones,
        total_final_envios: telefonesUnicosSet.size,
        destinatarios,
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
    if (step === 1) {
      if (!form.nome || !form.conn_selecionada) return false;
      if (form.canal_tipo === 'nao_oficial') {
        if (!form.mensagem_texto?.trim()) return false;
        if (form.mensagem_tipo !== 'texto' && !form.midia_url) return false;
        return true;
      }
      return !!form.template_id;
    }
    if (step === 2) {
      if (form.publico_produto === 'consorcio' || form.publico_consorcio_ativo) return !!form.administradora_id && !!form.consorcio_situacao;
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
      const baseClientes = await carregarClientesBase();
      const telsMap = await carregarTelefonesPorCliente(empresaId);
      const bloqueados = await carregarTelefonesBloqueados(empresaId);
      const filtrados = aplicarFiltrosPublico(baseClientes, form, telsMap);
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
          origens: form.publico_consorcio_ativo ? ['consorcio_ativo'] : form.origens,
          clientes_sub: form.clientes_sub,
          publico_consorcio_ativo: form.publico_consorcio_ativo,
          publico_produto: form.publico_produto,
          consorcio_situacao: form.consorcio_situacao,
          consorcio_vendedores_ids: form.consorcio_vendedores_ids || [],
          administradora_id: form.administradora_id,
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
      const administradoraSelecionada = form.publico_consorcio_ativo
        ? await base44.entities.Administradora.get(form.administradora_id).catch(() => null)
        : null;
      const campanha = await base44.entities.Campanha.create({
        empresa_id: empresaId,
        criador_id: user.id,
        criador_nome: user.full_name || user.email,
        nome: form.nome,
        descricao: form.descricao,
        canal: form.canal_tipo === 'nao_oficial' ? 'whatsapp_nao_oficial' : 'whatsapp_meta_oficial',
        connection_id: form.conn_selecionada,
        mensagem_tipo: form.canal_tipo === 'nao_oficial' ? form.mensagem_tipo : null,
        mensagem_texto: form.canal_tipo === 'nao_oficial' ? form.mensagem_texto : null,
        midia_url: form.canal_tipo === 'nao_oficial' ? form.midia_url : null,
        administradora_id: form.publico_consorcio_ativo ? form.administradora_id : null,
        administradora_nome: administradoraSelecionada?.nome_fantasia || administradoraSelecionada?.razao_social || '',
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
        cliente_id: c._cliente_id_campanha === null ? null : (c._cliente_id_campanha || c.id),
        cliente_nome: c.nome_completo || c.pj_razao_social || '',
        telefone: tel,
        status: 'na_fila',
        origem: 'clientes_filtro',
      }));
      if (destinatarios.length > 0) {
        await base44.entities.CampanhaDestinatario.bulkCreate(destinatarios);
      }

      if (form.agendamento === 'agora' && form.canal_tipo === 'nao_oficial') {
        await base44.entities.Campanha.update(campanha.id, { status: 'executando' });
        await base44.functions.invoke('dispararCampanhaNaoOficial', { campanha_id: campanha.id });
      }

      toast.success(
        form.agendamento === 'agendar'
          ? `Campanha agendada para ${form.agendada_para_data} ${form.agendada_para_hora}`
          : form.canal_tipo === 'nao_oficial'
            ? `Disparo iniciado para ${vistos.size} telefone(s) ativos da administradora selecionada`
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
              connections={conexoesDoCanal || []}
            />
          )}
          {step === 2 && (
            <PublicoBuilder form={form} setForm={setForm} empresaId={empresaId} user={user} />
          )}
          {step === 3 && <Step3 form={form} setForm={setForm} empresaId={empresaId} />}
          {step === 4 && (
            <Step4
              preview={preview}
              loading={loadingPreview}
              onRecalc={calcularPrevia}
              form={form}
              template={templateSelecionado}
            />
          )}
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

function Step1({ form, setForm, templates, loading, syncing, syncError, onSync, connections }) {
  const [uploading, setUploading] = useState(false);
  const templatesVisiveis = form.conn_selecionada
    ? (templates || []).filter((t) => !t.connection_id || t.connection_id === form.conn_selecionada)
    : (templates || []);
  const selecionado = templatesVisiveis.find((t) => t.id === form.template_id) || null;

  const uploadMidia = async (file) => {
    if (!file) return;
    const imagem = form.mensagem_tipo === 'imagem_texto';
    const valido = imagem ? file.type.startsWith('image/') : file.type.startsWith('video/');
    if (!valido) return toast.error(imagem ? 'Selecione uma imagem.' : 'Selecione um vídeo.');
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      if (!res?.file_url) throw new Error('O upload não retornou a URL do arquivo');
      setForm({ ...form, midia_url: res.file_url, midia_nome: file.name });
      toast.success('Mídia adicionada à campanha');
    } catch (e) {
      toast.error('Erro ao enviar mídia: ' + (e.message || 'desconhecido'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Nome da campanha *</Label>
          <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Vencimento Canopus" />
        </div>
        <div>
          <Label>Descrição</Label>
          <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Opcional" />
        </div>
      </div>

      <div>
        <Label className="block mb-2">Tipo de API *</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <button type="button" onClick={() => setForm({ ...form, canal_tipo: 'nao_oficial', conn_selecionada: '', template_id: '' })}
            className={`p-3 rounded-lg border text-left ${form.canal_tipo === 'nao_oficial' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
            <p className="font-semibold text-sm">API não oficial — JD/D-API</p>
            <p className="text-xs text-slate-500">Mensagem criada na hora, sem template aprovado.</p>
          </button>
          <button type="button" onClick={() => setForm({ ...form, canal_tipo: 'oficial', conn_selecionada: '', template_id: '' })}
            className={`p-3 rounded-lg border text-left ${form.canal_tipo === 'oficial' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
            <p className="font-semibold text-sm">API Oficial — Meta</p>
            <p className="text-xs text-slate-500">Utiliza template previamente aprovado.</p>
          </button>
        </div>
      </div>

      <div>
        <Label>Canal de envio *</Label>
        <select value={form.conn_selecionada || ''} onChange={(e) => setForm({ ...form, conn_selecionada: e.target.value, template_id: '' })}
          className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white">
          <option value="">Selecione a conexão…</option>
          {(connections || []).map((c) => (
            <option key={c.id} value={c.id}>{c.nome || c.session_id} {c.phone_number ? `· ${c.phone_number}` : ''}</option>
          ))}
        </select>
      </div>

      {form.canal_tipo === 'nao_oficial' ? (
        <div className="space-y-3 border rounded-xl p-4 bg-slate-50">
          <div>
            <Label className="block mb-2">Formato da mensagem *</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'texto', label: 'Apenas texto', Icon: FileText },
                { id: 'imagem_texto', label: 'Imagem + texto', Icon: ImageIcon },
                { id: 'video_texto', label: 'Vídeo + texto', Icon: Video },
              ].map(({ id: tipo, label, Icon }) => (
                <button key={tipo} type="button" onClick={() => setForm({ ...form, mensagem_tipo: tipo, midia_url: '', midia_nome: '' })}
                  className={`p-3 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 ${form.mensagem_tipo === tipo ? 'border-emerald-500 bg-white text-emerald-700' : 'border-slate-200 bg-white'}`}>
                  <Icon className="w-5 h-5" />{label}
                </button>
              ))}
            </div>
          </div>
          {form.mensagem_tipo !== 'texto' && (
            <div>
              <Label>{form.mensagem_tipo === 'imagem_texto' ? 'Imagem' : 'Vídeo'} *</Label>
              <label className="mt-1 border border-dashed rounded-lg p-4 flex items-center justify-center gap-2 cursor-pointer bg-white">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span className="text-sm">{form.midia_nome || (uploading ? 'Enviando…' : 'Selecionar arquivo')}</span>
                <input type="file" className="hidden" disabled={uploading}
                  accept={form.mensagem_tipo === 'imagem_texto' ? 'image/*' : 'video/*'}
                  onChange={(e) => { uploadMidia(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
          )}
          <div>
            <Label>Texto da mensagem *</Label>
            <Textarea rows={6} value={form.mensagem_texto} onChange={(e) => setForm({ ...form, mensagem_texto: e.target.value })}
              placeholder={"Olá, {nome}!\nHoje é o vencimento da sua parcela.\nSe já realizou o pagamento, desconsidere esta mensagem."} />
            <p className="text-[11px] text-slate-500 mt-1">Use <strong>{'{nome}'}</strong> para inserir o primeiro nome do cliente.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Template aprovado *</Label>
            <button type="button" onClick={() => onSync()} disabled={syncing}
              className="text-xs flex items-center gap-1 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sincronizar com a Meta
            </button>
          </div>
          {syncError && <p className="text-xs text-red-600">{syncError}</p>}
          {loading || syncing ? <div className="text-sm text-slate-500">Carregando templates…</div> :
            templatesVisiveis.length === 0 ? <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-700">Nenhum template aprovado encontrado para esta conexão.</div> :
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto">
              {templatesVisiveis.map((t) => (
                <button key={t.id} type="button" onClick={() => setForm({ ...form, template_id: t.id })}
                  className={`p-3 rounded-lg border text-left ${form.template_id === t.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                  <p className="font-medium text-sm">{t.display_name || t.name}</p>
                  <p className="text-xs text-slate-500 line-clamp-2">{t.body_text || t.category}</p>
                </button>
              ))}
            </div>}
          {selecionado && <TemplatePreview tipo={selecionado.type || selecionado.header_type || 'TEXT'} headerMediaUrl={selecionado.header_media_url || ''} bodyText={selecionado.body_text || ''} footerText={selecionado.footer_text || ''} />}
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
            value={(form.publico_produto === 'consorcio' || form.publico_consorcio_ativo) ? '' : (form.filtro_vendedor_id || '')}
            disabled={form.publico_produto === 'consorcio' || form.publico_consorcio_ativo}
            onChange={(e) => setForm({ ...form, filtro_vendedor_id: e.target.value })}
            className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">
              {(form.publico_produto === 'consorcio' || form.publico_consorcio_ativo)
                ? 'Definido na etapa Público'
                : 'Todos os vendedores'}
            </option>
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

function Step4({ preview, loading, onRecalc, form, template }) {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('todos');

  const contatosVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (preview?.destinatarios || []).filter((item) => {
      const correspondeSituacao = situacao === 'todos' || item.status === situacao;
      const correspondeBusca = !termo
        || item.nome.toLowerCase().includes(termo)
        || item.telefone.includes(termo)
        || item.cidade.toLowerCase().includes(termo);
      return correspondeSituacao && correspondeBusca;
    });
  }, [preview, busca, situacao]);

  const exemplo = (preview?.destinatarios || []).find((item) => item.status === 'apto');
  const primeiroNome = exemplo?.nome && exemplo.nome !== 'Sem nome'
    ? exemplo.nome.trim().split(/\s+/)[0]
    : 'Cliente';
  const textoExemplo = (form.mensagem_texto || '').replace(/\{nome\}/gi, primeiroNome);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="block mb-1">Confira a campanha antes de enviar</Label>
          <p className="text-sm text-slate-500">Mensagem, quantidade final e destinatários calculados automaticamente.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onRecalc} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
          Recalcular
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Preparando a prévia…
        </div>
      ) : preview ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] gap-4">
            <Card className="border-slate-200 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b bg-slate-50">
                  <p className="font-semibold text-sm text-slate-800">Mensagem que será enviada</p>
                  <p className="text-xs text-slate-500">Exemplo para {primeiroNome}</p>
                </div>
                <div className="p-4 bg-[#efeae2] min-h-[260px]">
                  <div className="max-w-sm ml-auto rounded-lg overflow-hidden bg-[#d9fdd3] shadow-sm">
                    {form.canal_tipo === 'oficial' ? (
                      <div className="bg-white">
                        <TemplatePreview
                          tipo={template?.type || template?.header_type || 'TEXT'}
                          headerMediaUrl={template?.header_media_url || ''}
                          bodyText={template?.body_text || ''}
                          footerText={template?.footer_text || ''}
                        />
                      </div>
                    ) : (
                      <>
                        {form.mensagem_tipo === 'imagem_texto' && form.midia_url && (
                          <img src={form.midia_url} alt="Imagem da campanha" className="w-full max-h-56 object-cover" />
                        )}
                        {form.mensagem_tipo === 'video_texto' && form.midia_url && (
                          <video src={form.midia_url} controls className="w-full max-h-56 bg-black" />
                        )}
                        <p className="p-3 text-sm text-slate-800 whitespace-pre-wrap break-words">{textoExemplo}</p>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                <p className="text-sm font-medium text-emerald-800">Mensagens que serão enviadas</p>
                <p className="text-4xl font-bold text-emerald-700 mt-1">{preview.total_final_envios ?? 0}</p>
                <p className="text-xs text-emerald-700 mt-1">Um envio por telefone apto e sem duplicidade.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Público encontrado" value={preview.clientes_base ?? 0} color="text-slate-700" />
                <Stat label="Após os filtros" value={preview.clientes_selecionados ?? 0} color="text-blue-600" />
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-600 mb-2">Contatos que não receberão</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <Row label="Removidos pelos filtros" value={preview.clientes_removidos_filtros ?? 0} />
                  <Row label="Sem telefone" value={preview.clientes_sem_telefone ?? 0} />
                  <Row label="Telefone inválido" value={preview.telefones_invalidos ?? 0} />
                  <Row label="Telefone duplicado" value={preview.telefones_duplicados ?? 0} />
                  <Row label="Bloqueados" value={preview.bloqueados_removidos ?? 0} />
                </div>
              </div>
            </div>
          </div>

          <Card className="border-slate-200">
            <CardContent className="p-0">
              <div className="p-4 border-b space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-800">Lista de contatos</p>
                    <p className="text-xs text-slate-500">{contatosVisiveis.length} registro(s) exibido(s)</p>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { id: 'todos', label: 'Todos' },
                      { id: 'apto', label: 'Aptos' },
                      { id: 'removido', label: 'Removidos' },
                    ].map((opcao) => (
                      <button
                        key={opcao.id}
                        type="button"
                        onClick={() => setSituacao(opcao.id)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs font-medium border',
                          situacao === opcao.id
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-white border-slate-200 text-slate-600'
                        )}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Pesquisar por nome, telefone ou cidade"
                />
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2.5">Cliente</th>
                      <th className="text-left px-4 py-2.5">Telefone</th>
                      <th className="text-left px-4 py-2.5 hidden md:table-cell">Cidade</th>
                      <th className="text-left px-4 py-2.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contatosVisiveis.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-700">{item.nome}</td>
                        <td className="px-4 py-2.5 text-slate-600">{item.telefone}</td>
                        <td className="px-4 py-2.5 text-slate-500 hidden md:table-cell">{item.cidade}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn(
                            'inline-flex px-2 py-1 rounded-full text-xs font-medium',
                            item.status === 'apto'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          )}>
                            {item.motivo}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {contatosVisiveis.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center text-slate-400 py-10">Nenhum contato encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center text-slate-400 py-10">Prévia ainda não calculada.</div>
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
        <Label className="block mb-2">Cadência segura de envio</Label>
        <p className="text-xs text-slate-500 mb-3">
          O sistema respeita o limite configurado, aplica pausas e recuo automático quando o provedor apresenta erro.
        </p>
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
          {form.canal_tipo === 'oficial'
            ? <Row label="Template" value={template?.display_name || template?.name || '-'} />
            : <Row label="Formato" value={form.mensagem_tipo === 'texto' ? 'Apenas texto' : form.mensagem_tipo === 'imagem_texto' ? 'Imagem + texto' : 'Vídeo + texto'} />}
          <Row label="Canal" value={form.canal_tipo === 'nao_oficial' ? 'WhatsApp API não oficial — JD/D-API' : 'WhatsApp API Oficial'} />
          {(form.publico_produto === 'consorcio' || form.publico_consorcio_ativo) && <Row label="Público" value={`Consórcio · ${form.consorcio_situacao === 'em_atraso' ? 'cotas vigentes em atraso' : 'cotas ativas'} · administradora selecionada · ${(form.consorcio_vendedores_ids || []).length ? `${form.consorcio_vendedores_ids.length} vendedor(es)` : 'todos os vendedores'}`} />}
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