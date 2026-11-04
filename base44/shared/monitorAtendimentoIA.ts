import { processarQualificadorTesteIA, EMPRESA_TESTE_IA, CONEXAO_TESTE_IA, parseIA, telefoneTesteIA } from './agentesTesteIA.ts';
import { ORIGENS_MEMORIA_TESTE_IA, origemMemoriaTesteIA } from './escopoTesteIA.ts';
import { encaminharFalhaIA } from './handoffIA.ts';
export async function monitorarAtendimentoTesteIA(db: any) {
  const resultados = [];
  for (const origem of ORIGENS_MEMORIA_TESTE_IA) resultados.push(await monitorarMemoria(db, origem));
  return { resultados };
}
async function monitorarMemoria(db: any, origem: string) {
  const memorias = await db.AgenteIARegistro.filter({ empresa_id:EMPRESA_TESTE_IA,tipo:'memoria',origem },'-updated_date',1);
  let mem = memorias[0], md = parseIA(mem);
  if (!mem || md.parar_contato || !md.conversa_id) return { ignorado:'pausado_ou_sem_conversa' };
  const c = await db.ConversaWhatsapp.get(md.conversa_id);
  if (c.empresa_id !== EMPRESA_TESTE_IA || c.connection_id !== CONEXAO_TESTE_IA || !telefoneTesteIA(c.cliente_telefone) || origemMemoriaTesteIA(c.cliente_telefone) !== origem ||
    c.bloqueado || ['encerrada','encerrado','finalizado'].includes(c.status)) return { ignorado:'fora_do_teste' };
  const reaberturaPendente = Boolean(c.ia_sessao_id && md.coordenador?.reabertura_sessao !== c.ia_sessao_id);
  if (md.coordenador?.pausado_humano && !reaberturaPendente) return { ignorado:'pausado_ou_sem_conversa' };
  const agentes = await db.AgenteIARegistro.filter({ empresa_id:EMPRESA_TESTE_IA,tipo:'agente' },'-updated_date',50);
  const papel = reaberturaPendente ? 'qualificador' : md.coordenador?.responsavel === 'follow_up' ? md.coordenador.retorno || 'vendedor' : md.coordenador?.responsavel;
  const agente = agentes.find((a: any) => { const d=parseIA(a);return d.papel===papel && d.ativo===true && d.modo==='teste' && d.connection_id===CONEXAO_TESTE_IA; });
  if (!agente) return { ignorado:'agente_desativado' };
  const ultimas = await db.MensagemWhatsapp.filter({ empresa_id:EMPRESA_TESTE_IA,conversa_id:c.id },'-data_envio',1);
  const mensagem = ultimas[0];
  if (!mensagem || mensagem.remetente !== 'cliente' || Date.parse(mensagem.data_envio) < Date.parse(md.coordenador.inicio)) return { ignorado:'sem_cliente_aguardando' };
  if (md.retomada_mensagem_id === mensagem.id) {
    // Autorização de uma tentativa para o evento exato. Consumir antes de qualquer efeito externo.
    await db.AgenteIARegistro.update(mem.id, { versao:Number(mem.versao||0)+1,
      dados_json:JSON.stringify({...md,retomada_mensagem_id:null,retomada_consumida_em:new Date().toISOString()}) });
    const connection = await db.WhatsappConnection.get(CONEXAO_TESTE_IA);
    const resultado = await processarQualificadorTesteIA(db,connection,c,mensagem);
    if (resultado?.enviado) return { retomado:true,resultado };
    return { retomada_iniciada:true, resultado:resultado || null };
  }
  if (md.retomada_consumida_em && Date.now() - Date.parse(md.retomada_consumida_em) < 120000) return { ignorado:'retomada_em_andamento' };
  if (Date.now() - Date.parse(mensagem.data_envio) < 120000) return { ignorado:'dentro_do_prazo' };
  return encaminharFalhaIA(db,c.id,mensagem.id,'IA não respondeu à mensagem do cliente em até 2 minutos.');
}
