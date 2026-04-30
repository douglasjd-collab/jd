import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Save, Loader2, Car, Home, Bike, Package, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const BENS = [
  { key: 'automovel', label: 'Automóvel', icon: Car, color: 'text-blue-600' },
  { key: 'imovel', label: 'Imóvel', icon: Home, color: 'text-green-600' },
  { key: 'motocicleta', label: 'Motocicleta', icon: Bike, color: 'text-orange-600' },
  { key: 'bens_moveis', label: 'Bens Móveis', icon: Package, color: 'text-purple-600' },
];

const CHAVE_CONFIG = 'simulador_seguro_prestamista';

const taxasVazias = () => ({
  automovel: '',
  imovel: '',
  motocicleta: '',
  bens_moveis: '',
});

export default function ConfiguracaoSimuladorModal({ open, onOpenChange }) {
  // Lista de { administradora_id, administradora_nome, taxas: { automovel, imovel, ... } }
  const [linhas, setLinhas] = useState([]);
  const [administradoras, setAdministradoras] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [configId, setConfigId] = useState(null);
  const [expandidos, setExpandidos] = useState({});

  useEffect(() => {
    if (!open) return;
    carregarDados();
  }, [open]);

  const carregarDados = async () => {
    setCarregando(true);
    try {
      const [admList, configs] = await Promise.all([
        base44.entities.Administradora.filter({ status: 'ativa' }, 'razao_social', 200),
        base44.entities.ConfiguracaoSistema.filter({ chave: CHAVE_CONFIG }),
      ]);
      setAdministradoras(admList);

      if (configs.length > 0 && configs[0].valor) {
        const dados = JSON.parse(configs[0].valor);
        // Suporte ao formato antigo (objeto simples sem adm) e novo (array)
        if (Array.isArray(dados)) {
          setLinhas(dados);
          // Expande o primeiro por padrão
          if (dados.length > 0) setExpandidos({ 0: true });
        } else {
          // Migra formato antigo para novo (sem adm vinculada)
          setLinhas([{ administradora_id: '', administradora_nome: 'Padrão', taxas: dados }]);
          setExpandidos({ 0: true });
        }
        setConfigId(configs[0].id);
      } else {
        setLinhas([]);
      }
    } catch (_e) {
      // usa vazios
    } finally {
      setCarregando(false);
    }
  };

  const adicionarLinha = () => {
    const novoIdx = linhas.length;
    setLinhas(prev => [...prev, { administradora_id: '', administradora_nome: '', taxas: taxasVazias() }]);
    setExpandidos(prev => ({ ...prev, [novoIdx]: true }));
  };

  const removerLinha = (idx) => {
    setLinhas(prev => prev.filter((_, i) => i !== idx));
    setExpandidos(prev => {
      const novo = {};
      Object.keys(prev).forEach(k => {
        const ki = parseInt(k);
        if (ki < idx) novo[ki] = prev[k];
        else if (ki > idx) novo[ki - 1] = prev[k];
      });
      return novo;
    });
  };

  const setAdm = (idx, admId) => {
    const adm = administradoras.find(a => a.id === admId);
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, administradora_id: admId, administradora_nome: adm?.razao_social || adm?.nome_fantasia || '' }
      : l
    ));
  };

  const setTaxa = (idx, bem, valor) => {
    setLinhas(prev => prev.map((l, i) => i === idx
      ? { ...l, taxas: { ...l.taxas, [bem]: valor } }
      : l
    ));
  };

  const toggleExpandido = (idx) => {
    setExpandidos(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const valor = JSON.stringify(linhas);
      if (configId) {
        await base44.entities.ConfiguracaoSistema.update(configId, { valor });
      } else {
        const nova = await base44.entities.ConfiguracaoSistema.create({
          chave: CHAVE_CONFIG,
          valor,
          descricao: 'Taxas de seguro prestamista por administradora e tipo de bem (% ao mês)',
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
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
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Taxas por Administradora
                </p>
                <Button size="sm" variant="outline" onClick={adicionarLinha} className="gap-1.5 h-7 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </Button>
              </div>

              {linhas.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-lg">
                  Nenhuma configuração. Clique em "Adicionar" para começar.
                </div>
              )}

              {linhas.map((linha, idx) => (
                <div key={idx} className="border rounded-lg overflow-hidden">
                  {/* Header da linha */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 cursor-pointer"
                    onClick={() => toggleExpandido(idx)}
                  >
                    <div className="flex-1">
                      <Select
                        value={linha.administradora_id || ''}
                        onValueChange={v => { setAdm(idx, v); }}
                      >
                        <SelectTrigger
                          className="h-7 text-sm border-0 bg-transparent shadow-none p-0 focus:ring-0"
                          onClick={e => e.stopPropagation()}
                        >
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
                    <button
                      onClick={e => { e.stopPropagation(); removerLinha(idx); }}
                      className="text-red-400 hover:text-red-600 p-0.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {expandidos[idx]
                      ? <ChevronUp className="w-4 h-4 text-slate-400" />
                      : <ChevronDown className="w-4 h-4 text-slate-400" />
                    }
                  </div>

                  {/* Taxas por bem */}
                  {expandidos[idx] && (
                    <div className="divide-y">
                      {BENS.map(({ key, label, icon: Icon, color }) => (
                        <div key={key} className="flex items-center gap-3 px-3 py-2">
                          <Icon className={`w-4 h-4 ${color} flex-shrink-0`} />
                          <span className="flex-1 text-sm text-slate-700">{label}</span>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.001"
                              min="0"
                              max="10"
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
                  )}
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