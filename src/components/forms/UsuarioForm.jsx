import React, { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function UsuarioForm({ open, onOpenChange, usuario, onSubmit, isLoading, currentUser, inviteSuccess }) {
  const [gerentes, setGerentes] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    mode: 'onChange',
    defaultValues: usuario || {
      razao_social: '',
      email: '',
      cpf_cnpj: '',
      nome_perfil: '',
      telefone: '',
      codigo_vendedor: '',
      perfil: 'vendedor',
      gerente_id: '',
      status: 'ativo',
      senha: ''
    }
  });

  const perfil = watch('perfil');
  const isGerenteOuSuperior = ['gerente', 'admin', 'super_admin', 'master'].includes(currentUser?.perfil);

  useEffect(() => {
    loadGerentes();
    if (currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin') {
      loadEmpresas();
    }
  }, [currentUser]);

  useEffect(() => {
    if (usuario) {
      Object.keys(usuario).forEach(key => {
        setValue(key, usuario[key]);
      });
    } else {
      reset({
        razao_social: '',
        email: '',
        cpf_cnpj: '',
        nome_perfil: '',
        telefone: '',
        codigo_vendedor: '',
        perfil: 'vendedor',
        gerente_id: '',
        status: 'ativo',
        senha: ''
      });
    }
  }, [usuario, setValue, reset]);

  const loadGerentes = async () => {
    const users = await base44.entities.User.filter({ perfil: 'gerente', status: 'ativo' });
    setGerentes(users);
  };

  const loadEmpresas = async () => {
    const empresasList = await base44.entities.Empresa.filter({ status: 'ativa' });
    setEmpresas(empresasList);
  };

  const formatCPFCNPJ = (value) => {
    const cleanValue = value.replace(/\D/g, '');
    
    if (cleanValue.length <= 11) {
      // Formato CPF
      return cleanValue
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    } else {
      // Formato CNPJ
      return cleanValue
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    }
  };

  const formatPhone = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const handleFormSubmit = (data) => {
    // Normalizar CPF/CNPJ e telefone (remover máscaras)
    const normalizedData = {
      ...data,
      cpf_cnpj: data.cpf_cnpj ? data.cpf_cnpj.replace(/\D/g, '') : '',
      telefone: data.telefone ? data.telefone.replace(/\D/g, '') : '',
      gerente_id: data.gerente_id || null // Garantir que gerente_id seja null se vazio
    };

    onSubmit(normalizedData, reset);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{usuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4 pb-4">
            <div className="col-span-2">
              <Label htmlFor="cpf_cnpj">CPF/CNPJ *</Label>
              <Input
                id="cpf_cnpj"
                {...register('cpf_cnpj', { required: true })}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                onChange={(e) => setValue('cpf_cnpj', formatCPFCNPJ(e.target.value))}
              />
              {errors.cpf_cnpj && <p className="text-sm text-red-500 mt-1">CPF/CNPJ é obrigatório</p>}
            </div>

            <div className="col-span-2">
              <Label htmlFor="razao_social">Nome Completo / Razão Social *</Label>
              <Input
                id="razao_social"
                {...register('razao_social', { required: true })}
                placeholder="Nome completo ou Razão Social"
              />
              {errors.razao_social && <p className="text-sm text-red-500 mt-1">Razão Social é obrigatória</p>}
            </div>

            <div className="col-span-2">
              <Label htmlFor="nome_perfil">Como você quer ser chamado? *</Label>
              <Input
                id="nome_perfil"
                {...register('nome_perfil', { required: true })}
                placeholder="Apelido ou nome de preferência"
              />
              {errors.nome_perfil && <p className="text-sm text-red-500 mt-1">Nome de perfil é obrigatório</p>}
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register('email', { required: true })}
                placeholder="email@exemplo.com"
                disabled={!!usuario && !isGerenteOuSuperior}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">Email é obrigatório</p>}
              {!!usuario && !isGerenteOuSuperior && (
                <p className="text-xs text-slate-500 mt-1">Apenas Gerente ou superior pode alterar o email</p>
              )}
            </div>

            {!usuario && (
              <div className="col-span-2">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-700">
                    📧 Um e-mail de convite será enviado para o usuário criar sua própria senha de acesso.
                  </p>
                </div>
              </div>
            )}
            
            <div>
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                {...register('telefone')}
                placeholder="(00) 00000-0000"
                onChange={(e) => setValue('telefone', formatPhone(e.target.value))}
              />
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="codigo_vendedor">Código Vendedor</Label>
              <Input
                id="codigo_vendedor"
                {...register('codigo_vendedor')}
                placeholder={watch('empresa_id') && empresas.length > 0 ? `Ex: ${empresas.find(e => e.id === watch('empresa_id'))?.codigo || 'EMP01'}-V001` : 'Ex: EMP01-V001'}
              />
              <p className="text-xs text-slate-500 mt-1">
                Use o código da empresa seguido de -V001, -V002, etc.
              </p>
            </div>
            
            {(currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin' || currentUser?.perfil === 'admin') && perfil !== 'super_admin' && (
              <div className="col-span-2">
                <Label>Empresa *</Label>
                <Select
                  value={watch('empresa_id') || ''}
                  onValueChange={(value) => {
                    setValue('empresa_id', value);
                    const empresa = empresas.find(e => e.id === value);
                    if (empresa) {
                      setValue('empresa_nome', empresa.nome);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.empresa_id && <p className="text-sm text-red-500 mt-1">Empresa é obrigatória</p>}
              </div>
            )}
            
            {perfil === 'super_admin' && (
              <div className="col-span-2">
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm text-purple-700">
                    🔐 Super Admin tem acesso a todas as empresas do sistema
                  </p>
                </div>
              </div>
            )}

            <div>
              <Label>Perfil *</Label>
              <Select
                value={watch('perfil')}
                onValueChange={(value) => setValue('perfil', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  {currentUser?.perfil === 'master' && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  {currentUser?.perfil === 'master' && <SelectItem value="master">Master</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            
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
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {perfil === 'vendedor' && (
              <div className="col-span-2">
                <Label>Gerente Responsável (Opcional)</Label>
                <Select
                  value={watch('gerente_id') || 'sem-gerente'}
                  onValueChange={(value) => setValue('gerente_id', value === 'sem-gerente' ? null : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem gerente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem-gerente">Sem gerente</SelectItem>
                    {gerentes.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            </div>
          </div>
          
          {inviteSuccess && !usuario && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-green-700 text-sm">
              ✅ Convite enviado com sucesso! Você pode cadastrar um novo usuário.
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t bg-white flex-shrink-0 -mx-6 px-6 pb-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {usuario ? 'Salvar' : 'Enviar Convite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}