import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { empresa_parceira_id } = await req.json();

    if (!empresa_parceira_id) {
      return Response.json({ error: 'empresa_parceira_id é obrigatório' }, { status: 400 });
    }

    // Buscar se layout já existe
    const existentes = await base44.entities.LayoutImportacao.filter({
      empresa_parceira_id,
      tipo: 'comissao',
      nome: 'Cred Franco - Comissão Empréstimo'
    });

    if (existentes.length > 0) {
      return Response.json({ 
        success: true, 
        message: 'Layout já existe',
        layout: existentes[0]
      });
    }

    // Criar layout: Cred Franco
    // A=COD. PROPOSTA (contrato - coluna A=0)
    // D=DATA (coluna D=3)
    // F=CPF (coluna F=5)
    // H=BANCO (coluna H=7)
    // I=CONVENIO (coluna I=8)
    // J=TIPO DE PRODUTO (coluna J=9)
    // S=PERC COMISSAO (coluna S=18)
    // T=VL COMISSAO (coluna T=19)
    const layout = await base44.entities.LayoutImportacao.create({
      empresa_parceira_id,
      tipo: 'comissao',
      nome: 'Cred Franco - Comissão Empréstimo',
      descricao: 'Layout para importação de comissões da Cred Franco com dados de contrato, CPF, banco, convênio, percentual e valor de comissão',
      linha_inicio_dados: 2,
      mapeamento: {
        contrato: 'A',
        data_recebimento: 'D',
        cpf: 'F',
        banco: 'H',
        convenio: 'I',
        tipo_consignado: 'J',
        percentual_comissao: 'S',
        valor_comissao: 'T'
      }
    });

    return Response.json({ 
      success: true, 
      message: 'Layout criado com sucesso',
      layout
    });
  } catch (error) {
    console.error('Erro ao criar layout:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});