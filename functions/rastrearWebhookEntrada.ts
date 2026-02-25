import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Função para registrar TUDO que chega no webhook
Deno.serve(async (req) => {
  const timestamp = new Date().toISOString();
  const rastreamento = {
    timestamp,
    url: req.url,
    metodo: req.method,
    headers: Object.fromEntries(req.headers),
    etapas: []
  };

  try {
    // ETAPA 1: Receber o body
    rastreamento.etapas.push({
      numero: 1,
      nome: 'Receber body',
      status: 'iniciando'
    });

    const rawBody = await req.text();
    rastreamento.etapas[0].status = 'completo';
    rastreamento.etapas[0].tamanho_bytes = rawBody.length;
    rastreamento.etapas[0].primeiros_100_chars = rawBody.substring(0, 100);

    // ETAPA 2: Parsear JSON
    rastreamento.etapas.push({
      numero: 2,
      nome: 'Parsear JSON',
      status: 'iniciando'
    });

    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
      rastreamento.etapas[1].status = 'completo';
      rastreamento.etapas[1].keys = Object.keys(payload);
    } catch (err) {
      rastreamento.etapas[1].status = 'erro';
      rastreamento.etapas[1].erro = err.message;
      
      // Tentar Base64
      try {
        const decoded = atob(rawBody.trim());
        payload = JSON.parse(decoded);
        rastreamento.etapas[1].status = 'completo_base64';
        rastreamento.etapas[1].keys = Object.keys(payload);
      } catch (e2) {
        rastreamento.etapas[1].erro_base64 = e2.message;
      }
    }

    // ETAPA 3: Extrair informações
    rastreamento.etapas.push({
      numero: 3,
      nome: 'Extrair informações',
      status: 'completo',
      event: payload.event,
      instance: payload.instance,
      has_data: !!payload.data,
      data_type: typeof payload.data,
      data_keys: payload.data ? Object.keys(payload.data || {}) : []
    });

    // ETAPA 4: Conectar ao Base44
    rastreamento.etapas.push({
      numero: 4,
      nome: 'Conectar Base44',
      status: 'iniciando'
    });

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    rastreamento.etapas[3].status = 'completo';
    rastreamento.etapas[3].usuario_id = user?.id;
    rastreamento.etapas[3].empresa_id = user?.empresa_id;

    // ETAPA 5: Registrar no banco
    rastreamento.etapas.push({
      numero: 5,
      nome: 'Registrar rastreamento',
      status: 'iniciando'
    });

    const registroRastreamento = await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
      empresa_id: user?.empresa_id || '',
      tipo_evento: 'rastreamento_webhook',
      status: 'sucesso',
      conteudo: JSON.stringify(rastreamento),
      instancia: payload.instance || 'desconhecida',
      timestamp
    });

    rastreamento.etapas[4].status = 'completo';
    rastreamento.etapas[4].registro_id = registroRastreamento.id;

    return Response.json({
      sucesso: true,
      rastreamento,
      proximo_passo: 'Verifique em Diagnóstico > Logs > Tipo Evento = rastreamento_webhook'
    });

  } catch (error) {
    rastreamento.etapas.push({
      numero: 999,
      nome: 'Erro crítico',
      status: 'erro',
      mensagem: error.message,
      stack: error.stack
    });

    // Tentar registrar erro mesmo assim
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.LogRecebimentoWebhook.create({
        empresa_id: '',
        tipo_evento: 'erro_rastreamento',
        status: 'erro',
        conteudo: JSON.stringify(rastreamento),
        mensagem_erro: error.message,
        timestamp
      });
    } catch (_) {}

    return Response.json(rastreamento, { status: 500 });
  }
});