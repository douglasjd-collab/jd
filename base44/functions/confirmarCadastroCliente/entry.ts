import { createClientFromRequest } from 'npm:@base44/sdk@0.8.39';

/**
 * Coach IA — confirmar criação/atualização do cadastro do cliente.
 * Chamado APENAS após revisão e autorização do atendente.
 * - Valida CPF novamente;
 * - Re-verifica duplicidade exata por CPF antes de criar;
 * - Cria ou atualiza o Cliente (PF) com apenas os campos informados (não apaga
 *   dados existentes em atualizar — apenas sobrescreve os selecionados);
 * - Vincula o cliente à conversa (ConversaWhatsapp.cliente_id);
 * - Vincula os documentos analisados ao cadastro (doc_identidade_urls e
 *   doc_comprovante_endereco_urls quando aplicável).
 */
const limparCpf = (s) => (s || '').toString().replace(/\D/g, '');

const validarCpf = (cpfStr) => {
  const cpf = limparCpf(cpfStr);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i], 10) * (10 - i);
  let d1 = 11 - (soma % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i], 10) * (11 - i);
  let d2 = 11 - (soma % 11);
  if (d2 >= 10) d2 = 0;
  if (d2 !== parseInt(cpf[10], 10)) return false;
  return true;
};

const paraDataISO = (val) => {
  if (!val) return null;
  const m = String(val).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return null;
};

const isUrlDocumento = (url) => /\.(pdf|png|jpe?g|webp|gif)(\?|$)/i.test(url || '');

const isUrlComprovante = (url) => /comprov|resid/i.test(url || '') ||
  /\.(png|jpe?g|webp)(\?|$)/i.test(url || '');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { conversa_id, empresa_id, dados = {}, acao, cliente_existente_id, documentos_urls = [] } = body;

    if (!empresa_id) return Response.json({ error: 'empresa_id é obrigatório.' }, { status: 400 });

    // ── Monta payload do Cliente a partir dos dados revisados ──
    const payload = {
      empresa_id,
      tipo_pessoa: 'Física',
      status: 'ativo'
    };

    const setS = (origKey, targetKey, transform = (v) => v) => {
      const v = dados[origKey];
      if (v != null && String(v).trim() !== '') {
        payload[targetKey] = transform(String(v).trim());
      }
    };

    // Dados pessoais
    setS('nome_completo', 'nome_completo');
    setS('cpf', 'cpf', (v) => limparCpf(v));
    setS('data_nascimento', 'data_nascimento', paraDataISO);
    setS('nome_mae', 'nome_mae');
    setS('nome_pai', 'nome_pai');
    setS('rg', 'rg');
    setS('data_emissao', 'rg_data_emissao', paraDataISO);
    setS('orgao_emissor', 'rg_orgao_emissor');
    // UF emissor não tem campo isolado no Cliente — guardamos no orgao_emissor quando UF também vier
    if (dados.uf_emissor && dados.orgao_emissor) {
      payload.rg_orgao_emissor = `${dados.orgao_emissor} / ${dados.uf_emissor}`.toUpperCase();
    } else if (dados.uf_emissor) {
      payload.rg_orgao_emissor = String(dados.uf_emissor).toUpperCase();
    }
    setS('sexo', 'sexo', (v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());
    setS('naturalidade', 'local_nascimento');
    setS('nacionalidade', 'nacionalidade');
    setS('estado_civil', 'estado_civil');
    setS('profissao', 'profissao');

    // Endereço
    setS('endereco_cep', 'res_cep');
    setS('endereco_logradouro', 'res_endereco');
    setS('endereco_numero', 'res_numero');
    setS('endereco_complemento', 'res_complemento');
    setS('endereco_bairro', 'res_bairro');
    setS('endereco_cidade', 'res_cidade');
    setS('endereco_estado', 'res_uf', (v) => String(v).toUpperCase().slice(0, 2));

    // Contato
    setS('telefone', 'celular');
    setS('email', 'email');

    // Documentos recebidos
    if (documentos_urls.length) {
      payload.doc_identidade = true;
      payload.doc_identidade_urls = documentos_urls;
      if (dados.endereco_cep && dados.endereco_cidade) {
        payload.doc_comprovante_endereco = true;
        payload.doc_comprovante_endereco_urls = documentos_urls.filter((u) => !/\.(pdf)(\?|$)/i.test(u));
      }
    }

    // ── Validar CPF novamente ──
    if (payload.cpf && !validarCpf(payload.cpf)) {
      return Response.json({
        error: 'O CPF informado não passou na validação. Confira o documento antes de continuar.'
      }, { status: 400 });
    }
    // Validar data de nascimento futura
    if (payload.data_nascimento) {
      const hoje = new Date().toISOString().slice(0, 10);
      if (payload.data_nascimento > hoje) {
        return Response.json({ error: 'Data de nascimento não pode ser futura.' }, { status: 400 });
      }
    }

    let clienteId;
    let acaoFinal = acao;

    // ── Atualização de cliente existente ──
    if (acaoFinal === 'atualizar' && cliente_existente_id) {
      try {
        await base44.asServiceRole.entities.Cliente.update(cliente_existente_id, payload);
        clienteId = cliente_existente_id;
      } catch (e) {
        return Response.json({ error: 'Falha ao atualizar cliente: ' + e.message }, { status: 500 });
      }
    } else {
      // ── Criar — re-verifica duplicidade por CPF ──
      if (payload.cpf) {
        const cpf = payload.cpf;
        const candidatos = await base44.asServiceRole.entities.Cliente.filter(
          { empresa_id }, '-created_date', 1000
        );
        const dup = candidatos.find((c) => limparCpf(c.cpf || '') === cpf);
        if (dup) {
          return Response.json({
            error: 'Já existe um cliente com o mesmo CPF. Operação cancelada para evitar duplicidade.',
            cliente_existente_id: dup.id,
            cliente_existente: {
              id: dup.id,
              nome_completo: dup.nome_completo,
              cpf: dup.cpf
            }
          }, { status: 409 });
        }
      }
      try {
        const novo = await base44.asServiceRole.entities.Cliente.create(payload);
        clienteId = novo.id;
        acaoFinal = 'criar';
      } catch (e) {
        return Response.json({ error: 'Falha ao criar cliente: ' + e.message }, { status: 500 });
      }
    }

    // ── Vincular conversa ──
    if (conversa_id && clienteId) {
      try {
        await base44.asServiceRole.entities.ConversaWhatsapp.update(conversa_id, { cliente_id: clienteId });
      } catch (e) {
        console.log('[confirmarCadastroCliente] erro ao vincular conversa:', e.message);
      }
    }

    return Response.json({
      success: true,
      cliente_id: clienteId,
      acao: acaoFinal,
      conversa_vinculada: Boolean(conversa_id),
      mensagem: acaoFinal === 'atualizar'
        ? 'Cadastro atualizado com sucesso. As informações foram adicionadas ao cadastro existente e a conversa foi vinculada.'
        : 'Cliente cadastrado com sucesso. O cadastro foi vinculado a esta conversa.',
      autorizado_por: { id: user.id, nome: user.full_name || user.email }
    });
  } catch (error) {
    console.error('[confirmarCadastroCliente] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});