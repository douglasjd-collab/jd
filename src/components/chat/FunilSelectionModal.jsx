import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function FunilSelectionModal({
  open,
  onOpenChange,
  contato,
  empresaId,
  onSuccess,
  existingOportunidade = null
}) {
  const queryClient = useQueryClient();
  const [funilSelecionado, setFunilSelecionado] = useState(existingOportunidade?.produto || '');
  const [etapaSelecionada, setEtapaSelecionada] = useState(existingOportunidade?.etapa_id || '');
  const [funis, setFunis] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);

  React.useEffect(() => {
    if (!open || !empresaId) return;
    
    const carregarFunis = async () => {
      setLoading(true);
      try {
        const etapasData = await base44.entities.EtapaFunil.filter({ empresa_id: empresaId });
        setEtapas(etapasData);
        
        // Extrair funis únicos
        const funisUnicos = [...new Set(etapasData.map(e => e.produto))].filter(Boolean);
        setFunis(funisUnicos);
      } catch (e) {
        toast.error('Erro ao carregar funis: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    
    carregarFunis();
  }, [open, empresaId]);

  // Filtrar etapas do funil selecionado
  const etapasDoFunil = funilSelecionado 
    ? etapas.filter(e => e.produto === funilSelecionado)
    : [];

  const handleSalvar = async () => {
    if (!funilSelecionado || !etapaSelecionada) {
      toast.error('Selecione o funil e a etapa');
      return;
    }

    setSalvando(true);
    try {
      const etapaData = etapas.find(e => e.id === etapaSelecionada);
      
      if (existingOportunidade) {
        // Atualizar oportunidade existente
        await base44.entities.Oportunidade.update(existingOportunidade.id, {
          etapa_id: etapaSelecionada,
          etapa_nome: etapaData?.nome || 'Desconhecida',
          produto: funilSelecionado
        });
        toast.success('Oportunidade movida com sucesso!');
      } else {
        // Criar nova oportunidade - precisa de vendedor_id obrigatório
        const user = await base44.auth.me();
        const vendedorId = user?.colaborador_id || user?.id || '';
        
        if (!vendedorId) {
          toast.error('Erro: usuário não identificado. Contate o suporte.');
          return;
        }

        const novaOportunidade = await base44.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: contato?.nome || contato?.telefone || 'Lead',
          cliente_id: contato?.id || '',
          cliente_nome: contato?.nome || contato?.telefone || '',
          cliente_telefone: contato?.telefone || '',
          etapa_id: etapaSelecionada,
          etapa_nome: etapaData?.nome || 'Desconhecida',
          vendedor_id: vendedorId,
          vendedor_nome: user?.nome_perfil || user?.full_name || 'Desconhecido',
          status: 'aberta',
          produto: funilSelecionado,
          origem: 'BatePapo',
          valor_estimado: 0,
          data_cadastro_lead: new Date().toISOString().split('T')[0]
        });
        toast.success('Contato lançado no funil com sucesso!');
      }
      
      // Invalida queries para atualizar no FunilVendas
      queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
      queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp'] });
      
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast.error('Erro ao salvar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {existingOportunidade ? 'Mover para outra etapa' : 'Lançar no Funil de Vendas'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-sm text-slate-600">
            <strong>Contato:</strong> {contato?.nome || contato?.telefone}
          </div>

          {/* Seleção de Funil */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Qual Funil?</Label>
            <Select value={funilSelecionado} onValueChange={(valor) => {
              setFunilSelecionado(valor);
              setEtapaSelecionada(''); // Resetar etapa ao mudar funil
            }} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha um funil..." />
              </SelectTrigger>
              <SelectContent>
                {funis.map(funil => (
                  <SelectItem key={funil} value={funil}>
                    {funil}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Etapa */}
          {funilSelecionado && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Qual Etapa?</Label>
              <Select value={etapaSelecionada} onValueChange={setEtapaSelecionada} disabled={loading || etapasDoFunil.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma etapa..." />
                </SelectTrigger>
                <SelectContent>
                  {etapasDoFunil.map(etapa => (
                    <SelectItem key={etapa.id} value={etapa.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: etapa.cor || '#3b82f6' }}
                        />
                        {etapa.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            disabled={!funilSelecionado || !etapaSelecionada || salvando || loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {existingOportunidade ? 'Mover' : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}