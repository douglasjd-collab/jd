import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Save, Shield, Building2, Settings, MessageSquare, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export default function ConfiguracaoSeguros() {
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [config, setConfig] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [seguradoraModal, setSeguradoraModal] = useState(false);
  const [seguradoraEdit, setSeguradoraEdit] = useState(null);
  const [formSeg, setFormSeg] = useState({});
  const queryClient = useQueryClient();

  useEffect(() => { loadUser(); }, []);
  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const emp = me.empresa_id;
    if (emp) { setEmpresaId(emp); loadConfig(emp); return; }
    const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' }, '-created_date', 1);
    if (colabs?.[0]?.empresa_id) { setEmpresaId(colabs[0].empresa_id); loadConfig(colabs[0].empresa_id); }
  };

  const loadConfig = async (empId) => {
    const cfgs = await base44.entities.ConfiguracaoSeguro.filter({ empresa_id: empId }, '-created_date', 1);
    if (cfgs.length > 0) {
      setConfig(cfgs[0]);
    } else {
      setConfig({
        empresa_id: empId,
        dias_para_renovacao: 30,
        dias_para_atraso: 3,
        alertas_ativos: true,
        alertas_whatsapp_cliente: true,
        alertas_whatsapp_vendedor: true,
        alertas_email_vendedor: false,
        template_renovacao_whatsapp: 'Olá {cliente_nome}! Seu seguro {seguradora} vence em {dias_vencimento} dias ({data_vencimento}). Entre em contato para renovar. 🛡️',
        template_cobranca_whatsapp: 'Olá {cliente_nome}! Sua parcela do seguro {seguradora} está em atraso. Valor: R$ {valor_parcela}. Entre em contato para regularizar.',
        template_boas_vindas_whatsapp: 'Olá {cliente_nome}! Seu seguro {seguradora} foi ativado com sucesso! Vigência: {data_inicio} a {data_vencimento}. Qualquer dúvida, estamos à disposição. 😊',
        template_confirmacao_pagamento: 'Olá {cliente_nome}! Confirmamos o recebimento do seu pagamento do seguro {seguradora}. Obrigado! 🎉',
      });
    }
  };

  const { data: seguradoras = [], refetch: refetchSeg } = useQuery({
    queryKey: ['seguradoras', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Seguradora.filter({ empresa_id: empresaId }, 'nome', 200),
  });

  const salvarConfig = async () => {
    if (!config) return;
    setSalvando(true);
    try {
      if (config.id) {
        await base44.entities.ConfiguracaoSeguro.update(config.id, config);
      } else {
        const criada = await base44.entities.ConfiguracaoSeguro.create({ ...config, empresa_id: empresaId });
        setConfig(criada);
      }
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const abrirNovaSeguradora = () => {
    setSeguradoraEdit(null);
    setFormSeg({ empresa_id: empresaId, nome: '', comissao_percentual: 0, tipo_cobranca: 'anual', status: 'ativa' });
    setSeguradoraModal(true);
  };

  const abrirEditarSeguradora = (s) => {
    setSeguradoraEdit(s);
    setFormSeg({ ...s });
    setSeguradoraModal(true);
  };

  const salvarSeguradora = async () => {
    if (!formSeg.nome?.trim()) { toast.error('Nome obrigatório'); return; }
    if (seguradoraEdit?.id) {
      await base44.entities.Seguradora.update(seguradoraEdit.id, formSeg);
    } else {
      await base44.entities.Seguradora.create({ ...formSeg, empresa_id: empresaId });
    }
    toast.success('Seguradora salva!');
    setSeguradoraModal(false);
    refetchSeg();
    queryClient.invalidateQueries({ queryKey: ['seguradoras', empresaId] });
  };

  const deletarSeguradora = async (s) => {
    if (!confirm(`Excluir seguradora ${s.nome}?`)) return;
    await base44.entities.Seguradora.delete(s.id);
    toast.success('Seguradora excluída');
    refetchSeg();
  };

  if (!user || !config) return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings className="w-7 h-7 text-slate-600" /> Configurações de Seguros
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Seguradoras, regras e templates de mensagem</p>
        </div>
        <Button onClick={salvarConfig} disabled={salvando} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Seguradoras */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Building2 className="w-4 h-4" /> Seguradoras</CardTitle>
            <Button size="sm" onClick={abrirNovaSeguradora} className="gap-1 h-8"><Plus className="w-3.5 h-3.5" /> Adicionar</Button>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {seguradoras.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">Nenhuma seguradora cadastrada</p>
              ) : seguradoras.map(s => (
                <div key={s.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.nome}</p>
                    <p className="text-xs text-slate-400">{s.comissao_percentual}% comissão · {s.tipo_cobranca}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => abrirEditarSeguradora(s)}>Editar</Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => deletarSeguradora(s)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Regras do sistema */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> Regras do Sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs font-semibold">Dias para entrar em renovação</Label>
              <Input type="number" min={1} max={90} value={config.dias_para_renovacao || 30}
                onChange={e => setConfig(c => ({ ...c, dias_para_renovacao: parseInt(e.target.value) }))}
                className="mt-1 h-8 w-32" />
              <p className="text-[11px] text-slate-400 mt-0.5">dias antes do vencimento</p>
            </div>
            <div>
              <Label className="text-xs font-semibold">Dias para considerar atrasado</Label>
              <Input type="number" min={1} max={30} value={config.dias_para_atraso || 3}
                onChange={e => setConfig(c => ({ ...c, dias_para_atraso: parseInt(e.target.value) }))}
                className="mt-1 h-8 w-32" />
              <p className="text-[11px] text-slate-400 mt-0.5">dias após vencimento da parcela</p>
            </div>
            <div className="space-y-3 pt-2">
              {[
                { key: 'alertas_ativos', label: 'Alertas automáticos ativos' },
                { key: 'alertas_whatsapp_cliente', label: 'WhatsApp para o cliente' },
                { key: 'alertas_whatsapp_vendedor', label: 'WhatsApp para o vendedor' },
                { key: 'alertas_email_vendedor', label: 'E-mail para o vendedor' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <Label className="text-sm text-slate-700">{item.label}</Label>
                  <Switch checked={!!config[item.key]} onCheckedChange={v => setConfig(c => ({ ...c, [item.key]: v }))} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Templates de mensagem */}
        <Card className="border-0 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Templates de Mensagem</CardTitle>
            <p className="text-xs text-slate-400">Variáveis: {'{cliente_nome}'}, {'{seguradora}'}, {'{data_vencimento}'}, {'{dias_vencimento}'}, {'{valor_parcela}'}</p>
          </CardHeader>
          <CardContent className="grid lg:grid-cols-2 gap-4">
            {[
              { key: 'template_renovacao_whatsapp', label: '🔄 Template de Renovação' },
              { key: 'template_cobranca_whatsapp', label: '💰 Template de Cobrança' },
              { key: 'template_boas_vindas_whatsapp', label: '👋 Boas-vindas' },
              { key: 'template_confirmacao_pagamento', label: '✅ Confirmação de Pagamento' },
            ].map(t => (
              <div key={t.key}>
                <Label className="text-xs font-semibold">{t.label}</Label>
                <Textarea
                  value={config[t.key] || ''}
                  onChange={e => setConfig(c => ({ ...c, [t.key]: e.target.value }))}
                  className="mt-1 text-xs h-24 resize-none"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Modal Seguradora */}
      <Dialog open={seguradoraModal} onOpenChange={setSeguradoraModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{seguradoraEdit ? 'Editar Seguradora' : 'Nova Seguradora'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Nome *</Label>
              <Input value={formSeg.nome || ''} onChange={e => setFormSeg(f => ({ ...f, nome: e.target.value }))} className="mt-1 h-8" /></div>
            <div><Label className="text-xs">CNPJ</Label>
              <Input value={formSeg.cnpj || ''} onChange={e => setFormSeg(f => ({ ...f, cnpj: e.target.value }))} className="mt-1 h-8" /></div>
            <div><Label className="text-xs">Comissão (%)</Label>
              <Input type="number" value={formSeg.comissao_percentual || 0} onChange={e => setFormSeg(f => ({ ...f, comissao_percentual: parseFloat(e.target.value) }))} className="mt-1 h-8" /></div>
            <div><Label className="text-xs">Tipo de cobrança</Label>
              <Select value={formSeg.tipo_cobranca || 'anual'} onValueChange={v => setFormSeg(f => ({ ...f, tipo_cobranca: v }))}>
                <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                  <SelectItem value="ambos">Ambos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setSeguradoraModal(false)}>Cancelar</Button>
            <Button onClick={salvarSeguradora} className="bg-blue-600 hover:bg-blue-700">Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}