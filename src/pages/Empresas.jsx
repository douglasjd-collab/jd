import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, MoreHorizontal, Pencil, Trash2, Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';

export default function Empresas() {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm();

  const { data: empresas = [], isLoading } = useQuery({
    queryKey: ['empresas'],
    queryFn: () => base44.entities.Empresa.list('-created_date'),
  });



  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Buscar todas as empresas para gerar o próximo código
      const allEmpresas = await base44.entities.Empresa.list();
      
      // Extrair números dos códigos existentes (EMP001 -> 1, EMP002 -> 2)
      const numeros = allEmpresas
        .map(e => e.codigo?.match(/EMP(\d+)/)?.[1])
        .filter(Boolean)
        .map(Number);
      
      // Encontrar o próximo número
      const proximoNumero = numeros.length > 0 ? Math.max(...numeros) + 1 : 1;
      
      // Formatar com zeros à esquerda (EMP001, EMP002, etc)
      const codigo = `EMP${String(proximoNumero).padStart(3, '0')}`;
      
      // Criar empresa com o código gerado
      return base44.entities.Empresa.create({ ...data, codigo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setFormOpen(false);
      reset();
      toast.success('Empresa criada! Convide um usuário ADM pela tela de Usuários.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Empresa.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setFormOpen(false);
      setSelectedEmpresa(null);
      reset();
      toast.success('Empresa atualizada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Empresa.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresas'] });
      setDeleteId(null);
      toast.success('Empresa excluída!');
    },
  });

  const openForm = (empresa = null) => {
    if (empresa) {
      Object.keys(empresa).forEach(key => setValue(key, empresa[key]));
      setSelectedEmpresa(empresa);
    } else {
      reset({
        cpf_cnpj: '',
        nome: '',
        telefone: '',
        email: '',
        endereco_rua: '',
        endereco_numero: '',
        endereco_complemento: '',
        endereco_cep: '',
        endereco_estado: '',
        endereco_cidade: '',
        status: 'ativa'
      });
      setSelectedEmpresa(null);
    }
    setFormOpen(true);
  };

  const onSubmit = async (data) => {
    if (!data.nome || !data.cpf_cnpj || !data.telefone || !data.email || !data.endereco_rua || !data.endereco_numero || !data.endereco_cep || !data.endereco_estado || !data.endereco_cidade) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (selectedEmpresa) {
      updateMutation.mutate({ id: selectedEmpresa.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const formatCPFCNPJ = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      // CPF
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    } else {
      // CNPJ
      return numbers
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    }
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCEP = (value) => {
    return value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').substring(0, 9);
  };

  const filteredEmpresas = empresas.filter(e => 
    e.nome?.toLowerCase().includes(search.toLowerCase()) ||
    e.cpf_cnpj?.includes(search) ||
    e.email?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Empresa',
      cell: (row) => (
        <div className="flex items-center gap-3">
          {row.logo_url ? (
            <img src={row.logo_url} alt={row.nome} className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <div className="w-10 h-10 bg-[#1e3a5f]/10 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#1e3a5f]" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-slate-900">{row.nome}</p>
              {row.codigo && (
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                  {row.codigo}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500">{row.cpf_cnpj}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Tipo',
      cell: (row) => row.tipo_empresa ? (
        <div className="px-2 py-1 bg-purple-100 text-purple-700 rounded-md text-sm font-medium inline-block">
          {row.tipo_empresa}
        </div>
      ) : '-'
    },
    {
      header: 'Contato',
      cell: (row) => (
        <div>
          <p className="text-sm text-slate-900">{row.email}</p>
          <p className="text-sm text-slate-500">{row.telefone}</p>
        </div>
      )
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: '',
      className: 'w-12',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openForm(row)}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setDeleteId(row.id)}
              className="text-red-600"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empresas"
        subtitle={`${empresas.length} empresas cadastradas`}
        actionLabel="Nova Empresa"
        onAction={() => openForm()}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredEmpresas}
        isLoading={isLoading}
        emptyMessage="Nenhuma empresa encontrada"
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedEmpresa ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
          </DialogHeader>
          
          <div className="px-6 pb-2 border-b">
            <Label htmlFor="codigo">ID da Empresa *</Label>
            {selectedEmpresa ? (
              <>
                <Input
                  id="codigo"
                  {...register('codigo', { required: true })}
                  placeholder="EMP001"
                />
                <p className="text-xs text-slate-500 mt-1">Formato: EMP001, EMP002, etc.</p>
              </>
            ) : (
              <>
                <Input
                  value="Será gerado automaticamente (EMP001, EMP002...)"
                  disabled
                  className="bg-slate-50 text-slate-500"
                />
                <p className="text-xs text-slate-500 mt-1">O ID será gerado automaticamente ao criar a empresa</p>
              </>
            )}
            {errors.codigo && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
          </div>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto pr-2 px-6 flex-1">

            <div>
              <Label htmlFor="cpf_cnpj">CPF/CNPJ *</Label>
              <Input
                id="cpf_cnpj"
                {...register('cpf_cnpj', { required: true })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                onChange={(e) => setValue('cpf_cnpj', formatCPFCNPJ(e.target.value))}
                maxLength={18}
              />
              {errors.cpf_cnpj && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
            </div>

            <div>
              <Label htmlFor="nome">Nome da Empresa *</Label>
              <Input
                id="nome"
                {...register('nome', { required: true })}
                placeholder="Nome da empresa"
              />
              {errors.nome && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
            </div>

            <div>
              <Label htmlFor="tipo_empresa">Tipo da Empresa *</Label>
              <Select
                value={watch('tipo_empresa') || ''}
                onValueChange={(value) => setValue('tipo_empresa', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEI">MEI - Microempreendedor Individual</SelectItem>
                  <SelectItem value="ME">ME - Microempresa</SelectItem>
                  <SelectItem value="LTDA">LTDA - Sociedade Limitada</SelectItem>
                </SelectContent>
              </Select>
              {errors.tipo_empresa && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  {...register('telefone', { required: true })}
                  placeholder="(00) 00000-0000"
                  onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
                  maxLength={15}
                />
                {errors.telefone && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  {...register('email', { required: true })}
                  placeholder="contato@empresa.com"
                />
                {errors.email && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Endereço</h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="endereco_rua">Rua *</Label>
                  <Input
                    id="endereco_rua"
                    {...register('endereco_rua', { required: true })}
                    placeholder="Rua/Avenida"
                  />
                  {errors.endereco_rua && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
                </div>

                <div>
                  <Label htmlFor="endereco_numero">Número *</Label>
                  <Input
                    id="endereco_numero"
                    {...register('endereco_numero', { required: true })}
                    placeholder="123"
                  />
                  {errors.endereco_numero && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="endereco_complemento">Complemento</Label>
                  <Input
                    id="endereco_complemento"
                    {...register('endereco_complemento')}
                    placeholder="Sala, Andar..."
                  />
                </div>

                <div>
                  <Label htmlFor="endereco_cep">CEP *</Label>
                  <Input
                    id="endereco_cep"
                    {...register('endereco_cep', { required: true })}
                    placeholder="00000-000"
                    onChange={(e) => setValue('endereco_cep', formatCEP(e.target.value))}
                    maxLength={9}
                  />
                  {errors.endereco_cep && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="endereco_estado">Estado *</Label>
                  <Select
                    value={watch('endereco_estado') || ''}
                    onValueChange={(value) => setValue('endereco_estado', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AC">Acre</SelectItem>
                      <SelectItem value="AL">Alagoas</SelectItem>
                      <SelectItem value="AP">Amapá</SelectItem>
                      <SelectItem value="AM">Amazonas</SelectItem>
                      <SelectItem value="BA">Bahia</SelectItem>
                      <SelectItem value="CE">Ceará</SelectItem>
                      <SelectItem value="DF">Distrito Federal</SelectItem>
                      <SelectItem value="ES">Espírito Santo</SelectItem>
                      <SelectItem value="GO">Goiás</SelectItem>
                      <SelectItem value="MA">Maranhão</SelectItem>
                      <SelectItem value="MT">Mato Grosso</SelectItem>
                      <SelectItem value="MS">Mato Grosso do Sul</SelectItem>
                      <SelectItem value="MG">Minas Gerais</SelectItem>
                      <SelectItem value="PA">Pará</SelectItem>
                      <SelectItem value="PB">Paraíba</SelectItem>
                      <SelectItem value="PR">Paraná</SelectItem>
                      <SelectItem value="PE">Pernambuco</SelectItem>
                      <SelectItem value="PI">Piauí</SelectItem>
                      <SelectItem value="RJ">Rio de Janeiro</SelectItem>
                      <SelectItem value="RN">Rio Grande do Norte</SelectItem>
                      <SelectItem value="RS">Rio Grande do Sul</SelectItem>
                      <SelectItem value="RO">Rondônia</SelectItem>
                      <SelectItem value="RR">Roraima</SelectItem>
                      <SelectItem value="SC">Santa Catarina</SelectItem>
                      <SelectItem value="SP">São Paulo</SelectItem>
                      <SelectItem value="SE">Sergipe</SelectItem>
                      <SelectItem value="TO">Tocantins</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.endereco_estado && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
                </div>

                <div>
                  <Label htmlFor="endereco_cidade">Cidade *</Label>
                  <Input
                    id="endereco_cidade"
                    {...register('endereco_cidade', { required: true })}
                    placeholder="Nome da cidade"
                  />
                  {errors.endereco_cidade && <p className="text-sm text-red-500 mt-1">Campo obrigatório</p>}
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <Label>Status</Label>
              <Select
                value={watch('status') || 'ativa'}
                onValueChange={(value) => setValue('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!selectedEmpresa && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>ℹ️ Importante:</strong> Após criar a empresa, convide um usuário ADM pela tela de Usuários.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t bg-white -mx-6 px-6 pb-2">
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {selectedEmpresa ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deleteId)}
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