import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Star } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const TEMPO_ATENDIMENTO_MS = 24 * 60 * 60 * 1000;

/**
 * Estrela de Atendimento Prioritário.
 * - Permite marcar/desmarcar prioridade na linha da conversa e no cabeçalho.
 * - Quando marcada: salva atendimento_prioritario=true, move para Em Atendimento
 *   (status='ativa' + responsável) e NÃO volta para Esperando por inatividade.
 * - Quando desmarcada com inatividade já expirada: pergunta ao usuário.
 * - Permissão: admin/gerente/master OU atendente responsável (ou sem responsável).
 */
export default function EstrelaPrioridadeButton({
  conversa,
  user,
  empresaId,
  queryClient,
  className = '',
  size = 'h-9 w-9',
  starSize = 'h-4 w-4',
}) {
  const [carregando, setCarregando] = useState(false);
  const [dialogAberto, setDialogAberto] = useState(false);

  const prioritario = !!(conversa && conversa.atendimento_prioritario);

  const podeMarcar = useMemo(() => {
    if (!user || !conversa) return false;
    const perfil = user.perfil;
    if (['admin', 'gerente', 'master', 'super_admin'].includes(perfil)) return true;
    const meuId = user.colaborador_id || user.id;
    if (!conversa.responsavel_id) return true; // sem atendente fixo: qualquer um com acesso pode assumir marcando
    return conversa.responsavel_id === meuId;
  }, [user, conversa]);

  const inatividadeExpirada = () => {
    if (!conversa) return false;
    if (!conversa.responsavel_expira_em) return true;
    return new Date(conversa.responsavel_expira_em) < new Date();
  };

  const atualizar = async (dados) => {
    await base44.entities.ConversaWhatsapp.update(conversa.id, dados);
    queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
      old.map(c => (c.id === conversa.id ? { ...c, ...dados } : c))
    );
    queryClient.invalidateQueries({ queryKey: ['conversas-whatsapp', empresaId] });
  };

  const marcar = async () => {
    const agora = new Date().toISOString();
    const nome = user.nome_perfil || user.full_name || '';
    const meuId = user.colaborador_id || user.id;
    const dados = {
      atendimento_prioritario: true,
      status: 'ativa',
      responsavel_id: conversa.responsavel_id || meuId,
      responsavel_nome: conversa.responsavel_nome || nome,
      responsavel_expira_em: new Date(Date.now() + TEMPO_ATENDIMENTO_MS).toISOString(),
      prioritario_marcado_por_id: meuId,
      prioritario_marcado_por_nome: nome,
      prioritario_marcado_em: agora,
    };
    await atualizar(dados);
    toast.success('⭐ Atendimento prioritário marcado');
  };

  const desmarcarSimples = async () => {
    const agora = new Date().toISOString();
    const nome = user.nome_perfil || user.full_name || '';
    const meuId = user.colaborador_id || user.id;
    const dados = {
      atendimento_prioritario: false,
      prioritario_removido_por_id: meuId,
      prioritario_removido_por_nome: nome,
      prioritario_removido_em: agora,
    };
    await atualizar(dados);
    toast.success('Prioridade removida — atendimento normal');
  };

  const enviarParaEsperando = async () => {
    const agora = new Date().toISOString();
    const nome = user.nome_perfil || user.full_name || '';
    const meuId = user.colaborador_id || user.id;
    const dados = {
      atendimento_prioritario: false,
      status: 'ativa',
      ultimo_remetente: 'cliente',
      prioritario_removido_por_id: meuId,
      prioritario_removido_por_nome: nome,
      prioritario_removido_em: agora,
      responsavel_id: '',
      responsavel_nome: '',
      responsavel_expira_em: '',
    };
    await atualizar(dados);
    toast.success('Conversa enviada para Esperando');
  };

  const handleClick = async (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!podeMarcar) {
      toast.error('Sem permissão para alterar a prioridade desta conversa');
      return;
    }
    if (carregando) return;
    setCarregando(true);
    try {
      if (prioritario) {
        if (inatividadeExpirada()) {
          setDialogAberto(true);
        } else {
          await desmarcarSimples();
        }
      } else {
        await marcar();
      }
    } catch (err) {
      console.error('Erro ao alterar prioridade:', err);
      toast.error('Erro ao alterar prioridade: ' + (err?.message || ''));
    } finally {
      setCarregando(false);
    }
  };

  if (!conversa) return null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            disabled={carregando}
            className={`inline-flex items-center justify-center rounded-md transition-colors hover:bg-black/5 disabled:opacity-50 ${size} ${className}`}
            aria-label={prioritario ? 'Remover atendimento prioritário' : 'Marcar como atendimento prioritário'}
          >
            {carregando ? (
              <Loader2 className={`${starSize} animate-spin text-slate-400`} />
            ) : (
              <Star
                className={`${starSize} ${prioritario ? 'text-yellow-400' : 'text-slate-300'}`}
                fill={prioritario ? 'currentColor' : 'none'}
                strokeWidth={2}
              />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {prioritario ? 'Remover atendimento prioritário' : 'Marcar como atendimento prioritário'}
        </TooltipContent>
      </Tooltip>

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-400" fill="currentColor" />
              Remover atendimento prioritário
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600 py-2">
            Este atendimento já ultrapassou o período de inatividade. Deseja mantê-lo
            em atendimento ou enviá-lo para Esperando?
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                setDialogAberto(false);
                setCarregando(true);
                try { await desmarcarSimples(); } finally { setCarregando(false); }
              }}
            >
              Manter em atendimento
            </Button>
            <Button
              onClick={async () => {
                setDialogAberto(false);
                setCarregando(true);
                try { await enviarParaEsperando(); } finally { setCarregando(false); }
              }}
            >
              Enviar para Esperando
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}