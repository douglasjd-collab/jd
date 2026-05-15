import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function FunilSelectionModal({
  open,
  onOpenChange,
  contato,
  empresaId,
  onSuccess,
  existingOportunidade = null
}) {
  const [funisSelecionado, setFunilSelecionado] = useState(existingOportunidade?.etapa_id || '');
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
      } catch (e) {
        toast.error('Erro ao carregar etapas: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    
    carregarFunis();
  }, [open, empresaId]);

  const handleSalvar = async () => {
    if (!funisSelecionado) {
      toast.error('Selecione uma etapa');
      return;
    }

    setSalvando(true);
    try {
      const etapaData = etapas.find(e => e.id === funisSelecionado);
      
      if (existingOportunidade) {
        // Atualizar oportunidade existente
        await base44.entities.Oportunidade.update(existingOportunidade.id, {
          etapa_id: funisSelecionado,
          etapa_nome: etapaData?.nome || 'Desconhecida'
        });
        toast.success('Oportunidade movida com sucesso!');
      } else {
        // Criar nova oportunidade
        const novaOportunidade = await base44.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: contato?.nome || contato?.telefone || 'Lead',
          cliente_id: contato?.id || '',
          cliente_nome: contato?.nome || contato?.telefone || '',
          cliente_telefone: contato?.telefone || '',
          etapa_id: funisSelecionado,
          etapa_nome: etapaData?.nome || 'Desconhecida',
          vendedor_id: '',
          status: 'aberta',
          produto: etapaData?.produto || 'consorcio',
          origem: 'BatePapo',
          valor_estimado: 0
        });
        toast.success('Contato lançado no funil com sucesso!');
      }
      
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

          <div className="space-y-2">
            <Label className="text-xs font-semibold">Selecionar Etapa</Label>
            <Select value={funisSelecionado} onValueChange={setFunilSelecionado} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha uma etapa..." />
              </SelectTrigger>
              <SelectContent>
                {etapas.map(etapa => (
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            disabled={!funisSelecionado || salvando || loading}
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