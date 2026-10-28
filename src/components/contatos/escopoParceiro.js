import { base44 } from '@/api/base44Client';

// Escopo de dados do perfil parceiro: ele só enxerga o que é dos clientes dele.
const digitos = (valor) => String(valor || '').replace(/\D/g, '');

const adicionarTelefone = (set, valor) => {
  const d = digitos(valor);
  if (d.length < 10) return;
  set.add(d);
  set.add(d.slice(-11));
  set.add(d.slice(-10));
};

export async function montarEscopoParceiro(userId) {
  const clientes = await base44.entities.Cliente.filter({ vendedor_id: userId }, null, 2000);
  const clienteIds = new Set();
  const telefones = new Set();

  clientes.forEach(c => {
    clienteIds.add(c.id);
    adicionarTelefone(telefones, c.celular);
    adicionarTelefone(telefones, c.telefone_fixo);
    adicionarTelefone(telefones, c.pj_celular);
    adicionarTelefone(telefones, c.pj_telefone_fixo);
  });

  if (clienteIds.size > 0) {
    try {
      const outros = await base44.entities.ClienteTelefone.filter(
        { cliente_id: { $in: [...clienteIds] } },
        null,
        5000
      );
      outros.forEach(t => adicionarTelefone(telefones, t.telefone));
    } catch {
      // Sem telefones complementares: segue apenas com os do cadastro do cliente
    }
  }

  return { clienteIds, telefones };
}

export function contatoDoParceiro(contato, escopo) {
  if (!escopo) return false;
  if (contato.cliente_id && escopo.clienteIds.has(contato.cliente_id)) return true;
  const d = digitos(contato.telefone);
  if (d.length < 10) return false;
  return escopo.telefones.has(d) || escopo.telefones.has(d.slice(-11)) || escopo.telefones.has(d.slice(-10));
}