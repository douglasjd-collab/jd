import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Search, Loader2, Check } from "lucide-react";
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export default function TransferirAtendimentoModal({ open, onOpenChange, conversa, empresaId, onTransferir }) {
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [transferindo, setTransferindo] = useState(false);

  const { data: colaboradores = [] } = useQuery({
    queryKey: ['colaboradores-transfer', empresaId],
    enabled: !!empresaId && open,
    queryFn: () => base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, 'nome', 100),
  });

  const filtrados = colaboradores.filter(c =>
    (c.nome || '').toLowerCase().includes(busca.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(busca.toLowerCase())
  );

  const handleTransferir = async () => {
    if (!selecionado || !conversa) return;
    setTransferindo(true);
    try {
      await onTransferir(conversa, selecionado);
      onOpenChange(false);
      setSelecionado(null);
      setBusca('');
    } finally {
      setTransferindo(false);
    }
  };

  const handleClose = (v) => {
    if (!v) { setSelecionado(null); setBusca(''); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-blue-600" />
            Transferir Atendimento
          </DialogTitle>
        </DialogHeader>

        {conversa && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 border">
            Conversa: <span className="font-semibold text-slate-800">{conversa.cliente_nome || conversa.cliente_telefone}</span>
          </div>
        )}

        <div>
          <Label className="text-xs text-slate-600 mb-1 block">Selecionar atendente</Label>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar colaborador..."
              className="pl-8 h-9"
            />
          </div>

          <div className="space-y-1 max-h-52 overflow-y-auto">
            {filtrados.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Nenhum colaborador encontrado</p>
            ) : filtrados.map(colab => {
              const ativo = selecionado?.id === colab.id;
              const iniciais = (colab.nome || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
              return (
                <button
                  key={colab.id}
                  onClick={() => setSelecionado(colab)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all border ${
                    ativo
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    {colab.foto_perfil ? (
                      <img src={colab.foto_perfil} alt={colab.nome} className="h-full w-full object-cover rounded-full" />
                    ) : (
                      <AvatarFallback className="text-xs bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                        {iniciais}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{colab.nome}</p>
                    {colab.cargo && <p className="text-[11px] text-slate-500 truncate">{colab.cargo}</p>}
                  </div>
                  {ativo && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button
            onClick={handleTransferir}
            disabled={!selecionado || transferindo}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {transferindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightLeft className="w-4 h-4" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}