import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Save, Loader2, Car, Home, Bike, Package, Plus, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const BENS = [
  { key: 'automovel', label: 'Automóvel', icon: Car, color: 'text-blue-600' },
  { key: 'imovel', label: 'Imóvel', icon: Home, color: 'text-green-600' },
  { key: 'motocicleta', label: 'Motocicleta', icon: Bike, color: 'text-orange-600' },
  { key: 'bens_moveis', label: 'Bens Móveis', icon: Package, color: 'text-purple-600' },
];

const CHAVE_CONFIG_SEGURO = 'simulador_seguro_prestamista';

export default function ConfiguracaoSimuladorModal({ open, onOpenChange, empresaId }) {
  const [administradoras, setAdministradoras] = useState([]);
  const [linhas, setLinhas] = useState([]);
  const [configSeguroId, setConfigSeguroId] = useState(null);
  const [carregandoSeguro, setCarregandoSeguro] = useState(false);
  const [salvandoSeguro, setSalvandoSeguro] = useState(false);

  useEffect(() => {
    if (!open) return;
    carregarDados(empresaId);
  }, [open, empresaId]);

  const carregarDados = async (eid) => {
    let resolvedEid = eid;
    if (!resolvedEid) {
      try {
        const user = await base44.auth.me();
        if (!user) return;
        const cols = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }, '-created_date', 1);
        resolvedEid = cols?.[0]?.empresa_id;
        if (!resolvedEid) return;
      } catch {
        return;
      }
    }

    setCarregandoSeguro(true);
    try {
      const [admList, configs] = await Promise.all([
        base44.entities.Administradora.filter({ empresa_id: resolvedEid }, 'razao_social', 200),
        base44.entities.ConfiguracaoSistema.filter({ chave: CHAVE_CONFIG_SEGURO }),
      ]);

      setAdministradoras(admList);

      if (configs.length > 0 && configs[0].valor) {
        const dados = JSON.parse(configs[0].valor);
        if (Array.isArray(dados)) {
          setLinhas(dados);
        } else {
          setLinhas([{ administradora_id: '', administradora_nome: 'Padrão', taxas: dados }]);
        }
        setConfigSeguroId(configs[0].id);
      }
    } catch (e) {
      toast.error('Erro ao carregar dados: ' + e.message);
    } finally {
      setCarregandoSeguro(false);
    }
  };

  const adicionarLinhaSeguro = () => {
    setLinhas(prev => [...prev, {
      administradora_id: '', administradora_nome: '',
      taxas: { automovel: '', imovel: '', motocicleta: '', bens_moveis: '' }
    }]);
  };

  const removerLinhaSeguro = (idx) => {
    setLinhas(prev => prev.filter((_, i) => i !== idx));
  };

  const setAdmSeguro = (idx, admId) => {
    const adm = administradoras.find(a => a.id === admId);
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, administradora_id: admId, administradora_nome: adm?.razao_social || '' }
      : l
    ));
  };

  const setTaxa = (idx, bem, valor) => {
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, taxas: { ...l.taxas, [bem]: valor } }
      : l
    ));
  };

  const handleSalvarSeguro = async () => {
    setSalvandoSeguro(true);
    try {
      const valor = JSON.stringify(linhas);
      if (configSeguroId) {
        await base44.entities.ConfiguracaoSistema.update(configSeguroId, { valor });
      } else {
        const nova = await base44.entities.ConfiguracaoSistema.create({
          chave: CHAVE_CONFIG_SEGURO,
          valor,
          descricao: 'Taxas de seguro prestamista por administradora e tipo de bem (% ao mês)',
        });
        setConfigSeguroId(nova.id);
      }
      toast.success('Configurações salvas!');
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoSeguro(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] flex flex-col overflow-visible">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-600" />
            Configuração do Simulador
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 mt-2">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>Seguro Prestamista:</strong> taxa mensal cobrada sobre a carta de crédito. Reduz a parcela final quando o prazo é diminuído via lance.
          </div>

          {carregandoSeguro ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxas por Administradora</p>
                <Button size="sm" variant="outline" onClick={adicionarLinhaSeguro} className="gap-1.5 h-7 text-xs">
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </Button>
              </div>

              {linhas.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-lg">
                  Nenhuma configuração. Clique em "Adicionar".
                </div>
              )}

              {linhas.map((linha, idx) => (
                <div key={idx} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
                    <div className="flex-1">
                      <Select
                        value={linha.administradora_id || ''}
                        onValueChange={v => setAdmSeguro(idx, v)}
                      >
                        <SelectTrigger className="h-8 text-sm bg-white text-slate-900">
                          <SelectValue placeholder="Selecionar Administradora..." />
                        </SelectTrigger>
                        <SelectContent>
                          {administradoras.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.razao_social || a.nome_fantasia}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <button onClick={() => removerLinhaSeguro(idx)} className="text-red-400 hover:text-red-600 p-0.5">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="divide-y">
                    {BENS.map(({ key, label, icon: Icon, color }) => (
                      <div key={key} className="flex items-center gap-3 px-3 py-2">
                        <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                        <span className="flex-1 text-sm text-slate-700">{label}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number" step="0.001" min="0" max="10"
                            value={linha.taxas?.[key] || ''}
                            onChange={e => setTaxa(idx, key, e.target.value)}
                            className="w-20 h-7 text-right text-sm"
                            placeholder="0,000"
                          />
                          <span className="text-xs text-slate-500 w-4">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <Button onClick={handleSalvarSeguro} disabled={salvandoSeguro} className="w-full gap-1.5 bg-slate-800 hover:bg-slate-900">
                {salvandoSeguro ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configurações
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}