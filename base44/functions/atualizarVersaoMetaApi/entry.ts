import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Versões da Graph API para testar (da mais recente para a mais antiga)
const VERSAOES_TESTAR = ['v23.0', 'v22.0', 'v21.0', 'v20.0'];

Deno.serve(async (req) => {
  console.log('🔄 ATUALIZAR VERSÃO META API');
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    
    const isAdmin = user.role === 'admin' || user.perfil === 'admin' || user.perfil === 'super_admin' || user.perfil === 'master';
    if (!isAdmin) return Response.json({ error: 'Apenas administradores' }, { status: 403 });

    // Buscar todas as empresas com Meta configurado
    const empresas = await base44.asServiceRole.entities.Empresa.filter({
      whatsapp_phone_number_id: { $ne: null },
      whatsapp_access_token: { $ne: null }
    }, '-updated_date', 50);

    console.log(`📋 ${empresas.length} empresas com Meta configurado`);

    if (empresas.length === 0) {
      return Response.json({ success: true, message: 'Nenhuma empresa com Meta configurado encontrada', empresas_verificadas: 0 });
    }

    const resultados = [];
    
    for (const empresa of empresas) {
      const token = empresa.whatsapp_access_token;
      const phoneId = empresa.whatsapp_phone_number_id;
      
      if (!token || !phoneId) {
        resultados.push({ empresa: empresa.nome, id: empresa.id, status: 'sem_credenciais' });
        continue;
      }

      console.log(`\n🏢 Testando empresa: ${empresa.nome} (${empresa.id})`);
      console.log(`   Phone ID: ${phoneId}`);
      console.log(`   Token: ${token.substring(0, 15)}...`);

      // Testar cada versão até encontrar uma que funcione
      let versaoFuncional = null;
      let erros = [];

      for (const versao of VERSAOES_TESTAR) {
        const url = `https://graph.facebook.com/${versao}/${phoneId}/messages`;
        console.log(`   🔍 Testando ${versao}...`);

        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: '5511999999999', // número de teste que não receberá a msg
              type: 'text',
              text: { body: 'test' }
            })
          });

          const text = await resp.text();
          console.log(`   📥 ${versao} → status ${resp.status}: ${text.substring(0, 200)}`);

          if (resp.status === 200 || resp.status === 201) {
            // Sucesso — esta versão funciona (mesmo que número seja inválido, retornaria 200)
            // Mas também verificar se erro é apenas de número (não de API)
            try {
              const data = JSON.parse(text);
              if (data.messages?.[0]?.id || data.error?.code === 100) {
                // 100 = invalid recipient — API funcionou, só o número que é inválido
                versaoFuncional = versao;
                console.log(`   ✅ ${versao} FUNCIONAL!`);
                break;
              }
            } catch (_) {}
            
            // Verificar se o erro é de versão ou de autenticação
            const isVersionError = text.includes('unsupported') || text.includes('deprecated') || text.includes('version');
            const isAuthError = resp.status === 401 || text.includes('access token') || text.includes('OAuth');
            
            if (!isVersionError && !isAuthError) {
              // Resposta OK da API mas com outro erro (ex: número inválido)
              // Vamos considerar funcional se não for erro de versão/token
              versaoFuncional = versao;
              console.log(`   ⚠️ ${versao} respondeu (erro não relacionado à versão)`);
              break;
            } else {
              erros.push({ versao, status: resp.status, erro: text.substring(0, 200) });
            }
          } else {
            erros.push({ versao, status: resp.status, erro: text.substring(0, 200) });
          }
        } catch (e) {
          erros.push({ versao, erro: e.message });
          console.log(`   ❌ ${versao} → erro de rede: ${e.message}`);
        }
      }

      if (versaoFuncional) {
        // Salvar versão funcional na ConfiguracaoSistema
        const chave = `meta_api_versao_${empresa.id}`;
        
        // Verificar se já existe
        const existentes = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({ chave, empresa_id: empresa.id });
        
        if (existentes.length > 0) {
          await base44.asServiceRole.entities.ConfiguracaoSistema.update(existentes[0].id, {
            valor: versaoFuncional,
            descricao: `Versão da Graph API Meta detectada automaticamente em ${new Date().toISOString()}`
          });
        } else {
          await base44.asServiceRole.entities.ConfiguracaoSistema.create({
            chave,
            valor: versaoFuncional,
            descricao: `Versão da Graph API Meta detectada automaticamente em ${new Date().toISOString()}`,
            empresa_id: empresa.id
          });
        }

        // Atualizar também no campo da empresa para compatibilidade
        try {
          await base44.asServiceRole.entities.Empresa.update(empresa.id, {
            whatsapp_token_atualizado_em: new Date().toISOString()
          });
        } catch (_) {}

        console.log(`   💾 Versão ${versaoFuncional} salva para ${empresa.nome}`);
        resultados.push({
          empresa: empresa.nome,
          id: empresa.id,
          status: 'atualizado',
          versao_anterior: 'v21.0 (hardcoded)',
          versao_nova: versaoFuncional
        });
      } else {
        console.log(`   ❌ NENHUMA versão funcionou para ${empresa.nome}`);
        console.log(`   Erros:`, JSON.stringify(erros));
        resultados.push({
          empresa: empresa.nome,
          id: empresa.id,
          status: 'erro',
          erros
        });
      }
    }

    // Salvar resumo global
    const resumo = {
      total: empresas.length,
      atualizadas: resultados.filter(r => r.status === 'atualizado').length,
      erros: resultados.filter(r => r.status === 'erro').length,
      detalhes: resultados
    };

    // Salvar no LogVersaoWhatsApp
    await base44.asServiceRole.entities.LogVersaoWhatsApp.create({
      acao: 'atualizacao_automatica',
      versao_nova: resultados.find(r => r.status === 'atualizado')?.versao_nova || 'nenhuma',
      sucesso: resumo.atualizadas > 0,
      detalhes: JSON.stringify(resumo),
      empresa_id: null
    });

    console.log('\n📊 RESUMO:', JSON.stringify(resumo, null, 2));

    return Response.json({ success: true, resumo });

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});