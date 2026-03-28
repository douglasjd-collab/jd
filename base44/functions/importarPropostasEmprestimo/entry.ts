import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
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

    const body = await req.json();
    const { file_url, layout, atualizar_telefone } = body;
    const atualizarTelefone = atualizar_telefone === true;

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

    const isExcel = file_url.toLowerCase().includes('.xlsx') || file_url.toLowerCase().includes('.xls');
    const isCsv = file_url.toLowerCase().includes('.csv');

    let rows = [];

    if (isExcel) {
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
      // Detectar delimitador
      const firstLine = lines[0] || '';
      const delimiter = firstLine.includes(';') ? ';' : ',';
      rows = lines.map(l => l.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '')));
    }

    if (rows.length < 2) {
      return Response.json({ error: 'Arquivo vazio ou sem dados' }, { status: 400 });
    }

    // Converter letra de coluna Excel para índice numérico (A=0, B=1, AA=26, ...)
    const colLetterToIndex = (letter) => {
      if (!letter || letter === 'Não Usado' || letter === '') return -1;
      const l = String(letter).toUpperCase().trim();
      let idx = 0;
      for (let i = 0; i < l.length; i++) {
        idx = idx * 26 + (l.charCodeAt(i) - 64);
      }
      return idx - 1;
    };

    let headerRowIndex = 0;
    let colNome, colCpf, colBanco, colConvenio, colTipo, colValor, colPrazo, colCelular;
    let colAde, colBeneficio, colData, colVendedor, colStatus, colComissao, colComissaoPercentual, colContrato, colTabela;
    let colDataRecebComissao, colDataPagCliente, colDataCadastroProp, colValorBaseComissao;
    let colValorBruto, colParcela;

    if (layout && Object.keys(layout).length > 0) {
      // Usar layout configurado — mapeamento letra -> índice (baseado em coluna Excel A=0)
      console.log('Usando layout configurado:', JSON.stringify(layout));
      colNome              = colLetterToIndex(layout.nome_completo);
      colCpf               = colLetterToIndex(layout.cpf);
      colBanco             = colLetterToIndex(layout.banco);
      colConvenio          = colLetterToIndex(layout.convenio);
      colTipo              = colLetterToIndex(layout.tipo_consignado || layout.tipo_operacao);
      colValor             = colLetterToIndex(layout.valor_liquido || layout.valor_liberado);
      colValorBruto        = colLetterToIndex(layout.valor_bruto || layout.valor_operacao);
      colParcela           = colLetterToIndex(layout.parcela || layout.valor_parcela);
      colPrazo             = colLetterToIndex(layout.prazo_meses);
      colAde               = colLetterToIndex(layout.numero_ade || layout.numero_proposta || layout.numero_contrato);
      colBeneficio         = colLetterToIndex(layout.numero_beneficio);
      colData              = colLetterToIndex(layout.data_digitacao || layout.data_proposta || layout.data_liberacao);
      colVendedor          = colLetterToIndex(layout.usuario_digitador || layout.assessor);
      colStatus            = colLetterToIndex(layout.status_contrato || layout.status);
      colComissao          = colLetterToIndex(layout.comissao_empresa);
      colComissaoPercentual = colLetterToIndex(layout.comissao_empresa_percentual);
      colContrato          = colLetterToIndex(layout.numero_contrato);
      colTabela            = colLetterToIndex(layout.tabela || layout.tabela_comissao);
      colDataRecebComissao = colLetterToIndex(layout.data_recebimento_comissao);
      colDataPagCliente    = colLetterToIndex(layout.data_pagamento_cliente || layout.data_liberacao);
      colDataCadastroProp  = colLetterToIndex(layout.data_cadastro_proposta || layout.data_digitacao);
      colCelular           = colLetterToIndex(layout.celular);
      colValorBaseComissao = colLetterToIndex(layout.valor_base_comissao);
    } else {
      // Detecção automática por cabeçalho
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const rowStr = rows[i].join(' ').toLowerCase();
        if (rowStr.includes('cpf') || rowStr.includes('nome') || rowStr.includes('cliente')) {
          headerRowIndex = i;
          break;
        }
      }
      const header = rows[headerRowIndex].map(h => String(h).toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      console.log('Cabeçalho detectado:', JSON.stringify(header));

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
      colConvenio  = findCol('convenio', 'convnio', 'orgao');
      colTipo      = findCol('tipo', 'modalidade');
      colValor     = findCol('valor', 'vlr');
      colPrazo     = findCol('prazo');
      colAde       = findCol('ade', 'proposta', 'contrato');
      colBeneficio = findCol('beneficio', 'benefic', 'matricula', 'benef');
      colData      = findCol('data', 'emisso', 'proposta', 'venda', 'liberacao');
      colVendedor  = findCol('digitador', 'assessor', 'vendedor', 'corretor');
      colStatus    = findCol('status');
      colComissao  = findCol('comissao', 'comisso');
      colContrato  = findCol('contrato', 'ade');
      colTabela    = findCol('tabela', 'produto');
      colCelular   = findCol('celular', 'telefone', 'fone');
    }

    console.log('Indices de colunas:', JSON.stringify({ colNome, colCpf, colBanco, colConvenio, colTipo, colValor, colPrazo, colStatus, colVendedor, colBeneficio, colAde }));

    // Buscar dados de referência — garantir que todos retornam arrays
    const toArray = (v) => Array.isArray(v) ? v : (v?.items || v?.data || v?.results || []);

    const [bancosRaw, conveniosRaw, clientesRaw, vendedoresRaw, statusListRaw, propostasExistentesRaw, tabelasComissaoRaw, tiposEmprestimoRaw] = await Promise.all([
      base44.asServiceRole.entities.Banco.filter({ empresa_id: empresaId }, null, 2000),
      base44.asServiceRole.entities.Convenio.filter({ empresa_id: empresaId }, null, 2000),
      base44.asServiceRole.entities.Cliente.filter({ empresa_id: empresaId }, null, 5000),
      base44.asServiceRole.entities.Colaborador.filter({ empresa_id: empresaId, status: 'ativo' }, null, 500),
      base44.asServiceRole.entities.StatusProposta.filter({ empresa_id: empresaId }, null, 500),
      base44.asServiceRole.entities.Proposta.filter({ empresa_id: empresaId, produto: 'emprestimo' }, null, 5000),
      base44.asServiceRole.entities.TabelaEmprestimo.filter({ empresa_id: empresaId, ativo: true }, null, 500),
      base44.asServiceRole.entities.TipoEmprestimo.filter({ empresa_id: empresaId, ativo: true }, null, 200),
    ]);

    const bancos = toArray(bancosRaw);
    const convenios = toArray(conveniosRaw);
    const clientes = toArray(clientesRaw);
    const vendedores = toArray(vendedoresRaw);
    const statusList = toArray(statusListRaw);
    const propostasExistentes = toArray(propostasExistentesRaw);
    const tabelasComissao = toArray(tabelasComissaoRaw);
    const tiposEmprestimo = toArray(tiposEmprestimoRaw);

    console.log(`Dados carregados: ${clientes.length} clientes, ${propostasExistentes.length} propostas, ${bancos.length} bancos`);

    // ════════════════════════════════════════════════════════════════════════════════════
    // PROTEÇÃO CONTRA DUPLICAÇÃO E COMISSÃO DUPLICADA
    // 
    // Regras rigorosas para garantir que NUNCA duplica proposta com comissão paga:
    // 1. Verifica contrato + banco (ID) PRIMEIRO — é a chave única
    // 2. Se não achar, verifica CPF + banco — menos específico, 2º nível
    // 3. SEMPRE verifica se comissão foi paga — se sim, IGNORA completamente
    // 4. Antes de CRIAR, refaz busca completa na base — não confia só no cache
    // 5. Se encontra duplicado COM COMISSÃO PAGA → IGNORA (não atualiza, não cria)
    // ════════════════════════════════════════════════════════════════════════════════════

    const normStr = s => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const normCpf = cpf => String(cpf || '').replace(/\D/g, '');
    
    // 🔐 DEDUPLICAÇÃO: Gera chave única = banco_normalizado + contrato
    const gerarChaveUnica = (bancoNome, contrato) => {
      const bancoNorm = normStr(bancoNome || '').replace(/\s+/g, '');
      const contratoNorm = String(contrato || '').replace(/\D/g, '');
      if (!bancoNorm || !contratoNorm) return null;
      return `${bancoNorm}_${contratoNorm}`;
    };
    
    // Função para verificar se proposta tem comissão paga (NUNCA deve tocar em propostas com comissão paga)
    const temComissaoPaga = (prop) => {
      if (!prop) return false;
      return prop.comissao_banco_recebida === true || prop.comissao_vendedor_paga === true;
    };

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
        const byCpf = clientes.find(c => normCpf(c.cpf) === cpfNorm || normCpf(c.pj_cnpj) === cpfNorm);
        if (byCpf) return byCpf;
      }
      if (nome) {
        return clientes.find(c => normStr(c.nome_completo) === normStr(nome));
      }
      return null;
    };

    // Busca o digitador pelo nome/código e retorna o VENDEDOR vinculado a ele.
    // Se o digitador não tiver vendedor_vinculado_id → retorna null (proposta fica sem vendedor).
    // Não atribui colaboradores com perfil "vendedor" diretamente via coluna digitador.
    const findVendedor = (nomeOuCod) => {
      if (!nomeOuCod) return null;

      // 1. Localiza o colaborador (digitador) pelo nome, código ou usuário_banco
      const digitador = vendedores.find(v =>
        normStr(v.nome).includes(normStr(nomeOuCod)) ||
        normStr(nomeOuCod).includes(normStr(v.nome)) ||
        v.codigo_vendedor === String(nomeOuCod).trim() ||
        (v.usuarios_banco || []).some(ub => normStr(ub.usuario) === normStr(nomeOuCod))
      );

      if (!digitador) return null;

      // 2. Se o digitador tem vendedor vinculado → retorna esse vendedor
      if (digitador.vendedor_vinculado_id) {
        return vendedores.find(v => v.id === digitador.vendedor_vinculado_id) || null;
      }

      // 3. Sem vínculo com vendedor → proposta fica sem vendedor
      return null;
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
      const match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
      if (match) {
        let [, d, m, y] = match;
        if (y.length === 2) y = '20' + y;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
      return null;
    };

    // Resolver tipo com base nos TipoEmprestimo cadastrados (aliases_importacao)
    const tiposNaoMapeados = {}; // { nomeOriginal: true } — para rastrear tipos desconhecidos desta importação

    const normTipo = (tipoRaw) => {
      if (!tipoRaw) return null; // null = sem tipo definido no arquivo
      const raw = String(tipoRaw).trim();

      // 1. Verificar aliases cadastrados em TipoEmprestimo
      if (tiposEmprestimo.length > 0) {
        for (const te of tiposEmprestimo) {
          const aliases = te.aliases_importacao || [];
          for (const alias of aliases) {
            if (normStr(alias) === normStr(raw)) return te.slug;
          }
          // Verificar também por nome direto
          if (normStr(te.nome) === normStr(raw) || normStr(te.slug) === normStr(raw)) return te.slug;
        }
        // Tipo não encontrado — marcar como não mapeado
        tiposNaoMapeados[raw] = true;
        return null; // pendente de vinculação
      }

      // 2. Fallback: mapeamento padrão (quando não há tipos cadastrados)
      const t = normStr(raw);
      if (t.includes('refin') && t.includes('port')) return 'REFIN_PORTABILIDADE';
      if (t.includes('port')) return 'PORTABILIDADE_PURA';
      if (t.includes('refin')) return 'REFINANCIAMENTO';
      if (t.includes('cartao') || t.includes('cartão')) {
        if (t.includes('benef')) return 'CARTAO_BENEFICIO';
        if (t.includes('consig')) return 'CARTAO_CONSIGNADO';
        return 'CARTAO';
      }
      if (t.includes('saque')) return 'SAQUE';
      return 'NOVO';
    };

    const dataRows = rows.slice(headerRowIndex + 1);
    let criadas = 0;
    let atualizadas = 0;
    let ignoradas = 0;
    let pendentes_tipo = 0;
    const erros = [];
    const previews = [];
    const propostasCriadasIds = []; // para log de desfazer

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowStr = row.join('').trim();
      if (!rowStr) continue;

      try {
        const nomeVal      = colNome      >= 0 ? String(row[colNome]      ?? '').trim() : '';
        const cpfVal       = colCpf       >= 0 ? String(row[colCpf]       ?? '').trim() : '';
        const bancoVal     = colBanco     >= 0 ? String(row[colBanco]     ?? '').trim() : '';
        const convenioVal  = colConvenio  >= 0 ? String(row[colConvenio]  ?? '').trim() : '';
        const tipoVal      = colTipo      >= 0 ? String(row[colTipo]      ?? '').trim() : '';
        const valorVal     = colValor     >= 0 ? row[colValor]                           : 0;
        const prazoVal     = colPrazo     >= 0 ? row[colPrazo]                           : null;
        const adeVal       = colAde       >= 0 ? String(row[colAde]       ?? '').trim() : '';
        const contratoVal  = colContrato  >= 0 ? String(row[colContrato]  ?? '').trim() : '';
        const beneficioVal = colBeneficio >= 0 ? String(row[colBeneficio] ?? '').trim() : '';
        const dataVal      = colData      >= 0 ? row[colData]                            : null;
        const vendedorVal  = colVendedor  >= 0 ? String(row[colVendedor]  ?? '').trim() : '';
        const statusVal    = colStatus    >= 0 ? String(row[colStatus]    ?? '').trim() : '';
        const comissaoVal  = colComissao  >= 0 ? row[colComissao]                        : null;
        const tabelaVal             = colTabela             >= 0 ? String(row[colTabela]             ?? '').trim() : '';
        const comissaoPercentualVal = colComissaoPercentual >= 0 ? row[colComissaoPercentual]                      : null;
        const dataRecebComissaoVal  = colDataRecebComissao  >= 0 ? row[colDataRecebComissao]                       : null;
        const dataPagClienteVal     = colDataPagCliente     >= 0 ? row[colDataPagCliente]                          : null;
        const dataCadastroPropVal   = colDataCadastroProp   >= 0 ? row[colDataCadastroProp]                        : null;
        const celularVal            = colCelular            >= 0 ? String(row[colCelular]            ?? '').trim() : '';
        const valorBaseComissaoVal  = colValorBaseComissao  >= 0 ? row[colValorBaseComissao]                        : null;
        const valorBrutoVal         = colValorBruto         >= 0 ? row[colValorBruto]                                : null;
        const parcelaVal            = colParcela            >= 0 ? row[colParcela]                                   : null;

        if (!nomeVal && !cpfVal) {
          ignoradas++;
          continue;
        }

        const banco   = findBanco(bancoVal);
        const conv    = findConvenio(convenioVal);
        let cliente = findCliente(cpfVal, nomeVal);
        const vend    = findVendedor(vendedorVal);

        // Criar ou atualizar cliente
        if (!cliente && (cpfVal || nomeVal)) {
          // Criar novo cliente com dados básicos da planilha
          const novoCliente = await base44.asServiceRole.entities.Cliente.create({
            empresa_id: empresaId,
            tipo_pessoa: 'Física',
            nome_completo: nomeVal || '',
            cpf: cpfVal || null,
            celular: celularVal || null,
            status: 'ativo',
          });
          clientes.push(novoCliente);
          cliente = novoCliente;
          console.log(`Cliente criado: ${nomeVal} (${cpfVal})`);
        } else if (cliente && atualizarTelefone && celularVal) {
          // Atualizar apenas telefone se configurado e veio no arquivo
          await base44.asServiceRole.entities.Cliente.update(cliente.id, { celular: celularVal });
          cliente = { ...cliente, celular: celularVal };
          const idx = clientes.findIndex(c => c.id === cliente.id);
          if (idx >= 0) clientes[idx] = cliente;
        }

        // Encontrar tabela de comissão por Banco + Tabela (combinação única)
        let tabelaComissao = null;
        if (tabelaVal) {
          const bancoNorm = normStr(banco?.nome || bancoVal || '');
          tabelaComissao = tabelasComissao.find(t => {
            const tabelaMatch =
              normStr(t.tabela || '') === normStr(tabelaVal) ||
              normStr(t.codigo_tabela || '') === normStr(tabelaVal);
            const bancoMatch = !bancoNorm || !normStr(t.banco || '') ||
              normStr(t.banco || '').includes(bancoNorm) ||
              bancoNorm.includes(normStr(t.banco || ''));
            return tabelaMatch && bancoMatch;
          });

          // Se não encontrou, criar nova tabela — se já existe, NÃO substituir
          if (!tabelaComissao) {
            const comissaoPerc = comissaoPercentualVal ? parseValor(comissaoPercentualVal) : 0;
            tabelaComissao = await base44.asServiceRole.entities.TabelaEmprestimo.create({
              empresa_id: empresaId,
              tabela: tabelaVal,
              convenio_id: conv?.id || null,
              convenio_nome: conv?.nome || convenioVal || null,
              banco: banco?.nome || bancoVal || null,
              produto: tipoVal || null,
              comissao_empresa: comissaoPerc,
              ativo: true,
            });
            tabelasComissao.push(tabelaComissao);
            console.log(`Nova tabela criada: ${tabelaVal} / ${banco?.nome || bancoVal}`);
          }
          // Se já existe → não alterar nada (manter dados originais cadastrados)
        }

        const valor        = parseValor(valorVal);      // valor líquido (coluna valor_liquido/valor_liberado)
        const valorBruto   = valorBrutoVal ? parseValor(valorBrutoVal) : 0; // valor bruto (coluna valor_bruto)
        const parcela      = parcelaVal ? parseValor(parcelaVal) : null;
        const prazo        = prazoVal ? (parseInt(String(prazoVal).replace(/\D/g, '')) || null) : null;
        const dataVend = parseData(dataVal) || new Date().toISOString().slice(0, 10);
        const tipo     = normTipo(tipoVal);
        const comissao = comissaoVal ? parseValor(comissaoVal) : null;

        // Se o tipo não foi mapeado E existem tipos cadastrados, pendenciar
        const tipoPendente = tipoVal && tipo === null && tiposEmprestimo.length > 0;
        if (tipoPendente) {
          pendentes_tipo++;
        }

        // Mapear status do arquivo para ID interno
        let statusId = null;
        if (statusVal) {
          // Procurar status ativo pelo nome exato primeiro (priorizando substatus ativos, depois principais ativos)
          const statusEncontrado =
            statusList.find(s => s.ativo && normStr(s.nome) === normStr(statusVal) && s.tipo === 'substatus') ||
            statusList.find(s => s.ativo && normStr(s.nome) === normStr(statusVal)) ||
            statusList.find(s => s.ativo && (normStr(s.nome).includes(normStr(statusVal)) || normStr(statusVal).includes(normStr(s.nome))));

          if (statusEncontrado) {
            statusId = statusEncontrado.id;
          } else {
            // Criar substatus pendente de vinculação
            const novoStatus = await base44.asServiceRole.entities.StatusProposta.create({
              empresa_id: empresaId,
              nome: statusVal,
              tipo: 'substatus',
              ativo: true,
              origem: 'importacao',
            });
            statusId = novoStatus.id;
            // Adicionar à lista local para evitar duplicatas na mesma importação
            statusList.push(novoStatus);
          }
        }

        const propostaBase = {
           empresa_id:                  empresaId,
           produto:                     'emprestimo',
           cliente_nome:                nomeVal || cliente?.nome_completo || '',
           cliente_cpf:                 cpfVal || cliente?.cpf || null,
           administradora_nome:         banco?.nome || bancoVal || null,
           emprestimo_convenio_nome:    conv?.nome || convenioVal || null,
           emprestimo_tipo:             tipo || null,
           tipo_importacao_original:    tipoPendente ? tipoVal : undefined,
           pendente_vinculacao_tipo:    tipoPendente ? true : undefined,
           emprestimo_numero_ade:       adeVal || null,
           emprestimo_numero_beneficio: beneficioVal || null,
           emprestimo_prazo:            prazo,
           emprestimo_valor_parcela:    parcela || undefined,
           contrato:                    contratoVal || adeVal || null,
           vendedor_nome:               vend?.nome || vendedorVal || null,
           data_venda:                  parseData(dataCadastroPropVal) || dataVend,
           valor_credito:               valorBruto > 0 ? valorBruto : (valor > 0 ? valor : undefined),
           valor_liquido:               valor > 0 ? valor : undefined,
           valor_comissao:              comissao,
           status:                      statusVal || null,
           status_id:                   statusId || null,
           tabela_comissao_id:          tabelaComissao?.id || null,
           tabela_comissao_nome:        tabelaComissao ? (tabelaComissao.tabela || tabelaComissao.nome) : null,
           emprestimo_data_liberacao:   parseData(dataPagClienteVal) || undefined,
           data_comissao_recebida:      parseData(dataRecebComissaoVal) || undefined,
           comissao_banco_base_comissao: valorBaseComissaoVal ? parseValor(valorBaseComissaoVal) : undefined,
         };

         // Adicionar IDs somente se existirem (campos string)
         propostaBase.cliente_id = cliente?.id || 'importado';
         propostaBase.administradora_id = banco?.id || null;
         if (conv?.id) propostaBase.emprestimo_convenio_id = conv.id;

         // 🏢 Adicionar empresa parceira selecionada no formulário
         if (body.empresa_parceira_id) {
           propostaBase.empresa_parceira_id = body.empresa_parceira_id;
           propostaBase.empresa_parceira_nome = body.empresa_parceira_nome || '';
         }

        // Vincular vendedor
        if (vend?.id) {
          propostaBase.vendedor_id = vend.id;
          propostaBase.vendedor_nome = vend.nome;
        } else if (vendedorVal) {
          // Digitador informado no arquivo mas não encontrou vínculo -> sem vendedor
          propostaBase.vendedor_id = null;
          propostaBase.vendedor_nome = vendedorVal;
        }

        // Remover campos null para criação (mas mantemos para update separado)
        const proposta = Object.fromEntries(
          Object.entries(propostaBase).filter(([, v]) => v !== null && v !== undefined)
        );

        // Objeto de update inclui explicitamente o vendedor (mesmo null para limpar)
        const updatePayload = { ...proposta };
        if (vend?.id) {
          updatePayload.vendedor_id = vend.id;
          updatePayload.vendedor_nome = vend.nome;
        } else if (vendedorVal) {
          updatePayload.vendedor_id = null;
          updatePayload.vendedor_nome = vendedorVal;
        }

        // 🔐 DEDUPLICAÇÃO COM CHAVE ÚNICA: 100% efetiva
        const chaveUnica = gerarChaveUnica(proposta.administradora_nome, proposta.contrato);

        if (!chaveUnica) {
          // Sem contrato ou banco → não conseguimos gerar chave = ignorar
          ignoradas++;
          console.log(`⚠️ IGNORADA (sem contrato/banco): ${nomeVal}`);
        } else {
          // Adicionar chave única à proposta
          proposta.chave_unica = chaveUnica;

          try {
            // Procurar proposta existente pela chave única (única busca necessária!)
            const resultado = toArray(
              await base44.asServiceRole.entities.Proposta.filter({
                empresa_id: empresaId,
                chave_unica: chaveUnica,
                produto: 'emprestimo',
              })
            );

            if (resultado.length > 0) {
              // 🔴 Proposta JÁ EXISTE!
              const propostaExistente = resultado[0];

              if (temComissaoPaga(propostaExistente)) {
                // ❌ NUNCA TOCA EM PROPOSTA COM COMISSÃO PAGA
                ignoradas++;
                console.log(`❌ IGNORADA (chave: ${chaveUnica}, comissão paga): ${nomeVal}`);
              } else {
                // ✅ Seguro atualizar — comissão não foi paga
                const updateData = {};
                if (statusVal) {
                  updateData.status = statusVal;
                  updateData.status_id = statusId || null;
                }
                if (dataVend) updateData.data_venda = dataVend;
                if (parseData(dataPagClienteVal)) updateData.emprestimo_data_liberacao = parseData(dataPagClienteVal);
                if (valorBruto > 0) updateData.valor_credito = valorBruto;
                else if (valor > 0) updateData.valor_credito = valor;
                if (valor > 0) updateData.valor_liquido = valor;
                if (comissaoVal) updateData.valor_comissao = parseValor(comissaoVal);
                if (parcela) updateData.emprestimo_valor_parcela = parcela;
                if (prazo) updateData.emprestimo_prazo = prazo;
                if (tabelaComissao?.id) {
                  updateData.tabela_comissao_id = tabelaComissao.id;
                  updateData.tabela_comissao_nome = tabelaComissao.tabela || tabelaComissao.nome;
                }
                if (body.empresa_parceira_id) {
                  updateData.empresa_parceira_id = body.empresa_parceira_id;
                  updateData.empresa_parceira_nome = body.empresa_parceira_nome || '';
                }

                await base44.asServiceRole.entities.Proposta.update(propostaExistente.id, updateData);
                atualizadas++;
                console.log(`✅ ATUALIZADA (chave: ${chaveUnica}): ${nomeVal}`);
              }
            } else {
              // 🆕 Realmente é nova — CRIAR com segurança
              const nova = await base44.asServiceRole.entities.Proposta.create(proposta);
              criadas++;
              propostasCriadasIds.push(nova.id);
              console.log(`🆕 CRIADA (chave: ${chaveUnica}): ${nomeVal}`);
            }
          } catch (err) {
            console.error(`❌ Erro ao processar chave ${chaveUnica}:`, err.message);
            ignoradas++;
          }
        }

        previews.push({
          nome: proposta.cliente_nome,
          banco: proposta.administradora_nome,
          tipo: tipo || tipoVal,
          tipoPendente,
          valor,
          data: dataVend,
          status: statusVal,
        });

      } catch (err) {
        erros.push(`Linha ${i + 2}: ${err.message}`);
        console.error(`Erro na linha ${i + 2}:`, err);
      }
    }

    // ── Vincular vendedor automaticamente ──────────────────────────────────────
    // Para cada proposta sem vendedor, verificar se o mesmo cliente (por CPF)
    // tem OUTRA proposta COM vendedor → vincular o mesmo vendedor automaticamente.
    let vinculados_auto = 0;
    try {
      // Recarregar propostas atualizadas
      const todasPropostas = toArray(
        await base44.asServiceRole.entities.Proposta.filter({ empresa_id: empresaId, produto: 'emprestimo' }, null, 5000)
      );

      // Mapear CPF → vendedor_id/nome (da proposta que tem vendedor)
      const cpfVendedorMap = {};
      for (const p of todasPropostas) {
        const cpf = normCpf(p.cliente_cpf || '');
        if (cpf && p.vendedor_id && p.vendedor_nome) {
          cpfVendedorMap[cpf] = { vendedor_id: p.vendedor_id, vendedor_nome: p.vendedor_nome };
        }
      }

      // Aplicar vendedor nas propostas sem vendedor do mesmo CPF
      for (const p of todasPropostas) {
        const cpf = normCpf(p.cliente_cpf || '');
        if (!cpf) continue;
        if (p.vendedor_id) continue; // já tem vendedor
        const vInfo = cpfVendedorMap[cpf];
        if (!vInfo) continue;

        await base44.asServiceRole.entities.Proposta.update(p.id, {
          vendedor_id: vInfo.vendedor_id,
          vendedor_nome: vInfo.vendedor_nome,
        });
        vinculados_auto++;
        console.log(`Vendedor vinculado automaticamente: ${p.cliente_nome} (${p.contrato}) → ${vInfo.vendedor_nome}`);
      }
    } catch (err) {
      console.error('Erro ao vincular vendedores automáticos:', err.message);
    }
    // ───────────────────────────────────────────────────────────────────────────

    // ── Salvar log da importação (para histórico e desfazer) ──────────────────
    try {
      const empresaParceiras = body.empresa_parceira_id
        ? toArray(await base44.asServiceRole.entities.EmpresaParceira.filter({ id: body.empresa_parceira_id }))
        : [];
      const epNome = empresaParceiras[0]?.nome || '';

      // Buscar layout nome
      let layoutNome = '';
      if (body.layout_id) {
        const lays = toArray(await base44.asServiceRole.entities.LayoutImportacao.filter({ id: body.layout_id }));
        layoutNome = lays[0]?.nome || '';
      }

      await base44.asServiceRole.entities.ImportacaoPropostasLog.create({
        empresa_id: empresaId,
        empresa_parceira_id: body.empresa_parceira_id || null,
        empresa_parceira_nome: epNome,
        layout_nome: layoutNome,
        arquivo_nome: body.arquivo_nome || '',
        usuario_nome: user.full_name || '',
        criadas,
        atualizadas,
        ignoradas,
        propostas_ids_criadas: JSON.stringify(propostasCriadasIds),
        status: 'concluida',
      });
    } catch (logErr) {
      console.error('Erro ao salvar log:', logErr.message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    return Response.json({
      success: true,
      criadas,
      atualizadas,
      ignoradas,
      pendentes_tipo,
      vinculados_auto,
      tipos_nao_mapeados: Object.keys(tiposNaoMapeados),
      erros: erros.slice(0, 20),
      previews: previews.slice(0, 5),
    });

  } catch (error) {
    console.error('Erro na importação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});