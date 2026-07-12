import { jsPDF } from 'jspdf';

export const TIPO_LABELS_TERMO = {
  NOVO: 'Novo',
  REFINANCIAMENTO: 'Refinanciamento',
  PORTABILIDADE_PURA: 'Portabilidade',
  REFIN_PORTABILIDADE: 'Portabilidade + Refinanciamento',
  CARTAO_CONSIGNADO: 'Cartão consignado',
  SAQUE_COMPLEMENTAR: 'Saque complementar',
};

const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const fmtMoeda = (v) => (v || v === 0) ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : null;
const fmtData = (d) => {
  if (!d) return null;
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('pt-BR');
};
const dataExtenso = (date = new Date()) => `${date.getDate()} de ${MESES_PT[date.getMonth()]} de ${date.getFullYear()}`;

export function getTipoOperacaoLabel(proposta) {
  return TIPO_LABELS_TERMO[proposta?.emprestimo_tipo] || proposta?.emprestimo_tipo || '-';
}

export function gerarTermoAutorizacaoPDF(proposta, cliente, empresa) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginX = 18;
  const maxWidth = pageWidth - marginX * 2;
  let y = 20;

  const checkBreak = (needed = 8) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
  };

  const addTitle = (text) => {
    checkBreak(14);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((l) => {
      checkBreak(7);
      doc.text(l, pageWidth / 2, y, { align: 'center' });
      y += 6;
    });
    y += 4;
  };

  const addSectionHeader = (text) => {
    checkBreak(10);
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.text(text, marginX, y);
    y += 6;
  };

  const addParagraph = (text, opts = {}) => {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach((l) => {
      checkBreak(6);
      doc.text(l, marginX, y);
      y += 5;
    });
    y += 2;
  };

  const addBullets = (items) => {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    items.forEach((item) => {
      const lines = doc.splitTextToSize(`- ${item}`, maxWidth - 4);
      lines.forEach((l, idx) => {
        checkBreak(6);
        doc.text(l, marginX + (idx === 0 ? 0 : 3), y);
        y += 5;
      });
    });
    y += 2;
  };

  // Campo de dado (label + valor); omite a linha se o valor for vazio/nulo (campos opcionais)
  const addField = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    const labelText = `${label}: `;
    checkBreak(6);
    doc.text(labelText, marginX, y);
    const labelWidth = doc.getTextWidth(labelText);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(String(value), maxWidth - labelWidth);
    doc.text(valueLines[0], marginX + labelWidth, y);
    y += 5;
    for (let i = 1; i < valueLines.length; i++) {
      checkBreak(6);
      doc.text(valueLines[i], marginX, y);
      y += 5;
    }
  };

  // ==================== DADOS ====================
  const clienteNome = cliente?.nome_completo || proposta.cliente_nome;
  const clienteCpf = cliente?.cpf || proposta.cliente_cpf;
  const enderecoCompleto = cliente
    ? `${cliente.res_endereco || ''}${cliente.res_numero ? ', nº ' + cliente.res_numero : ''}${cliente.res_complemento ? ', ' + cliente.res_complemento : ''}${cliente.res_bairro ? ', Bairro ' + cliente.res_bairro : ''}${cliente.res_cidade ? ', ' + cliente.res_cidade : ''}${cliente.res_uf ? ' – ' + cliente.res_uf : ''}${cliente.res_cep ? ', CEP ' + cliente.res_cep : ''}.`
    : null;

  const empresaEnderecoCompleto = empresa
    ? `${empresa.endereco_rua || ''}${empresa.endereco_numero ? ', nº ' + empresa.endereco_numero : ''}${empresa.endereco_complemento ? ', ' + empresa.endereco_complemento : ''}${empresa.endereco_cidade ? ', ' + empresa.endereco_cidade : ''}${empresa.endereco_estado ? ' – ' + empresa.endereco_estado : ''}${empresa.endereco_cep ? ', CEP ' + empresa.endereco_cep : ''}.`
    : null;

  // ==================== CABEÇALHO ====================
  addTitle('TERMO DE AUTORIZAÇÃO PARA INTERMEDIAÇÃO E FORMALIZAÇÃO DE OPERAÇÃO DE CRÉDITO');

  // I – Autorizante
  addSectionHeader('I – IDENTIFICAÇÃO DO(A) AUTORIZANTE');
  addField('Nome completo', clienteNome);
  addField('CPF', clienteCpf);
  addField('RG', cliente?.rg);
  addField('Órgão expedidor', cliente?.rg_orgao_emissor);
  addField('Data de nascimento', fmtData(cliente?.data_nascimento));
  addField('Estado civil', cliente?.estado_civil);
  addField('Profissão', cliente?.profissao);
  addField('Telefone', cliente?.celular || cliente?.telefone_fixo);
  addField('E-mail', cliente?.email);
  addField('Endereço completo', enderecoCompleto);
  addParagraph('Doravante denominado(a) simplesmente AUTORIZANTE.');
  y += 2;

  // II – Empresa Autorizada
  addSectionHeader('II – IDENTIFICAÇÃO DA EMPRESA AUTORIZADA');
  addField('Razão social', empresa?.nome);
  addField('Nome fantasia', empresa?.nome_fantasia);
  addField('CNPJ', empresa?.cpf_cnpj);
  addField('Endereço completo', empresaEnderecoCompleto);
  addField('Telefone', empresa?.telefone);
  addField('E-mail', empresa?.email);
  addField('Representante legal', empresa?.socio_nome);
  addParagraph('Doravante denominada simplesmente EMPRESA AUTORIZADA.');
  y += 2;

  // III – Operação
  addSectionHeader('III – IDENTIFICAÇÃO DA OPERAÇÃO');
  addField('Instituição financeira', proposta.administradora_nome);
  addField('Tipo de operação', getTipoOperacaoLabel(proposta));
  addField('Número da proposta', proposta.codigo_proposta_banco);
  addField('Número do contrato', proposta.contrato);
  addField('ADE', proposta.emprestimo_numero_ade);
  addField('Benefício ou matrícula', proposta.emprestimo_numero_beneficio);
  addField('Valor bruto da operação', fmtMoeda(proposta.valor_credito));
  addField('Valor líquido previsto para liberação', fmtMoeda(proposta.valor_liquido));
  addField('Quantidade de parcelas', proposta.emprestimo_prazo);
  addField('Valor de cada parcela', fmtMoeda(proposta.emprestimo_valor_parcela));
  addField('Prazo da operação', proposta.emprestimo_prazo ? `${proposta.emprestimo_prazo} meses` : null);
  addField('Data da proposta', fmtData(proposta.data_venda));
  addField('Vendedor', proposta.vendedor_nome);
  addField('Responsável', proposta.responsavel_nome);
  y += 2;

  // IV – Objeto
  addSectionHeader('IV – OBJETO DA AUTORIZAÇÃO');
  addParagraph('Pelo presente instrumento, o(a) AUTORIZANTE declara que solicitou, de maneira livre e consciente, a intermediação da operação de crédito identificada neste Termo.');
  addParagraph('O(A) AUTORIZANTE autoriza expressamente a EMPRESA AUTORIZADA a realizar os atos de intermediação e apoio operacional necessários à análise, simulação, cadastramento, formalização e acompanhamento da operação perante a instituição financeira indicada, respeitados os limites deste documento e as autorizações exigidas pela instituição financeira.');
  addParagraph('Esta autorização não transfere à EMPRESA AUTORIZADA poderes para receber valores pertencentes ao(à) AUTORIZANTE, movimentar suas contas bancárias, utilizar senhas pessoais, contratar produto diferente do descrito neste Termo ou alterar unilateralmente as condições apresentadas.');
  addParagraph('A contratação definitiva dependerá da análise, aprovação e formalização perante a instituição financeira responsável.');

  // V – Declaração de ciência
  addSectionHeader('V – DECLARAÇÃO DE CIÊNCIA DAS CONDIÇÕES');
  addParagraph('O(A) AUTORIZANTE declara que recebeu ou teve acesso às principais informações disponíveis sobre a operação, incluindo:');
  addBullets([
    'instituição financeira;',
    'modalidade da operação;',
    'valor bruto;',
    'valor líquido estimado;',
    'valor da parcela;',
    'quantidade de parcelas;',
    'prazo total;',
    'número da proposta ou contrato;',
    'demais condições apresentadas durante a contratação.',
  ]);
  addParagraph('O(A) AUTORIZANTE declara estar ciente de que valores, taxas, margem disponível, saldo devedor, prazo e condições poderão ser confirmados ou ajustados pela instituição financeira antes da conclusão da contratação.');
  addParagraph('Caso haja alteração relevante nas condições registradas neste Termo, especialmente no valor liberado, valor da parcela, quantidade de parcelas, prazo ou instituição financeira, deverá ser obtida uma nova confirmação do cliente antes da conclusão da operação.');

  // VI – Declarações do autorizante
  addSectionHeader('VI – DECLARAÇÕES DO(A) AUTORIZANTE');
  addParagraph('O(A) AUTORIZANTE declara, sob sua responsabilidade, que:');
  addBullets([
    'solicitou espontaneamente a operação descrita neste documento;',
    'as informações fornecidas são verdadeiras e atualizadas;',
    'os documentos apresentados são legítimos e pertencem ao(à) próprio(a) AUTORIZANTE;',
    'teve oportunidade de esclarecer suas dúvidas;',
    'não sofreu coação, ameaça ou imposição para solicitar a operação;',
    'está ciente de que a EMPRESA AUTORIZADA atua como intermediadora e não garante a aprovação da proposta;',
    'está ciente de que a decisão de aprovação, recusa, liberação e definição final das condições pertence à instituição financeira;',
    'não forneceu senha bancária, senha do benefício, código pessoal ou qualquer outra credencial sigilosa à EMPRESA AUTORIZADA;',
    'deverá conferir as condições finais apresentadas pela instituição financeira antes da assinatura ou confirmação definitiva do contrato.',
  ]);

  // VII – Tratamento de dados
  addSectionHeader('VII – TRATAMENTO DE DADOS PESSOAIS');
  addParagraph('O(A) AUTORIZANTE declara estar ciente de que seus dados pessoais poderão ser tratados pela EMPRESA AUTORIZADA para:');
  addBullets([
    'identificação e atendimento;',
    'análise e cadastramento da proposta;',
    'encaminhamento à instituição financeira;',
    'formalização e acompanhamento da operação;',
    'prevenção a fraudes;',
    'cumprimento de obrigações legais e regulatórias;',
    'atendimento de auditorias;',
    'exercício regular de direitos em processos administrativos, judiciais ou extrajudiciais;',
    'manutenção do histórico e dos documentos relacionados à operação.',
  ]);
  addParagraph('Os dados deverão ser utilizados somente para finalidades legítimas relacionadas à operação e protegidos por medidas adequadas de segurança, observando-se a legislação aplicável sobre proteção de dados pessoais.');
  addParagraph('A LGPD regula o tratamento de dados pessoais, inclusive em meios digitais, e prevê diferentes bases legais conforme a finalidade do tratamento. Portanto, o sistema não deve tratar todo uso de dados apenas como "consentimento"; deve registrar a finalidade e a base aplicável a cada atividade.');

  // VIII – Validade e limites
  addSectionHeader('VIII – VALIDADE E LIMITES DA AUTORIZAÇÃO');
  addParagraph('A presente autorização se destina exclusivamente à operação identificada neste Termo e permanecerá válida durante o período necessário para sua análise, formalização, conclusão, cancelamento ou recusa definitiva.');
  addParagraph('O prazo de validade desta autorização não se confunde com o prazo de pagamento ou amortização do contrato de crédito.');
  if (proposta.emprestimo_prazo) {
    addParagraph(`Após a contratação, o contrato bancário poderá permanecer vigente pelo prazo registrado na operação, inclusive por até ${proposta.emprestimo_prazo} meses.`);
  }
  addParagraph('A autorização não permite a criação de novas operações, alteração da modalidade, troca de banco ou modificação relevante das condições sem nova manifestação do(a) AUTORIZANTE.');
  addParagraph('A autorização para processamento da proposta poderá ser revogada antes da formalização definitiva, mediante solicitação do(a) AUTORIZANTE, ressalvados os tratamentos e registros necessários ao cumprimento de obrigações legais, regulatórias e ao exercício regular de direitos.');

  // IX – Guarda e utilização
  addSectionHeader('IX – GUARDA E UTILIZAÇÃO DO DOCUMENTO');
  addParagraph('Este Termo e os registros relacionados à sua assinatura poderão ser armazenados em meio físico ou eletrônico pelo período necessário ao cumprimento das obrigações legais, regulatórias, contratuais e ao exercício regular de direitos.');
  addParagraph('Após sua assinatura, o Termo permanecerá arquivado como comprovação da manifestação de vontade do(a) AUTORIZANTE, inclusive após o encerramento ou quitação do contrato, respeitados os prazos legais aplicáveis.');
  addParagraph('O documento não deverá ser alterado depois de assinado. Qualquer correção deverá gerar uma nova versão, preservando-se a versão anterior no histórico.');
  addParagraph('Documentos digitalizados devem ser preservados, ao menos, durante os prazos legais de prescrição ou decadência aplicáveis.');

  // X – Assinatura e manifestação
  addSectionHeader('X – ASSINATURA E MANIFESTAÇÃO DE VONTADE');
  addParagraph('Ao assinar este Termo, física ou eletronicamente, o(a) AUTORIZANTE confirma:');
  addBullets([
    'sua identidade;',
    'a leitura ou apresentação do conteúdo;',
    'a conferência dos dados da operação;',
    'a concordância com a intermediação descrita;',
    'sua livre manifestação de vontade.',
  ]);
  addParagraph('Quando utilizada assinatura eletrônica, o sistema deverá registrar os elementos disponíveis para comprovação de autoria, integridade, data, hora e vínculo do signatário com o documento.');

  // XI – Foro
  addSectionHeader('XI – FORO');
  addParagraph('Para eventuais controvérsias decorrentes deste Termo, fica indicado o Foro da Comarca de Águas Belas, Estado de Pernambuco, quando legalmente permitido, sem prejuízo do foro do domicílio do consumidor ou de outra competência obrigatória prevista na legislação aplicável.');

  // XII – Local, data e assinaturas
  addSectionHeader('XII – LOCAL, DATA E ASSINATURAS');
  addField('Local', empresa?.endereco_cidade ? `${empresa.endereco_cidade} – ${empresa.endereco_estado || ''}` : null);
  addField('Data', dataExtenso());
  y += 6;

  checkBreak(30);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSINATURA DO(A) AUTORIZANTE', marginX, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.line(marginX, y, marginX + 80, y);
  y += 5;
  doc.text(clienteNome || '-', marginX, y);
  y += 5;
  doc.text(`CPF: ${clienteCpf || '-'}`, marginX, y);
  y += 12;

  checkBreak(30);
  doc.setFont('helvetica', 'bold');
  doc.text('EMPRESA AUTORIZADA', marginX, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.line(marginX, y, marginX + 80, y);
  y += 5;
  doc.text(empresa?.nome || '-', marginX, y);
  y += 5;
  doc.text(`CNPJ: ${empresa?.cpf_cnpj || '-'}`, marginX, y);
  y += 5;
  doc.text(`Representante: ${empresa?.socio_nome || '-'}`, marginX, y);

  return doc;
}