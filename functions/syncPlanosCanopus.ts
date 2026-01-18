import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import puppeteer from 'npm:puppeteer@21.0.0';

Deno.serve(async (req) => {
  let browser = null;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verificar se é admin - aceitar role ou perfil
    const isAdmin = ['admin', 'super_admin', 'master'].includes(user.role) || 
                    ['admin', 'super_admin', 'master'].includes(user.perfil);
    
    if (!isAdmin) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    let payload = {};
    try {
      const body = await req.text();
      if (body) {
        payload = JSON.parse(body);
      }
    } catch (e) {
      console.log('Payload parse error:', e.message);
    }

    let empresaIdFinal = payload.empresa_id || user.empresa_id;

    // Se não tiver empresa_id, buscar do Colaborador
    if (!empresaIdFinal) {
      const colabs = await base44.asServiceRole.entities.Colaborador.filter({
        user_id: user.id,
        status: 'ativo'
      });
      
      if (colabs.length > 0) {
        empresaIdFinal = colabs[0].empresa_id;
      }
    }

    if (!empresaIdFinal) {
      console.error('Erro: empresa_id não encontrado. User:', user);
      return Response.json({ 
        error: 'empresa_id não encontrado. Vincule o usuário a uma empresa.',
      }, { status: 400 });
    }

    // Buscar administradora Canopus - verificar múltiplas combinações
    let adminCanopus = await base44.asServiceRole.entities.Administradora.filter({
      empresa_id: empresaIdFinal
    });

    // Se não encontrar Canopus, usar a primeira disponível
    if (adminCanopus.length === 0) {
      return Response.json({
        error: 'Nenhuma administradora encontrada para esta empresa',
        success: false
      }, { status: 400 });
    }

    // Procurar por Canopus no nome
    let administradora = adminCanopus.find(a => 
      a.nome_fantasia?.toLowerCase().includes('canopus') ||
      a.razao_social?.toLowerCase().includes('canopus')
    );

    // Se não encontrar Canopus, usar primeira
    if (!administradora) {
      administradora = adminCanopus[0];
    }

    const administradora_id = administradora.id;
    let successCount = 0;
    let updatedCount = 0;
    const errors = [];

    // Iniciar Puppeteer
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    // Acessar site AFV
    console.log('Acessando AFV...');
    await page.goto('https://afv.consorciocanopus.com.br/Sistema/', { waitUntil: 'networkidle2' });

    // Fazer login
    console.log('Realizando login...');
    await page.type('input[name="login"]', '0000022393', { delay: 50 });
    await page.type('input[name="senha"]', 'Canopus24@', { delay: 50 });
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // Acessar página de planos
    console.log('Acessando página de planos...');
    await page.goto('https://afv.consorciocanopus.com.br/Sistema/planos/listagem_planos.php', { waitUntil: 'networkidle2' });

    // Configurações de filtros
    const filtros = [
      { produto: 'AUTOMÓVEIS', reajuste: 'IPCA', nome_produto: 'Automóvel' },
      { produto: 'IMÓVEIS', reajuste: 'INCC', nome_produto: 'Imóvel' }
    ];

    for (const filtro of filtros) {
      console.log(`Processando ${filtro.nome_produto}...`);

      // Resetar página
      await page.goto('https://afv.consorciocanopus.com.br/Sistema/planos/listagem_planos.php', { waitUntil: 'networkidle2' });

      try {
        // Selecionar produto
        await page.select('select[name="produto"]', filtro.produto);
        await page.waitForTimeout(500);

        // Selecionar reajuste
        const reajusteRadio = await page.$(`input[value="${filtro.reajuste}"]`);
        if (reajusteRadio) {
          await reajusteRadio.click();
          await page.waitForTimeout(500);
        }

        // Selecionar "Sem reserva"
        const semReservaRadio = await page.$('input[value="Sem reserva"]');
        if (semReservaRadio) {
          await semReservaRadio.click();
          await page.waitForTimeout(500);
        }

        // Clicar em Filtrar
        await page.click('button:contains("Filtrar")');
        await page.waitForTimeout(1000);

        // Extrair planos da tabela
        const planos = await page.evaluate(() => {
          const rows = document.querySelectorAll('table tbody tr');
          const planosList = [];

          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
              planosList.push({
                nome: cells[0]?.textContent?.trim() || '',
                nome_bem: cells[1]?.textContent?.trim() || '',
                prazo_meses: parseInt(cells[2]?.textContent?.trim()) || 0,
                valor_bem: parseFloat(cells[3]?.textContent?.trim().replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0,
                parcela: parseFloat(cells[4]?.textContent?.trim().replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0
              });
            }
          });

          return planosList;
        });

        // Processar cada plano
        for (const plano of planos) {
          if (!plano.nome || plano.prazo_meses === 0) continue;

          try {
            const hashChave = `${empresaIdFinal}|${plano.nome}|${filtro.nome_produto}|${plano.nome_bem}|${plano.prazo_meses}|${filtro.reajuste}|sem_reserva`;

            const existente = await base44.asServiceRole.entities.PlanoCanopus.filter({
              hash_chave: hashChave
            });

            const planoData = {
              empresa_id: empresaIdFinal,
              origem: 'CANOPUS',
              plano: plano.nome,
              produto: filtro.nome_produto,
              nome_bem: plano.nome_bem,
              reajuste_tipo: filtro.reajuste,
              sem_reserva: true,
              valor_bem: plano.valor_bem,
              prazo_meses: plano.prazo_meses,
              parcela: plano.parcela,
              status: 'ativo',
              hash_chave: hashChave,
              ultima_sincronizacao: new Date().toISOString()
            };

            if (existente.length > 0) {
              await base44.asServiceRole.entities.PlanoCanopus.update(existente[0].id, planoData);
              updatedCount++;
            } else {
              await base44.asServiceRole.entities.PlanoCanopus.create(planoData);
              successCount++;
            }
          } catch (error) {
            errors.push({
              plano: plano.nome,
              message: error.message
            });
          }
        }
      } catch (error) {
        errors.push({
          filtro: filtro.nome_produto,
          message: error.message
        });
      }
    }

    await browser.close();

    return Response.json({
      success: true,
      summary: {
        total: successCount + updatedCount,
        successCount,
        updatedCount,
        errorCount: errors.length
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Sincronização concluída: ${successCount} criados, ${updatedCount} atualizados`
    });

  } catch (error) {
    if (browser) await browser.close();
    console.error('Erro na sincronização:', error);
    return Response.json({
      error: error.message || 'Erro ao sincronizar planos',
      success: false,
      stack: error.stack
    }, { status: 500 });
  }
});