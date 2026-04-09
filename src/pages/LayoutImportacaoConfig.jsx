import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Copy, ChevronLeft, Trash2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

// Lista completa de campos internos
const CAMPOS_PRODUCAO = [
  { key: 'nome_completo', label: 'Nome Completo', obrigatorio: true },
  { key: 'cpf', label: 'CPF', obrigatorio: true },
  { key: 'data_nascimento', label: 'Data de Nascimento', obrigatorio: false },
  { key: 'rg', label: 'RG', obrigatorio: false },
  { key: 'data_emissao_rg', label: 'Data Emissão RG', obrigatorio: false },
  { key: 'orgao_emissor', label: 'Órgão Emissor', obrigatorio: false },
  { key: 'estado_civil', label: 'Estado Civil', obrigatorio: false },
  { key: 'profissao', label: 'Profissão', obrigatorio: false },
  { key: 'sexo', label: 'Sexo', obrigatorio: false },
  { key: 'celular', label: 'Celular', obrigatorio: false },
  { key: 'email', label: 'Email', obrigatorio: false },
  { key: 'endereco_logradouro', label: 'Nome da rua/avenida', obrigatorio: false },
  { key: 'endereco_numero', label: 'Número', obrigatorio: false },
  { key: 'endereco_complemento', label: 'Complemento', obrigatorio: false },
  { key: 'endereco_bairro', label: 'Bairro', obrigatorio: false },
  { key: 'endereco_cidade', label: 'Cidade', obrigatorio: false },
  { key: 'endereco_uf', label: 'UF', obrigatorio: false },
  { key: 'nome_pai', label: 'Nome do Pai', obrigatorio: false },
  { key: 'nome_mae', label: 'Nome da Mãe', obrigatorio: false },
  { key: 'nacionalidade', label: 'Nacionalidade', obrigatorio: false },
  { key: 'uf_nascimento', label: 'UF de Nascimento', obrigatorio: false },
  { key: 'cidade_nascimento', label: 'Cidade de Nascimento', obrigatorio: false },
  { key: 'renda', label: 'Renda', obrigatorio: false },
  { key: 'banco', label: 'Banco', obrigatorio: true },
  { key: 'tipo_consignado', label: 'Tipo de Consignado', obrigatorio: true },
  { key: 'convenio', label: 'Convênio', obrigatorio: true },
  { key: 'tabela', label: 'Tabela', obrigatorio: false },
  { key: 'numero_beneficio', label: 'Número do Benefício', obrigatorio: false },
  { key: 'usuario_digitador', label: 'Usuário Digitador', obrigatorio: false },
  { key: 'empresa_parceira', label: 'Empresa Parceira', obrigatorio: false },
  { key: 'valor_liberado', label: 'Valor Liberado', obrigatorio: true },
  { key: 'valor_bruto', label: 'Valor Bruto', obrigatorio: false },
  { key: 'valor_base_comissao', label: 'Valor Base Comissão', obrigatorio: false },
  { key: 'prazo_meses', label: 'Prazo (meses)', obrigatorio: false },
  { key: 'valor_parcela', label: 'Parcela', obrigatorio: false },
  { key: 'data_liberacao', label: 'Data de Liberação', obrigatorio: false },
  { key: 'data_digitacao', label: 'Data de Digitação', obrigatorio: false },
  { key: 'numero_contrato', label: 'Nº Contrato', obrigatorio: true },
  { key: 'numero_ade', label: 'Número ADE', obrigatorio: true },
  { key: 'status_contrato', label: 'Status', obrigatorio: true },
  { key: 'comissao_empresa', label: 'Comissão Empresa (Lançamento)', obrigatorio: false },
  { key: 'comissao_empresa_percentual', label: 'Comissão Empresa %', obrigatorio: false },
  { key: 'comissao_vendedor', label: 'Comissão Vendedor R$ (já pago)', obrigatorio: false },
  { key: 'comissao_vendedor_percentual', label: 'Comissão Vendedor % (já pago)', obrigatorio: false },
  { key: 'data_recebimento_comissao', label: 'Data de Recebimento da Comissão (Empresa)', obrigatorio: false },
  { key: 'data_pagamento_vendedor', label: 'Data de Pagamento ao Vendedor', obrigatorio: false },
];

