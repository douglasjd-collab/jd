import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Cloud, Smartphone, X } from 'lucide-react';
import {
  isConnectionOficial,
  isConnectionDapiAlternative,
  displayConnectionName,
} from './connectionDisplay';

// Modal de seleção de canal de envio.
// Regra: sempre que uma conversa for REABERTA, o sistema deve exibir esta
// confirmação antes de liberar o campo de envio. O usuário escolhe "API Oficial"
// ou "D-API – Douglas | JD Promotora"; a conexão escolhida é salva como canal
// ativo da conversa (locked_provider=true) e só pode ser trocada por ação
// manual do próprio usuário no seletor do ChatHeader.
export default function SelecionarApiModal({
  open,
  onOpenChange,
  conexoesAtivas = [],
  onSelecionar,
  loading = false,
}) {
  const oficial = conexoesAtivas.find((c) => isConnectionOficial(c) && c.is_active);
  const alternativa = conexoesAtivas.find((c) => isConnectionDapiAlternative(c) && c.is_active);

  const handleConfirmar = async (conexao) => {
    if (!conexao || loading) return;
    await onSelecionar(conexao);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-center">
            Selecione por qual API deseja conversar com este cliente
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          <button
            type="button"
            disabled={!oficial || loading}
            onClick={() => handleConfirmar(oficial)}
            className="flex items-start gap-3 p-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
          >
            <Cloud className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-emerald-800 text-sm">API Oficial</p>
              <p className="text-[11px] text-emerald-700 mt-0.5 leading-tight">
                WhatsApp Business Cloud API — alta entregabilidade, em conformidade com a Meta.
              </p>
            </div>
            {oficial ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <X className="w-5 h-5 text-slate-400 flex-shrink-0" />
            )}
          </button>

          {alternativa ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => handleConfirmar(alternativa)}
              className="flex items-start gap-3 p-4 rounded-xl border-2 border-sky-300 bg-sky-50 hover:bg-sky-100 transition-colors disabled:opacity-50 text-left"
            >
              <Smartphone className="w-6 h-6 text-sky-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sky-800 text-sm">{displayConnectionName(alternativa)}</p>
                <p className="text-[11px] text-sky-700 mt-0.5 leading-tight">
                  API não oficial da JD Promotora — WhatsApp conectado via D-API.
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-sky-600 flex-shrink-0" />
            </button>
          ) : (
            <div className="text-xs text-slate-500 italic px-2 py-3 text-center">
              Nenhuma conexão alternativa (D-API – Douglas | JD Promotora) disponível.
            </div>
          )}
        </div>

        <div className="text-[11px] text-slate-500 px-2 text-center leading-tight">
          A escolha fica salva nesta conversa até que você altere manualmente no seletor de API.
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}