import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Isolar a API: os testes não consultam nem alteram registros reais.
const { outputFiles } = await build({
  entryPoints: ['src/components/funil/moverOportunidade.js'],
  bundle: true, write: false, format: 'esm',
  plugins: [{ name: 'api-falsa', setup(b) {
    b.onResolve({ filter: /^(@\/api\/base44Client|sonner)$/ }, args => ({ path: args.path, namespace: 'falso' }));
    b.onLoad({ filter: /.*/, namespace: 'falso' }, args => ({
      contents: args.path === 'sonner' ? 'export const toast = { warning() {} };' : 'export const base44 = {};',
    }));
  }}],
});
const { moverOportunidade } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));

function cenario(op = {}, destino = {}) {
  const oportunidade = { id: 'op1', empresa_id: 'emp1', titulo: 'Carro', vendedor_id: 'v1', etapa_id: 'e1', etapa_nome: 'Qualificação', produto: 'consorcio', ...op };
  const etapas = [
    { id: 'e1', nome: oportunidade.etapa_nome, empresa_id: 'emp1', produto: 'consorcio', tipo: 'aberta' },
    { id: 'e2', nome: 'Negociação', empresa_id: 'emp1', produto: 'consorcio', tipo: 'aberta', ...destino },
  ];
  const gravacoes = [];
  const avisos = [];
  const client = {
    auth: { me: async () => ({ id: 'u1', full_name: 'Vendedora', empresa_id: 'emp1' }) },
    entities: {
      Oportunidade: { get: async () => oportunidade, update: async (id, data) => { gravacoes.push(['oportunidade', id, data]); Object.assign(oportunidade, data); } },
      MovimentacaoFunil: { create: async data => { gravacoes.push(['historico', data]); } },
      LogAuditoria: { create: async data => { gravacoes.push(['auditoria', data]); } },
      AlertePreFechamento: { filter: async () => [{ id: 'a1' }], update: async (id, data) => { gravacoes.push(['alerta', id, data]); } },
      ComentarioOportunidade: { filter: async () => [] },
    },
  };
  const args = { client, etapas, oportunidadeId: 'op1', novaEtapaId: 'e2', avisar: msg => avisos.push(msg) };
  return { args, gravacoes, avisos, oportunidade };
}

test('mover preserva dados da oportunidade e registra autor e observação', async () => {
  const c = cenario();
  await moverOportunidade({ ...c.args, observacao: 'Cliente recebeu cotação' });
  const update = c.gravacoes.find(g => g[0] === 'oportunidade')[2];
  assert.equal(update.empresa_id, 'emp1');
  assert.equal(update.vendedor_id, 'v1');
  assert.equal(update.etapa_id, 'e2');
  assert.equal(update.status, 'aberta');
  const historico = c.gravacoes.find(g => g[0] === 'historico')[1];
  assert.equal(historico.etapa_origem_id, 'e1');
  assert.equal(historico.usuario_id, 'u1');
  assert.equal(historico.observacao, 'Cliente recebeu cotação');
});

test('entrar em planejamento do consórcio inicia controle das campanhas', async () => {
  const c = cenario({}, { tipo: 'planejamento' });
  await moverOportunidade(c.args);
  assert.ok(c.oportunidade.data_entrada_planejamento);
  assert.equal(c.oportunidade.campanha_planejamento_ultima, 0);
});

test('sair de pré-fechamento encerra alertas ativos', async () => {
  const c = cenario({ etapa_nome: 'Pré-Fechamento' });
  await moverOportunidade(c.args);
  assert.deepEqual(c.gravacoes.find(g => g[0] === 'alerta'), ['alerta', 'a1', { status: 'encerrado' }]);
});

test('ganho abre registro de venda somente quando não há venda vinculada', async () => {
  const c = cenario({}, { tipo: 'ganho' });
  assert.equal((await moverOportunidade(c.args)).abrirFormVenda, true);
  assert.equal(c.oportunidade.status, 'ganha');
  assert.ok(c.gravacoes.some(g => g[0] === 'auditoria'));
  const vinculado = cenario({ venda_id: 'venda1' }, { tipo: 'ganho' });
  assert.equal((await moverOportunidade(vinculado.args)).abrirFormVenda, false);
});

test('etapa inativa ou de outra empresa não causa gravação', async () => {
  for (const destino of [{ status: 'inativa' }, { empresa_id: 'outra' }]) {
    const c = cenario({}, destino);
    await assert.rejects(moverOportunidade(c.args), /Etapa indisponível/);
    assert.equal(c.gravacoes.length, 0);
  }
});

test('edição rápida exige cliente, motivo da perda e funil correto', async () => {
  for (const [destino, erro] of [[{ requer_cliente: true }, /Vincule/], [{ tipo: 'perdida' }, /motivo/], [{ produto: 'emprestimo' }, /mesmo funil/]]) {
    const c = cenario({}, destino);
    await assert.rejects(moverOportunidade({ ...c.args, validarRequisitos: true }), erro);
    assert.equal(c.gravacoes.length, 0);
  }
});

test('documentos obrigatórios impedem avanço sem anexo', async () => {
  const c = cenario({}, { requer_documentos: true });
  await assert.rejects(moverOportunidade({ ...c.args, validarRequisitos: true }), /exige documentos/);
  assert.equal(c.gravacoes.length, 0);
  c.args.client.entities.ComentarioOportunidade.filter = async () => [{ mensagem: '[Documento](https://example.com/documento.pdf)' }];
  await moverOportunidade({ ...c.args, validarRequisitos: true });
  assert.equal(c.oportunidade.etapa_id, 'e2');
});

test('mudança concorrente e repetição não duplicam movimentação', async () => {
  const c = cenario();
  await assert.rejects(moverOportunidade({ ...c.args, etapaEsperada: 'etapa-antiga' }), /outra pessoa/);
  assert.equal(c.gravacoes.length, 0);
  await moverOportunidade(c.args);
  await moverOportunidade(c.args);
  assert.equal(c.gravacoes.filter(g => g[0] === 'historico').length, 1);
});

test('falha de permissão não grava histórico nem etapa', async () => {
  const c = cenario();
  c.args.client.entities.Oportunidade.update = async () => { throw new Error('Acesso negado'); };
  await assert.rejects(moverOportunidade(c.args), /Acesso negado/);
  assert.equal(c.gravacoes.length, 0);
});

test('falha secundária avisa sem repetir operação já salva', async () => {
  const c = cenario();
  c.args.client.entities.MovimentacaoFunil.create = async () => { throw new Error('Indisponível'); };
  await moverOportunidade(c.args);
  assert.equal(c.oportunidade.etapa_id, 'e2');
  assert.equal(c.avisos.length, 1);
  assert.match(c.avisos[0], /histórico/);
});
