import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

const DIAS = [
  { valor: 1, nome: 'Seg' },
  { valor: 2, nome: 'Ter' },
  { valor: 3, nome: 'Qua' },
  { valor: 4, nome: 'Qui' },
  { valor: 5, nome: 'Sex' },
  { valor: 6, nome: 'Sáb' },
  { valor: 7, nome: 'Dom' },
];

const PADRAO = { ativo: true, dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' };

/**
 * Horário de atendimento dos alertas. Não existia expediente configurado no
 * sistema; sem configuração, os alertas valem 24h (comportamento explícito na
 * tela). Configurado, o popup só abre sozinho dentro do horário — a lista
 * continua sempre acessível.
 */
export default function ConfiguracaoHorarioModal({ open, configAtual, empresaId, onOpenChange, onConcluido }) {
  const [config, setConfig] = useState(PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfig(configAtual?.dias?.length ? { ...configAtual, ativo: configAtual.ativo !== false } : PADRAO);
  }, [open, configAtual]);

  const alternarDia = (dia) => {
    setConfig((atual) => ({
      ...atual,
      dias: atual.dias.includes(dia) ? atual.dias.filter((d) => d !== dia) : [...atual.dias, dia].sort(),
    }));
  };

  const salvar = async () => {
    if (!config.dias.length) {
      toast.error('Selecione ao menos um dia de atendimento');
      return;
    }
    setSalvando(true);
    try {
      const { data } = await base44.functions.invoke('alertasAtendimento', {
        empresa_id: empresaId,
        acao: 'salvar_horario',
        horario: config,
      });
      if (data?.error) throw new Error(data.error);
      toast.success('Horário de atendimento salvo');
      onOpenChange(false);
      onConcluido?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || e?.message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(valor) => !salvando && onOpenChange(valor)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Horário de atendimento</DialogTitle>
          <DialogDescription>
            Define quando o alerta de clientes aguardando pode abrir sozinho. Fora do horário, a
            pendência continua visível na lista, sem popup automático.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-800">Usar horário de atendimento</p>
              <p className="text-xs text-slate-500">Desligado: alertas valem 24 horas por dia.</p>
            </div>
            <Switch checked={config.ativo} onCheckedChange={(v) => setConfig((a) => ({ ...a, ativo: v }))} />
          </div>

          <div className="space-y-2">
            <Label>Dias de atendimento</Label>
            <div className="flex flex-wrap gap-3">
              {DIAS.map((dia) => (
                <label key={dia.valor} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <Checkbox
                    checked={config.dias.includes(dia.valor)}
                    onCheckedChange={() => alternarDia(dia.valor)}
                  />
                  {dia.nome}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="horario-inicio">Início</Label>
              <Input
                id="horario-inicio"
                type="time"
                value={config.inicio}
                onChange={(e) => setConfig((a) => ({ ...a, inicio: e.target.value }))}
                disabled={!config.ativo}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="horario-fim">Fim</Label>
              <Input
                id="horario-fim"
                type="time"
                value={config.fim}
                onChange={(e) => setConfig((a) => ({ ...a, fim: e.target.value }))}
                disabled={!config.ativo}
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">Referência de horário: Brasília (America/Sao_Paulo).</p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700" onClick={salvar}>
            {salvando ? 'Salvando…' : 'Salvar horário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}