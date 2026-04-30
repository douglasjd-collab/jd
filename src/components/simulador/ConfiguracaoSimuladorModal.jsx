import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save, Loader2, Car, Home, Bike, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const BENS = [
  { key: 'automovel', label: 'Automóvel', icon: Car, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'imovel', label: 'Imóvel', icon: Home, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'motocicleta', label: 'Motocicleta', icon: Bike, color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'bens_moveis', label: 'Bens Móveis', icon: Package, color: 'text-purple-600', bg: 'bg-purple-50' },
];

const CHAVE_CONFIG = 'simulador_seguro_prestamista';

export default function ConfiguracaoSimuladorModal({ open, onOpenChange }) {
  const [taxas, setTaxas] = useState({
    automovel: '',
    imovel: '',
    motocicleta: '',
    bens_moveis: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [configId, setConfigId] = useState(null);

  useEffect(() => {
    if (!open) return;
    carregarConfig();
  }, [open]);

  const carregarConfig = async () => {
    setCarregando(true);
    try {
      const configs = await base44.entities.ConfiguracaoSistema.filter({ chave: CHAVE_CONFIG });
      if (configs.length > 0 && configs[0].valor) {
        const dados = JSON.parse(configs[0].valor);
        setTaxas(prev => ({ ...prev, ...dados }));
        setConfigId(configs[0].id);
      }
    } catch (_e) {
      // Usa valores padrão
    } finally {
      setCarregando(false);
    }
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const valor = JSON.stringify(taxas);
      if (configId) {
        await base44.entities.ConfiguracaoSistema.update(configId, { valor });
      } else {
        const nova = await base44.entities.ConfiguracaoSistema.create({
          chave: CHAVE_CONFIG,
          valor,
          descricao: 'Taxas de seguro prestamista por tipo de bem (% ao mês)',
        });
        setConfigId(nova.id);
      }
      toast.success('Configurações salvas com sucesso!');
      onOpenChange(false);
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            Configuração do Simulador
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>Seguro Prestamista:</strong> taxa mensal cobrada sobre a carta de crédito. Reduz a parcela final quando o prazo é diminuído via lance.
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Taxa de Seguro Prestamista por Bem (% ao mês)
              </p>
              {BENS.map(({ key, label, icon: Icon, color, bg }) => (
                <div key={key} className={`flex items-center gap-3 p-3 rounded-lg border ${bg}`}>
                  <div className={`w-9 h-9 rounded-lg bg-white flex items-center justify-center shadow-sm`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <Label className="flex-1 font-medium text-slate-700">{label}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      max="10"
                      value={taxas[key]}
                      onChange={e => setTaxas(t => ({ ...t, [key]: e.target.value }))}
                      className="w-24 h-8 text-right text-sm"
                      placeholder="0,000"
                    />
                    <span className="text-sm text-slate-500 w-6">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={salvando || carregando} className="gap-1.5 bg-slate-800 hover:bg-slate-900">
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}