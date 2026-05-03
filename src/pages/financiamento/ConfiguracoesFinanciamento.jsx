import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Settings } from 'lucide-react';

export default function ConfiguracoesFinanciamento({ user }) {
  const [config, setConfig] = useState({ prefixo_proposta: 'FIN', percentual_comissao_padrao: '2', banco_padrao: '' });
  const [saving, setSaving] = useState(false);

  const handleSalvar = async () => {
    setSaving(true);
    // Salvar nas configurações do sistema
    try {
      const chave = `financiamento_config_${user?.empresa_id}`;
      const existentes = await base44.entities.ConfiguracaoSistema.filter({ chave });
      if (existentes.length > 0) {
        await base44.entities.ConfiguracaoSistema.update(existentes[0].id, { valor: JSON.stringify(config) });
      } else {
        await base44.entities.ConfiguracaoSistema.create({ chave, valor: JSON.stringify(config) });
      }
      toast.success('Configurações salvas!');
    } catch {
      toast.error('Erro ao salvar configurações');
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!user?.empresa_id) return;
    const chave = `financiamento_config_${user.empresa_id}`;
    base44.entities.ConfiguracaoSistema.filter({ chave }).then(res => {
      if (res.length > 0 && res[0].valor) {
        try { setConfig(JSON.parse(res[0].valor)); } catch {}
      }
    });
  }, [user?.empresa_id]);

  const set = (f, v) => setConfig(prev => ({ ...prev, [f]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-slate-600" />
        <h2 className="text-xl font-bold text-slate-800">Configurações — Financiamento de Veículos</h2>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Configurações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Prefixo das Propostas</Label>
            <Input value={config.prefixo_proposta} onChange={e => set('prefixo_proposta', e.target.value)} placeholder="FIN" />
            <p className="text-xs text-slate-400">Ex: FIN → FIN001, FIN002...</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Percentual de Comissão Padrão (%)</Label>
            <Input type="number" value={config.percentual_comissao_padrao} onChange={e => set('percentual_comissao_padrao', e.target.value)} placeholder="2" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-slate-600">Banco Padrão</Label>
            <Input value={config.banco_padrao} onChange={e => set('banco_padrao', e.target.value)} placeholder="Ex: Bradesco" />
          </div>
          <Button onClick={handleSalvar} disabled={saving} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}