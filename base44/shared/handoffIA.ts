import { telefoneTesteIA, origemMemoriaTesteIA } from './escopoTesteIA.ts';
import { camposAtendimentoIA } from './atendimentoIA.ts';
const EMPRESA = '699696c2c9f5bffc2e67402b', CONEXAO = '6a406c5e86664cdaac6f95cb';
export async function encaminharFalhaIA(db: any, conversaId: string, mensagemId: string, motivo: string) {
  const c = await db.ConversaWhatsapp.get(conversaId);
  if (c.empresa_id !== EMPRESA || c.connection_id !== CONEXAO || c.bloqueado ||
    !telefoneTesteIA(c.cliente_telefone) ||
    ['encerrada','encerrado','finalizado'].includes(c.status)) return { encaminhado: false };
  const ultimas = await db.MensagemWhatsapp.filter({ empresa_id: EMPRESA, conversa_id: c.id }, '-data_envio', 1);
  // Não assumir uma conversa que já teve resposta ou mudou enquanto a geração falhava.
  if (ultimas[0]?.id !== mensagemId || ultimas[0]?.remetente !== 'cliente') return { encaminhado: false, motivo: 'conversa_alterada' };
  const origem = 'ia-handoff:' + mensagemId;
  const ja = await db.AgenteIARegistro.filter({ empresa_id: EMPRESA, tipo:'historico', origem }, '-created_date', 1);
  if (ja.length) return { encaminhado: true, repetido: true };
  const memorias = await db.AgenteIARegistro.filter({ empresa_id: EMPRESA, tipo:'memoria', origem:origemMemoriaTesteIA(c.cliente_telefone) }, '-updated_date', 1);
  const mem = memorias[0];
  let md: any = {}; try { md = JSON.parse(mem?.dados_json || '{}'); } catch {}
  if (md.parar_contato) return { encaminhado: false, motivo: 'contato_interrompido' };
  if (mem) await db.AgenteIARegistro.update(mem.id, { versao: Number(mem.versao || 0) + 1,
    dados_json: JSON.stringify({ ...md, retomada_mensagem_id: null, transferir: true, coordenador: {
      ...md.coordenador, responsavel:'humano', retorno:'humano', pausado_humano:true, aguardando_resposta:false,
      motivo_handoff:motivo, handoff_em:new Date().toISOString() } }) });
  let destino: any = null;
  if (c.responsavel_id) {
    const colab = await db.Colaborador.get(c.responsavel_id).catch(() => null);
    if (colab?.empresa_id === EMPRESA && colab.status === 'ativo') destino = colab;
  }
  const agora = new Date().toISOString();
  await db.ConversaWhatsapp.update(c.id, { ...camposAtendimentoIA(null), ia_aguardando_humano:true,
    ia_motivo_handoff:motivo, ia_handoff_em:agora,
    responsavel_id:destino?.id || null, responsavel_nome:destino?.nome || null,
    responsavel_expira_em:destino ? new Date(Date.now()+3600000).toISOString() : null,
    atendimento_prioritario:true });
  const alertas = await db.AtendimentoAlerta.filter({ empresa_id:EMPRESA, conversa_id:c.id }, '-updated_date',1);
  const alerta = { empresa_id:EMPRESA, conversa_id:c.id, connection_id:CONEXAO, cliente_nome:c.cliente_nome || 'Contato de teste',
    cliente_telefone:c.cliente_telefone, aguardando_desde:ultimas[0].data_envio, alerta_adiado_ate:null,
    status_conversa:c.status, atualizado_em:agora };
  if (alertas[0]) await db.AtendimentoAlerta.update(alertas[0].id,alerta); else await db.AtendimentoAlerta.create(alerta);
  await db.AgenteIARegistro.create({ empresa_id:EMPRESA,tipo:'historico',titulo:'IA sem resposta — atendimento humano',
    origem,status:'aprovado',conteudo:motivo + (destino ? ' Responsável: ' + destino.nome + '.' : ' Disponível na fila para a equipe assumir.'),
    dados_json:JSON.stringify({ conversa_id:c.id,mensagem_id:mensagemId,destino_colaborador_id:destino?.id || null,etapa:'encaminhado_humano' }) });
  return { encaminhado:true, destino:destino?.nome || 'fila_humana' };
}
