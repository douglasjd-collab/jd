import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'react-hot-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Edit3, Send } from 'lucide-react';
import TemplateForm from './TemplateForm';
import TemplatePreview from './TemplatePreview';
import TemplateList from './TemplateList';
import { normalizeTemplateName } from './templateHelpers';
import ConectarMetaOficialDialog from './ConectarMetaOficialDialog';

const EMPTY_FORM = {
  id: null,
  connection_id: '',
  display_name: '',
  name: '',
  category: 'UTILITY',
  language: 'pt_BR',
  type: 'TEXT',
  header_text: '',
  header_media_url: '',
  body_text: '',
  footer_text: '',
  buttons: [],
  variables: [],
  waba_id: '',
  phone_number_id: '',
  session_id: '',
  connection_nome: '',
};

export default function TemplateManagerModal({ open, onOpenChange, empresaId, user }) {
  const [tab, setTab] = useState('criar');
  const [form, setForm] = useState(EMPTY_FORM);
  const [connections, setConnections] = useState([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [conectarOpen, setConectarOpen] = useState(false);

  const isSuperAdmin = user?.perfil === 'super_admin' || user?.perfil === 'master';
  const isGerentePlus = isSuperAdmin || user?.perfil === 'admin' || user?.perfil === 'gerente';
  const canCreate = isGerentePlus;

  const loadConnections = useCallback(async () => {
    setLoadingConnections(true);
    try {
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', { action: 'list_connections' });
      const data = res?.data?.connections || [];
      const conns = data.map((c) => {
        let cfg = {};
        try { cfg = JSON.parse(c.config_json || '{}'); } catch {}
        return {
          ...c,
          waba_id: cfg.wabaId || c.waba_id || '',
          phone_number_id: cfg.phoneNumberId || c.phone_number_id || '',
          session_id: cfg.sessionId || c.session_id || '',
        };
      });
      setConnections(conns);
    } catch (e) {
      console.error('list_connections', e);
      setConnections([]);
    } finally {
      setLoadingConnections(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const filter = isSuperAdmin ? {} : (empresaId ? { empresa_id: empresaId } : {});
      const items = await base44.entities.WhatsappTemplate.filter(filter, '-created_date', 200);
      setTemplates(items);
    } catch (e) {
      console.error('loadTemplates', e);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, [empresaId, isSuperAdmin]);

  useEffect(() => {
    if (open) {
      loadConnections();
      loadTemplates();
    } else {
      setForm(EMPTY_FORM);
      setTab('criar');
    }
  }, [open]);

  const handleEdit = (t) => {
    let parsedButtons = [];
    let parsedVariables = [];
    try { parsedButtons = JSON.parse(t.buttons_json || '[]'); } catch {}
    try { parsedVariables = JSON.parse(t.variables_json || '[]'); } catch {}
    setForm({
      id: t.id,
      connection_id: t.connection_id,
      display_name: t.display_name || '',
      name: t.name || '',
      category: t.category,
      language: t.language,
      type: t.type || 'TEXT',
      header_text: t.header_text || '',
      header_media_url: t.header_media_url || '',
      body_text: t.body_text || '',
      footer_text: t.footer_text || '',
      buttons: parsedButtons,
      variables: parsedVariables,
      waba_id: t.waba_id,
      phone_number_id: t.phone_number_id,
      session_id: t.session_id,
      connection_nome: t.connection_nome,
    });
    setTab('criar');
  };

  // Atualiza waba_id/phone_number_id da conexão selecionada
  useEffect(() => {
    if (!form.connection_id) return;
    const c = connections.find((cc) => cc.id === form.connection_id);
    if (!c) return;
    setForm((f) => ({
      ...f,
      waba_id: c.waba_id,
      phone_number_id: c.phone_number_id,
      session_id: c.session_id,
      connection_nome: c.nome,
    }));
  }, [form.connection_id, connections]);

  const positions = (form.body_text || '').match(/\{\{(\d+)\}\}/g) || [];
  const erros = [];
  if (!form.connection_id) erros.push('selecione a conexão');
  if (!form.name) erros.push('informe o nome');
  if (!form.body_text) erros.push('corpo da mensagem é obrigatório');
  if (positions.length > 0 && (form.variables || []).some((v) => !v.example_value)) {
    erros.push('preencha os exemplos de todas as variáveis');
  }
  if (form.footer_text && /\{\{(\d+)\}\}/.test(form.footer_text)) {
    erros.push('rodapé não pode conter variáveis');
  }

  const buildTemplateRecord = (status) => {
    const conn = connections.find((c) => c.id === form.connection_id);
    return {
      empresa_id: empresaId,
      connection_id: form.connection_id,
      connection_nome: conn?.nome || form.connection_nome,
      session_id: conn?.session_id || form.session_id,
      waba_id: conn?.waba_id || form.waba_id,
      phone_number_id: conn?.phone_number_id || form.phone_number_id,
      name: normalizeTemplateName(form.name),
      display_name: form.display_name,
      language: form.language,
      category: form.category,
      type: form.type,
      header_type: form.type === 'TEXT' ? (form.header_text ? 'TEXT' : 'NONE') : form.type,
      header_text: form.type === 'TEXT' ? form.header_text : null,
      body_text: form.body_text,
      footer_text: form.footer_text,
      buttons_json: JSON.stringify(form.buttons || []),
      variables_json: JSON.stringify(form.variables || []),
      status,
      created_by_id: user?.id,
      created_by_nome: user?.full_name,
    };
  };

  const handleSaveDraft = async () => {
    if (erros.length > 0) {
      toast.error('Corrija: ' + erros.join('; '));
      return;
    }
    setIsSaving(true);
    try {
      const data = buildTemplateRecord('rascunho');
      if (form.id) {
        await base44.entities.WhatsappTemplate.update(form.id, data);
        toast.success('Rascunho atualizado');
      } else {
        const created = await base44.entities.WhatsappTemplate.create(data);
        setForm((f) => ({ ...f, id: created.id }));
        toast.success('Rascunho salvo');
      }
      loadTemplates();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || '';
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendToMeta = async () => {
    if (erros.length > 0) {
      toast.error('Corrija: ' + erros.join('; '));
      return;
    }
    // Verificar nome duplicado no CRM
    const dup = templates.find((t) =>
      t.name === form.name &&
      t.language === form.language &&
      t.id !== form.id
    );
    if (dup) {
      toast.error('Já existe um template com este nome e idioma na empresa.');
      return;
    }
    if (!window.confirm('Deseja enviar este template para análise da Meta? \n\nApós o envio, algumas informações não poderão ser alteradas enquanto o template estiver em análise.')) {
      return;
    }

    setIsSending(true);
    try {
      // 1) Salva/atualiza o rascunho com snapshot correto
      let templateId = form.id;
      const data = buildTemplateRecord('enviando');
      if (templateId) {
        await base44.entities.WhatsappTemplate.update(templateId, data);
      } else {
        const created = await base44.entities.WhatsappTemplate.create(data);
        templateId = created.id;
        setForm((f) => ({ ...f, id: created.id }));
      }

      // 2) Sincroniza variáveis no entity (separado para futuras consultas)
      const existingVars = await base44.entities.WhatsappTemplateVariable.filter(
        { template_id: templateId, empresa_id: empresaId }, null, 100
      );
      for (const v of existingVars) {
        try { await base44.entities.WhatsappTemplateVariable.delete(v.id); } catch {}
      }
      for (const v of (form.variables || [])) {
        await base44.entities.WhatsappTemplateVariable.create({
          empresa_id: empresaId,
          template_id: templateId,
          component: v.component || 'BODY',
          position: v.position,
          crm_field: v.crm_field || '',
          description: v.description || '',
          example_value: v.example_value || '',
        });
      }

      // 3) Envia para a Meta via backend
      const res = await base44.functions.invoke('gerenciarTemplateMetaOficial', {
        action: 'send_to_meta',
        template_id: templateId,
      });
      if (res?.data?.success) {
        toast.success('Template enviado para análise da Meta.');
        await loadTemplates();
        setForm(EMPTY_FORM);
        setTab('meus');
      } else {
        toast.error(res?.data?.error || 'Não foi possível enviar para análise da Meta.');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || '';
      toast.error(`Erro ao enviar: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  const isLoading = isSaving || isSending;
  if (!canCreate && open) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="p-4 max-w-md">
          <SheetHeader><SheetTitle>Gerenciar Templates</SheetTitle></SheetHeader>
          <div className="text-center py-10 px-6 text-sm text-slate-500">
            Seu perfil não tem permissão para gerenciar templates da API Oficial.
            <div className="mt-3 text-xs">Templates aprovados poderão ser utilizados no bate-papo quando disponíveis.</div>
            <Button className="mt-4" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(1200px,95vw)] sm:max-w-none p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-3 border-b border-slate-200 flex-row items-center justify-between">
          <SheetTitle className="text-base font-bold">Gerenciar Templates da API Oficial</SheetTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('criar')}
              className={`text-xs px-3 py-1.5 rounded-full border ${tab === 'criar' ? 'bg-[#10353C] text-white border-[#10353C]' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              <Plus className="w-3 h-3 inline mr-1" /> Criar template
            </button>
            <button
              onClick={() => setTab('meus')}
              className={`text-xs px-3 py-1.5 rounded-full border ${tab === 'meus' ? 'bg-[#10353C] text-white border-[#10353C]' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              Meus templates ({templates.length})
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5">
            {tab === 'criar' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Criar template da API Oficial</h3>
                  <p className="text-xs text-slate-500 mb-4">Crie uma mensagem e envie para análise e aprovação da Meta.</p>
                  <TemplateForm
                    value={form}
                    onChange={setForm}
                    connections={connections}
                    loadingConnections={loadingConnections}
                  />
                </div>
                <div className="lg:sticky lg:top-5">
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Pré-visualização</h4>
                  <TemplatePreview
                    headerText={form.type === 'TEXT' ? form.header_text : ''}
                    tipo={form.type}
                    headerMediaUrl={form.header_media_url}
                    bodyText={form.body_text}
                    footerText={form.footer_text}
                    buttons={form.buttons}
                    examples={form.variables}
                  />
                </div>
              </div>
            ) : (
              <TemplateList
                templates={templates}
                loading={loadingTemplates}
                onEdit={handleEdit}
                onRefresh={loadTemplates}
              />
            )}
          </div>
        </div>

        <ConectarMetaOficialDialog
          open={conectarOpen}
          onOpenChange={setConectarOpen}
          empresaId={empresaId}
          onSuccess={async () => {
            setConectarOpen(false);
            await loadConnections();
          }}
        />

        {tab === 'criar' && (
          <SheetFooter className="border-t border-slate-200 px-5 py-3 flex-row items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isLoading || !form.connection_id || !form.body_text || !form.name}
              className="border-slate-400 text-slate-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Edit3 className="w-4 h-4 mr-2" />}
              Salvar como rascunho
            </Button>
            <Button
              onClick={handleSendToMeta}
              disabled={isLoading || !form.connection_id || !form.body_text || !form.name}
              className="bg-[#10353C] hover:bg-[#1a5060] text-white"
            >
              {isSending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando template para análise...</>
                : <><Send className="w-4 h-4 mr-2" /> Enviar para aprovação</>}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}