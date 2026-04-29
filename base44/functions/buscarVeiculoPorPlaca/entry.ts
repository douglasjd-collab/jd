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

    // Tenta API WebXcar
    let veiculo = null;
    const webxcarApiKey = Deno.env.get('WEBXCAR_API_KEY');

    if (webxcarApiKey) {
      try {
        const response = await fetch(`https://api.webxcar.com.br/fipe/${placaLimpa}`, {
          method: 'GET',
          headers: { 'Authorization': webxcarApiKey },
        });

        if (response.ok) {
          const data = await response.json();
          veiculo = data.data || data;
        }
      } catch (_err) {
        // Continua
      }
    }

    if (!veiculo) {
      veiculo = {};
    }

    const marca = veiculo.marca || veiculo.MARCA || veiculo.montadora || '';
    const modelo = veiculo.modelo || veiculo.MODELO || veiculo.descricao || '';
    const ano = String(veiculo.ano || veiculo.ANO || veiculo.anoModelo || veiculo.ano_modelo || '');
    const versao = veiculo.versao || veiculo.VERSAO || veiculo.nome || '';
    const tipo = veiculo.tipo || veiculo.TIPO || 'automovel';

    // Extrai FIPE de vários formatos possíveis
    let valorFipe = veiculo.valor_fipe || veiculo.fipe_preco || veiculo.preco || veiculo.valor || null;
    let codigoFipe = veiculo.codigo_fipe || veiculo.fipe_codigo || veiculo.codigoFipe || null;

    // Se valorFipe vem como string (ex: "R$ 82.036,00"), converte
    if (valorFipe && typeof valorFipe === 'string') {
      const precoNum = parseFloat(
        valorFipe.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
      );
      valorFipe = !isNaN(precoNum) ? precoNum : null;
    }

    // FIPE deve vir da API de placa ou ser preenchida manualmente
    // Não tentamos buscar na BrasilAPI pois tem limitações de cobertura

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