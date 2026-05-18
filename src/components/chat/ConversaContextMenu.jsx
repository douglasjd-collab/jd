import React from 'react';
import { base44 } from '@/api/base44Client';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Bell,
  Contact,
  Pencil,
  Tag,
  Clock,
  ArrowRightLeft,
  Star,
  Lock,
  Unlock,
  Check,
  Trash2,
  CalendarClock,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ConversaContextMenu({
  conversa,
  isGrupo,
  empresaId,
  conversaSelecionada,
  setConversaSelecionada,
  setMarcadasNaoLidasManual,
  marcadasNaoLidasManual,
  setNaoLidasPorConversa,
  abrirSalvarCrm,
  setContatoParaTags,
  setTagsModalOpen,
  setTransferirModal,
  onAgendarMensagem,
}) {
  const queryClient = useQueryClient();

  if (isGrupo) {
    return (
      <>
        {conversa.status === 'encerrada' && (
          <DropdownMenuItem
            onClick={async () => {
              queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
                old.map(cv => cv.id === conversa.id ? { ...cv, status: 'ativa' } : cv)
              );
              await base44.entities.ConversaWhatsapp.update(conversa.id, { status: 'ativa' });
              toast.success('✅ Conversa do grupo reaberta');
            }}
            className="text-emerald-600 focus:text-emerald-700"
          >
            <Unlock className="mr-2 h-3.5 w-3.5" />
            Reabrir conversa
          </DropdownMenuItem>
        )}
        {conversa.status !== 'encerrada' && (
          <DropdownMenuItem
            onClick={async () => {
              queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
                old.map(cv => cv.id === conversa.id ? { ...cv, status: 'encerrada', responsavel_id: null, responsavel_nome: null } : cv)
              );
              if (conversaSelecionada?.id === conversa.id) setConversaSelecionada(null);
              base44.entities.ConversaWhatsapp.update(conversa.id, { status: 'encerrada', responsavel_id: null, responsavel_nome: null }).catch(() => {});
              toast.success('✅ Conversa do grupo finalizada');
            }}
            className="text-red-600 focus:text-red-700"
          >
            <Check className="mr-2 h-3.5 w-3.5" />
            Finalizar conversa
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={async () => {
            const novoBloqueado = !conversa.bloqueado;
            queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
              old.map(cv => cv.id === conversa.id ? { ...cv, bloqueado: novoBloqueado } : cv)
            );
            await base44.entities.ConversaWhatsapp.update(conversa.id, { bloqueado: novoBloqueado });
            toast.success(novoBloqueado ? '🔒 Grupo bloqueado — mensagens serão ignoradas' : '🔓 Grupo desbloqueado');
          }}
          className={conversa.bloqueado ? 'text-green-600 focus:text-green-700' : 'text-orange-600 focus:text-orange-700'}
        >
          {conversa.bloqueado ? <Unlock className="mr-2 h-3.5 w-3.5" /> : <Lock className="mr-2 h-3.5 w-3.5" />}
          {conversa.bloqueado ? 'Desbloquear grupo' : 'Bloquear grupo'}
        </DropdownMenuItem>
      </>
    );
  }

  // Conversa pessoal
  return (
    <>
      {conversa.status === 'encerrada' && conversa.responsavel_id && (
        <DropdownMenuItem
          onClick={async () => {
            queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
              old.map(cv => cv.id === conversa.id ? { ...cv, responsavel_id: null, responsavel_expira_em: null } : cv)
            );
            await base44.entities.ConversaWhatsapp.update(conversa.id, { responsavel_id: null, responsavel_expira_em: null });
            toast.success('✅ Conversa finalizada e movida para Finalizados');
          }}
          className="text-red-600 focus:text-red-700"
        >
          <Check className="mr-2 h-3.5 w-3.5" />
          Finalizar conversa
        </DropdownMenuItem>
      )}
      {conversa.status === 'encerrada' && !conversa.responsavel_id && (
        <DropdownMenuItem
          onClick={async () => {
            queryClient.setQueryData(['conversas-whatsapp', empresaId], (old = []) =>
              old.map(cv => cv.id === conversa.id ? { ...cv, status: 'ativa', responsavel_id: null, responsavel_expira_em: null } : cv)
            );
            await base44.entities.ConversaWhatsapp.update(conversa.id, { status: 'ativa', responsavel_id: null, responsavel_expira_em: null });
            toast.success('✅ Conversa reaberta');
          }}
          className="text-emerald-600 focus:text-emerald-700"
        >
          <Unlock className="mr-2 h-3.5 w-3.5" />
          Reabrir conversa
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => {
        if (marcadasNaoLidasManual.has(conversa.id)) {
          setMarcadasNaoLidasManual(prev => {
            const nova = new Set(prev);
            nova.delete(conversa.id);
            return nova;
          });
          toast.success('Marcado como lido');
        } else {
          setMarcadasNaoLidasManual(prev => new Set(prev).add(conversa.id));
          setNaoLidasPorConversa(prev => ({ ...prev, [conversa.id]: 1 }));
          toast.success('Marcado como não lido');
        }
      }}>
        <Bell className="mr-2 h-3.5 w-3.5" />
        {marcadasNaoLidasManual.has(conversa.id) ? 'Marcar como lido' : 'Marcar como não lido'}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => abrirSalvarCrm(conversa)}>
        <Contact className="mr-2 h-3.5 w-3.5" />
        {/* contato_whatsapp check to be done in parent */}
        Editar no CRM
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => abrirSalvarCrm(conversa)}>
        <Pencil className="mr-2 h-3.5 w-3.5" />
        Alterar nome
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => {
        setContatoParaTags(conversa);
        setTagsModalOpen(true);
      }}>
        <Tag className="mr-2 h-3.5 w-3.5" />
        Tags
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => toast.info('Criar tarefa em desenvolvimento')}>
        <Clock className="mr-2 h-3.5 w-3.5" />
        Criar tarefa
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTransferirModal(conversa)}>
        <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
        Transferir atendimento
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAgendarMensagem && onAgendarMensagem(conversa)}>
        <CalendarClock className="mr-2 h-3.5 w-3.5 text-blue-600" />
        <span className="text-blue-600">Agendar mensagem</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => toast.success('Adicionado aos favoritos')}>
        <Star className="mr-2 h-3.5 w-3.5" />
        Favoritar
      </DropdownMenuItem>
    </>
  );
}