const CAMPOS_COMISSAO = [
  { key: 'nome_completo', label: 'Nome Completo', obrigatorio: true },
  { key: 'cpf', label: 'CPF', obrigatorio: false },
  { key: 'banco', label: 'Banco', obrigatorio: true },
  { key: 'tabela_comissao', label: 'Tabela de Comissão', obrigatorio: false },
  { key: 'convenio', label: 'Convênio', obrigatorio: false },
  { key: 'tipo_consignado', label: 'Tipo de Consignado', obrigatorio: false },
  { key: 'numero_beneficio', label: 'Número do Benefício', obrigatorio: false },
  { key: 'numero_ade', label: 'Número ADE', obrigatorio: false },
  { key: 'contrato', label: 'Contrato/ADE', obrigatorio: false },
  { key: 'data_recebimento_comissao', label: 'Data de Recebimento da Comissão', obrigatorio: false },
  { key: 'data_pagamento_cliente', label: 'Data de Pagamento ao Cliente', obrigatorio: false },
  { key: 'data_cadastro_proposta', label: 'Data de Cadastro da Proposta', obrigatorio: false },
  { key: 'valor_bruto', label: 'Valor Bruto', obrigatorio: false },
  { key: 'valor_liquido', label: 'Valor Líquido', obrigatorio: false },
  { key: 'valor_parcela', label: 'Valor da Parcela', obrigatorio: false },
  { key: 'valor_comissao', label: 'Valor da Comissão', obrigatorio: true },
  { key: 'percentual_comissao', label: '% Comissão', obrigatorio: false },
  { key: 'comissao_vendedor', label: 'Comissão Vendedor', obrigatorio: false },
  { key: 'vendedor', label: 'Vendedor', obrigatorio: false },
  { key: 'observacao', label: 'Observação', obrigatorio: false },
];

// Gera opções de coluna A-Z, AA-AZ, BA-BZ etc.
const COLUNAS = (() => {
  const cols = ['Não Usado'];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  letters.forEach(l => cols.push(l));
  letters.forEach(l1 => letters.forEach(l2 => cols.push(l1 + l2)));
  return cols.slice(0, 60); // A até BH
})();

