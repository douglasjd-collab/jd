import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2 } from 'lucide-react';
import { toast } from 'sonner';

const CAMPOS_VAZIOS = {
  nome: '',
  nome_fantasia: '',
  cpf_cnpj: '',
  endereco_rua: '',
  endereco_numero: '',
  endereco_cep: '',
  endereco_cidade: '',
  socio_nome: '',
  socio_cpf: '',
  socio_data_nascimento: '',
  socio_nome_pai: '',
  socio_nome_mae: '',
};

export default function EditarNomeEmpresaModal({ open, onOpenChange, empresaId, onSuccess }) {
  const [dados, setDados] = useState(CAMPOS_VAZIOS);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (open && empresaId) {
      carregarEmpresa();
    }
  }, [open, empresaId]);

  const carregarEmpresa = async () => {
    setCarregando(true);
    try {
      const emps = await base44.entities.Empresa.filter({ id: empresaId });
      if (emps && emps.length > 0) {
        const emp = emps[0];
        setDados({
          nome: emp.nome || '',
          nome_fantasia: emp.nome_fantasia || '',
          cpf_cnpj: emp.cpf_cnpj || '',
          endereco_rua: emp.endereco_rua || '',
          endereco_numero: emp.endereco_numero || '',
          endereco_cep: emp.endereco_cep || '',
          endereco_cidade: emp.endereco_cidade || '',
          socio_nome: emp.socio_nome || '',
          socio_cpf: emp.socio_cpf || '',
          socio_data_nascimento: emp.socio_data_nascimento || '',
          socio_nome_pai: emp.socio_nome_pai || '',
          socio_nome_mae: emp.socio_nome_mae || '',
        });
      }
    } catch (error) {
      console.error('Erro ao carregar empresa:', error);
    } finally {
      setCarregando(false);
    }
  };

  const handleChange = (campo, valor) => {
    setDados(prev => ({ ...prev, [campo]: valor }));
  };

  const handleSalvar = async () => {
    if (!dados.nome.trim()) {
      toast.error('Razão social não pode estar vazia');
      return;
    }

    setSalvando(true);
    try {
      await base44.entities.Empresa.update(empresaId, dados);
      toast.success('Dados da empresa atualizados com sucesso!');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast.error('Erro ao salvar dados: ' + error.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Dados da Empresa
          </DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center gap-2 p-4 text-sm text-slate-500 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando...
          </div>
        ) : (
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <div>
                <Label>Razão Social</Label>
                <Input className="mt-1.5" value={dados.nome} onChange={(e) => handleChange('nome', e.target.value)} placeholder="Razão social" />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input className="mt-1.5" value={dados.nome_fantasia} onChange={(e) => handleChange('nome_fantasia', e.target.value)} placeholder="Nome fantasia" />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input className="mt-1.5" value={dados.cpf_cnpj} onChange={(e) => handleChange('cpf_cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Endereço</Label>
                  <Input className="mt-1.5" value={dados.endereco_rua} onChange={(e) => handleChange('endereco_rua', e.target.value)} placeholder="Rua/Logradouro" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input className="mt-1.5" value={dados.endereco_numero} onChange={(e) => handleChange('endereco_numero', e.target.value)} placeholder="Número" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CEP</Label>
                  <Input className="mt-1.5" value={dados.endereco_cep} onChange={(e) => handleChange('endereco_cep', e.target.value)} placeholder="00000-000" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input className="mt-1.5" value={dados.endereco_cidade} onChange={(e) => handleChange('endereco_cidade', e.target.value)} placeholder="Cidade" />
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t">
              <p className="text-sm font-semibold text-slate-700">Sócio</p>
              <div>
                <Label>Nome</Label>
                <Input className="mt-1.5" value={dados.socio_nome} onChange={(e) => handleChange('socio_nome', e.target.value)} placeholder="Nome do sócio" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CPF</Label>
                  <Input className="mt-1.5" value={dados.socio_cpf} onChange={(e) => handleChange('socio_cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input type="date" className="mt-1.5" value={dados.socio_data_nascimento} onChange={(e) => handleChange('socio_data_nascimento', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Filiação (Pai)</Label>
                  <Input className="mt-1.5" value={dados.socio_nome_pai} onChange={(e) => handleChange('socio_nome_pai', e.target.value)} placeholder="Nome do pai" />
                </div>
                <div>
                  <Label>Filiação (Mãe)</Label>
                  <Input className="mt-1.5" value={dados.socio_nome_mae} onChange={(e) => handleChange('socio_nome_mae', e.target.value)} placeholder="Nome da mãe" />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || carregando}
            className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}