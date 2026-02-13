import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, Trash2, Upload, History, Plus, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function TabelasEmprestimo() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [importText, setImportText] = useState('');
  const [arquivoCSV, setArquivoCSV] = useState(null);
  const [showHistoricoModal, setShowHistoricoModal] = useState(false);
  const [tabelaSelecionada, setTabelaSelecionada] = useState(null);
  const [novaComissao, setNovaComissao] = useState('');
  const [dataVigencia, setDataVigencia] = useState('');
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    convenio_id: '',
    banco: '',
    comissao_empresa: ''
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);

    if (me.role === 'super_admin' || me.perfil === 'super_admin') {
      const empresas = await base44.entities.Empresa.filter({ status: 'ativa' });
      if (empresas.length > 0) setEmpresaId(empresas[0].id);
    } else {
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      if (colabs.length > 0) setEmpresaId(colabs[0].empresa_id);
    }
  };

  const { data: tabelas = [], isLoading } = useQuery({
    queryKey: ['tabelas-emprestimo', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.TabelaEmprestimo.filter({ empresa_id: empresaId, ativo: true }, 'nome')
  });

  const { data: convenios = [] } = useQuery({
    queryKey: ['convenios', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Convenio.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: bancos = [] } = useQuery({
    queryKey: ['bancos', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Banco.filter({ empresa_id: empresaId, ativo: true })
  });

  const { data: historicos = [] } = useQuery({
    queryKey: ['historico-comissao', tabelaSelecionada?.id],
    enabled: !!tabelaSelecionada?.id,
    queryFn: () => base44.entities.HistoricoComissaoTabela.filter(
      { tabela_id: tabelaSelecionada.id, ativo: true },
      '-data_vigencia'
    )
  });

  const criarMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      const tabela = await base44.entities.TabelaEmprestimo.create({
        empresa_id: empresaId,
        codigo: dados.codigo,
        nome: dados.nome,
        convenio_id: dados.convenio_id || null,
        convenio_nome: convenioSelecionado?.nome || '',
        banco: dados.banco,
        comissao_empresa: parseFloat(dados.comissao_empresa),
        ativo: true
      });

      // Criar primeiro registro de histórico
      await base44.entities.HistoricoComissaoTabela.create({
        empresa_id: empresaId,
        tabela_id: tabela.id,
        comissao_empresa: parseFloat(dados.comissao_empresa),
        data_vigencia: new Date().toISOString().split('T')[0],
        ativo: true
      });

      return tabela;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      toast.success('Tabela cadastrada com sucesso!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao cadastrar: ' + error.message);
    }
  });

  const editarMutation = useMutation({
    mutationFn: async ({ id, dados }) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      return await base44.entities.TabelaEmprestimo.update(id, {
        codigo: dados.codigo,
        nome: dados.nome,
        convenio_id: dados.convenio_id || null,
        convenio_nome: convenioSelecionado?.nome || '',
        banco: dados.banco,
        comissao_empresa: parseFloat(dados.comissao_empresa)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      toast.success('Tabela atualizada!');
      setShowModal(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => base44.entities.TabelaEmprestimo.update(id, { ativo: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      toast.success('Tabela excluída!');
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error('Erro ao excluir: ' + error.message);
    }
  });

  const importarCSVMutation = useMutation({
    mutationFn: async (arquivo) => {
      // Ler conteúdo do arquivo
      const content = await arquivo.text();
      
      const response = await base44.functions.invoke('importarTabelasEmprestimoCSV', { content });
      return response.data;
    },
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      
      if (resultado.erros > 0) {
        toast.warning(`${resultado.criadas} tabelas importadas. ${resultado.erros} erros encontrados.`);
        console.log('Erros:', resultado.detalhes_erros);
      } else {
        toast.success(`${resultado.criadas} tabelas importadas com sucesso!`);
      }
      
      setShowImportModal(false);
      setArquivoCSV(null);
    },
    onError: (error) => {
      toast.error('Erro ao importar: ' + error.message);
    }
  });

  const importarMutation = useMutation({
    mutationFn: async (texto) => {
      const linhas = texto.split('\n').filter(l => l.trim());
      const criadas = [];
      
      for (const linha of linhas) {
        const partes = linha.split('\t');
        if (partes.length >= 3) {
          const nome = partes[0].trim();
          const comissaoCorretor = parseFloat(partes[1].replace(',', '.'));
          const comissaoEmpresa = parseFloat(partes[2].replace(',', '.'));
          
          if (nome && !isNaN(comissaoCorretor) && !isNaN(comissaoEmpresa)) {
            const tabela = await base44.entities.TabelaEmprestimo.create({
              empresa_id: empresaId,
              nome,
              comissao_corretor: comissaoCorretor,
              comissao_empresa: comissaoEmpresa,
              ativo: true
            });
            criadas.push(tabela);
          }
        }
      }
      
      return criadas;
    },
    onSuccess: (criadas) => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      toast.success(`${criadas.length} tabelas importadas com sucesso!`);
      setShowImportModal(false);
      setImportText('');
    },
    onError: (error) => {
      toast.error('Erro ao importar: ' + error.message);
    }
  });

  const adicionarComissaoMutation = useMutation({
    mutationFn: async ({ tabelaId, comissao, dataVig }) => {
      // Criar novo histórico
      await base44.entities.HistoricoComissaoTabela.create({
        empresa_id: empresaId,
        tabela_id: tabelaId,
        comissao_empresa: parseFloat(comissao),
        data_vigencia: dataVig,
        ativo: true
      });

      // Atualizar a tabela com a nova comissão
      await base44.entities.TabelaEmprestimo.update(tabelaId, {
        comissao_empresa: parseFloat(comissao)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tabelas-emprestimo', empresaId] });
      queryClient.invalidateQueries({ queryKey: ['historico-comissao'] });
      toast.success('Comissão atualizada com sucesso!');
      setShowHistoricoModal(false);
      setNovaComissao('');
      setDataVigencia('');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar comissão: ' + error.message);
    }
  });

  const resetForm = () => {
    setFormData({
      codigo: '',
      nome: '',
      convenio_id: '',
      banco: '',
      comissao_empresa: ''
    });
    setEditando(null);
  };

  const handleEditar = (tabela) => {
    setEditando(tabela);
    setFormData({
      codigo: tabela.codigo || '',
      nome: tabela.nome,
      convenio_id: tabela.convenio_id || '',
      banco: tabela.banco || '',
      comissao_empresa: tabela.comissao_empresa
    });
    setShowModal(true);
  };

  const handleAbrirHistorico = (tabela) => {
    setTabelaSelecionada(tabela);
    setShowHistoricoModal(true);
  };

  const handleAdicionarComissao = (e) => {
    e.preventDefault();
    if (!novaComissao || !dataVigencia) {
      toast.error('Preencha todos os campos');
      return;
    }
    adicionarComissaoMutation.mutate({
      tabelaId: tabelaSelecionada.id,
      comissao: novaComissao,
      dataVig: dataVigencia
    });
  };

  const handleBaixarModelo = () => {
    const csvContent = `Data;Convenio;Banco;Codigo Produto;Produto;Codigo Tabela;Tabela;Prazo Inicial;Prazo Final;Valor Inicial;Valor Final;Tipo Agente;Empresa;Tipo de Formalização;Comissão Empresa
06/02/2026;INSS;HAPPY CONSIG;;NOVO;75173;HAPPY DIG - INSS NOVO INDICADO;1;120;;;Bronze;Prospecta;DIGITAL;0
06/02/2026;INSS;HAPPY CONSIG;;NOVO;76709;HAPPY DIG INSS - MARGEM LIVRE - SEM SEGURO - TKT 1.000,00 A 1.499,99 - TX 1,85%;96;96;1000;1499.99;Bronze;Prospecta;DIGITAL;6.37
06/02/2026;INSS;HAPPY CONSIG;;NOVO;76710;HAPPY DIG INSS - MARGEM LIVRE - SEM SEGURO - TKT MIN 1.500,00 - TX 1,85%;96;96;1500;999999.99;Bronze;Prospecta;DIGITAL;8.82`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_tabelas_emprestimo.csv');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Modelo baixado com sucesso!');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editando) {
      editarMutation.mutate({ id: editando.id, dados: formData });
    } else {
      criarMutation.mutate(formData);
    }
  };

  const handleImportarCSV = () => {
    if (!arquivoCSV) {
      toast.error('Selecione um arquivo CSV');
      return;
    }
    importarCSVMutation.mutate(arquivoCSV);
  };

  const handleImportar = () => {
    if (!importText.trim()) {
      toast.error('Cole os dados para importar');
      return;
    }
    importarMutation.mutate(importText);
  };

  if (!user || !empresaId) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const tabelasFiltradas = tabelas.filter(t =>
    t.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.banco?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tabelas de Empréstimo"
        subtitle="Gerencie as tabelas de comissão para empréstimos"
        actionLabel="Nova Tabela"
        onAction={() => {
          resetForm();
          setShowModal(true);
        }}
      >
        <Button variant="outline" onClick={() => setShowImportModal(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Importar
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-6">
          <Input
            placeholder="Buscar por nome, código ou banco..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : tabelasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-slate-500">
              {searchTerm ? 'Nenhuma tabela encontrada.' : 'Nenhuma tabela cadastrada ainda.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tabelasFiltradas.map((tabela) => (
            <Card key={tabela.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {tabela.codigo && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-sm font-mono">
                          {tabela.codigo}
                        </span>
                      )}
                      <h3 className="font-medium">{tabela.nome}</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {tabela.convenio_nome && (
                        <span className="text-slate-600">Convênio: {tabela.convenio_nome}</span>
                      )}
                      {tabela.banco && (
                        <span className="text-slate-600">Banco: {tabela.banco}</span>
                      )}
                      <span className="text-blue-600 font-medium">Comissão: {tabela.comissao_empresa}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleAbrirHistorico(tabela)}
                      title="Histórico de Comissões"
                    >
                      <History className="w-4 h-4 text-blue-600" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditar(tabela)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setDeleteId(tabela.id)}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar' : 'Nova'} Tabela</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Código</Label>
                <Input
                  value={formData.codigo}
                  onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                  placeholder="210180"
                />
              </div>
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="INSS ML NORMAL - WEB [INSS C6 BANK]"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Convênio</Label>
                <select
                  value={formData.convenio_id}
                  onChange={(e) => setFormData({ ...formData, convenio_id: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Selecione...</option>
                  {convenios.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Banco</Label>
                <select
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">Selecione...</option>
                  <option value="C6 Bank">C6 Bank</option>
                  <option value="Digio">Digio</option>
                  <option value="BMG">BMG</option>
                  <option value="Finanto">Finanto</option>
                  <option value="BRB">BRB</option>
                  <option value="Happy">Happy</option>
                  {bancos.map(b => (
                    <option key={b.id} value={b.nome}>{b.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label>% Comissão Empresa *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.comissao_empresa}
                onChange={(e) => setFormData({ ...formData, comissao_empresa: e.target.value })}
                placeholder="10.00"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Esta será a comissão inicial. Você pode atualizar depois através do histórico.
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={criarMutation.isPending || editarMutation.isPending}>
                {(criarMutation.isPending || editarMutation.isPending) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportModal} onOpenChange={setShowImportModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Tabelas via CSV</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* Botão para baixar modelo */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-sm text-blue-900">
                    📥 Modelo de Planilha
                  </h3>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Baixe o CSV modelo para preencher
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBaixarModelo}
                  className="border-blue-300 hover:bg-blue-100 shrink-0"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Baixar
                </Button>
              </div>
            </div>

            {/* Upload do arquivo */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Selecione o Arquivo CSV</Label>
              
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors">
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-8 h-8 text-slate-400" />
                  <div className="w-full">
                    <label className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <span className="text-sm font-medium text-slate-700">
                        {arquivoCSV ? arquivoCSV.name : 'Escolher ficheiro CSV'}
                      </span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        onChange={(e) => setArquivoCSV(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  {arquivoCSV && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-green-600 font-medium text-sm">✓</span>
                      <span className="text-xs text-green-700">Arquivo selecionado</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Exemplo do formato */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-medium mb-1.5">Exemplo do formato CSV:</p>
              <div className="text-[10px] leading-tight font-mono bg-white p-2 rounded border overflow-x-auto">
                <div className="whitespace-nowrap">Data;Convenio;Banco;Codigo Produto;Produto;Codigo Tabela;Tabela;Prazo Inicial;Prazo Final;Valor Inicial;Valor Final;Tipo Agente;Empresa;Tipo de Formalização;Comissão Empresa</div>
                <div className="whitespace-nowrap mt-1">06/02/2026;INSS;HAPPY CONSIG;;NOVO;76709;HAPPY DIG INSS - ML;96;96;1000;1499.99;Bronze;Prospecta;DIGITAL;6.37</div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5">
                💡 Separado por ponto-e-vírgula (;)
              </p>
            </div>

            {/* Botões de ação */}
            <div className="flex gap-2 justify-end pt-3 border-t">
              <Button 
                size="sm"
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowImportModal(false);
                  setArquivoCSV(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                size="sm"
                onClick={handleImportarCSV} 
                disabled={!arquivoCSV || importarCSVMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {importarCSVMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta tabela?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletarMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de Histórico de Comissões */}
      <Dialog open={showHistoricoModal} onOpenChange={setShowHistoricoModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Histórico de Comissões - {tabelaSelecionada?.nome}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Formulário para adicionar nova comissão */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Nova Comissão
              </h3>
              
              <form onSubmit={handleAdicionarComissao} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nova Comissão Empresa (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={novaComissao}
                      onChange={(e) => setNovaComissao(e.target.value)}
                      placeholder="10.50"
                      required
                    />
                  </div>
                  <div>
                    <Label>Data de Vigência</Label>
                    <Input
                      type="date"
                      value={dataVigencia}
                      onChange={(e) => setDataVigencia(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={adicionarComissaoMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {adicionarComissaoMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Adicionando...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar Comissão
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>

            {/* Lista de histórico */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Histórico de Alterações</h3>
              
              {historicos.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  Nenhum histórico de comissão registrado
                </div>
              ) : (
                <div className="space-y-2">
                  {historicos.map((hist, idx) => (
                    <div 
                      key={hist.id} 
                      className={`p-4 rounded-lg border ${idx === 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">{hist.comissao_empresa}%</span>
                            {idx === 0 && (
                              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                                Atual
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mt-1">
                            Vigência: {new Date(hist.data_vigencia).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowHistoricoModal(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}