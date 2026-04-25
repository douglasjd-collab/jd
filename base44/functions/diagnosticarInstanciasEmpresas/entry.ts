import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Buscar todas as empresas com instância configurada
    const todasEmpresas = await base44.asServiceRole.entities.Empresa.list('-created_date', 100);

    const resultado = [];

    for (const emp of todasEmpresas) {
      const instancia = emp.evolution_instance_name || '';
      const url = emp.evolution_url || '';
      const apiKey = emp.evolution_api_key || '';

      const info = {
        empresa_id: emp.id,
        empresa_nome: emp.nome,
        instancia_configurada: instancia || '❌ NÃO CONFIGURADA',
        url_configurada: url || '❌ NÃO CONFIGURADA',
        api_key_configurada: apiKey ? '✅ SIM' : '❌ NÃO',
        webhook_correto: instancia
          ? `https://app--waze-crm.base44.app/api/apps/6950a9860c8af0e2ff10fc9e/functions/receberWebhookWhatsApp?instance=${encodeURIComponent(instancia)}`
          : '⚠️ Configure a instância primeiro',
        status_evolution: '—',
        webhook_evolution_atual: '—',
      };

      // Verificar se a instância está conectada e qual webhook está configurado
      if (instancia && url && apiKey) {
        const baseUrl = url.replace(/\/$/, '').replace(/\/manager\/?$/, '');
        try {
          // Verificar status da instância
          const statusResp = await fetch(`${baseUrl}/instance/connectionState/${instancia}`, {
            headers: { 'apikey': apiKey },
          });
          if (statusResp.ok) {
            const statusData = await statusResp.json();
            const state = statusData?.instance?.state || statusData?.state || 'desconhecido';
            info.status_evolution = state === 'open' ? '🟢 CONECTADA' : `🔴 ${state.toUpperCase()}`;
          } else {
            info.status_evolution = `⚠️ Erro ${statusResp.status}`;
          }
        } catch (e) {
          info.status_evolution = `❌ Sem acesso: ${e.message}`;
        }

        try {
          // Verificar webhook configurado na Evolution
          const webhookResp = await fetch(`${baseUrl}/webhook/find/${instancia}`, {
            headers: { 'apikey': apiKey },
          });
          if (webhookResp.ok) {
            const webhookData = await webhookResp.json();
            const webhookUrl = webhookData?.url || webhookData?.webhook?.url || '—';
            const webhookUrlEsperada = `receberWebhookWhatsApp?instance=${instancia}`;
            const correto = webhookUrl.includes('receberWebhookWhatsApp') && webhookUrl.includes(instancia);
            info.webhook_evolution_atual = webhookUrl;
            info.webhook_correto_no_evolution = correto ? '✅ CORRETO' : `❌ INCORRETO — deveria conter: ?instance=${instancia}`;
          } else {
            info.webhook_evolution_atual = `⚠️ Não foi possível verificar (${webhookResp.status})`;
          }
        } catch (e) {
          info.webhook_evolution_atual = `❌ Erro: ${e.message}`;
        }
      }

      resultado.push(info);
    }

    const empresasComInstancia = resultado.filter(e => e.instancia_configurada !== '❌ NÃO CONFIGURADA');
    const empresasSemInstancia = resultado.filter(e => e.instancia_configurada === '❌ NÃO CONFIGURADA');

    return Response.json({
      total_empresas: todasEmpresas.length,
      com_instancia: empresasComInstancia.length,
      sem_instancia: empresasSemInstancia.length,
      empresas: resultado,
      instrucoes: {
        problema: 'Cada empresa deve ter sua própria instância na Evolution API',
        solucao: [
          '1. Entre na Configuração WhatsApp de cada subconta',
          '2. Preencha: URL da API, Nome da Instância e Chave API',
          '3. O webhook configurado na Evolution deve ser: ...receberWebhookWhatsApp?instance=NOME_DA_INSTANCIA',
          '4. O nome da instância no CRM deve ser EXATAMENTE igual ao nome na Evolution API'
        ]
      }
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});