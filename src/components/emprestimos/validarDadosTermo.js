// Validação dos dados obrigatórios para gerar o Termo de Autorização.
// Retorna { valido, faltantes: [{ label, categoria }] }

export function validarDadosTermo({ cliente, proposta, empresa }) {
  const faltantes = [];
  const add = (label, categoria) => faltantes.push({ label, categoria });

  // Cliente
  if (!cliente?.nome_completo && !proposta?.cliente_nome) add('Nome completo do cliente', 'cliente');
  if (!cliente?.cpf && !proposta?.cliente_cpf) add('CPF do cliente', 'cliente');
  if (!cliente?.rg) add('RG do cliente', 'cliente');
  if (!cliente?.res_endereco) add('Endereço do cliente', 'cliente');
  if (!cliente?.res_cidade) add('Cidade do cliente', 'cliente');
  if (!cliente?.res_uf) add('Estado do cliente', 'cliente');
  if (!cliente?.res_cep) add('CEP do cliente', 'cliente');

  // Operação
  if (!proposta?.administradora_nome) add('Banco da operação', 'proposta');
  if (!proposta?.emprestimo_tipo) add('Tipo de operação', 'proposta');
  if (!proposta?.emprestimo_valor_parcela) add('Valor da parcela', 'proposta');
  if (!proposta?.emprestimo_prazo) add('Quantidade de parcelas / Prazo', 'proposta');
  if (!proposta?.contrato && !proposta?.codigo_proposta_banco) add('Número da proposta ou contrato', 'proposta');

  // Empresa
  if (!empresa?.nome) add('Razão social da empresa', 'empresa');
  if (!empresa?.nome_fantasia) add('Nome fantasia da empresa', 'empresa');
  if (!empresa?.cpf_cnpj) add('CNPJ da empresa', 'empresa');
  if (!empresa?.endereco_rua) add('Endereço da empresa', 'empresa');
  if (!empresa?.endereco_cidade) add('Cidade da empresa', 'empresa');
  if (!empresa?.endereco_estado) add('Estado da empresa', 'empresa');
  if (!empresa?.endereco_cep) add('CEP da empresa', 'empresa');
  if (!empresa?.socio_nome) add('Representante legal da empresa', 'empresa');

  return { valido: faltantes.length === 0, faltantes };
}