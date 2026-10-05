import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { chaveAlias, chavesDoTipo, normalizarDescricaoTipo } from '../../shared/tiposEmprestimoShared.ts';

// Vinculação manual de uma pendência de tipo de empréstimo:
// salva a descrição recebida como vínculo do tipo escolhido (respeitando a origem/banco),
// reprocessa os registros envolvidos e mantém a pendência aberta em caso de falha parcial.

const PERFIS_PERMITIDOS = ['master', 'super_admin', 'admin', 'gerente'];
const TAMANHO_LOTE = 100;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autorizado' }, { status: 401 });
    }

    const { pendencia_id, tipo_id } = await req.json();
    if (!pendencia_id || !tipo_id) {
      return Response.json({ success: false, error: 'Pendência e tipo são obrigatórios' });
    }

    // Permissões de cadastro (mesmos perfis que podem gerenciar tipos de empréstimo)
    const perfil = user.perfil || (['admin', 'super_admin'].includes(user.role) ? 'admin' : null);
    if (!PERFIS_PERMITIDOS.includes(perfil)) {
      return Response.json({ success: false, error: 'Seu perfil não tem permissão para vincular tipos de empréstimo.' });
    }

    const pendencia = await base44.asServiceRole.entities.PendenciaVinculacaoTipo.get(pendencia_id);
    if (!pendencia) {
      return Response.json({ success: false, error: 'Pendência não encontrada' });
    }

    const tipo = await base44.asServiceRole.entities.TipoEmprestimo.get(tipo_id);
    if (!tipo) {
      return Response.json({ success: false, error: 'Tipo de empréstimo não encontrado' });
    }
    if (tipo.empresa_id !== pendencia.empresa_id) {
      return Response.json({ success: false, error: 'O tipo escolhido pertence a outra empresa.' });
    }

    const descricao = String(pendencia.descricao_original || '').trim();
    const origem = String(pendencia.origem || '').trim();
    const origemChave = normalizarDescricaoTipo(origem);

    // ── 1. Salvar o vínculo no tipo escolhido ───────────────────────────────
    let aliasSalvo = null;

    if (pendencia.sem_descricao) {
      // Descrição ausente: não cria alias vazio; define o tipo padrão para arquivos sem tipo
      const marcados = await base44.asServiceRole.entities.TipoEmprestimo.filter(
        { empresa_id: pendencia.empresa_id, tipo_padrao_sem_descricao: true }, null, 50
      );
      for (const outro of marcados.filter(t => t.id !== tipo.id)) {
        await base44.asServiceRole.entities.TipoEmprestimo.update(outro.id, { tipo_padrao_sem_descricao: false });
      }
      if (!tipo.tipo_padrao_sem_descricao) {
        await base44.asServiceRole.entities.TipoEmprestimo.update(tipo.id, { tipo_padrao_sem_descricao: true });
      }
    } else {
      const chave = chaveAlias(origem, descricao);
      if (!chave) {
        return Response.json({ success: false, error: 'A descrição desta pendência está vazia.' });
      }

      const tipos = await base44.asServiceRole.entities.TipoEmprestimo.filter(
        { empresa_id: pendencia.empresa_id }, null, 500
      );
      const conflito = tipos.find(t => t.id !== tipo.id && chavesDoTipo(t).has(chave));
      if (conflito) {
        return Response.json({
          success: false,
          error: `A descrição "${descricao}" já está vinculada ao tipo "${conflito.nome}"${origemChave ? ` para a origem ${origem}` : ''}. Desvincule antes de apontar para outro tipo.`,
        });
      }

      const porOrigem = !!origemChave;
      const campo = porOrigem ? 'aliases_por_origem' : 'aliases_importacao';
      const atuais = (porOrigem ? tipo.aliases_por_origem : tipo.aliases_importacao) || [];
      const jaExiste = atuais.some(a => (porOrigem ? normalizarDescricaoTipo(a) === chave : chaveAlias('', a) === chave));

      if (!jaExiste) {
        await base44.asServiceRole.entities.TipoEmprestimo.update(tipo.id, {
          [campo]: [...atuais, porOrigem ? chave : descricao],
        });
      }
      aliasSalvo = porOrigem ? chave : descricao;
    }

    // ── 2. Reprocessar os registros envolvidos na pendência ─────────────────
    let registros = [];
    try { registros = pendencia.registros_json ? JSON.parse(pendencia.registros_json) : []; } catch { registros = []; }

    const propostaIds = [...new Set(registros.map(r => r?.proposta_id).filter(Boolean))];
    const recebimentoIds = [...new Set(registros.map(r => r?.recebimento_id).filter(Boolean))];
    const falhas = new Set();

    for (let i = 0; i < propostaIds.length; i += TAMANHO_LOTE) {
      const lote = propostaIds.slice(i, i + TAMANHO_LOTE);
      try {
        await base44.asServiceRole.entities.Proposta.bulkUpdate(
          lote.map(id => ({ id, emprestimo_tipo: tipo.slug, pendente_vinculacao_tipo: false }))
        );
      } catch (e) {
        lote.forEach(id => falhas.add(id));
      }
    }

    // O recebimento guarda apenas o reconhecimento do tipo — valores financeiros não são alterados
    for (let i = 0; i < recebimentoIds.length; i += TAMANHO_LOTE) {
      const lote = recebimentoIds.slice(i, i + TAMANHO_LOTE);
      try {
        await base44.asServiceRole.entities.RecebimentoComissao.bulkUpdate(
          lote.map(id => ({ id, tipo_emprestimo_slug: tipo.slug }))
        );
      } catch (e) {
        // O tipo da proposta é a fonte para as telas; falha aqui não bloqueia a vinculação
      }
    }

    const restantes = registros.filter(r => r?.proposta_id && falhas.has(r.proposta_id));
    const atualizados = registros.length - restantes.length;

    // ── 3. Histórico da vinculação e status da pendência ────────────────────
    const vinculacao = {
      tipo_id: tipo.id,
      tipo_nome: tipo.nome,
      tipo_slug: tipo.slug,
      alias_salvo: aliasSalvo,
      vinculado_por_id: user.id,
      vinculado_por_nome: user.full_name || user.nome_perfil || user.email || '',
      vinculado_em: new Date().toISOString(),
    };

    if (restantes.length > 0) {
      // Falha parcial: o que não foi atualizado continua pendente de vinculação
      await base44.asServiceRole.entities.PendenciaVinculacaoTipo.update(pendencia.id, {
        ...vinculacao,
        status: 'pendente',
        quantidade: restantes.length,
        registros_json: JSON.stringify(restantes),
        registros_falha_json: JSON.stringify([...falhas]),
      });
    } else {
      await base44.asServiceRole.entities.PendenciaVinculacaoTipo.update(pendencia.id, {
        ...vinculacao,
        status: 'resolvida',
        registros_falha_json: null,
      });
    }

    return Response.json({
      success: true,
      atualizados,
      falhas: restantes.length,
      pendencia_resolvida: restantes.length === 0,
      tipo_nome: tipo.nome,
      alias_salvo: aliasSalvo,
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});