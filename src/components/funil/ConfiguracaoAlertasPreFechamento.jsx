import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Loader2, Settings, Bell, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function ConfiguracaoAlertasPreFechamento({ open, onOpenChange }) {
  const [config, setConfig] = useState({
    ativo: true,
    horario_envio: '08:00',
    enviar_whatsapp: true
  });
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) carregarConfig();
  }, [open]);

  const carregarConfig = async () => {
    setLoading(true);
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'alertas_pre_fechamento' });
      if (configs.length > 0 && configs[0].valor) {
        setConfig(JSON.parse(configs[0].valor));
      }
    } catch (e) {
      console.error('Erro ao carregar config:', e);
    } finally {
      setLoading(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: 'alertas_pre_fechamento' });
      const valor = JSON.stringify(config);
      if (configs.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(configs[0].id, { valor });
      } else {
        await base44.entities.ConfiguracaoSistema.create({
          chave: 'alertas_pre_fechamento',
          valor,
          descricao: 'Configuração de alertas de Pré-Fechamento',
          tipo: 'texto'
        });
      }
      toast.success('Configuração salva com sucesso!');
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  const dispararAgora = async () => {
    try {
      toast.info('Processando alertas...');
      const res = await base44.functions.invoke('processarAlertasPreFechamento', {});
      const d = res.data;
      toast.success(`Processado! ${d.criados || 0} novos alertas criados, ${d.whatsappEnviados || 0} WhatsApp enviados.`);
    } catch (e) {
      toast.error('Erro ao disparar: ' + e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-600" />
            Alertas de Pré-Fechamento
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
              <div>
                <p className="font-medium text-sm text-slate-800">Alertas ativos</p>
                <p className="text-xs text-slate-500">Notificar responsáveis sobre leads em Pré-Fechamento</p>
              </div>
              <Switch
                checked={config.ativo}
                onCheckedChange={(v) => setConfig({ ...config, ativo: v })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5 text-slate-500" />
                Horário do lembrete diário
              </Label>
              <Input
                type="time"
                value={config.horario_envio || '08:00'}
                onChange={(e) => setConfig({ ...config, horario_envio: e.target.value })}
                disabled={!config.ativo}
              />
              <p className="text-xs text-slate-400">Horário em que o sistema verificará leads vencidos diariamente</p>
            </div>

            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="font-medium text-sm flex items-center gap-1.5 text-slate-800">
                  <MessageSquare className="w-4 h-4 text-green-600" />
                  Enviar lembrete via WhatsApp
                </p>
                <p className="text-xs text-slate-500">Envia mensagem para o responsável pelo lead</p>
              </div>
              <Switch
                checked={config.enviar_whatsapp !== false}
                onCheckedChange={(v) => setConfig({ ...config, enviar_whatsapp: v })}
                disabled={!config.ativo}
              />
            </div>

            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 border border-blue-200 space-y-1">
              <p className="font-semibold">ℹ️ Como funciona:</p>
              <p>• O sistema verifica diariamente leads na etapa <strong>"Pré-Fechamento"</strong></p>
              <p>• Quando a <strong>Data de Pré-Fechamento</strong> chega (ou está vencida), cria um alerta</p>
              <p>• O alerta aparece no sino 🔔 do Funil e no próprio card</p>
              <p>• Só gera <strong>1 alerta por dia</strong> por lead (sem duplicatas)</p>
              <p>• Encerra automaticamente quando o lead sai da etapa</p>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={dispararAgora}
                className="flex-1 text-amber-600 border-amber-300 hover:bg-amber-50"
              >
                ⚡ Disparar agora (teste)
              </Button>
              <Button
                onClick={salvar}
                disabled={salvando}
                className="flex-1 bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {salvando && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Salvar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}