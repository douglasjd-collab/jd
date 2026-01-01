import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

export default function VendaForm({ open, onOpenChange, venda, onSubmit, isLoading, currentUser }) {
  const [clientes, setClientes] = useState([]);
  const [administradoras, setAdministradoras] = useState([]);
  const [tabelas, setTabelas] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [gerentes, setGerentes] = useState([]);
  const [searchCliente, setSearchCliente] = useState('');
  
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: venda || {
      cliente_id: '',
      administradora_id: '',
      tabela_id: '',
      grupo: '',
      cota: '',
      contrato: '',
      valorCredito: '',
      taxaAdministracao: '',
      vendedor_id: currentUser?.id || '',
      gerente_id: currentUser?.gerente_id || '',
      data_venda: format(new Date(), 'yyyy-MM-dd'),
      status: 'ativa'
    }
  });

  const administradoraId = watch('administradora_id');
  const tabelaId = watch('tabela_id');
  const vendedorId = watch('vendedor_id');
  const valorCredito = watch('valorCredito');
  const taxaAdministracao = watch('taxaAdministracao');
  const tipoEmpresa = watch('tipoEmpresa');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (venda) {
      Object.keys(venda).forEach(key => {
        setValue(key, venda[key]);
      });
    } else {
      reset({
        cliente_id: '',
        administradora_id: '',
        tabela_id: '',
        grupo: '',
        cota: '',
        contrato: '',
        valorCredito: '',
        taxaAdministracao: '',
        vendedor_id: currentUser?.id || '',
        gerente_id: currentUser?.gerente_id || '',
        data_venda: format(new Date(), 'yyyy-MM-dd'),
        status: 'ativa'
      });
    }
  }, [venda, setValue, reset, currentUser]);

  useEffect(() => {
    if (administradoraId) {
      loadTabelas(administradoraId);
    }
  }, [administradoraId]);

  useEffect(() => {
    if (tabelaId && tabelas.length > 0) {
      const tabela = tabelas.find(t => t.id === tabelaId);
      if (tabela) {
        setValue('tipoEmpresa', tabela.tipoEmpresa);
        setValue('tabela_nome', tabela.nomeTabela);
      }
    }
  }, [tabelaId, tabelas, setValue]);

  // Calcular comissão automaticamente
  useEffect(() => {
    const credito = parseFloat(valorCredito) || 0;
    const taxa = parseFloat(taxaAdministracao) || 0;
    
    if (credito > 0 && taxa > 0 && tipoEmpresa) {
      const fator = tipoEmpresa === 'MEI' ? 0.25 : (tipoEmpresa === 'ME' || tipoEmpresa === 'LTDA') ? 0.30 : 0;
      const percentualComissao = taxa * fator;
      const valorComissao = credito * (percentualComissao / 100);
      
      setValue('percentualComissao', percentualComissao);
      setValue('valorComissao', valorComissao);
    } else {
      setValue('percentualComissao', 0);
      setValue('valorComissao', 0);
    }
  }, [valorCredito, taxaAdministracao, tipoEmpresa, setValue]);

  useEffect(() => {
    if (vendedorId && vendedores.length > 0) {
      const vendedor = vendedores.find(v => v.id === vendedorId);
      if (vendedor?.gerente_id) {
        setValue('gerente_id', vendedor.gerente_id);
      }
    }
  }, [vendedorId, vendedores, setValue]);

  const loadData = async () => {
    try {
      // Buscar TODOS os clientes ativos - sem filtro por perfil ou usuário
      const [clientesData, adminData, vendedoresData, gerentesData] = await Promise.all([
        base44.entities.Cliente.filter({ status: 'ativo' }),
        base44.entities.Administradora.filter({ status: 'ativa' }),
        base44.entities.User.filter({ perfil: 'vendedor', status: 'ativo' }),
        base44.entities.User.filter({ perfil: 'gerente', status: 'ativo' })
      ]);
      
      console.log('Clientes carregados:', clientesData.length);
      
      setClientes(clientesData);
      setAdministradoras(adminData);
      setVendedores(vendedoresData);
      setGerentes(gerentesData);
    } catch (error) {
      console.error('Erro detalhado ao carregar dados:', error);
      toast.error('Erro ao carregar dados: ' + (error.message || 'Verifique suas permissões'));
    }
  };

  const loadTabelas = async (adminId) => {
    const data = await base44.entities.TabelaConsorcio.filter({ 
      administradora_id: adminId, 
      status: 'ativa' 
    });
    setTabelas(data);
  };

  const filteredClientes = clientes.filter(c => {
    const search = searchCliente.toLowerCase().trim();
    const nome = (c.nome || '').toLowerCase();
    const cpf = (c.cpf || '').replace(/\D/g, '');
    const telefone = (c.telefone || '').replace(/\D/g, '');
    const searchNormalized = search.replace(/\D/g, '');
    
    return nome.includes(search) || 
           cpf.includes(searchNormalized) || 
           telefone.includes(searchNormalized);
  });

  const isAdmin = currentUser?.perfil === 'master' || currentUser?.perfil === 'admin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{venda ? 'Editar Venda' : 'Nova Venda'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Cliente */}
            <div className="col-span-2">
              <Label>Cliente *</Label>
              <Select
                value={watch('cliente_id')}
                onValueChange={(value) => {
                  setValue('cliente_id', value);
                  const cliente = clientes.find(c => c.id === value);
                  if (cliente) {
                    setValue('cliente_nome', cliente.nome);
                    setValue('cliente_cpf', cliente.cpf);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 sticky top-0 bg-white z-10">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        placeholder="Buscar por nome, CPF ou telefone..."
                        value={searchCliente}
                        onChange={(e) => setSearchCliente(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  {filteredClientes.length > 0 ? (
                    <>
                      {searchCliente && (
                        <div className="px-3 py-2 text-xs text-slate-500 bg-slate-50">
                          {filteredClientes.length} cliente(s) encontrado(s)
                        </div>
                      )}
                      {filteredClientes.slice(0, 30).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex flex-col py-1">
                            <span className="font-medium">{c.nome}</span>
                            <span className="text-xs text-slate-500">CPF: {c.cpf}</span>
                            {c.telefone && (
                              <span className="text-xs text-slate-400">Tel: {c.telefone}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </>
                  ) : searchCliente ? (
                    <div className="p-6 text-center">
                      <p className="text-sm text-slate-500 mb-2">Nenhum cliente encontrado</p>
                      <p className="text-xs text-slate-400">Tente buscar por nome, CPF ou telefone</p>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-slate-400">
                      Digite para buscar clientes
                    </div>
                  )}
                </SelectContent>
              </Select>
              {errors.cliente_id && <p className="text-sm text-red-500 mt-1">Cliente é obrigatório</p>}
            </div>
            
            {/* Administradora */}
            <div>
              <Label>Administradora *</Label>
              <Select
                value={watch('administradora_id')}
                onValueChange={(value) => {
                  setValue('administradora_id', value);
                  setValue('tabela_id', '');
                  const admin = administradoras.find(a => a.id === value);
                  if (admin) {
                    setValue('administradora_nome', admin.nome_fantasia || admin.razao_social);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {administradoras.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome_fantasia || a.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Tabela */}
            <div>
              <Label>Tabela de Consórcio *</Label>
              <Select
                value={watch('tabela_id')}
                onValueChange={(value) => setValue('tabela_id', value)}
                disabled={!administradoraId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {tabelas.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nomeTabela} ({t.tipoEmpresa})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Grupo e Cota */}
            <div>
              <Label htmlFor="grupo">Grupo *</Label>
              <Input
                id="grupo"
                {...register('grupo', { required: true })}
                placeholder="Ex: 1234"
              />
            </div>
            
            <div>
              <Label htmlFor="cota">Cota</Label>
              <Input
                id="cota"
                {...register('cota')}
                placeholder="Ex: 56 (deixar vazio = pendente)"
              />
              <p className="text-xs text-slate-500 mt-1">Se não preencher, a venda ficará pendente</p>
            </div>
            
            {/* Contrato */}
            <div>
              <Label htmlFor="contrato">Contrato (opcional)</Label>
              <Input
                id="contrato"
                {...register('contrato')}
                placeholder="Número do contrato"
              />
            </div>
            
            {/* Tipo Empresa - somente leitura */}
            <div>
              <Label>Tipo Empresa</Label>
              <Input
                value={tipoEmpresa || '-'}
                disabled
                className="bg-slate-100"
              />
            </div>
            
            {/* Valor Crédito */}
            <div>
              <Label htmlFor="valorCredito">Valor do Crédito *</Label>
              <Input
                id="valorCredito"
                type="number"
                step="0.01"
                {...register('valorCredito', { required: true, min: 0.01 })}
                placeholder="0,00"
              />
              {errors.valorCredito && <p className="text-sm text-red-500 mt-1">Valor obrigatório e deve ser maior que zero</p>}
            </div>
            
            {/* Taxa Administração */}
            <div>
              <Label htmlFor="taxaAdministracao">Taxa Administração (%) *</Label>
              <Input
                id="taxaAdministracao"
                type="number"
                step="0.01"
                {...register('taxaAdministracao', { required: true, min: 0.01 })}
                placeholder="0,00"
              />
              {errors.taxaAdministracao && <p className="text-sm text-red-500 mt-1">Taxa obrigatória e deve ser maior que zero</p>}
            </div>
            
            {/* Percentual Comissão - calculado */}
            <div>
              <Label>Percentual Comissão (calculado)</Label>
              <Input
                value={watch('percentualComissao')?.toFixed(2) || '0.00'}
                disabled
                className="bg-slate-100"
              />
            </div>
            
            {/* Valor Comissão - calculado */}
            <div>
              <Label>Valor Comissão (calculado)</Label>
              <Input
                value={`R$ ${(watch('valorComissao') || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                disabled
                className="bg-slate-100 font-semibold text-green-700"
              />
            </div>
            
            {/* Vendedor - só admin pode alterar */}
            {isAdmin && (
              <div>
                <Label>Vendedor</Label>
                <Select
                  value={watch('vendedor_id')}
                  onValueChange={(value) => {
                    setValue('vendedor_id', value);
                    const vendedor = vendedores.find(v => v.id === value);
                    if (vendedor) {
                      setValue('vendedor_nome', vendedor.full_name);
                      if (vendedor.gerente_id) {
                        setValue('gerente_id', vendedor.gerente_id);
                        const gerente = gerentes.find(g => g.id === vendedor.gerente_id);
                        if (gerente) {
                          setValue('gerente_nome', gerente.full_name);
                        }
                      }
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {/* Data Venda */}
            <div>
              <Label htmlFor="data_venda">Data da Venda *</Label>
              <Input
                id="data_venda"
                type="date"
                {...register('data_venda', { required: true })}
              />
            </div>
            
            {/* Status */}
            <div>
              <Label>Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(value) => setValue('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                  <SelectItem value="contemplada">Contemplada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !watch('cliente_id') || !watch('administradora_id') || !watch('tabela_id') || !watch('grupo') || parseFloat(watch('valorCredito')) <= 0 || parseFloat(watch('taxaAdministracao')) <= 0} 
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {venda ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}