import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export const MENSAGEM_FINALIZACAO_PADRAO = `✅ *Atendimento finalizado!*

Agradecemos pelo seu contato com a *JD Promotora*.

Caso deseje um novo atendimento, basta enviar uma nova mensagem. Nossa equipe estará à disposição para ajudar!

🎁 *Você sabia?*
Ao indicar um amigo ou familiar que contratar um dos nossos serviços, você poderá receber cashback.

Trabalhamos com:
• Seguros
• Consórcios
• Financiamentos
• Empréstimos

📲 Siga a JD Promotora no Instagram:
https://www.instagram.com/jdpromotora?igsh=czJ1Z213ZGdpZGo5&utm_source=qr

_Cashback sujeito às regras da campanha._`;

// Mantém a proteção mesmo ao fechar o chat e montar outro painel.
const finalizacoesPendentes = new Set();

/**
 * Modal principal de finalização de atendimento — fonte única da regra usada
 * pelo Bate-papo e pelo painel flutuante de Atendimento.
 *
 * A conversa de destino é sempre resolvida pelo id (e pela conexão da própria
 * conversa), nunca pela conversa aberta na tela — assim finalizar a partir de
 * outra página nunca envia mensagem para o cliente errado.
 *
 * - enviarMensagem: opcional; o Bate-papo passa a fila de envio do chat.
 *   Sem ele, o envio usa a conexão de origem da própria conversa.
 * - fecharAoIniciar: Bate-papo fecha o modal e libera a navegação na hora
 *   (comportamento já existente). O painel de Atendimento mantém o modal
 *   aberto até a conclusão, mostrando o erro se o envio falhar.
 */
export default function FinalizarAtendimentoDialog({
  open,
  onOpenChange,
  conversa = null,
  conversaId = '',
  empresaId,
  user,
  enviarMensagem = null,
  fecharAoIniciar = false,
  descricaoExtra = '',
  onIniciada,
  onConcluida,
}) {
  const [mensagem, setMensagem] = useState(MENSAGEM_FINALIZACAO_PADRAO);
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState('');
  const [alvoCarregado, setAlvoCarregado] = useState(null);
  const [carregandoAlvo, setCarregandoAlvo] = useState(false);

  const idAlvo = conversa?.id || conversaId || '';
  const alvo = conversa || alvoCarregado;

  useEffect(() => {
    if (!open) return undefined;
    setMensagem(MENSAGEM_FINALIZACAO_PADRAO);
    setErro('');
    setAlvoCarregado(null);
    // O Bate-papo já tem a conversa carregada e o envio pela fila do chat.
    if (conversa || !conversaId) return undefined;

    let ativo = true;
    setCarregandoAlvo(true);
    base44.entities.ConversaWhatsapp.get(conversaId)
      .then((carregada) => {
        if (!ativo) return;
        if (empresaId && carregada.empresa_id && carregada.empresa_id !== empresaId) {
          setErro('Conversa de outra empresa — ação bloqueada.');
          return;
        }
        setAlvoCarregado(carregada);
      })
      .catch(() => {
        if (ativo) setErro('Não foi possível carregar a conversa de destino.');
      })
      .finally(() => {
        if (ativo) setCarregandoAlvo(false);
      });

    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conversaId]);

  const enviarPelaConexaoDaConversa = async (texto) => {
    if (!alvo) throw new Error('Conversa de destino não carregada.');
    if (empresaId && alvo.empresa_id && alvo.empresa_id !== empresaId) {
      throw new Error('Conversa de outra empresa — envio bloqueado.');
    }
    // A conexão é a da própria conversa: o backend usa o canal de origem.
    const numero = alvo.cliente_telefone || alvo.whatsapp_id;
    if (!numero) throw new Error('Conversa sem telefone de destino.');

    const resp = await base44.functions.invoke('enviarMensagemWhatsapp', {
      conversa_id: alvo.id,
      mensagem_texto: texto,
      numero_cliente: numero,
      empresa_id: empresaId,
      arquivo: null,
    });
    if (!resp?.data?.success) {
      throw new Error(resp?.data?.error || 'Erro ao enviar mensagem');
    }
    return resp.data;
  };

  const concluir = async ({ enviar = false } = {}) => {
    if (finalizando || !idAlvo) return;
    if (finalizacoesPendentes.has(idAlvo)) {
      toast.info('Esta conversa já está sendo finalizada.');
      return;
    }
    if (enviar && !mensagem.trim()) {
      toast.error('Digite a mensagem de finalização.');
      return;
    }
    if (enviar && !enviarMensagem && (!alvo || carregandoAlvo)) {
      setErro('Conversa de destino não carregada.');
      return;
    }

    finalizacoesPendentes.add(idAlvo);
    setFinalizando(true);
    setErro('');
    const avisoId = toast.loading('Finalizando conversa…');
    if (fecharAoIniciar) onOpenChange?.(false);
    onIniciada?.(idAlvo);

    try {
      // Só encerra depois do envio confirmado — falha mantém o atendimento aberto.
      if (enviar) {
        const texto = mensagem.trim();
        if (enviarMensagem) await enviarMensagem(texto, alvo);
        else await enviarPelaConexaoDaConversa(texto);
      }

      const finalizadoEm = new Date().toISOString();
      const finalizadoPorId = user?.colaborador_id || user?.id || '';
      const finalizadoPorNome = user?.nome_perfil || user?.full_name || user?.email || '';

      await base44.entities.ConversaWhatsapp.update(idAlvo, {
        status: 'encerrada',
        responsavel_id: null,
        responsavel_nome: null,
        responsavel_expira_em: null,
        atendimento_transferido_para_id: null,
        atendimento_prioritario: false,
        prioritario_removido_por_id: finalizadoPorId,
        prioritario_removido_por_nome: finalizadoPorNome,
        prioritario_removido_em: finalizadoEm,
      });

      onConcluida?.(idAlvo, { enviarMensagem: enviar });
      onOpenChange?.(false);
      toast.success(
        enviar ? 'Mensagem enviada e conversa finalizada' : 'Conversa finalizada sem enviar mensagem',
        { id: avisoId }
      );
    } catch (error) {
      const detalhe = error?.response?.data?.error || error?.message || 'erro desconhecido';
      setErro('Não foi possível finalizar. O atendimento continua aberto: ' + detalhe);
      toast.error('Não foi possível finalizar a conversa. Ela continua na lista: ' + detalhe, {
        id: avisoId,
      });
    } finally {
      finalizacoesPendentes.delete(idAlvo);
      setFinalizando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(valor) => !finalizando && onOpenChange?.(valor)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalizar atendimento</DialogTitle>
          <DialogDescription>
            Finalize sem enviar mensagem ou revise a mensagem abaixo antes de enviar ao cliente.
          </DialogDescription>
        </DialogHeader>

        {descricaoExtra && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-800">
            {descricaoExtra}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="mensagem-finalizacao" className="text-sm font-medium text-slate-700">
            Mensagem de finalização
          </label>
          <Textarea
            id="mensagem-finalizacao"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={15}
            disabled={finalizando}
            className="resize-y text-sm"
          />
          <p className="text-xs text-slate-500">Você pode personalizar o texto antes do envio.</p>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={finalizando}
            onClick={() => onOpenChange?.(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={finalizando || carregandoAlvo}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            onClick={() => concluir({ enviar: false })}
          >
            Finalizar sem enviar
          </Button>
          <Button
            type="button"
            disabled={finalizando || carregandoAlvo || !mensagem.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => concluir({ enviar: true })}
          >
            {finalizando ? 'Finalizando...' : 'Enviar e finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}