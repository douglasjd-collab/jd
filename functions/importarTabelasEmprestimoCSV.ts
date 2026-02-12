import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Obter empresa_id do usuário
    let empresaId = null;
    if (user.role === 'super_admin' || user.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) empresaId = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ 
        user_id: user.id, 
        status: 'ativo' 
      });
      if (colabs.length > 0) empresaId = colabs[0].empresa_id;
    }

    if (!empresaId) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    const formData = await req.formData();
    const arquivo = formData.get('file');

    if (!arquivo) {
      return Response.json({ error: 'Arquivo não enviado' }, { status: 400 });
    }

    // Ler conteúdo do arquivo
    const texto = await arquivo.text();
    const linhas = texto.split('\n').filter(l => l.trim());

    if (linhas.length === 0) {
      return Response.json({ error: 'Arquivo vazio' }, { status: 400 });
    }

    // Buscar convênios e bancos existentes
    const convenios = await base44.asServiceRole.entities.Convenio.filter({ 
      empresa_id: empresaId, 
      ativo: true 
    });
    const bancos = await base44.asServiceRole.entities.Banco.filter({ 
      empresa_id: empresaId, 
      ativo: true 
    });

    const criadas = [];
    const erros = [];

    // Pular primeira linha se for cabeçalho
    const primeiraLinha = linhas[0].toLowerCase();
    const temCabecalho = primeiraLinha.includes('data') || 
                         primeiraLinha.includes('convenio') || 
                         primeiraLinha.includes('banco') ||
                         primeiraLinha.includes('tabela') ||
                         primeiraLinha.includes('prazo');
    
    const linhasDados = temCabecalho ? linhas.slice(1) : linhas;

    for (let i = 0; i < linhasDados.length; i++) {
      const linha = linhasDados[i];
      const indice = i + (temCabecalho ? 2 : 1); // Número da linha para erro
      
      // Suporta separação por vírgula, ponto-e-vírgula ou tab
      const separador = linha.includes('\t') ? '\t' : 
                       linha.includes(';') ? ';' : ',';
      const campos = linha.split(separador).map(c => c.trim());

      if (campos.length < 5) {
        erros.push(`Linha ${indice}: Formato inválido (esperado: Data, Convenio, Banco, Tabela, Prazo)`);
        continue;
      }

      const [data, convenioNome, bancoNome, tabelaNome, prazo] = campos;

      // Buscar convênio
      const convenio = convenios.find(c => 
        c.nome.toLowerCase().includes(convenioNome.toLowerCase())
      );

      // Criar dados da tabela
      const tabelaData = {
        empresa_id: empresaId,
        nome: tabelaNome,
        banco: bancoNome,
        convenio_id: convenio?.id || null,
        convenio_nome: convenio?.nome || convenioNome,
        codigo: prazo, // Usando prazo como código
        comissao_corretor: 0,
        comissao_empresa: 0,
        ativo: true
      };

      try {
        const tabela = await base44.asServiceRole.entities.TabelaEmprestimo.create(tabelaData);
        criadas.push(tabela);
      } catch (error) {
        erros.push(`Linha ${indice}: ${error.message}`);
      }
    }

    return Response.json({
      success: true,
      total: linhasDados.length,
      criadas: criadas.length,
      erros: erros.length,
      detalhes_erros: erros
    });

  } catch (error) {
    console.error('Erro ao importar CSV:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});