export default function LayoutImportacaoConfig() {
  const params = new URLSearchParams(window.location.search);
  const empresaParceiraId = params.get('empresa_parceira_id');
  const tipoParam = params.get('tipo') || 'producao'; // producao | comissao

  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [empresaParceira, setEmpresaParceira] = useState(null);
  const [layouts, setLayouts] = useState([]);
  const [layoutSelecionadoId, setLayoutSelecionadoId] = useState('novo');
  const [nomeLayout, setNomeLayout] = useState('');
  const [mapeamento, setMapeamento] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState(tipoParam);
  const [modoEdicao, setModoEdicao] = useState(false);
  const [atualizarTelefone, setAtualizarTelefone] = useState(false);

  const campos = tipo === 'producao' ? CAMPOS_PRODUCAO : CAMPOS_COMISSAO;

  useEffect(() => { init(); }, []);

  useEffect(() => { carregarLayouts(tipo); }, [tipo]);

  const init = async () => {
    setLoading(true);
    const me = await base44.auth.me();
    setUser(me);

    let eid = null;
    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) eid = empresas[0].id;
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) eid = colabs[0].empresa_id;
    }
    setEmpresaId(eid);

    if (empresaParceiraId) {
      const ep = await base44.entities.EmpresaParceira.filter({ id: empresaParceiraId });
      if (ep.length > 0) setEmpresaParceira(ep[0]);
    }
    setLoading(false);
  };

  const carregarLayouts = async (tipoAtual) => {
    if (!empresaParceiraId) return;
    const lays = await base44.entities.LayoutImportacao.filter({
      empresa_parceira_id: empresaParceiraId,
      tipo: tipoAtual,
    });
    setLayouts(lays);
  };

  useEffect(() => {
    if (layoutSelecionadoId === 'novo') {
      setNomeLayout('');
      setMapeamento({});
      setAtualizarTelefone(false);
      setModoEdicao(true);
    } else {
      const lay = layouts.find(l => l.id === layoutSelecionadoId);
      if (lay) {
        setNomeLayout(lay.nome);
        setMapeamento({ ...(lay.mapeamento || {}) });
        setAtualizarTelefone(lay.atualizar_telefone || false);
        setModoEdicao(false);
      }
    }
  }, [layoutSelecionadoId]);

  const handleColuna = (campo, coluna) => {
    setMapeamento(prev => ({ ...prev, [campo]: coluna === 'Não Usado' ? null : coluna }));
  };

  const handleSalvar = async () => {
    if (!nomeLayout.trim()) { toast.error('Informe um nome para o layout'); return; }

    const camposObrigatoriosSemColuna = campos
      .filter(c => c.obrigatorio && !mapeamento[c.key])
      .map(c => c.label);

    if (camposObrigatoriosSemColuna.length > 0) {
      toast.error(`Configure as colunas obrigatórias: ${camposObrigatoriosSemColuna.join(', ')}`);
      return;
    }

    setSaving(true);
    const dados = {
      empresa_id: empresaId,
      empresa_parceira_id: empresaParceiraId,
      empresa_parceira_nome: empresaParceira?.nome || '',
      tipo,
      nome: nomeLayout,
      mapeamento,
      atualizar_telefone: tipo === 'producao' ? atualizarTelefone : undefined,
    };

    if (layoutSelecionadoId === 'novo') {
      const criado = await base44.entities.LayoutImportacao.create(dados);
      toast.success('Layout criado com sucesso!');
      const lays = await base44.entities.LayoutImportacao.filter({ empresa_parceira_id: empresaParceiraId, tipo });
      setLayouts(lays);
      setLayoutSelecionadoId(criado.id);
    } else {
      await base44.entities.LayoutImportacao.update(layoutSelecionadoId, dados);
      toast.success('Layout atualizado!');
      const lays = await base44.entities.LayoutImportacao.filter({ empresa_parceira_id: empresaParceiraId, tipo });
      setLayouts(lays);
    }
    setModoEdicao(false);
    setSaving(false);
  };

  const handleExcluir = async () => {
    if (!window.confirm('Tem certeza que deseja excluir este layout?')) return;
    setSaving(true);
    await base44.entities.LayoutImportacao.delete(layoutSelecionadoId);
    const lays = await base44.entities.LayoutImportacao.filter({ empresa_parceira_id: empresaParceiraId, tipo });
    setLayouts(lays);
    setLayoutSelecionadoId('novo');
    toast.success('Layout excluído!');
    setSaving(false);
  };

  const handleDuplicar = async () => {
    if (layoutSelecionadoId === 'novo') { toast.error('Selecione um layout para duplicar'); return; }
    const lay = layouts.find(l => l.id === layoutSelecionadoId);
    if (!lay) return;
    setSaving(true);
    const { id, created_date, updated_date, created_by, ...dadosLay } = lay;
    const duplicado = await base44.entities.LayoutImportacao.create({
      ...dadosLay,
      nome: lay.nome + ' (cópia)',
    });
    const lays = await base44.entities.LayoutImportacao.filter({ empresa_parceira_id: empresaParceiraId, tipo });
    setLayouts(lays);
    setLayoutSelecionadoId(duplicado.id);
    toast.success('Layout duplicado!');
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <div className="text-sm text-slate-500 flex items-center gap-1">
            <span>Empresas Parceiras</span>
            <span>/</span>
            <span>{empresaParceira?.nome}</span>
            <span>/</span>
            <span className="font-medium text-slate-700">
              {tipo === 'producao' ? 'Layout de Produção' : 'Layout de Comissão'}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 mt-1">
            {empresaParceira?.nome}
          </h1>
          <p className="text-sm text-slate-500">
            Configure o layout para importação dos dados de {tipo === 'producao' ? 'produção' : 'comissão'} para a empresa parceira selecionada.
          </p>
        </div>
      </div>

      {/* Tipo tabs */}
      <div className="flex gap-2">
        <Button
          variant={tipo === 'producao' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setTipo('producao'); setLayoutSelecionadoId('novo'); setMapeamento({}); setNomeLayout(''); }}
        >Produção</Button>
        <Button
          variant={tipo === 'comissao' ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setTipo('comissao'); setLayoutSelecionadoId('novo'); setMapeamento({}); setNomeLayout(''); }}
        >Comissão</Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs text-slate-500 mb-1 block">Escolha um layout:</Label>
          <Select value={layoutSelecionadoId} onValueChange={setLayoutSelecionadoId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="novo">+ Novo Layout</SelectItem>
              {layouts.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 self-end flex-wrap">
          {layoutSelecionadoId !== 'novo' && !modoEdicao && (
            <>
              <Button variant="outline" onClick={handleDuplicar} disabled={saving} className="gap-2">
                <Copy className="w-4 h-4" /> Duplicar
              </Button>
              <Button variant="outline" onClick={handleExcluir} disabled={saving} className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
                <Trash2 className="w-4 h-4" /> Excluir
              </Button>
              <Button onClick={() => setModoEdicao(true)} className="gap-2 bg-blue-600 hover:bg-blue-700">
                Editar Layout
              </Button>
            </>
          )}
          {(layoutSelecionadoId === 'novo' || modoEdicao) && (
            <>
              {modoEdicao && layoutSelecionadoId !== 'novo' && (
                <Button variant="outline" onClick={() => {
                  const lay = layouts.find(l => l.id === layoutSelecionadoId);
                  if (lay) { setNomeLayout(lay.nome); setMapeamento(lay.mapeamento || {}); }
                  setModoEdicao(false);
                }} disabled={saving} className="gap-2">
                  Cancelar
                </Button>
              )}
              <Button variant="outline" onClick={handleDuplicar} disabled={saving || layoutSelecionadoId === 'novo'} className="gap-2">
                <Copy className="w-4 h-4" /> Duplicar
              </Button>
              <Button onClick={handleSalvar} disabled={saving} className="bg-green-600 hover:bg-green-700 gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Configuração
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Nome do layout */}
      <div className="max-w-sm">
        <Label>Nome do Layout *</Label>
        {modoEdicao || layoutSelecionadoId === 'novo' ? (
          <Input
            value={nomeLayout}
            onChange={e => setNomeLayout(e.target.value)}
            placeholder={`Ex: ${tipo === 'producao' ? 'Produção Consignado INSS' : 'Comissão Mensal'}`}
            className="mt-1"
          />
        ) : (
          <p className="mt-1 px-3 py-2 rounded-md border bg-slate-50 text-slate-700 text-sm">{nomeLayout}</p>
        )}
      </div>

      {/* Opção atualizar telefone (apenas produção) */}
      {tipo === 'producao' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl max-w-lg">
          <Checkbox
            id="atualizar_telefone"
            checked={atualizarTelefone}
            onCheckedChange={val => setAtualizarTelefone(!!val)}
            disabled={!modoEdicao && layoutSelecionadoId !== 'novo'}
          />
          <label htmlFor="atualizar_telefone" className="text-sm text-blue-800 cursor-pointer select-none">
            <span className="font-semibold">Atualizar telefone do cliente</span> ao importar — se o cliente já existir e a planilha tiver telefone, o celular será atualizado. Caso contrário, permanece o cadastrado.
          </label>
        </div>
      )}

      {/* Tabela de mapeamento */}
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b bg-slate-50 rounded-t-xl">
            <p className="text-sm font-medium text-slate-700">
              Mapeie os campos da planilha do Excel para os campos internos do sistema
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 w-64">Campos Internos</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 w-40">Coluna Excel</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-700 w-36">Obrigatório</th>
                </tr>
              </thead>
              <tbody>
                {campos.map((campo, idx) => {
                  const coluna = mapeamento[campo.key] || 'Não Usado';
                  return (
                    <tr key={campo.key} className={`border-b ${campo.obrigatorio ? 'bg-white' : ''} hover:bg-slate-50 transition-colors`}>
                      <td className="px-4 py-3">
                        <span className={campo.obrigatorio ? 'font-semibold text-slate-800' : 'text-slate-600'}>
                          {campo.label}
                          {campo.obrigatorio && <span className="text-red-500 ml-1">*</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {modoEdicao || layoutSelecionadoId === 'novo' ? (
                          <Select value={coluna} onValueChange={val => handleColuna(campo.key, val)}>
                            <SelectTrigger className="w-32 h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-60">
                              {COLUNAS.map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${coluna !== 'Não Usado' ? 'bg-blue-100 text-blue-700' : 'text-slate-400'}`}>
                            {coluna}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {campo.obrigatorio ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100">
                            <span className="text-green-600 text-xs font-bold">✓</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}