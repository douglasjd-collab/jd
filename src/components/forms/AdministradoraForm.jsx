import React from 'react';
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

export default function AdministradoraForm({ open, onOpenChange, administradora, onSubmit, isLoading }) {
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: administradora || {
      razao_social: '',
      nome_fantasia: '',
      cnpj: '',
      contato: '',
      status: 'ativa'
    }
  });

  React.useEffect(() => {
    if (administradora) {
      Object.keys(administradora).forEach(key => {
        setValue(key, administradora[key]);
      });
    } else {
      reset({
        razao_social: '',
        nome_fantasia: '',
        cnpj: '',
        contato: '',
        status: 'ativa'
      });
    }
  }, [administradora, setValue, reset]);

  const formatCNPJ = (value) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{administradora ? 'Editar Administradora' : 'Nova Administradora'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="razao_social">Razão Social *</Label>
              <Input
                id="razao_social"
                {...register('razao_social', { required: 'Razão social é obrigatória' })}
                placeholder="Razão social"
              />
              {errors.razao_social && <p className="text-sm text-red-500 mt-1">{errors.razao_social.message}</p>}
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="nome_fantasia">Nome Fantasia</Label>
              <Input
                id="nome_fantasia"
                {...register('nome_fantasia')}
                placeholder="Nome fantasia"
              />
            </div>
            
            <div>
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                {...register('cnpj', { required: 'CNPJ é obrigatório' })}
                placeholder="00.000.000/0000-00"
                onChange={(e) => setValue('cnpj', formatCNPJ(e.target.value))}
              />
              {errors.cnpj && <p className="text-sm text-red-500 mt-1">{errors.cnpj.message}</p>}
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
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="inativa">Inativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="contato">Contato</Label>
              <Input
                id="contato"
                {...register('contato')}
                placeholder="Informações de contato"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {administradora ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}