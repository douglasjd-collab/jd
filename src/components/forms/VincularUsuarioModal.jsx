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

  // Reset state quando abrir o modal
  React.useEffect(() => {
    if (open) {
      console.log('Modal aberto para usuário:', usuario);
      console.log('Empresas disponíveis:', empresas);
      setSelectedEmpresa('');
      setPerfil('vendedor');
    }
  }, [open, usuario, empresas]);

  const handleVincular = async () => {
    console.log('handleVincular iniciado');
    console.log('selectedEmpresa:', selectedEmpresa);
    console.log('usuario:', usuario);
    console.log('perfil:', perfil);

    if (!selectedEmpresa || !usuario) {
      toast.error('Selecione uma empresa');
      return;
    }

    setIsLoading(true);
    try {
      const empresa = empresas.find(e => e.id === selectedEmpresa);
      console.log('empresa encontrada:', empresa);
      
      const dados = {
        user_id: usuario.user_id || usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil,
        empresa_id: selectedEmpresa,
        empresa_nome: empresa?.nome,
        status: 'ativo',
        cpf_cnpj: usuario.cpf_cnpj || null,
        codigo_vendedor: usuario.codigo_vendedor || null,
      };

      console.log('dados a serem salvos:', dados);

      // Se já existe Colaborador com esse user_id, atualizar
      const existentes = await base44.entities.Colaborador.filter({
        user_id: dados.user_id
      });

      console.log('colaboradores existentes:', existentes);

      if (existentes?.length) {
        console.log('Atualizando colaborador existente:', existentes[0].id);
        await base44.entities.Colaborador.update(existentes[0].id, dados);
      } else {
        console.log('Criando novo colaborador');
        await base44.entities.Colaborador.create(dados);
      }

      toast.success(`✅ ${usuario.nome} vinculado a ${empresa?.nome || selectedEmpresa}`);
      setSelectedEmpresa('');
      setPerfil('vendedor');
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Erro ao vincular:', error);
      toast.error(error.message || 'Erro ao vincular usuário');
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
              <Select 
                value={selectedEmpresa} 
                onValueChange={(value) => {
                  console.log('Empresa selecionada:', value);
                  setSelectedEmpresa(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas && empresas.length > 0 ? (
                    empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-slate-500">Nenhuma empresa disponível</div>
                  )}
                </SelectContent>
              </Select>
              {empresas && empresas.length === 0 && (
                <p className="text-xs text-red-500 mt-1">⚠️ Nenhuma empresa cadastrada</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Perfil</label>
              <Select value={perfil} onValueChange={setPerfil}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="colaborador_vendedor">Colaborador/Vendedor</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="parceiro">Parceiro</SelectItem>
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