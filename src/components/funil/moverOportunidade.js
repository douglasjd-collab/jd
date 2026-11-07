import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

// Compartilhado pelo quadro e pela edição rápida do bate-papo.
export async function moverOportunidade({ oportunidadeId, novaEtapaId, updates = {}, etapas, currentUser, observacao = '', etapaEsperada, validarRequisitos = false, avisar = toast.warning, client = base44 }) {
      const user = await client.auth.me();
      const oportunidade = await client.entities.Oportunidade.get(oportunidadeId);
      if (!oportunidade) throw new Error("Oportunidade não encontrada");
      const etapaDestino = etapas.find(e => e.id === novaEtapaId);
      if (!etapaDestino || etapaDestino.status === "inativa" || (etapaDestino.empresa_id && etapaDestino.empresa_id !== oportunidade.empresa_id)) throw new Error("Etapa indisponível");
      if (etapaEsperada && oportunidade.etapa_id !== etapaEsperada) throw new Error('A etapa foi alterada por outra pessoa. Feche e abra novamente para atualizar.');
      if (validarRequisitos && etapaDestino.produto !== oportunidade.produto) throw new Error('Selecione uma etapa do mesmo funil.');
      if (validarRequisitos && etapaDestino.requer_cliente && !oportunidade.cliente_id) throw new Error('Vincule o cliente antes de avançar.');
      if (validarRequisitos && etapaDestino.tipo === 'perdida' && !observacao.trim()) throw new Error('Informe o motivo da perda.');
      if (validarRequisitos && etapaDestino.requer_documentos) {
        const anexos = await client.entities.ComentarioOportunidade.filter({ oportunidade_id: oportunidadeId }, '-created_date', 5000);
        if (!anexos.some(c => /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(c.mensagem || ''))) throw new Error('Esta etapa exige documentos. Anexe os documentos no card da oportunidade antes de avançar.');
      }
      if (oportunidade.etapa_id === novaEtapaId) return { oportunidadeId, novaEtapaId, etapaDestino, oportunidade, abrirFormVenda: false };

      // ✅ empresa_id com fallback REAL (prioriza o que já existe na oportunidade)
      const empresaId =
        updates.empresa_id ||
        oportunidade?.empresa_id ||
        currentUser?.empresa_id ||
        user?.empresa_id ||
        user?.empresa?.id;

      if (!empresaId) {
        throw new Error("empresa_id não encontrado. Verifique se o usuário e a oportunidade estão vinculados a uma empresa.");
      }

      // HU 04 - avisos
      if (etapaDestino?.requer_cliente && !oportunidade?.cliente_id) {
        avisar('Atenção: Esta etapa requer cliente vinculado');
      }

      // Se está sendo movido para etapa de planejamento E é consórcio, registrar data de entrada
      const entrandoNoPlanejamento = etapaDestino?.tipo === 'planejamento' && !oportunidade?.data_entrada_planejamento && oportunidade?.produto === 'consorcio';


      // ✅ UPDATE sempre com empresa_id + campos essenciais
      await client.entities.Oportunidade.update(oportunidadeId, {
        ...updates,
        empresa_id: empresaId,
        etapa_id: novaEtapaId,
        etapa_nome: etapaDestino?.nome || '',
        titulo: oportunidade?.titulo || '',
        vendedor_id: oportunidade?.vendedor_id || '',
        data_ultima_movimentacao: new Date().toISOString(),
        status:
          etapaDestino?.tipo === 'ganho'
            ? 'ganha'
            : etapaDestino?.tipo === 'perdida'
            ? 'perdida'
            : 'aberta',
        ...(entrandoNoPlanejamento ? {
          data_entrada_planejamento: new Date().toISOString(),
          campanha_planejamento_ultima: 0,
        } : {}),
      });

      // Se estava em Pré-Fechamento e saiu, encerrar alertas ativos
      const etapaOrigemObj = etapas.find(e => e.id === oportunidade?.etapa_id);
      const eraPreFechamento = etapaOrigemObj?.nome?.toLowerCase().includes('pré-fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pre-fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pré fechamento') ||
        etapaOrigemObj?.nome?.toLowerCase().includes('pre fechamento');
      const continuaPreFechamento = etapaDestino?.nome?.toLowerCase().includes('pré-fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pre-fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pré fechamento') ||
        etapaDestino?.nome?.toLowerCase().includes('pre fechamento');
      if (eraPreFechamento && !continuaPreFechamento) {
        // Encerrar alertas ativos deste lead
        const alertasAtivos = await client.entities.AlertePreFechamento.filter({
          oportunidade_id: oportunidadeId,
          status: 'ativo'
        });
        for (const alerta of alertasAtivos) {
          await client.entities.AlertePreFechamento.update(alerta.id, { status: 'encerrado' });
        }
      }

      // histórico
      await client.entities.MovimentacaoFunil.create({
        oportunidade_id: oportunidadeId,
        etapa_origem_id: oportunidade?.etapa_id,
        etapa_origem_nome: oportunidade?.etapa_nome || '',
        etapa_destino_id: novaEtapaId,
        etapa_destino_nome: etapaDestino?.nome || '',
        ...(observacao ? { observacao } : {}),
        usuario_id: user.id,
        usuario_nome: user.full_name
      });

      // integração com vendas
      if (etapaDestino?.tipo === 'ganho' && !oportunidade?.venda_id) {
        return { oportunidadeId, novaEtapaId, etapaDestino, abrirFormVenda: true, oportunidade };
      }

      // auditoria
      await client.entities.LogAuditoria.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        acao: `Moveu oportunidade "${oportunidade?.titulo}" de "${oportunidade?.etapa_nome}" para "${etapaDestino?.nome}"`,
        entidade: 'Oportunidade',
        entidade_id: oportunidadeId,
        tipo: 'edicao'
      });

      return { oportunidadeId, novaEtapaId, etapaDestino, abrirFormVenda: false };
}
