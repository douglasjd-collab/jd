import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bell, Plus, Trash2, Save, Clock, MessageCircle, User, Users } from 'lucide-react';
import { toast } from 'sonner';

const MSG_CLIENTE_DEFAULT = `Olá {cliente_nome} 👋\n\nLembramos que você possui uma reunião agendada hoje às {hora}.\n\nAssunto: {titulo}\n\nEquipe JD Promotora.`;
const MSG_RESPONSAVEL_DEFAULT = `⏰ *Lembrete de reunião*\n\nCliente: {cliente_nome}\nHorário: {hora}\nAssunto: {titulo}\n\nFaltam {faltam} para a reunião.`;

const PRESETS = [
  { label: '5 min antes', valor: 5 },
  { label: '10 min antes', valor: 10 },
  { label: '15 min antes', valor: 15 },
  { label: '30 min antes', valor: 30 },
  { label: '1 hora antes', valor: 60 },
  { label: '2 horas antes', valor: 120 },
  { label: '1 dia antes', valor: 1440 },
];

function formatarTempo(minutos) {
  if (minutos >= 1440) return `${Math.round(minutos / 1440)} dia(s) antes`;
  if (minutos >= 60) return `${Math.round(minutos / 60)} hora(s) antes`;
  return `${minutos} min antes`;
}

