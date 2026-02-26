import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    // Buscar empresa_id e colaborador_id do usuário
    let empresaId = null;
    let colaboradorId = null;

    if (user.role === 'super_admin' || user.perfil === 'super_admin') {
      const empresas = await base44.asServiceRole.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) empresaId = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' });
      if (colabs.length > 0) {
        empresaId = colabs[0].empresa_id;
        colaboradorId = colabs[0].id;
      }
    }

    if (!empresaId) {
      return Response.json({ error: 'Empresa não encontrada' }, { status: 400 });
    }

    // Receber arquivo via URL ou base64
    const body = await req.json();
    const { file_url, layout } = body; // layout = mapeamento configurado { campo_interno: 'A', ... }

    if (!file_url) {
      return Response.json({ error: 'URL do arquivo não fornecida' }, { status: 400 });
    }

    // Baixar o arquivo
    const fileResp = await fetch(file_url);
    if (!fileResp.ok) {
      return Response.json({ error: 'Falha ao baixar o arquivo' }, { status: 400 });
    }
    const arrayBuffer = await fileResp.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Detectar tipo de arquivo pela extensão da URL
    const isExcel = file_url.toLowerCase().includes('.xlsx') || file_url.toLowerCase().includes('.xls');
    const isCsv = file_url.toLowerCase().includes('.csv');

    let rows = []; // array de arrays

    if (isExcel || (!isCsv)) {
      // Tentar Excel primeiro
      try {
        const workbook = XLSX.read(uint8, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      } catch (e) {
        return Response.json({ error: 'Erro ao ler arquivo Excel: ' + e.message }, { status: 400 });
      }
    } else {
      // CSV
      let csvContent = '';
      try {
        csvContent = new TextDecoder('utf-8', { fatal: true }).decode(uint8);
      } catch {
        csvContent = new TextDecoder('ISO-8859-1').decode(uint8);
      }
      csvContent = csvContent.replace(/^\uFEFF/, '');
      const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
      const delimiter = lines[0]?.includes(';') ? ';' : ',';
      rows = lines.map(l => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '')));
    }

    if (rows.length < 2) {
      return Response.json({ error: 'Arquivo vazio ou sem dados' }, { status: 400 });
    }

    // Converter letra de coluna Excel para índice numérico (A=0, B=1, AA=26, ...)
    const colLetterToIndex = (letter) => {
      if (!letter || letter === 'Não Usado') return -1;
      const l = String(letter).toUpperCase().trim();
      let idx = 0;
      for (let i = 0; i < l.length; i++) {
        idx = idx * 26 + (l.charCodeAt(i) - 64);
      }
      return idx - 1;
    };

    let colNome, colCpf, colBanco, colConvenio, colTipo, colValor, colPrazo,
        colAde, colBeneficio, colData, colVendedor, colStatus, colComissao,
        colContrato, colParcela, colDataDigitacao;

    if (layout && Object.keys(layout).length > 0) {
      // Usar layout configurado — mapeamento letra -> índice
      console.log('Usando layout configurado:', layout);
      colNome          = colLetterToIndex(layout.nome_completo);
      colCpf           = colLetterToIndex(layout.cpf);
      colBanco         = colLetterToIndex(layout.banco);
      colConvenio      = colLetterToIndex(layout.convenio);
      colTipo          = colLetterToIndex(layout.tipo_consignado);
      colValor         = colLetterToIndex(layout.valor_liberado || layout.valor_bruto);
      colPrazo         = colLetterToIndex(layout.prazo_meses);
      colAde           = colLetterToIndex(layout.numero_contrato); // numero_contrato mapeado como ADE/contrato
      colBeneficio     = colLetterToIndex(layout.numero_beneficio);
      colData          = colLetterToIndex(layout.data_liberacao || layout.data_digitacao);
      colVendedor      = colLetterToIndex(layout.usuario_digitador);
      colStatus        = colLetterToIndex(layout.status_contrato);
      colComissao      = colLetterToIndex(layout.comissao_empresa);
      colContrato      = colLetterToIndex(layout.numero_contrato);
      colParcela       = colLetterToIndex(layout.valor_parcela);
    } else {
      // Detecção automática por cabeçalho
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowStr = rows[i].join(' ').toLowerCase();
        if (rowStr.includes('cpf') || rowStr.includes('nome') || rowStr.includes('cliente')) {
          headerRowIndex = i;
          break;
        }
      }
      const header = rows[headerRowIndex].map(h => String(h).toLowerCase().trim());
      console.log('Cabeçalho detectado automaticamente:', header);

      const findCol = (...terms) => {
        for (const term of terms) {
          const idx = header.findIndex(h => h.includes(term));
          if (idx !== -1) return idx;
        }
        return -1;
      };

      colNome      = findCol('nome', 'cliente');
      colCpf       = findCol('cpf', 'cnpj');
      colBanco     = findCol('banco', 'financeira', 'administradora');
      colConvenio  = findCol('convenio', 'convênio', 'orgao', 'órgão');
      colTipo      = findCol('tipo', 'modalidade', 'operacao', 'operação');
      colValor     = findCol('valor', 'credito', 'crédito', 'emprestimo', 'empréstimo');
      colPrazo     = findCol('prazo', 'parcelas');
      colAde       = findCol('ade', 'proposta', 'numero_ade', 'nº ade');
      colBeneficio = findCol('beneficio', 'benefício', 'nb', 'matricula', 'matrícula');
      colData      = findCol('data', 'dt_venda', 'data venda', 'data_venda');
      colVendedor  = findCol('vendedor', 'assessor', 'corretor', 'agente');
      colStatus    = findCol('status', 'situacao', 'situação');
      colComissao  = findCol('comissao', 'comissão');
      colContrato  = -1;
      colParcela   = -1;
    }

    console.log('Índices de colunas:', { colNome, colCpf, colBanco, colConvenio, colTipo, colValor, colPrazo, colStatus, colContrato });

    // Buscar dados de referência
    const [bancos, convenios, clientes, vendedores, statusList] = await Promise.all([
      base44.entities.Banco.filter({ empresa_id: empresaId }),
      base44.entities.Convenio.filter({ empresa_id: empresaId }),
      base44.entities.Cliente.filter({ empresa_id: empresaId }),
      base44.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }),
      base44.entities.StatusProposta.filter({ empresa_id: empresaId }),
    ]);

    // Helpers
    const normStr = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const normCpf = cpf => String(cpf || '').replace(/\D/g, '');
    
    const findBanco = (nome) => {
      if (!nome) return null;
      return bancos.find(b => normStr(b.nome).includes(normStr(nome)) || normStr(nome).includes(normStr(b.nome)));
    };

    const findConvenio = (nome) => {
      if (!nome) return null;
      return convenios.find(c => normStr(c.nome).includes(normStr(nome)) || normStr(nome).includes(normStr(c.nome)));
    };

    const findCliente = (cpf, nome) => {
      const cpfNorm = normCpf(cpf);
      if (cpfNorm.length >= 11) {
        const byСpf = clientes.find(c => normCpf(c.cpf) === cpfNorm || normCpf(c.pj_cnpj) === cpfNorm);
        if (byСpf) return byСpf;
      }
      if (nome) {
        return clientes.find(c => normStr(c.nome_completo) === normStr(nome) || normStr(c.pj_razao_social) === normStr(nome));
      }
      return null;
    };

    const findVendedor = (nomeOuCod) => {
      if (!nomeOuCod) return colaboradorId ? vendedores.find(v => v.id === colaboradorId) : null;
      return vendedores.find(v =>
        normStr(v.nome).includes(normStr(nomeOuCod)) ||
        normStr(nomeOuCod).includes(normStr(v.nome)) ||
        v.codigo_vendedor === String(nomeOuCod).trim()
      );
    };

    const parseValor = (val) => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return val;
      return parseFloat(String(val).replace(/\./g, '').replace(',', '.')) || 0;
    };

    const parseData = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      const str = String(val).trim();
      // Formato dd/mm/yyyy ou dd/mm/yy
      const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (match) {
        let [, d, m, y] = match;
        if (y.length === 2) y = '20' + y;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      // ISO
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      return null;
    };

    const normTipo = (tipo) => {
      if (!tipo) return 'NOVO';
      const t = normStr(tipo);
      if (t.includes('refin') && t.includes('port')) return 'REFIN_PORTABILIDADE';
      if (t.includes('port')) return 'PORTABILIDADE_PURA';
      if (t.includes('refin')) return 'REFINANCIAMENTO';
      return 'NOVO';
    };

    // Processar linhas de dados
    const dataRows = rows.slice(headerRowIndex + 1);
    let criadas = 0;
    let ignoradas = 0;
    const erros = [];
    const previews = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowStr = row.join('').trim();
      if (!rowStr) continue;

      try {
        const nomeVal     = colNome     >= 0 ? String(row[colNome]     ?? '').trim() : '';
        const cpfVal      = colCpf      >= 0 ? String(row[colCpf]      ?? '').trim() : '';
        const bancoVal    = colBanco    >= 0 ? String(row[colBanco]    ?? '').trim() : '';
        const convenioVal = colConvenio >= 0 ? String(row[colConvenio] ?? '').trim() : '';
        const tipoVal     = colTipo     >= 0 ? String(row[colTipo]     ?? '').trim() : '';
        const valorVal    = colValor    >= 0 ? row[colValor]                          : 0;
        const prazoVal    = colPrazo    >= 0 ? row[colPrazo]                          : null;
        const adeVal      = colAde      >= 0 ? String(row[colAde]      ?? '').trim() : '';
        const contratoVal = colContrato >= 0 ? String(row[colContrato] ?? '').trim() : '';
        const beneficioVal= colBeneficio>= 0 ? String(row[colBeneficio]?? '').trim() : '';
        const dataVal     = colData     >= 0 ? row[colData]                           : null;
        const vendedorVal = colVendedor >= 0 ? String(row[colVendedor] ?? '').trim() : '';
        const statusVal   = colStatus   >= 0 ? String(row[colStatus]   ?? '').trim() : '';
        const comissaoVal = colComissao >= 0 ? row[colComissao]                       : null;

        // Nome é obrigatório
        if (!nomeVal && !cpfVal) {
          ignoradas++;
          continue;
        }

        const banco   = findBanco(bancoVal);
        const conv    = findConvenio(convenioVal);
        const cliente = findCliente(cpfVal, nomeVal);
        const vend    = findVendedor(vendedorVal);

        const valor    = parseValor(valorVal);
        const prazo    = prazoVal ? (parseInt(String(prazoVal).replace(/\D/g, '')) || null) : null;
        const dataVend = parseData(dataVal) || new Date().toISOString().slice(0, 10);
        const tipo     = normTipo(tipoVal);
        const comissao = comissaoVal ? parseValor(comissaoVal) : null;

        // Determinar status
        let statusCodigo = 'digitado';
        if (statusVal) {
          const statusEncontrado = statusList.find(s =>
            normStr(s.nome).includes(normStr(statusVal)) ||
            normStr(statusVal).includes(normStr(s.nome)) ||
            s.codigo === normStr(statusVal)
          );
          if (statusEncontrado) statusCodigo = statusEncontrado.codigo;
        }

        // Status: usar valor bruto do arquivo se não encontrar na lista cadastrada
        const statusFinal = statusVal || statusCodigo;

        const proposta = {
          empresa_id:               empresaId,
          produto:                  'emprestimo',
          cliente_id:               cliente?.id || null,
          cliente_nome:             nomeVal || cliente?.nome_completo || '',
          administradora_id:        banco?.id || null,
          administradora_nome:      banco?.nome || bancoVal || null,
          emprestimo_convenio_id:   conv?.id || null,
          emprestimo_convenio_nome: conv?.nome || convenioVal || null,
          emprestimo_tipo:          tipo,
          emprestimo_numero_ade:    adeVal || null,
          emprestimo_numero_beneficio: beneficioVal || null,
          emprestimo_prazo:         prazo,
          contrato:                 contratoVal || adeVal || null,
          vendedor_id:              vend?.id || colaboradorId || null,
          vendedor_nome:            vend?.nome || vendedorVal || null,
          data_venda:               dataVend,
          valor_credito:            valor,
          valor_comissao:           comissao,
          status:                   statusFinal,
        };

        await base44.entities.Proposta.create(proposta);
        criadas++;

        previews.push({
          nome: proposta.cliente_nome,
          banco: proposta.administradora_nome,
          tipo,
          valor,
          data: dataVend,
          status: statusCodigo,
        });

      } catch (err) {
        erros.push(`Linha ${i + 2}: ${err.message}`);
        console.error(`Erro na linha ${i + 2}:`, err);
      }
    }

    return Response.json({
      success: true,
      criadas,
      ignoradas,
      erros: erros.slice(0, 20),
      previews: previews.slice(0, 5),
    });

  } catch (error) {
    console.error('Erro na importação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});