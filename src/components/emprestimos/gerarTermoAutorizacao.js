import { jsPDF } from 'jspdf';
import moment from 'moment';

const TIPO_LABELS_TERMO = {
  NOVO: 'Novo',
  REFINANCIAMENTO: 'Refinanciamento',
  PORTABILIDADE_PURA: 'Portabilidade',
  REFIN_PORTABILIDADE: 'Portabilidade + Refinanciamento',
};

const fmtMoeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtData = (d) => (d ? moment(d).format('DD/MM/YYYY') : '-');

export function gerarTermoAutorizacaoPDF(proposta, cliente, empresa) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let y = 20;

  const addSectionTitle = (titulo) => {
    doc.setFillColor(16, 53, 60);
    doc.rect(14, y - 6, pageWidth - 28, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 18, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  };

  const addRow = (label, valor) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 18, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(valor || '-'), 70, y);
    y += 6;
    if (y > 275) {
      doc.addPage();
      y = 20;
    }
  };

  // Cabeçalho
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMO DE AUTORIZAÇÃO', pageWidth / 2, y, { align: 'center' });
  y += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Gerado em: ${moment().format('DD/MM/YYYY HH:mm')}`, pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Dados do Cliente
  addSectionTitle('DADOS DO CLIENTE');
  addRow('Nome', cliente?.nome_completo || proposta.cliente_nome);
  addRow('CPF', cliente?.cpf || proposta.cliente_cpf);
  addRow('RG', cliente?.rg);
  addRow('Data de Nascimento', fmtData(cliente?.data_nascimento));
  addRow('Estado Civil', cliente?.estado_civil);
  addRow('Profissão', cliente?.profissao);
  addRow('Telefone', cliente?.celular || cliente?.telefone_fixo);
  addRow('Email', cliente?.email);
  addRow('Endereço', cliente?.res_endereco);
  addRow('Número', cliente?.res_numero);
  addRow('Complemento', cliente?.res_complemento);
  addRow('Bairro', cliente?.res_bairro);
  addRow('Cidade', cliente?.res_cidade);
  addRow('Estado', cliente?.res_uf);
  addRow('CEP', cliente?.res_cep);
  y += 4;

  // Dados da Operação
  addSectionTitle('DADOS DA OPERAÇÃO');
  addRow('Banco', proposta.administradora_nome);
  addRow('Tipo da Operação', TIPO_LABELS_TERMO[proposta.emprestimo_tipo] || proposta.emprestimo_tipo || '-');
  addRow('Contrato', proposta.contrato);
  addRow('ADE', proposta.emprestimo_numero_ade);
  addRow('Valor Liberado', fmtMoeda(proposta.valor_liquido || proposta.valor_credito));
  addRow('Quantidade de Parcelas', proposta.emprestimo_prazo);
  addRow('Valor da Parcela', fmtMoeda(proposta.emprestimo_valor_parcela));
  addRow('Prazo', proposta.emprestimo_prazo ? `${proposta.emprestimo_prazo} meses` : '-');
  addRow('Data da Proposta', fmtData(proposta.data_venda));
  addRow('Vendedor', proposta.vendedor_nome);
  addRow('Responsável', proposta.responsavel_nome);
  y += 4;

  // Dados da Empresa
  addSectionTitle('DADOS DA EMPRESA');
  addRow('Razão Social', empresa?.nome);
  addRow('Nome Fantasia', empresa?.nome_fantasia);
  addRow('CNPJ', empresa?.cpf_cnpj);
  addRow('Endereço', `${empresa?.endereco_rua || ''}${empresa?.endereco_numero ? ', ' + empresa.endereco_numero : ''}`);
  addRow('Cidade', empresa?.endereco_cidade);
  addRow('CEP', empresa?.endereco_cep);
  addRow('Telefone', empresa?.telefone);
  addRow('Email', empresa?.email);
  addRow('Responsável Legal', empresa?.socio_nome);
  y += 10;

  // Assinaturas
  if (y > 250) {
    doc.addPage();
    y = 30;
  }
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.line(18, y, 100, y);
  doc.text('Assinatura do Cliente', 18, y + 5);
  doc.line(pageWidth - 100, y, pageWidth - 18, y);
  doc.text('Assinatura do Responsável', pageWidth - 100, y + 5);

  return doc;
}