/**
 * Módulo compartilhado para controle de consumo, idempotência e travas contra execução simultânea.
 *
 * Usado por todas as funções backend que consomem créditos de integração.
 * Registra cada execução em ConsumoIntegracaoLog (operação de entidade — gratuita,
 * não consome créditos de integração).
 *
 * Funcionalidades:
 * 1. registrarConsumo — loga cada execução (função, origem, resultado, duração, integrações)
 * 2. obterTrava — trava contra execução simultânea da mesma rotina (lock por campo em ConfiguracaoSistema)
 * 3. liberarTrava — libera a trava
 * 4. jaProcessado — verifica idempotência por evento_id
 * 5. marcarProcessado — marca evento como processado
 * 6. ehErroDefinitivo — classifica erros que não devem ser retentados
 */

const TRAVA_PREFIX = 'trava_';
const DEDUP_PREFIX = 'dedup_';
const TRAVA_TTL_MINUTOS = 10; // trava expira automaticamente em 10 min

/**
 * Registra uma execução no ConsumoIntegracaoLog.
 * Não lança erro — falha silenciosamente para não impactar o fluxo principal.
 */
export async function registrarConsumo(base44, dados: {
  funcao_nome: string;
  origem: 'webhook' | 'usuario' | 'automacao' | 'sistema';
  resultado: 'util' | 'vazio' | 'erro' | 'pulado';
  empresa_id?: string;
  registros_encontrados?: number;
  registros_processados?: number;
  duracao_ms?: number;
  tentativa?: number;
  evento_id?: string;
  motivo?: string;
  integracoes_feitas?: number;
}) {
  try {
    await base44.asServiceRole.entities.ConsumoIntegracaoLog.create({
      funcao_nome: dados.funcao_nome,
      origem: dados.origem,
      resultado: dados.resultado,
      empresa_id: dados.empresa_id || '',
      registros_encontrados: dados.registros_encontrados || 0,
      registros_processados: dados.registros_processados || 0,
      duracao_ms: dados.duracao_ms || 0,
      tentativa: dados.tentativa || 1,
      evento_id: dados.evento_id || '',
      motivo: (dados.motivo || '').substring(0, 500),
      integracoes_feitas: dados.integracoes_feitas || 0,
    });
  } catch (e) {
    // Falha silenciosa — o log não pode impactar o fluxo principal
    console.warn('Aviso: não foi possível registrar consumo:', e.message);
  }
}

/**
 * Tenta obter uma trava contra execução simultânea.
 * Usa ConfiguracaoSistema com chave `trava_<nomeRotina>`.
 * Retorna true se conseguiu a trava, false se já está travada.
 */
export async function obterTrava(base44, nomeRotina: string, ttlMinutos = TRAVA_TTL_MINUTOS): Promise<boolean> {
  try {
    const chave = `${TRAVA_PREFIX}${nomeRotina}`;
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + ttlMinutos * 60 * 1000).toISOString();

    // Verificar trava existente
    const existentes = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave });
    if (existentes && existentes.length > 0) {
      const trava = existentes[0];
      const valor = JSON.parse(trava.valor || '{}');
      const dataTrava = valor.travada_em ? new Date(valor.travada_em) : null;

      // Se a trava ainda é válida, não permite
      if (dataTrava && (agora.getTime() - dataTrava.getTime()) < ttlMinutos * 60 * 1000) {
        return false;
      }

      // Trava expirada — sobrescrever
      await base44.asServiceRole.entities.ConfiguracaoSistema.update(trava.id, {
        valor: JSON.stringify({ travada_em: agora.toISOString(), expira_em: expiraEm }),
      });
      return true;
    }

    // Criar nova trava
    await base44.asServiceRole.entities.ConfiguracaoSistema.create({
      chave,
      valor: JSON.stringify({ travada_em: agora.toISOString(), expira_em: expiraEm }),
      descricao: `Trava de execução para ${nomeRotina}`,
    });
    return true;
  } catch (e) {
    // Se não conseguir verificar a trava, permite a execução (fail-open)
    // para não bloquear funções essenciais
    console.warn(`Aviso: erro ao obter trava ${nomeRotina}:`, e.message);
    return true;
  }
}

/**
 * Libera a trava de execução.
 */
export async function liberarTrava(base44, nomeRotina: string): Promise<void> {
  try {
    const chave = `${TRAVA_PREFIX}${nomeRotina}`;
    const existentes = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave });
    if (existentes && existentes.length > 0) {
      await base44.asServiceRole.entities.ConfiguracaoSistema.update(existentes[0].id, {
        valor: JSON.stringify({ travada_em: null, expira_em: null, liberada_em: new Date().toISOString() }),
      });
    }
  } catch (e) {
    console.warn(`Aviso: erro ao liberar trava ${nomeRotina}:`, e.message);
  }
}

/**
 * Verifica se um evento já foi processado (idempotência).
 * Usa ConfiguracaoSistema com chave `dedup_<funcao>_<eventoId>`.
 */
export async function jaProcessado(base44, funcaoNome: string, eventoId: string): Promise<boolean> {
  if (!eventoId) return false;
  try {
    const chave = `${DEDUP_PREFIX}${funcaoNome}_${eventoId}`;
    const existentes = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave });
    return !!(existentes && existentes.length > 0);
  } catch (e) {
    return false;
  }
}

/**
 * Marca um evento como processado para idempotência.
 * O registro expira em 7 dias (limpeza manual ou por rotina de manutenção).
 */
export async function marcarProcessado(base44, funcaoNome: string, eventoId: string): Promise<void> {
  if (!eventoId) return;
  try {
    const chave = `${DEDUP_PREFIX}${funcaoNome}_${eventoId}`;
    const expiraEm = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await base44.asServiceRole.entities.ConfiguracaoSistema.create({
      chave,
      valor: JSON.stringify({ processado_em: new Date().toISOString(), expira_em: expiraEm }),
      descricao: `Deduplicação de ${funcaoNome}`,
    });
  } catch (e) {
    // Se a chave já existe (erro de duplicação), ignora
  }
}

/**
 * Classifica erros como definitivos (não devem ser retentados).
 * Retorna true para: credencial inválida, número incorreto, conteúdo incompatível, etc.
 */
export function ehErroDefinitivo(erro: string): boolean {
  if (!erro) return false;
  const msg = String(erro).toLowerCase();
  const errosDefinitivos = [
    'invalid api key',
    'unauthorized',
    'forbidden',
    'invalid credentials',
    'access token',
    'oauth',
    'invalid phone number',
    'invalid recipient',
    'recipient not found',
    'numero invalido',
    'não suportado',
    'not supported',
    'incompatible',
    'not found',
    '404',
    '401',
    '403',
    'schema validation',
    'validation error',
    'payload too large',
    'media type not supported',
    'unsupported media',
  ];
  return errosDefinitivos.some(e => msg.includes(e));
}

/**
 * Calcula o intervalo de backoff progressivo para retentativas.
 * Tentativa 1 → 1 min, 2 → 5 min, 3 → 15 min, 4+ → 60 min.
 * Máximo de 4 tentativas.
 */
export function calcularBackoff(tentativa: number): number {
  if (tentativa <= 1) return 60 * 1000;        // 1 min
  if (tentativa === 2) return 5 * 60 * 1000;    // 5 min
  if (tentativa === 3) return 15 * 60 * 1000;  // 15 min
  return 60 * 60 * 1000;                         // 60 min
}

export const MAX_TENTATIVAS = 4;