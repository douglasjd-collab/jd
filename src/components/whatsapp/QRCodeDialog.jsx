import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, QrCode, CheckCircle2 } from 'lucide-react';

export default function QRCodeDialog({
  open,
  onOpenChange,
  connection,
  qrCode,
  isLoading,
  onRefresh
}) {
  if (!open || !connection) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">QR Code - {connection.nome}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Escaneie o QR Code com seu WhatsApp
          </p>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
              <p className="text-slate-600">Carregando QR Code...</p>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center">
              <img 
                src={qrCode} 
                alt="QR Code" 
                className="w-64 h-64 object-contain border rounded-lg p-4"
              />
              <p className="text-sm text-slate-600 mt-4 text-center">
                Abra o WhatsApp no seu celular → Configurações → Aparelhos conectados → Conectar aparelho
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-600 mb-4" />
              <p className="text-slate-600 text-center">
                Esta conexão já está conectada.<br/>
                Não é necessário gerar QR Code.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={onRefresh} disabled={isLoading}>
              <QrCode className="w-4 h-4 mr-2" />
              Atualizar QR Code
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}