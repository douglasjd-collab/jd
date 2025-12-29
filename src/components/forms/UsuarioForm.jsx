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

export default function UsuarioForm({ open, onOpenChange, usuario, onSubmit, isLoading, currentUser }) {
  const [gerentes, setGerentes] = useState([]);
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: usuario || {
      full_name: '',
      email: '',
      cpf: '',
      telefone: '',
      codigo_vendedor: '',
      perfil: 'vendedor',
      gerente_id: '',
      status: 'ativo',
      senha: ''
    }
  });

  const perfil = watch('perfil');
  const isGerenteOuSuperior = ['gerente', 'admin', 'master'].includes(currentUser?.perfil);

  useEffect(() => {
    loadGerentes();
  }, []);

  useEffect(() => {
    if (usuario) {
      Object.keys(usuario).forEach(key => {
        setValue(key, usuario[key]);
      });
    } else {
      reset({
        full_name: '',
        email: '',
        cpf: '',
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

  const formatCPF = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPhone = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const handleFormSubmit = (data) => {
    // Normalizar CPF e telefone (remover máscaras)
    const normalizedData = {
      ...data,
      cpf: data.cpf ? data.cpf.replace(/\D/g, '') : '',
      telefone: data.telefone ? data.telefone.replace(/\D/g, '') : ''
    };

    onSubmit(normalizedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{usuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                {...register('full_name', { required: 'Nome é obrigatório' })}
                placeholder="Nome do usuário"
              />
              {errors.full_name && <p className="text-sm text-red-500 mt-1">{errors.full_name.message}</p>}
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register('email', { required: 'Email é obrigatório' })}
                placeholder="email@exemplo.com"
                disabled={!!usuario && !isGerenteOuSuperior}
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>}
              {!!usuario && !isGerenteOuSuperior && (
                <p className="text-xs text-slate-500 mt-1">Apenas Gerente ou superior pode alterar o email</p>
              )}
            </div>

            {!usuario && (
              <div className="col-span-2">
                <Label htmlFor="senha">Senha *</Label>
                <Input
                  id="senha"
                  type="password"
                  {...register('senha', { 
                    required: 'Senha é obrigatória',
                    minLength: { value: 6, message: 'Senha deve ter no mínimo 6 caracteres' }
                  })}
                  placeholder="Mínimo 6 caracteres"
                />
                {errors.senha && <p className="text-sm text-red-500 mt-1">{errors.senha.message}</p>}
              </div>
            )}
            
            <div>
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                {...register('cpf')}
                placeholder="000.000.000-00"
                onChange={(e) => setValue('cpf', formatCPF(e.target.value))}
              />
            </div>
            
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
                placeholder="Ex: V001"
              />
            </div>
            
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
                  <SelectItem value="master">Master</SelectItem>
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
                <Label>Gerente Responsável</Label>
                <Select
                  value={watch('gerente_id') || ''}
                  onValueChange={(value) => setValue('gerente_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um gerente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Sem gerente</SelectItem>
                    {gerentes.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {usuario ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}