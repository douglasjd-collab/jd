import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

export default function VincularUsuarioModal({ open, onOpenChange, usuario, empresas, onSuccess }) {
  const [selectedEmpresa, setSelectedEmpresa] = useState('');
  const [perfil, setPerfil] = useState('vendedor');
  const [isLoading, setIsLoading] = useState(false);

  const handleVincular = async () => {
    if (!selectedEmpresa || !usuario) {
      toast.error('Selecione uma empresa');
      return;
    }

    setIsLoading(true);
    try {
      const empresa = empresas.find(e => e.id === selectedEmpresa);
      
      const dados = {
        user_id: usuario.user_id,
        nome: usuario.nome,
        email: usuario.email,
        perfil,
        empresa_id: selectedEmpresa,
        empresa_nome: empresa?.nome,
        status: 'ativo',
        cpf_cnpj: usuario.cpf_cnpj || null,
        codigo_vendedor: usuario.codigo_vendedor || null,
      };

      // Se já existe, atualizar; senão, criar
      const existentes = await base44.entities.Colaborador.filter({
        user_id: usuario.user_id,
        empresa_id: selectedEmpresa
      });

      if (existentes?.length) {
        await base44.entities.Colaborador.update(existentes[0].id, dados);
      } else {
        await base44.entities.Colaborador.create(dados);
      }

      toast.success(`${usuario.nome} vinculado a ${empresa?.nome}`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Erro ao vincular');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Usuário a Empresa</DialogTitle>
        </DialogHeader>

        {usuario && (
          <div className="space-y-4">
            <div className="bg-slate-100 p-3 rounded-lg">
              <p className="text-sm text-slate-600">Usuário</p>
              <p className="font-medium">{usuario.nome}</p>
              <p className="text-sm text-slate-500">{usuario.email}</p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Empresa</label>
              <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Perfil</label>
              <Select value={perfil} onValueChange={setPerfil}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-start gap-2 bg-blue-50 p-3 rounded text-sm text-blue-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>Este usuário será vinculado à empresa selecionada com o perfil escolhido.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleVincular} 
            disabled={isLoading || !selectedEmpresa}
            className="bg-[#23BE84] hover:bg-[#1da570]"
          >
            {isLoading ? 'Vinculando...' : 'Vincular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}