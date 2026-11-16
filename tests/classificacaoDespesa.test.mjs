import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificacaoDespesa } from '../src/components/financeiro/classificacaoDespesa.js';

const categorias = [
  { id: 'marketing', empresa_id: 'jd', nome: 'Marketing', status: 'ativa' },
  { id: 'eventos', empresa_id: 'jd', nome: 'Eventos', categoria_pai_id: 'marketing', status: 'ativa' },
];

test('lançamento antigo de Eventos recupera Marketing sem alterar o registro', () => {
  const registro = { empresa_id: 'jd', categoria: 'Eventos', valor: 300, status: 'pago' };
  assert.deepEqual(classificacaoDespesa(registro, categorias), {
    categoria: 'Marketing', categoria_id: 'marketing', subcategoria_id: 'eventos', subcategoria_nome: 'Eventos',
  });
  assert.equal(registro.categoria, 'Eventos');
  assert.equal(registro.valor, 300);
  assert.equal(registro.status, 'pago');
});

test('cadastro com campos separados e remoção da subcategoria sobrevivem à reabertura', () => {
  const registro = { empresa_id: 'jd', categoria: 'Marketing', categoria_id: 'marketing', subcategoria_id: 'eventos', subcategoria_nome: 'Eventos' };
  assert.deepEqual(classificacaoDespesa(registro, categorias), {
    categoria: 'Marketing', categoria_id: 'marketing', subcategoria_id: 'eventos', subcategoria_nome: 'Eventos',
  });
  const semSubcategoria = classificacaoDespesa({ ...registro, subcategoria_id: '', subcategoria_nome: '' }, categorias);
  assert.equal(semSubcategoria.categoria, 'Marketing');
  assert.equal(semSubcategoria.subcategoria_nome, '');
});

test('nomes ambíguos não são reclassificados e categorias de outra empresa são ignoradas', () => {
  const outraEmpresa = { id: 'outra', empresa_id: 'outra', nome: 'Eventos' };
  assert.equal(classificacaoDespesa({ empresa_id: 'jd', categoria: 'Eventos' }, [...categorias, outraEmpresa]).categoria, 'Marketing');
  const duplicada = { id: 'duplicada', empresa_id: 'jd', nome: 'Eventos' };
  assert.equal(classificacaoDespesa({ empresa_id: 'jd', categoria: 'Eventos' }, [...categorias, duplicada]).categoria, 'Eventos');
  assert.equal(classificacaoDespesa({ empresa_id: 'jd', categoria: 'Eventos' }, [outraEmpresa]).categoria, 'Eventos');
});

test('categoria antiga sem correspondência mantém o nome e aceita resolução posterior', () => {
  const registro = { empresa_id: 'jd', categoria: 'Eventos' };
  const antes = classificacaoDespesa(registro, []);
  assert.equal(antes.categoria, 'Eventos');
  assert.equal(classificacaoDespesa({ ...registro, ...antes }, categorias).categoria, 'Marketing');
});

test('categoria inativa continua disponível para o histórico', () => {
  assert.equal(classificacaoDespesa({ empresa_id: 'jd', categoria: 'Eventos' }, categorias.map(c => ({ ...c, status: 'inativa' }))).categoria, 'Marketing');
});
