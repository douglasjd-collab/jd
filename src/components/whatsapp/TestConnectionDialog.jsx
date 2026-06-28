import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function TestConnectionDialog({
  open,
  onOpenChange,
  connection,
  onTest,
  isLoading
}) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('Mensagem de teste enviada pelo CRM JD via D-API.');

  if (!open || !connection) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Testar Conexão D-API</h2>
          <p className="text-sm text-slate-500 mt-1">
            {connection.nome}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <Label>Número para Teste</Label>
            <Input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="5587999999999"
            />
            <p className="text-xs text-slate-500 mt-1">
              Formato: DDI + DDD + número (sem espaços ou símbolos)
            </p>
          </div>

          <div>
            <Label>Mensagem de Teste</Label>
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem de teste"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button 
              onClick={() => onTest(phoneNumber, message)}
              disabled={isLoading || !phoneNumber}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Enviando...
                </>
              ) : (
                'Enviar Mensagem de Teste'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}