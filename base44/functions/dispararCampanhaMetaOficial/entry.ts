import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { empresa_id, template_name, template_language = 'pt_BR', variaveis = {}, contatos = [], template_header_type, template_header_url, template_botoes = [], conversa_id, texto_preview, delay_segundos = 5, pausar_apos = 0, duracao_pausa = 60, nome_campanha = '', job_id = '' } = await req.json();

    if (!empresa_id || !template_name || contatos.length === 0) {
      return Response.json({ error: 'empresa_id, template_name e contatos são obrigatórios' }, { status: 400 });
    }

    // ── Carregar conversa quando enviada do BatePapo (template por conversa) ──
    // A conversa é a fonte de verdade: phone_number_id_meta (número que recebeu),
    // connection_id (qual conexão usar no disparo), instancia (session_id D-API).
    let conversaAlvo: any = null;
    if (conversa_id) {
      try {
        conversaAlvo = await base44.asServiceRole.entities.ConversaWhatsapp.get(conversa_id);
        console.log('💬 Conversa carregada — phone_number_id_meta:', conversaAlvo?.phone_number_id_meta, '| connection_id:', conversaAlvo?.connection_id, '| instancia:', conversaAlvo?.instancia);
      } catch (e) {
        console.warn('⚠️ Não foi possível carregar a conversa:', e.message);
      }
    }

    const empresa = await base44.asServiceRole.entities.Empresa.get(empresa_id);
    if (!empresa) return Response.json({ error: 'Empresa não encontrada' }, { status: 404 });

    // 1) phone_number_id da conversa (número específico que recebeu a msg — cada
    //    conversa conhece a conexção/phone_number_id que a_originou no webhook).
    // 2) Credenciais da empresa (multi-tenant) — entidade Empresa (fallback).
    // 3) Fallback: app secrets (META_WHATSAPP_ACCESS_TOKEN / META_PHONE_NUMBER_ID).
    // Estas credenciais só são obrigatórias quando a conversa NÃO usa D-API Cloud.
    // A validação é feita mais abaixo, após a detecção da conexão D-API.
    const accessToken = empresa.whatsapp_access_token || Deno.env.get('META_WHATSAPP_ACCESS_TOKEN') || '';
    const phoneNumberId =
      conversaAlvo?.phone_number_id_meta ||
      empresa.whatsapp_phone_number_id ||
      Deno.env.get('META_PHONE_NUMBER_ID') || '';

    // Versão dinâmica da API Meta
    let metaApiVersion = 'v23.0';
    try {
      const configsVersao = await base44.asServiceRole.entities.ConfiguracaoSistema.filter({
        chave: `meta_api_versao_${empresa_id}`,
        empresa_id
      }, '-created_date', 1);
      if (configsVersao?.length > 0 && configsVersao[0].valor) {
        metaApiVersion = configsVersao[0].valor;
      }
    } catch (_) {}

    const metaUrl = `https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/messages`;

    let enviados = 0;
    let erros = 0;
    const resultados = [];

    // ── Detectar conexão D-API Cloud ativa ──
    // Ordem de prioridade (fonte de verdade = a conversa):
    //   1) connection_id salvo na conversa — cada conversa sabe qual conexão
    //      recebeu a mensagem; nunca cair para uma conexão "aleatória" da empresa.
    //   2) instancia (session_id) gravado no inbound da conversa.
    //   3) Fallback apenas para campanhas em massa (sem conversa): qualquer D-API
    //      ativa da empresa, preferindo Cloud API (session_id 'cloud-').
    let conexaoDapi: any = null;
    try {
      if (conversaAlvo?.connection_id) {
        try {
          const conexaoEspecifica = await base44.asServiceRole.entities.WhatsappConnection.get(conversaAlvo.connection_id);
          if (conexaoEspecifica?.is_active && conexaoEspecifica?.provider_type === 'dapi') {
            conexaoDapi = conexaoEspecifica;
            console.log('🟦 [D-API] Conexão da conversa (connection_id):', conexaoDapi.id, conexaoDapi.session_id);
          }
        } catch (_) {}
      }
      if (!conexaoDapi && conversaAlvo?.instancia) {
        const matches = await base44.asServiceRole.entities.WhatsappConnection.filter(
          { empresa_id, provider_type: 'dapi', session_id: conversaAlvo.instancia, is_active: true },
          '-created_date', 1,
        );
        if (matches?.[0]) {
          conexaoDapi = matches[0];
          console.log('🟦 [D-API] Conexão casada pela instancia:', conexaoDapi.id, conexaoDapi.session_id);
        }
      }
      if (!conexaoDapi && !conversaAlvo) {
        // Campanha em massa (sem conversa): qualquer D-API Cloud ativa da empresa.
        const conns = await base44.asServiceRole.entities.WhatsappConnection.filter(
          { empresa_id, provider_type: 'dapi', is_active: true },
          '-created_date', 50,
        );
        conexaoDapi = conns.find(c => /^cloud-/i.test(c.session_id || '')) || conns[0] || null;
        if (conexaoDapi) {
          console.log('🟦 [D-API] Conexão ativa da empresa:', conexaoDapi.session_id);
        }
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar conexão D-API:', e.message);
    }

    // Sem D-API Cloud ativa? Então os disparos vão pela Graph API direta —
    // access_token e phone_number_id se tornam obrigatórios. Informamos
    // EXATAMENTE quais campos estão faltando (não uma mensagem genérica).
    if (!conexaoDapi) {
      const faltantes = [];
      if (!accessToken) faltantes.push('access_token (empresa.whatsapp_access_token ou secret META_WHATSAPP_ACCESS_TOKEN)');
      if (!phoneNumberId) faltantes.push('phone_number_id (conversa.phone_number_id_meta, empresa.whatsapp_phone_number_id ou secret META_PHONE_NUMBER_ID)');
      if (faltantes.length > 0) {
        return Response.json({
          error: `Credenciais Meta ausentes — campos faltando: ${faltantes.join(' | ')}.`,
        }, { status: 400 });
      }
    }

    // Buscar definição do template para obter header type e URL da mídia
    let templateHeaderType = template_header_type || null;
    let templateHeaderUrl = template_header_url || null;
    let templateHeaderText = '';
    let templateBotoes: any[] = Array.isArray(template_botoes) ? template_botoes : [];
    try {
      const defs = await base44.asServiceRole.entities.CampanhaLog.filter({
        empresa_id,
        tipo_campanha: 'meta_template_definition',
      }, '-created_date', 200);
      const def = defs.find(d => {
        try { return JSON.parse(d.motivo_erro || '{}').nome === template_name; } catch { return false; }
      });
      if (def) {
        const parsed = JSON.parse(def.motivo_erro || '{}');
        // Chaves salvas pelo sincronizarTemplatesMeta: tipo_cabecalho e cabecalho_midia_url
        if (!templateHeaderType) templateHeaderType = parsed.tipo_cabecalho || parsed.header_type || null;
        if (!templateHeaderUrl) templateHeaderUrl = parsed.cabecalho_midia_url || parsed.header_url || null;
        templateHeaderText = parsed.cabecalho || '';
        if (Array.isArray(parsed.botoes) && parsed.botoes.length > 0) templateBotoes = parsed.botoes;
        console.log('📋 Template def encontrado — tipo_cabecalho:', templateHeaderType, '| cabecalho_midia_url:', templateHeaderUrl?.substring(0, 80));
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar definição do template:', e.message);
    }

    for (const telefone of contatos) {
      const numeroLimpo = String(telefone).replace(/\D/g, '');
      if (numeroLimpo.length < 10) {
        erros++;
        resultados.push({ telefone, status: 'erro', motivo: 'Número inválido' });
        continue;
      }

      const components = [];

      // ── ENVIO VIA D-API (conexão Cloud API ativa da empresa) ──
      if (conexaoDapi) {
        const headerTypeDapi = (templateHeaderType || '').toUpperCase();
        const urlMidiaDapi = String(templateHeaderUrl || '').trim();
        const isNumericHandleDapi = /^\d{10,}$/.test(urlMidiaDapi);
        const isMetaCdnDapi = /fbcdn\.net|fbsbx\.com|facebook\.com/.test(urlMidiaDapi);
        const urlPublicaDapi = urlMidiaDapi.startsWith('http') && !isNumericHandleDapi && !isMetaCdnDapi;

        const templatePayload: any = {
          name: template_name,
          language: template_language || 'pt_BR',
          bodyVariables: Object.values(variaveis || {}),
        };

        // Header de mídia (URL pública) — D-API monta os components da Graph API
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerTypeDapi) && urlPublicaDapi) {
          templatePayload.headerMedia = { url: urlMidiaDapi };
        } else if (headerTypeDapi === 'TEXT' && templateHeaderText) {
          templatePayload.headerVariable = templateHeaderText;
        }

        try {
          console.log(`🟦 [D-API] Enviando template "${template_name}" para ${numeroLimpo} via session ${conexaoDapi.session_id}`);
          const srResp = await base44.functions.invoke('whatsappService', {
            connectionId: conexaoDapi.id,
            action: 'sendTemplate',
            phoneNumber: numeroLimpo,
            template: templatePayload,
          });
          const sr = srResp?.data;
          // O wrapper do whatsappService sempre retorna { success: true, data: result };
          // o sucesso real está dentro de result. Validamos ambos.
          const resultObj = sr?.data || sr;
          if (!resultObj?.success) {
            const msg = resultObj?.error || sr?.error || 'Erro D-API';
            throw new Error(msg);
          }
          const wamid = resultObj?.data?.messageId ||
                        resultObj?.messageId ||
                        resultObj?.data?.id ||
                        resultObj?.data?.message_id ||
                        resultObj?.data?.messages?.[0]?.id ||
                        resultObj?.id ||
                        `dapi_${Date.now()}`;

          // Registrar log
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id,
            tipo_campanha: 'meta_oficial',
            cliente_telefone: numeroLimpo,
            cliente_nome: numeroLimpo,
            nome_campanha: nome_campanha || template_name,
            status: 'enviada',
            numero_sequencia: 1,
          }).catch(() => {});

          // Resolver/criar conversa + salvar mensagem (igual ao fluxo Meta direto)
          let convId = conversa_id;
          if (!convId) {
            const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
              { empresa_id, cliente_telefone: numeroLimpo }, '-data_ultima_mensagem', 1,
            );
            if (conversas.length > 0) {
              convId = conversas[0].id;
              await base44.asServiceRole.entities.ConversaWhatsapp.update(convId, {
                status: 'campanha', origem: 'campanha', tipo_conexao: 'meta_oficial',
                canal_origem: 'meta', provider: 'whatsapp_meta',
                phone_number_id_meta: phoneNumberId,
              }).catch(() => {});
            } else {
              const nova = await base44.asServiceRole.entities.ConversaWhatsapp.create({
                empresa_id, cliente_telefone: numeroLimpo, cliente_nome: numeroLimpo,
                status: 'campanha', origem: 'campanha', tipo_conexao: 'meta_oficial',
                canal_origem: 'meta', provider: 'whatsapp_meta', phone_number_id_meta: phoneNumberId,
                data_ultima_mensagem: new Date().toISOString(),
                ultima_mensagem: `📋 ${template_name}`, ultimo_remetente: 'vendedor',
              });
              convId = nova?.id;
            }
          }

          if (convId) {
            const templateJsonDapi = JSON.stringify({
              __template: true, template_name,
              header_type: (templateHeaderType || '').toUpperCase(),
              header_url: templateHeaderUrl || null,
              corpo: texto_preview || `📋 Template: ${template_name}`,
              botoes: templateBotoes,
            });
            await base44.asServiceRole.entities.MensagemWhatsapp.create({
              conversa_id: convId, empresa_id,
              remetente: 'vendedor', usuario_id: user.id, usuario_nome: user.full_name || '',
              tipo_conteudo: 'texto', texto: templateJsonDapi,
              whatsapp_message_id: wamid,
              data_envio: new Date().toISOString(), status: 'enviada',
              provider: 'whatsapp_meta',
            }).catch(() => {});
            await base44.asServiceRole.entities.ConversaWhatsapp.update(convId, {
              ultima_mensagem: `📋 ${template_name}`,
              data_ultima_mensagem: new Date().toISOString(),
              ultimo_remetente: 'vendedor',
              status: 'campanha', origem: 'campanha',
            }).catch(() => {});
          }

          enviados++;
          resultados.push({ telefone: numeroLimpo, status: 'enviada', message_id: wamid, via: 'dapi' });

          if (job_id) {
            await base44.asServiceRole.entities.CampanhaDisparoJob.update(job_id, { enviados, erros }).catch(() => {});
          }
        } catch (e: any) {
          erros++;
          console.error(`❌ [D-API] Erro ao enviar template para ${numeroLimpo}:`, e.message);
          await base44.asServiceRole.entities.CampanhaLog.create({
            empresa_id, tipo_campanha: 'meta_oficial', cliente_telefone: numeroLimpo,
            cliente_nome: numeroLimpo, status: 'erro', motivo_erro: e.message,
          }).catch(() => {});
          resultados.push({ telefone: numeroLimpo, status: 'erro', motivo: e.message, via: 'dapi' });
        }

        // Delay e pausa (mesmo do fluxo Meta)
        const delayMsDapi = Math.max(1000, (Number(delay_segundos) || 5) * 1000);
        await new Promise(r => setTimeout(r, delayMsDapi));
        if (pausar_apos > 0 && (enviados + erros) % pausar_apos === 0 && (enviados + erros) > 0) {
          const pausaMsDapi = Math.max(10000, (Number(duracao_pausa) || 60) * 1000);
          await new Promise(r => setTimeout(r, pausaMsDapi));
        }
        continue; // próximo contato (não cai no fluxo Meta Graph direto)
      }

      // Header com mídia — enviar quando template tem IMAGE/VIDEO/DOCUMENT
      const headerType = (templateHeaderType || '').toUpperCase();
      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType) && templateHeaderUrl) {
        const mediaKey = headerType === 'IMAGE' ? 'image' : headerType === 'VIDEO' ? 'video' : 'document';
        const urlStr = String(templateHeaderUrl).trim();

        // Handles/media_ids numéricos da Meta — usar diretamente como id
        const isMediaId = /^\d{10,}$/.test(urlStr);

        let mediaValue = null;

        if (isMediaId) {
          // media_id permanente salvo pelo sincronizarTemplatesMeta
          mediaValue = { id: urlStr };
          console.log(`📎 Header ${headerType}: media_id permanente = ${urlStr}`);
        } else if (urlStr.startsWith('http')) {
          // URL pública — tentar upload para obter media_id
          try {
            console.log(`📎 Header ${headerType}: upload da URL para obter media_id...`);
            const imgResp = await fetch(urlStr);
            if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`);
            const imgBuf = await imgResp.arrayBuffer();
            const ct = imgResp.headers.get('content-type') || 'image/jpeg';
            const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
            const fd = new FormData();
            fd.append('messaging_product', 'whatsapp');
            fd.append('type', ct);
            fd.append('file', new Blob([imgBuf], { type: ct }), `header.${ext}`);
            const upResp = await fetch(`https://graph.facebook.com/${metaApiVersion}/${phoneNumberId}/media`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}` },
              body: fd,
            });
            const upData = await upResp.json();
            if (upData.id) {
              mediaValue = { id: upData.id };
              console.log(`✅ Upload OK — media_id: ${upData.id}`);
            } else {
              throw new Error(upData.error?.message || 'sem media_id');
            }
          } catch (upErr) {
            console.warn(`⚠️ Upload falhou: ${upErr.message} — enviando sem imagem`);
          }
        }

        if (mediaValue) {
          components.push({
            type: 'header',
            parameters: [{ type: mediaKey, [mediaKey]: mediaValue }],
          });
        }
      }

      // Body variables
      const varsKeys = Object.keys(variaveis);
      if (varsKeys.length > 0) {
        const parametros = varsKeys.map(k => ({ type: 'text', text: variaveis[k] || '' }));
        components.push({ type: 'body', parameters: parametros });
      }

      // Botões QUICK_REPLY — usar botões do template definition (já buscados acima)
      // A Meta exige um componente button por botão QUICK_REPLY com índice correto
      const botoesParaEnviar = templateBotoes;
      botoesParaEnviar.forEach((btn, idx) => {
        if (btn.tipo === 'QUICK_REPLY') {
          components.push({
            type: 'button',
            sub_type: 'quick_reply',
            index: String(idx),
            parameters: [{ type: 'payload', payload: btn.texto || String(idx) }],
          });
        }
      });

      const payload = {
        messaging_product: 'whatsapp',
        to: numeroLimpo,
        type: 'template',
        template: {
          name: template_name,
          language: { code: template_language },
          ...(components.length > 0 ? { components } : {}),
        },
      };

      try {
        const resp = await fetch(metaUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await resp.json();

        if (!resp.ok) {
          const errDetail = data?.error?.error_data?.details || data?.error?.message || `HTTP ${resp.status}`;
          console.error(`❌ Meta API error para ${numeroLimpo}:`, JSON.stringify(data?.error));
          throw new Error(errDetail);
        }

        // Registrar no CampanhaLog
        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id,
          tipo_campanha: 'meta_oficial',
          cliente_telefone: numeroLimpo,
          cliente_nome: numeroLimpo,
          nome_campanha: nome_campanha || template_name,
          status: 'enviada',
          numero_sequencia: 1,
        });

        // Salvar como MensagemWhatsapp para aparecer no chat (Bate Papo)
        const whatsappMsgId = data?.messages?.[0]?.id;
        const textoMensagem = texto_preview || `📋 Template enviado: ${template_name}`;

        // Montar JSON de template para renderização rica no chat (imagem + botões)
        const templateJson = JSON.stringify({
          __template: true,
          template_name,
          header_type: (templateHeaderType || '').toUpperCase(),
          header_url: templateHeaderUrl || null,
          corpo: textoMensagem,
          botoes: templateBotoes,
        });

        // Buscar ou usar conversa_id fornecida
        let convId = conversa_id;
        if (!convId) {
          // Procurar conversa existente para este telefone na empresa
          const conversas = await base44.asServiceRole.entities.ConversaWhatsapp.filter(
            { empresa_id, cliente_telefone: numeroLimpo },
            '-data_ultima_mensagem', 1
          );
          if (conversas.length > 0) {
            convId = conversas[0].id;
            // Marcar conversa existente como campanha
            await base44.asServiceRole.entities.ConversaWhatsapp.update(convId, {
              status: 'campanha',
              origem: 'campanha',
              tipo_conexao: 'meta_oficial',
              canal_origem: 'meta',
              provider: 'whatsapp_meta',
              phone_number_id_meta: phoneNumberId,
            }).catch(() => {});
          } else {
            // Criar nova conversa como campanha
            const nova = await base44.asServiceRole.entities.ConversaWhatsapp.create({
              empresa_id,
              cliente_telefone: numeroLimpo,
              cliente_nome: numeroLimpo,
              status: 'campanha',
              origem: 'campanha',
              tipo_conexao: 'meta_oficial',
              canal_origem: 'meta',
              provider: 'whatsapp_meta',
              phone_number_id_meta: phoneNumberId,
              data_ultima_mensagem: new Date().toISOString(),
              ultima_mensagem: `📋 ${template_name}`,
              ultimo_remetente: 'vendedor',
            });
            convId = nova.id;
          }
        }

        if (convId) {
          await base44.asServiceRole.entities.MensagemWhatsapp.create({
            conversa_id: convId,
            empresa_id,
            remetente: 'vendedor',
            usuario_id: user.id,
            usuario_nome: user.full_name || '',
            tipo_conteudo: 'texto',
            texto: templateJson,
            whatsapp_message_id: whatsappMsgId || null,
            data_envio: new Date().toISOString(),
            status: 'enviada',
            provider: 'whatsapp_meta',
          });

          // Atualizar última mensagem da conversa (mantendo status campanha)
          await base44.asServiceRole.entities.ConversaWhatsapp.update(convId, {
            ultima_mensagem: `📋 ${template_name}`,
            data_ultima_mensagem: new Date().toISOString(),
            ultimo_remetente: 'vendedor',
            status: 'campanha',
            origem: 'campanha',
          }).catch(() => {});
        }

        enviados++;
        resultados.push({ telefone: numeroLimpo, status: 'enviada', message_id: data?.messages?.[0]?.id });

        // Atualizar progresso do job
        if (job_id) {
          await base44.asServiceRole.entities.CampanhaDisparoJob.update(job_id, {
            enviados,
            erros,
          }).catch(() => {});
        }

      } catch (e) {
        erros++;
        console.error(`❌ Erro ao enviar para ${numeroLimpo}:`, e.message);

        await base44.asServiceRole.entities.CampanhaLog.create({
          empresa_id,
          tipo_campanha: 'meta_oficial',
          cliente_telefone: numeroLimpo,
          cliente_nome: numeroLimpo,
          status: 'erro',
          motivo_erro: e.message,
        }).catch(() => {});

        resultados.push({ telefone: numeroLimpo, status: 'erro', motivo: e.message });
      }

      // Delay configurável entre envios
      const delayMs = Math.max(1000, (Number(delay_segundos) || 5) * 1000);
      await new Promise(r => setTimeout(r, delayMs));

      // Pausa automática a cada N mensagens
      if (pausar_apos > 0 && (enviados + erros) % pausar_apos === 0 && (enviados + erros) > 0) {
        const pausaMs = Math.max(10000, (Number(duracao_pausa) || 60) * 1000);
        console.log(`⏸️ Pausa automática de ${pausaMs / 1000}s após ${enviados + erros} mensagens`);
        await new Promise(r => setTimeout(r, pausaMs));
      }
    }

    // Marcar job como concluído
    if (job_id) {
      await base44.asServiceRole.entities.CampanhaDisparoJob.update(job_id, {
        enviados,
        erros,
        status: 'concluido',
        resultados: JSON.stringify(resultados),
      }).catch(() => {});
    }

    console.log(`✅ Campanha Meta Oficial: ${enviados} enviados, ${erros} erros`);

    return Response.json({
      ok: true,
      enviados,
      erros,
      total: contatos.length,
      resultados,
    });

  } catch (error) {
    console.error('❌ Erro crítico:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});