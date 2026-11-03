import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// Exclui a instância de WhatsApp (sessão no provedor + conexão no CRM).
export default function ExcluirCanalWhatsappButton({ conexao, onExcluido }) {
  const [aberto, setAberto] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const nome = conexao?.nome || conexao?.session_id || 'este canal';

  const excluir = async () => {
    setExcluindo(true);
    try {
      const { data } = await base44.functions.invoke('excluirCanalWhatsapp', {
        connection_id: conexao.id,
      });
      if (data?.error) throw new Error(data.error);
      toast.success(
        data?.sessao_excluida
          ? `Instância "${nome}" excluída`
          : `Canal "${nome}" removido do CRM (sessão não existia no provedor)`
      );
      setAberto(false);
      onExcluido?.();
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Não foi possível excluir a instância');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        title="Excluir instância de WhatsApp"
        className="h-6 w-6 shrink-0 text-slate-400 hover:text-red-600"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAberto(true);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instância "{nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A sessão será removida do provedor (D-API) e o canal sairá do CRM. Todos os usuários perdem
              o acesso a este canal e as conversas existentes deixam de enviar mensagens por ele. Esta
              ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindo}
              onClick={(e) => {
                e.preventDefault();
                excluir();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {excluindo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir instância
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}