import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { placa } = await req.json();

    if (!placa) {
      return Response.json({ sucesso: false, mensagem: 'Informe a placa do veículo.' });
    }

    const placaLimpa = placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    if (placaLimpa.length !== 7) {
      return Response.json({ sucesso: false, mensagem: 'Placa inválida. Deve ter 7 caracteres.' });
    }

    // Tenta API configurada primeiro, senão usa BrasilAPI
    let veiculo = null;
    const apiUrl = Deno.env.get('PLACA_API_URL');
    const apiToken = Deno.env.get('PLACA_API_TOKEN');

    if (apiUrl && apiToken) {
      const response = await fetch(`${apiUrl}/${placaLimpa}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        veiculo = await response.json();
      }
    }

    // Se não conseguiu pela API configurada, usa BrasilAPI como fallback
    if (!veiculo) {
      try {
        const brasilApiResp = await fetch(`https://brasilapi.com.br/api/placa/v1/${placaLimpa}`);
        if (brasilApiResp.ok) {
          veiculo = await brasilApiResp.json();
        }
      } catch (_err) {
        // Continua sem dados iniciais
      }
    }

    if (!veiculo) {
      veiculo = {};
    }

    const marca = veiculo.marca || veiculo.MARCA || '';
    const modelo = veiculo.modelo || veiculo.MODELO || '';
    const ano = String(veiculo.ano || veiculo.ANO || veiculo.anoModelo || '');
    const versao = veiculo.versao || veiculo.VERSAO || '';
    const tipo = veiculo.tipo || veiculo.TIPO || 'automovel';

    // Se a API já retornar FIPE, usa direto
    let valorFipe = veiculo.valor_fipe || veiculo.fipe_preco || null;
    let codigoFipe = veiculo.codigo_fipe || veiculo.fipe_codigo || null;

    // Se não tiver FIPE, tenta consultar pela BrasilAPI (gratuita)
    if (!valorFipe && marca && modelo && ano) {
      try {
        // Buscar marcas de veículos na BrasilAPI
        const tipoFipe = tipo.toLowerCase().includes('moto') ? 'motos' : 'carros';
        const marcasResp = await fetch(`https://brasilapi.com.br/api/fipe/marcas/v1/${tipoFipe}`);
        
        if (marcasResp.ok) {
          const marcas = await marcasResp.json();
          const marcaNorm = marca.toLowerCase();
          const marcaEncontrada = marcas.find(m => 
            m.nome.toLowerCase().includes(marcaNorm) || marcaNorm.includes(m.nome.toLowerCase())
          );

          if (marcaEncontrada) {
            // Buscar modelos da marca
            const modelosResp = await fetch(
              `https://brasilapi.com.br/api/fipe/veiculos/v1/${tipoFipe}/${marcaEncontrada.valor}`
            );
            if (modelosResp.ok) {
              const modelosData = await modelosResp.json();
              const modeloNorm = modelo.toLowerCase();
              const modeloEncontrado = (modelosData.modelos || []).find(m =>
                m.nome.toLowerCase().includes(modeloNorm) || modeloNorm.includes(m.nome.toLowerCase())
              );

              if (modeloEncontrado && ano) {
                // Buscar anos disponíveis
                const anosResp = await fetch(
                  `https://brasilapi.com.br/api/fipe/veiculos/v1/${tipoFipe}/${marcaEncontrada.valor}/${modeloEncontrado.valor}`
                );
                if (anosResp.ok) {
                  const anos = await anosResp.json();
                  const anoEncontrado = anos.find(a => String(a.nome).includes(ano));

                  if (anoEncontrado) {
                    const fipeResp = await fetch(
                      `https://brasilapi.com.br/api/fipe/veiculos/v1/${tipoFipe}/${marcaEncontrada.valor}/${modeloEncontrado.valor}/${anoEncontrado.valor}`
                    );
                    if (fipeResp.ok) {
                      const fipeData = await fipeResp.json();
                      const precoStr = fipeData.preco || '';
                      // Converter "R$ 82.036,00" → 82036.00
                      const precoNum = parseFloat(
                        precoStr.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
                      );
                      if (!isNaN(precoNum)) {
                        valorFipe = precoNum;
                        codigoFipe = fipeData.codigoFipe || null;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (_fipeErr) {
        // FIPE não encontrada, retorna sem valor FIPE — usuário preenche manualmente
      }
    }

    return Response.json({
      sucesso: true,
      placa: placaLimpa,
      marca,
      modelo,
      ano,
      versao,
      tipo,
      valor_fipe: valorFipe,
      codigo_fipe: codigoFipe,
    });

  } catch (error) {
    return Response.json({ sucesso: false, mensagem: error.message }, { status: 500 });
  }
});