export default function ConfiguracaoLembretesAgenda({ user }) {
  const [config, setConfig] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [novoTempo, setNovoTempo] = useState('');
  const [novoLabel, setNovoLabel] = useState('');

  useEffect(() => {
    if (user?.empresa_id) carregarConfig();
    else setLoading(false);
  }, [user]);

  const carregarConfig = async () => {
    setLoading(true);
    try {
      const configs = await base44.entities.ConfiguracaoLembretesAgenda.filter({ empresa_id: user.empresa_id });
      if (configs && configs.length > 0) {
        setConfigId(configs[0].id);
        setConfig({
          ativo: configs[0].ativo ?? false,
          tempos_minutos: configs[0].tempos_minutos || [60, 10],
          enviar_para_cliente: configs[0].enviar_para_cliente ?? true,
          enviar_para_responsaveis: configs[0].enviar_para_responsaveis ?? true,
          mensagem_cliente: configs[0].mensagem_cliente || MSG_CLIENTE_DEFAULT,
          mensagem_responsavel: configs[0].mensagem_responsavel || MSG_RESPONSAVEL_DEFAULT,
        });
      } else {
        setConfig({
          ativo: false,
          tempos_minutos: [60, 10],
          enviar_para_cliente: true,
          enviar_para_responsaveis: true,
          mensagem_cliente: MSG_CLIENTE_DEFAULT,
          mensagem_responsavel: MSG_RESPONSAVEL_DEFAULT,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const payload = { ...config, empresa_id: user.empresa_id };
      if (configId) {
        await base44.entities.ConfiguracaoLembretesAgenda.update(configId, payload);
      } else {
        const criado = await base44.entities.ConfiguracaoLembretesAgenda.create(payload);
        setConfigId(criado.id);
      }
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const adicionarTempo = (minutos) => {
    const val = Number(minutos);
    if (!val || val <= 0) return;
    if (config.tempos_minutos.includes(val)) {
      toast.error('Este tempo já foi adicionado');
      return;
    }
    setConfig(c => ({ ...c, tempos_minutos: [...c.tempos_minutos, val].sort((a, b) => b - a) }));
    setNovoTempo('');
    setNovoLabel('');
  };

  const removerTempo = (val) => {
    setConfig(c => ({ ...c, tempos_minutos: c.tempos_minutos.filter(t => t !== val) }));
  };

  if (loading) return <div className="text-center py-12 text-slate-400">Carregando...</div>;

  if (!user?.empresa_id) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center text-yellow-700">
        <Bell className="w-8 h-8 mx-auto mb-2 opacity-60" />
        <p className="font-medium">Empresa não identificada</p>
        <p className="text-sm mt-1">Faça login com uma conta vinculada a uma empresa para configurar lembretes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-600" />
            Configuração de Lembretes
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure lembretes automáticos via WhatsApp para reuniões e compromissos.</p>
        </div>
        <Button onClick={salvar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </div>

      {/* Ativar/desativar */}
      <div className="bg-white rounded-xl border p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.ativo ? 'bg-green-100' : 'bg-slate-100'}`}>
            <MessageCircle className={`w-5 h-5 ${config.ativo ? 'text-green-600' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Ativar lembretes via WhatsApp</p>
            <p className="text-xs text-slate-500">Envia mensagens automáticas antes dos compromissos</p>
          </div>
        </div>
        <Switch checked={config.ativo} onCheckedChange={v => setConfig(c => ({ ...c, ativo: v }))} />
      </div>

      {config.ativo && (
        <>
          {/* Destinatários */}
          <div className="bg-white rounded-xl border p-5 space-y-3">
            <h3 className="font-semibold text-slate-700 text-sm">Enviar para</h3>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <span className="text-sm text-slate-700">Cliente (telefone do compromisso)</span>
              </div>
              <Switch checked={config.enviar_para_cliente} onCheckedChange={v => setConfig(c => ({ ...c, enviar_para_cliente: v }))} />
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-500" />
                <span className="text-sm text-slate-700">Responsáveis (colaboradores)</span>
              </div>
              <Switch checked={config.enviar_para_responsaveis} onCheckedChange={v => setConfig(c => ({ ...c, enviar_para_responsaveis: v }))} />
            </div>
          </div>

          {/* Tempos de lembrete */}
          <div className="bg-white rounded-xl border p-5 space-y-4">
            <h3 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Horários dos lembretes
            </h3>

            {/* Tempos configurados */}
            <div className="flex flex-wrap gap-2">
              {config.tempos_minutos.length === 0 && (
                <p className="text-sm text-slate-400">Nenhum horário configurado</p>
              )}
              {config.tempos_minutos.map(t => (
                <div key={t} className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full px-3 py-1 text-sm font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {formatarTempo(t)}
                  <button onClick={() => removerTempo(t)} className="ml-1 hover:text-red-500 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            {/* Presets rápidos */}
            <div>
              <p className="text-xs text-slate-500 mb-2">Adicionar preset rápido:</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.filter(p => !config.tempos_minutos.includes(p.valor)).map(p => (
                  <button
                    key={p.valor}
                    onClick={() => adicionarTempo(p.valor)}
                    className="text-xs px-3 py-1 rounded-full border border-dashed border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                  >
                    + {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input customizado */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label className="text-xs">Tempo personalizado (em minutos)</Label>
                <Input
                  type="number"
                  placeholder="Ex: 90"
                  value={novoTempo}
                  onChange={e => setNovoTempo(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && adicionarTempo(novoTempo)}
                  className="mt-1"
                  min="1"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => adicionarTempo(novoTempo)}
                disabled={!novoTempo}
                className="gap-1"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </Button>
            </div>
            <p className="text-xs text-slate-400">💡 Ex: 90 = 1h30min antes | 1440 = 1 dia antes | 15 = 15 minutos antes</p>
          </div>

          {/* Mensagem para o cliente */}
          {config.enviar_para_cliente && (
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <div>
                <h3 className="font-semibold text-slate-700 text-sm">Mensagem para o cliente</h3>
                <p className="text-xs text-slate-400 mt-0.5">Variáveis: <code className="bg-slate-100 px-1 rounded">{'{cliente_nome}'}</code> <code className="bg-slate-100 px-1 rounded">{'{hora}'}</code> <code className="bg-slate-100 px-1 rounded">{'{titulo}'}</code> <code className="bg-slate-100 px-1 rounded">{'{faltam}'}</code></p>
              </div>
              <Textarea
                value={config.mensagem_cliente}
                onChange={e => setConfig(c => ({ ...c, mensagem_cliente: e.target.value }))}
                rows={5}
                className="font-mono text-sm"
              />
              <button
                onClick={() => setConfig(c => ({ ...c, mensagem_cliente: MSG_CLIENTE_DEFAULT }))}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Restaurar padrão
              </button>
            </div>
          )}

          {/* Mensagem para responsáveis */}
          {config.enviar_para_responsaveis && (
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <div>
                <h3 className="font-semibold text-slate-700 text-sm">Mensagem para os responsáveis</h3>
                <p className="text-xs text-slate-400 mt-0.5">Variáveis: <code className="bg-slate-100 px-1 rounded">{'{cliente_nome}'}</code> <code className="bg-slate-100 px-1 rounded">{'{hora}'}</code> <code className="bg-slate-100 px-1 rounded">{'{titulo}'}</code> <code className="bg-slate-100 px-1 rounded">{'{faltam}'}</code></p>
              </div>
              <Textarea
                value={config.mensagem_responsavel}
                onChange={e => setConfig(c => ({ ...c, mensagem_responsavel: e.target.value }))}
                rows={5}
                className="font-mono text-sm"
              />
              <button
                onClick={() => setConfig(c => ({ ...c, mensagem_responsavel: MSG_RESPONSAVEL_DEFAULT }))}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                Restaurar padrão
              </button>
            </div>
          )}

          {/* Info sobre o scheduler */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            <p className="font-semibold mb-1">ℹ️ Como funciona</p>
            <p>O sistema verifica os lembretes a cada 5 minutos automaticamente. Para cada compromisso ativo, envia a mensagem no horário configurado e registra o histórico para evitar envios duplicados.</p>
          </div>
        </>
      )}
    </div>
  );
}