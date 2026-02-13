import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar empresa_id do usuário
    let empresaId = null;
    if (user.role === 'super_admin' || user.perfil === 'super_admin') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) empresaId = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' });
      if (colabs.length > 0) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    // Obter arquivo do FormData
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json({ error: 'Arquivo não enviado' }, { status: 400 });
    }

    // Ler conteúdo do arquivo
    const text = await file.text();
    const linhas = text.split('\n').filter(l => l.trim());

    if (linhas.length < 2) {
      return Response.json({ error: 'Arquivo vazio ou inválido' }, { status: 400 });
    }

    // Pular cabeçalho
    const linhasDados = linhas.slice(1);
    
    let criadas = 0;
    let erros = 0;
    const detalhesErros = [];

    // Buscar todos os convênios da empresa
    const convenios = await base44.entities.Convenio.filter({ empresa_id: empresaId, ativo: true });

    for (const linha of linhasDados) {
      try {
        // Separar por ponto-e-vírgula
        const colunas = linha.split(';').map(c => c.trim());

        // Estrutura do CSV:
        // Data;Convenio;Banco;Codigo Produto;Produto;Codigo Tabela;Tabela;Prazo Inicial;Prazo Final;Valor Inicial;Valor Final;Tipo Agente;Empresa;Tipo de Formalização;Comissão Empresa
        const [
          dataStr,
          convenioNome,
          banco,
          codigoProduto,
          produto,
          codigoTabela,
          tabela,
          prazoInicialStr,
          prazoFinalStr,
          valorInicialStr,
          valorFinalStr,
          tipoAgente,
          empresaNome,
          tipoFormalizacao,
          comissaoEmpresaStr
        ] = colunas;

        // Validar campos obrigatórios
        if (!tabela || !comissaoEmpresaStr) {
          erros++;
          detalhesErros.push(`Linha ignorada: falta tabela ou comissão - ${linha.substring(0, 50)}`);
          continue;
        }

        // Converter valores
        const comissaoEmpresa = parseFloat(comissaoEmpresaStr.replace(',', '.'));
        
        if (isNaN(comissaoEmpresa)) {
          erros++;
          detalhesErros.push(`Comissão inválida: ${comissaoEmpresaStr} - ${tabela}`);
          continue;
        }

        // Buscar convênio
        let convenioId = null;
        if (convenioNome) {
          const conv = convenios.find(c => 
            c.nome.toLowerCase().includes(convenioNome.toLowerCase()) ||
            convenioNome.toLowerCase().includes(c.nome.toLowerCase())
          );
          if (conv) convenioId = conv.id;
        }

        // Converter data se presente (formato dd/mmm)
        let data = null;
        if (dataStr) {
          try {
            // Exemplo: "06/02/2026" ou "12/fev"
            const partes = dataStr.split('/');
            if (partes.length >= 2) {
              const dia = partes[0].padStart(2, '0');
              let mes = partes[1];
              let ano = partes[2] || new Date().getFullYear().toString();
              
              // Converter mês abreviado para número
              const meses = {
                'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
                'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
                'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
              };
              
              if (meses[mes.toLowerCase()]) {
                mes = meses[mes.toLowerCase()];
              } else {
                mes = mes.padStart(2, '0');
              }
              
              data = `${ano}-${mes}-${dia}`;
            }
          } catch (e) {
            console.log('Erro ao converter data:', dataStr, e);
          }
        }

        // Preparar dados
        const dadosTabela = {
          empresa_id: empresaId,
          data: data,
          convenio_id: convenioId,
          convenio_nome: convenioNome || null,
          banco: banco || null,
          codigo_produto: codigoProduto || null,
          produto: produto || null,
          codigo_tabela: codigoTabela || null,
          tabela: tabela,
          prazo_inicial: prazoInicialStr ? parseFloat(prazoInicialStr) : null,
          prazo_final: prazoFinalStr ? parseFloat(prazoFinalStr) : null,
          valor_inicial: valorInicialStr ? parseFloat(valorInicialStr.replace(',', '.')) : null,
          valor_final: valorFinalStr ? parseFloat(valorFinalStr.replace(',', '.')) : null,
          tipo_agente: tipoAgente || null,
          empresa_nome: empresaNome || null,
          tipo_formalizacao: tipoFormalizacao || null,
          comissao_empresa: comissaoEmpresa,
          ativo: true
        };

        // Criar tabela
        await base44.entities.TabelaEmprestimo.create(dadosTabela);
        criadas++;

      } catch (err) {
        erros++;
        detalhesErros.push(`Erro na linha: ${linha.substring(0, 50)} - ${err.message}`);
        console.error('Erro ao processar linha:', err);
      }
    }

    return Response.json({
      success: true,
      criadas,
      erros,
      detalhes_erros: detalhesErros.slice(0, 10) // Limitar a 10 erros
    });

  } catch (error) {
    console.error('Erro na importação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});