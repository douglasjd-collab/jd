import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { User, CreditCard, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function MeusDados() {
  const [user, setUser] = useState(null);
  const [dadosBancarios, setDadosBancarios] = useState({
    chave_pix: '',
    tipo_chave_pix: '',
    banco: '',
    agencia: '',
    conta: ''
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userData = await base44.auth.me();
    setUser(userData);
    setDadosBancarios({
      chave_pix: userData.chave_pix || '',
      tipo_chave_pix: userData.tipo_chave_pix || '',
      banco: userData.banco || '',
      agencia: userData.agencia || '',
      conta: userData.conta || ''
    });
  };

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.User.update(user.id, data),
    onSuccess: () => {
      toast.success('Dados bancários atualizados!');
      loadUser();
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!dadosBancarios.chave_pix || !dadosBancarios.tipo_chave_pix) {
      toast.error('Preencha a chave PIX e o tipo');
      return;
    }
    updateMutation.mutate(dadosBancarios);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1e3a5f]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meus Dados"
        subtitle="Gerencie suas informações pessoais e bancárias"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informações Pessoais */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Informações Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Nome</p>
              <p className="font-medium">{user.full_name}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Email</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">CPF</p>
              <p className="font-medium">{user.cpf || '-'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Telefone</p>
              <p className="font-medium">{user.telefone || '-'}</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Perfil</p>
              <p className="font-medium capitalize">{user.perfil}</p>
            </div>
            {user.perfil === 'vendedor' && (
              <div className="p-4 bg-emerald-50 rounded-xl">
                <p className="text-sm text-emerald-700 font-medium">Saldo Disponível</p>
                <p className="text-2xl font-bold text-emerald-800 mt-1">
                  {formatCurrency(user.saldo_comissao)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados Bancários */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Dados Bancários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Chave PIX *</Label>
                  <Select
                    value={dadosBancarios.tipo_chave_pix}
                    onValueChange={(value) => setDadosBancarios({ ...dadosBancarios, tipo_chave_pix: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="telefone">Telefone</SelectItem>
                      <SelectItem value="aleatoria">Chave Aleatória</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Chave PIX *</Label>
                  <Input
                    value={dadosBancarios.chave_pix}
                    onChange={(e) => setDadosBancarios({ ...dadosBancarios, chave_pix: e.target.value })}
                    placeholder="Informe sua chave PIX"
                  />
                </div>

                <div className="md:col-span-2">
                  <Label>Banco</Label>
                  <Input
                    value={dadosBancarios.banco}
                    onChange={(e) => setDadosBancarios({ ...dadosBancarios, banco: e.target.value })}
                    placeholder="Ex: Banco do Brasil, Caixa, Bradesco..."
                  />
                </div>

                <div>
                  <Label>Agência (opcional)</Label>
                  <Input
                    value={dadosBancarios.agencia}
                    onChange={(e) => setDadosBancarios({ ...dadosBancarios, agencia: e.target.value })}
                    placeholder="0000"
                  />
                </div>

                <div>
                  <Label>Conta (opcional)</Label>
                  <Input
                    value={dadosBancarios.conta}
                    onChange={(e) => setDadosBancarios({ ...dadosBancarios, conta: e.target.value })}
                    placeholder="00000-0"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="bg-[#1e3a5f] hover:bg-[#2a4a73] gap-2"
                >
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  <Save className="w-4 h-4" />
                  Salvar Dados Bancários
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}