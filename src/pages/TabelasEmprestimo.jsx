import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil, Trash2, Upload } from 'lucide-react';
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
  const [formData, setFormData] = useState({
    codigo: '',
    nome: '',
    convenio_id: '',
    banco: '',
    comissao_corretor: '',
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

  const criarMutation = useMutation({
    mutationFn: async (dados) => {
      const convenioSelecionado = convenios.find(c => c.id === dados.convenio_id);
      return await base44.entities.TabelaEmprestimo.create({
        empresa_id: empresaId,
        codigo: dados.codigo,
        nome: dados.nome,
        convenio_id: dados.convenio_id || null,
        convenio_nome: convenioSelecionado?.nome || '',
        banco: dados.banco,
        comissao_corretor: parseFloat(dados.comissao_corretor),
        comissao_empresa: parseFloat(dados.comissao_empresa),
        ativo: true
      });
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
        comissao_corretor: parseFloat(dados.comissao_corretor),
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

  const resetForm = () => {
    setFormData({
      codigo: '',
      nome: '',
      convenio_id: '',
      banco: '',
      comissao_corretor: '',
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
      comissao_corretor: tabela.comissao_corretor,
      comissao_empresa: tabela.comissao_empresa
    });
    setShowModal(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editando) {
      editarMutation.mutate({ id: editando.id, dados: formData });
    } else {
      criarMutation.mutate(formData);
    }
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
                      <span className="text-green-600 font-medium">Corretor: {tabela.comissao_corretor}%</span>
                      <span className="text-blue-600 font-medium">Empresa: {tabela.comissao_empresa}%</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>% Comissão Corretor *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.comissao_corretor}
                  onChange={(e) => setFormData({ ...formData, comissao_corretor: e.target.value })}
                  placeholder="8.20"
                  required
                />
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
              </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar Tabelas</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Cole os dados (formato: Nome [TAB] Comissão Corretor [TAB] Comissão Empresa)</Label>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="flex min-h-[200px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
                placeholder="210180 - INSS ML NORMAL - WEB [INSS C6 BANK]	8.20	10.00&#10;210181 - INSS ML ESPECIAL [INSS BMG]	7.50	9.50"
              />
              <p className="text-xs text-slate-500 mt-2">
                Exemplo: Cole do Excel/Planilha com 3 colunas separadas por TAB
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => setShowImportModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleImportar} disabled={importarMutation.isPending}>
                {importarMutation.isPending ? (
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
    </div>
  );
}