import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CheckCircle2, Loader2 } from 'lucide-react';

const formatCNPJ = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      .replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
      .replace(/(\d{3})(\d{1,3})/, '$1.$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const formatTelefone = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/\($/, '').replace(/\(\d{0,2}$/, (m) => m);
  }
  return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
};

const INITIAL_FORM = {
  codigo: '',
  nome: '',
  email: '',
  cpf_cnpj: '',
  telefone: '',
  endereco_rua: '',
  endereco_numero: '',
  endereco_cep: '',
  endereco_cidade: '',
  endereco_estado: '',
  tipo_licenca: 'basica',
  limite_usuarios: 5,
  email_admin: '',
};

export default function NovaSubcontaModal({ open, onOpenChange, onSuccess }) {
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [step, setStep] = useState(1); // 1 = dados empresa, 2 = senha admin
  const [empresaCriada, setEmpresaCriada] = useState(null);
  const [enviandoConvite, setEnviandoConvite] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('createEmpresa', { empresaData: data }),
    onSuccess: (resp) => {
      const empresa = resp?.data?.empresa;
      setEmpresaCriada(empresa);
      setStep(2);
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.email || !formData.telefone) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }
    createMutation.mutate({
      ...formData,
      status: 'ativa',
      status_licenca: 'trial',
      usuarios_ativos: 0,
      total_clientes: 0,
      total_vendas: 0,
      whatsapp_conectado: false,
      data_criacao: new Date().toISOString(),
    });
  };

  const handleEnviarConvite = async () => {
    const emailAdmin = formData.email_admin || formData.email;
    if (!emailAdmin) {
      toast.error('Informe o email do admin');
      return;
    }

    setEnviandoConvite(true);
    try {
      await base44.functions.invoke('inviteUser', {
        email: emailAdmin,
        perfil: 'admin',
        nome: formData.nome,
        empresa_id: empresaCriada?.id,
      });
      toast.success(`✅ Convite enviado para ${emailAdmin}! O usuário receberá um link de acesso.`);
      resetModal();
      onSuccess();
    } catch (e) {
      toast.error('Erro ao enviar convite: ' + e.message);
    } finally {
      setEnviandoConvite(false);
    }
  };

  const handlePularSenha = () => {
    // Apenas cria a empresa sem definir senha (admin pode ser convidado depois)
    toast.success('Subconta criada! Configure o acesso depois em Usuários.');
    resetModal();
    onSuccess();
  };

  const resetModal = () => {
    setFormData(INITIAL_FORM);
    setStep(1);
    setEmpresaCriada(null);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetModal(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Nova Subconta' : '🔐 Definir Acesso do Admin'}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? `Passo 1 de 2 — Dados da empresa`
              : `Passo 2 de 2 — Subconta "${empresaCriada?.nome}" criada! Defina agora a senha de acesso.`}
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de progresso */}
        <div className="flex gap-2 mb-2">
          <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-[#23BE84]' : 'bg-slate-200'}`} />
          <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-[#23BE84]' : 'bg-slate-200'}`} />
        </div>

        {/* PASSO 1: Dados da empresa */}
        {step === 1 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nome da Empresa *</Label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: Empresa LTDA"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="contato@empresa.com"
                />
              </div>
              <div>
                <Label>CPF/CNPJ</Label>
                <Input
                  value={formData.cpf_cnpj}
                  onChange={(e) => setFormData({ ...formData, cpf_cnpj: formatCNPJ(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <Label>Telefone *</Label>
                <Input
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: formatTelefone(e.target.value) })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-4">Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Rua</Label>
                  <Input value={formData.endereco_rua} onChange={(e) => setFormData({ ...formData, endereco_rua: e.target.value })} placeholder="Av. Principal" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={formData.endereco_numero} onChange={(e) => setFormData({ ...formData, endereco_numero: e.target.value })} placeholder="123" />
                </div>
                <div>
                  <Label>CEP</Label>
                  <Input value={formData.endereco_cep} onChange={(e) => setFormData({ ...formData, endereco_cep: e.target.value })} placeholder="00000-000" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={formData.endereco_cidade} onChange={(e) => setFormData({ ...formData, endereco_cidade: e.target.value })} placeholder="São Paulo" />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input value={formData.endereco_estado} onChange={(e) => setFormData({ ...formData, endereco_estado: e.target.value })} placeholder="SP" maxLength="2" />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-semibold text-sm mb-4">Configurações de Licença</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Email do Admin *</Label>
                  <Input
                    type="email"
                    value={formData.email_admin}
                    onChange={(e) => setFormData({ ...formData, email_admin: e.target.value })}
                    placeholder="admin@empresa.com"
                  />
                  <p className="text-xs text-slate-400 mt-1">Este email será usado para acessar a subconta</p>
                </div>
                <div>
                  <Label>Tipo de Licença</Label>
                  <Select value={formData.tipo_licenca} onValueChange={(value) => setFormData({ ...formData, tipo_licenca: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gratuita">Gratuita</SelectItem>
                      <SelectItem value="basica">Básica</SelectItem>
                      <SelectItem value="profissional">Profissional</SelectItem>
                      <SelectItem value="empresa">Empresa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Limite de Usuários</Label>
                  <Input type="number" value={formData.limite_usuarios} onChange={(e) => setFormData({ ...formData, limite_usuarios: parseInt(e.target.value) })} min="1" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => { resetModal(); onOpenChange(false); }}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending} className="bg-[#23BE84] hover:bg-[#1da570]">
                {createMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Criando...</> : 'Criar Subconta →'}
              </Button>
            </div>
          </form>
        )}

        {/* PASSO 2: Enviar convite ao admin */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Subconta criada com sucesso!</p>
                <p className="text-xs text-green-600">Envie um convite de acesso para o administrador desta subconta.</p>
              </div>
            </div>

            <div>
              <Label>Email do Admin</Label>
              <Input
                type="email"
                value={formData.email_admin || formData.email}
                readOnly
                className="bg-slate-50 text-slate-600"
              />
              <p className="text-xs text-slate-400 mt-1">O usuário receberá um email com o link para definir a senha e acessar o sistema.</p>
            </div>

            <div className="flex justify-between gap-2 border-t pt-4">
              <Button type="button" variant="ghost" className="text-slate-500 text-sm" onClick={handlePularSenha}>
                Pular (enviar depois)
              </Button>
              <Button onClick={handleEnviarConvite} disabled={enviandoConvite} className="bg-[#23BE84] hover:bg-[#1da570]">
                {enviandoConvite
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Enviando...</>
                  : <><CheckCircle2 className="w-4 h-4 mr-2" />Enviar Convite de Acesso</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}