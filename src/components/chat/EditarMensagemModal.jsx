import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Pencil, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Modal de edição de mensagem enviada pelo atendente.
 * Ao confirmar, chama a função backend `editarMensagemWhatsapp` que:
 *  - atualiza o texto no CRM (preservando a versão anterior em `texto_anterior`)
 *  - tenta refletir a edição no aparelho conectado (D-API/Evolution) — best-effort
 *
 * O cache local é atualizado imediatamente para refletir a edição (texto novo +
 * texto anterior com meia opacidade, exibido pelo MensagemItem).
 */
export default function EditarMensagemModal({ open, onOpenChange, mensagem, conversaId }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && mensagem) {
      setTexto(mensagem.texto || '');
    }
  }, [open, mensagem]);

  if (!mensagem) return null;

  const handleSalvar = async () => {
    if (!texto.trim()) {
      toast.error('O texto não pode ficar vazio');
      return;
    }
    if (texto.trim() === (mensagem.texto || '').trim()) {
      toast.info('Texto não alterado');
      onOpenChange(false);
      return;
    }

    setSalvando(true);
    try {
      const resp = await base44.functions.invoke('editarMensagemWhatsapp', {
        mensagem_id: mensagem.id,
        novo_texto: texto.trim()
      });

      if (resp?.data?.success) {
        // Atualizar cache imediatamente — refletir texto novo + texto anterior (ghost)
        queryClient.setQueryData(['mensagens-whatsapp', conversaId], (old = []) =>
          old.map(m => m.id === mensagem.id ? {
            ...m,
            texto: resp.data.novo_texto,
            texto_anterior: resp.data.texto_anterior,
            editada: true,
            edicao_count: resp.data.edicao_count,
            data_edicao: new Date().toISOString(),
            edicao_api_status: resp.data.api_status
          } : m)
        );

        const apiStatus = resp.data.api_status;
        if (apiStatus === 'sucesso') {
          toast.success('Mensagem editada no CRM e no WhatsApp');
        } else if (apiStatus === 'nao_aplicavel') {
          toast.success('Mensagem editada no CRM');
          if (resp.data.api_erro) toast.info(resp.data.api_erro);
        } else {
          toast.success('Mensagem editada no CRM');
          toast.warning('Não foi possível editar no aparelho: ' + (resp.data.api_erro || '').substring(0, 80));
        }

        onOpenChange(false);
      } else {
        toast.error('Erro ao editar: ' + (resp?.data?.error || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error('Erro ao editar mensagem:', e);
      toast.error('Erro ao editar: ' + e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-blue-600" />
            Editar mensagem
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {mensagem.editada && mensagem.texto_anterior && (
            <div className="text-xs text-slate-400 bg-slate-50 rounded-lg p-2 border border-slate-100">
              <p className="font-medium mb-1 text-slate-500">Versão atual (será substituída):</p>
              <p className="whitespace-pre-wrap opacity-60">{mensagem.texto}</p>
            </div>
          )}

          <Textarea
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            className="min-h-[120px] resize-y text-sm"
            placeholder="Digite o novo texto da mensagem..."
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSalvar();
              }
            }}
          />

          <p className="text-[11px] text-slate-500">
            ✏️ A mensagem será atualizada no CRM (a versão anterior fica com meia opacidade abaixo da nova).
            {'\n'}O sistema tentará refletir a edição no aparelho conectado (quando suportado). A API Oficial Meta ainda não suporta edição — nesses casos, apenas o CRM é atualizado.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !texto.trim()}
            className="gap-2 bg-[#1e3a5f] hover:bg-[#2a4a73]"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {salvando ? 'Salvando...' : 'Salvar edição'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}