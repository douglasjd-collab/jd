/**
 * Verifica a versão atual do WhatsApp Web disponível e compara com a configurada.
 * Busca de múltiplas fontes para garantir disponibilidade.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { empresa_id, salvar_log = true } = payload;

    const empresaId = empresa_id || user.empresa_id;

    // Buscar empresa para obter credenciais Evolution
    let empresa = null;
    let evolutionUrl = null;
    let evolutionApiKey = null;
    let versaoConfigurada = null;

    if (empresaId) {
      try {
        empresa = await base44.asServiceRole.entities.Empresa.get(empresaId);
        evolutionUrl = empresa?.evolution_url;
        evolutionApiKey = empresa?.evolution_api_key;
      } catch (_) {}
    }

    // Fallback para variáveis de ambiente
    if (!evolutionUrl) evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    if (!evolutionApiKey) evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    // 1. Buscar versão mais recente do WhatsApp Web
    let versaoMaisRecente = null;
    let fonteVersao = null;
    const errosVersao = [];

    // Fonte 1: wppconnect.io
    try {
      const resp = await fetch('https://wppconnect.io/whatsapp-versions/', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CRM-Bot/1.0)' },
        signal: AbortSignal.timeout(10000)
      });
      if (resp.ok) {
        const html = await resp.text();
        // Extrair versão do HTML - formato típico: 2.3000.XX ou similar
        const matches = html.match(/(\d+\.\d+\.\d+[\.\d]*)/g);
        if (matches && matches.length > 0) {
          // Filtrar versões do WhatsApp (geralmente 2.xxxx.xx)
          const versoes = matches.filter(v => v.startsWith('2.') && v.split('.').length >= 3);
          if (versoes.length > 0) {
            // Ordenar e pegar a mais recente
            versoes.sort((a, b) => {
              const partsA = a.split('.').map(Number);
              const partsB = b.split('.').map(Number);
              for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const diff = (partsB[i] || 0) - (partsA[i] || 0);
                if (diff !== 0) return diff;
              }
              return 0;
            });
            versaoMaisRecente = versoes[0];
            fonteVersao = 'wppconnect.io';
          }
        }
      }
    } catch (e) {
      errosVersao.push(`wppconnect.io: ${e.message}`);
    }

    // Fonte 2: GitHub WhatsApp Web releases (fallback)
    if (!versaoMaisRecente) {
      try {
        const resp = await fetch('https://raw.githubusercontent.com/nicekiwi/whatsapp-web-versions/main/versions.json', {
          signal: AbortSignal.timeout(8000)
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data) && data.length > 0) {
            versaoMaisRecente = data[data.length - 1];
            fonteVersao = 'github/whatsapp-versions';
          }
        }
      } catch (e) {
        errosVersao.push(`github/whatsapp-versions: ${e.message}`);
      }
    }

    // Fonte 3: Consultar Evolution API pela versão configurada
    let statusInstancias = [];
    let evolutionOnline = false;
    let versaoAtualEvolution = null;

    if (evolutionUrl && evolutionApiKey) {
      const baseUrl = evolutionUrl.replace(/\/$/, '');
      
      // Verificar status geral da Evolution
      try {
        const resp = await fetch(`${baseUrl}/`, {
          headers: { 'apikey': evolutionApiKey },
          signal: AbortSignal.timeout(8000)
        });
        evolutionOnline = resp.ok || resp.status === 200 || resp.status === 404;
      } catch (_) {
        evolutionOnline = false;
      }

      // Buscar instâncias e seus status
      try {
        const resp = await fetch(`${baseUrl}/instance/fetchInstances`, {
          headers: { 'apikey': evolutionApiKey },
          signal: AbortSignal.timeout(10000)
        });
        if (resp.ok) {
          const data = await resp.json();
          const instancias = Array.isArray(data) ? data : (data.instances || []);
          statusInstancias = instancias.map(inst => ({
            nome: inst.instance?.instanceName || inst.name || inst.instanceName,
            status: inst.instance?.status || inst.status || inst.state || 'unknown',
            conectado: ['open', 'connected', 'CONNECTED'].includes(inst.instance?.status || inst.status || inst.state || '')
          }));
        }
      } catch (e) {
        console.warn('Erro ao buscar instâncias:', e.message);
      }
    }

    // Buscar versão configurada atualmente (no banco de dados da empresa)
    try {
      const configs = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
        chave: 'whatsapp_versao_configurada'
      });
      if (configs.length > 0) {
        versaoConfigurada = configs[0].valor;
      }
    } catch (_) {}

    // Verificar se há instâncias desconectadas
    const instanciasDesconectadas = statusInstancias.filter(i => !i.conectado);
    const todasConectadas = statusInstancias.length > 0 && instanciasDesconectadas.length === 0;
    const precisaAtualizacao = versaoMaisRecente && versaoConfigurada && versaoMaisRecente !== versaoConfigurada;

    // Salvar log se solicitado
    if (salvar_log) {
      try {
        await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
          empresa_id: empresaId || null,
          versao_anterior: versaoConfigurada,
          versao_nova: versaoMaisRecente,
          versao_atual_evolution: versaoAtualEvolution,
          status_antes: JSON.stringify({
            evolution_online: evolutionOnline,
            instancias: statusInstancias,
            total: statusInstancias.length,
            desconectadas: instanciasDesconectadas.length
          }),
          acao: 'verificacao',
          sucesso: true,
          detalhes: `Fonte: ${fonteVersao || 'nenhuma'}. Instâncias: ${statusInstancias.length} total, ${instanciasDesconectadas.length} desconectadas.`
        });
      } catch (_) {}
    }

    return Response.json({
      success: true,
      versao_mais_recente: versaoMaisRecente,
      versao_configurada: versaoConfigurada,
      fonte_versao: fonteVersao,
      precisa_atualizacao: precisaAtualizacao,
      evolution_online: evolutionOnline,
      instancias: statusInstancias,
      total_instancias: statusInstancias.length,
      instancias_desconectadas: instanciasDesconectadas.length,
      todas_conectadas: todasConectadas,
      erros_busca_versao: errosVersao,
      verificado_em: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro ao verificar versão WhatsApp:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});