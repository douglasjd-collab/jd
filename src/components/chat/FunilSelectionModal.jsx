import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  const [valor, setValor] = useState(existingOportunidade?.valor_estimado?.toString() || '');
  const [vendedorId, setVendedorId] = useState(existingOportunidade?.vendedor_id || '');
  const [vendedores, setVendedores] = useState([]);
  const [previsaoFechamento, setPrevisaoFechamento] = useState(
    existingOportunidade?.data_fechamento_prevista || ''
  );
  const [currentUser, setCurrentUser] = useState(null);

  React.useEffect(() => {
    if (!open || !empresaId) return;

    setVendedorId(existingOportunidade?.vendedor_id || '');
    setValor(existingOportunidade?.valor_estimado?.toString() || '');
    setPrevisaoFechamento(existingOportunidade?.data_fechamento_prevista || '');

    const carregarFunis = async () => {
      setLoading(true);
      try {
        const etapasData = await base44.entities.EtapaFunil.filter({ empresa_id: empresaId });
        setEtapas(etapasData);

        const funisUnicos = [...new Set(etapasData.map(e => e.produto))].filter(Boolean);
        setFunis(funisUnicos);

        // Carregar vendedores da empresa
        const perfisVendedor = ['vendedor', 'colaborador_vendedor', 'gerente', 'admin', 'parceiro'];
        const colabs = await base44.entities.Colaborador.filter(
          { empresa_id: empresaId, status: 'ativo' },
          'nome',
          500
        );
        const vendedoresFiltrados = (colabs || []).filter(c =>
          perfisVendedor.includes(c.perfil)
        );
        setVendedores(vendedoresFiltrados);

        // Carregar usuário atual e pré-selecionar
        try {
          const me = await base44.auth.me();
          setCurrentUser(me);
          if (!existingOportunidade?.vendedor_id) {
            const colabAtual = vendedoresFiltrados.find(c => c.user_id === me.id);
            if (colabAtual) {
              setVendedorId(colabAtual.id);
            }
          }
        } catch {}
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

      // Determinar vendedor (selecionado ou atual)
      let vendedorSelecionado = vendedores.find(v => v.id === vendedorId);
      let vIdFinal = vendedorId;
      let vNomeFinal = '';
      let vFotoFinal = '';

      if (!vendedorSelecionado && currentUser) {
        // Fallback: usuário atual se não selecionou vendedor
        vIdFinal = currentUser.colaborador_id || currentUser.id;
        vNomeFinal = currentUser.nome_perfil || currentUser.full_name || 'Desconhecido';
        vFotoFinal = currentUser.foto_perfil || '';
      } else if (vendedorSelecionado) {
        vNomeFinal = vendedorSelecionado.nome || 'Desconhecido';
        vFotoFinal = vendedorSelecionado.foto_perfil || '';
      }

      if (!vIdFinal) {
        toast.error('Selecione um vendedor responsável.');
        setSalvando(false);
        return;
      }

      const valorNumerico = parseFloat(String(valor).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;

      if (existingOportunidade) {
        await base44.entities.Oportunidade.update(existingOportunidade.id, {
          etapa_id: etapaSelecionada,
          etapa_nome: etapaData?.nome || 'Desconhecida',
          produto: funilSelecionado,
          valor_estimado: valorNumerico,
          vendedor_id: vIdFinal,
          vendedor_nome: vNomeFinal,
          foto_perfil_responsavel: vFotoFinal,
          responsaveis_ids: JSON.stringify([vIdFinal]),
          responsaveis_nomes: JSON.stringify([vNomeFinal]),
          responsaveis_fotos: JSON.stringify([vFotoFinal]),
          data_fechamento_prevista: previsaoFechamento || null,
        });
        toast.success('Oportunidade atualizada com sucesso!');
      } else {
        await base44.entities.Oportunidade.create({
          empresa_id: empresaId,
          titulo: contato?.nome || contato?.telefone || 'Lead',
          cliente_id: contato?.id || '',
          cliente_nome: contato?.nome || contato?.telefone || '',
          cliente_telefone: contato?.telefone || '',
          etapa_id: etapaSelecionada,
          etapa_nome: etapaData?.nome || 'Desconhecida',
          vendedor_id: vIdFinal,
          vendedor_nome: vNomeFinal,
          foto_perfil_responsavel: vFotoFinal,
          responsaveis_ids: JSON.stringify([vIdFinal]),
          responsaveis_nomes: JSON.stringify([vNomeFinal]),
          responsaveis_fotos: JSON.stringify([vFotoFinal]),
          status: 'aberta',
          produto: funilSelecionado,
          origem: 'BatePapo',
          valor_estimado: valorNumerico,
          data_fechamento_prevista: previsaoFechamento || null,
          data_cadastro_lead: new Date().toISOString().split('T')[0] // automático: data atual
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

          {/* Valor */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Valor</Label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valor}
              onChange={e => setValor(e.target.value)}
              disabled={salvando}
            />
          </div>

          {/* Vendedor */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId} disabled={loading || salvando}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor..." />
              </SelectTrigger>
              <SelectContent>
                {vendedores.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome} {v.perfil ? `(${v.perfil})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Previsão de fechamento */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Previsão de fechamento</Label>
            <Input
              type="date"
              value={previsaoFechamento}
              onChange={e => setPrevisaoFechamento(e.target.value)}
              disabled={salvando}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            disabled={!funilSelecionado || !etapaSelecionada || salvando || loading || !vendedorId}
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