import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { 
  Wallet, 
  DollarSign, 
  TrendingUp, 
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function Saques() {
  const [user, setUser] = useState(null);
  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [valorSaque, setValorSaque] = useState('');
  const [aprovarId, setAprovarId] = useState(null);
  const [rejeitarId, setRejeitarId] = useState(null);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const userData = await base44.auth.me();
    setUser(userData);
  };

  const isAdmin = user?.perfil === 'master' || user?.perfil === 'admin';

  const { data: saques = [], isLoading } = useQuery({
    queryKey: ['saques'],
    queryFn: () => base44.entities.Saque.list('-created_date'),
  });

  const solicitarMutation = useMutation({
    mutationFn: async (valor) => {
      // Validar saldo
      if (valor > (user.saldo_comissao || 0)) {
        throw new Error('Saldo insuficiente');
      }
      if (valor <= 0) {
        throw new Error('Valor inválido');
      }
      if (!user.chave_pix) {
        throw new Error('Configure seus dados bancários primeiro');
      }

      // Criar solicitação
      const saque = await base44.entities.Saque.create({
        usuario_id: user.id,
        usuario_nome: user.full_name,
        valor,
        saldo_anterior: user.saldo_comissao,
        saldo_posterior: user.saldo_comissao - valor,
        chave_pix: user.chave_pix,
        tipo_chave_pix: user.tipo_chave_pix,
        banco: user.banco,
        status: 'solicitado',
        data_solicitacao: format(new Date(), 'yyyy-MM-dd')
      });

      // Debitar do saldo
      await base44.entities.User.update(user.id, {
        saldo_comissao: user.saldo_comissao - valor
      });

      return saque;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setSolicitarOpen(false);
      setValorSaque('');
      loadUser();
      toast.success('Solicitação de saque realizada!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao solicitar saque');
    }
  });

  const aprovarMutation = useMutation({
    mutationFn: (id) => base44.entities.Saque.update(id, {
      status: 'pago',
      data_pagamento: format(new Date(), 'yyyy-MM-dd')
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saques'] });
      setAprovarId(null);
      toast.success('Saque aprovado!');
    },
  });

  const rejeitarMutation = useMutation({
    mutationFn: async ({ id, motivo }) => {
      // Buscar saque
      const saquesData = await base44.entities.Saque.filter({ id });
      const saque = saquesData[0];

      // Devolver valor ao saldo
      const usuariosData = await base44.entities.User.filter({ id: saque.usuario_id });
      if (usuariosData.length > 0) {
        const usuario = usuariosData[0];
        await base44.entities.User.update(usuario.id, {
          saldo_comissao: (usuario.saldo_comissao || 0) + saque.valor
        });
      }

      // Atualizar saque
      await base44.entities.Saque.update(id, {
        status: 'rejeitado',
        motivo_rejeicao: motivo
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setRejeitarId(null);
      setMotivoRejeicao('');
      toast.success('Saque rejeitado e saldo devolvido');
    },
  });

  const handleSolicitar = (e) => {
    e.preventDefault();
    const valor = parseFloat(valorSaque);
    if (isNaN(valor) || valor <= 0) {
      toast.error('Informe um valor válido');
      return;
    }
    solicitarMutation.mutate(valor);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Filtrar saques por perfil
  const filteredSaques = isAdmin ? saques : saques.filter(s => s.usuario_id === user?.id);

  const totalSolicitado = filteredSaques
    .filter(s => s.status === 'solicitado')
    .reduce((acc, s) => acc + s.valor, 0);

  const totalPago = filteredSaques
    .filter(s => s.status === 'pago')
    .reduce((acc, s) => acc + s.valor, 0);

  const columns = [
    {
      header: 'Data',
      cell: (row) => row.data_solicitacao ? format(new Date(row.data_solicitacao), 'dd/MM/yyyy') : '-'
    },
    ...(isAdmin ? [{
      header: 'Vendedor',
      cell: (row) => row.usuario_nome
    }] : []),
    {
      header: 'Valor',
      cell: (row) => (
        <span className="font-semibold text-amber-600">
          {formatCurrency(row.valor)}
        </span>
      )
    },
    {
      header: 'Chave PIX',
      cell: (row) => (
        <div className="max-w-xs">
          <p className="font-medium truncate">{row.chave_pix}</p>
          <p className="text-xs text-slate-500 capitalize">{row.tipo_chave_pix}</p>
        </div>
      )
    },
    {
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status} />
    },
    {
      header: 'Data Pgto',
      cell: (row) => row.data_pagamento ? format(new Date(row.data_pagamento), 'dd/MM/yyyy') : '-'
    },
    ...(isAdmin ? [{
      header: '',
      className: 'w-32',
      cell: (row) => row.status === 'solicitado' && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAprovarId(row.id)}
            className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
          >
            <CheckCircle className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRejeitarId(row.id)}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <XCircle className="w-4 h-4" />
          </Button>
        </div>
      )
    }] : [])
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Minhas Comissões"
        subtitle="Gerencie suas solicitações de comissão"
        {...(!isAdmin && {
          actionLabel: "Solicitar Comissão",
          actionIcon: Wallet,
          onAction: () => setSolicitarOpen(true)
        })}
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {!isAdmin && (
          <Card className="border-0 shadow-sm bg-emerald-50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-100">
                <Wallet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-emerald-700">Saldo Disponível</p>
                <p className="text-2xl font-bold text-emerald-800">
                  {formatCurrency(user?.saldo_comissao)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100">
              <DollarSign className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-amber-700">Solicitados</p>
              <p className="text-2xl font-bold text-amber-800">
                {formatCurrency(totalSolicitado)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-blue-50">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-blue-700">Total Pago</p>
              <p className="text-2xl font-bold text-blue-800">
                {formatCurrency(totalPago)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredSaques}
        isLoading={isLoading}
        emptyMessage="Nenhum saque encontrado"
      />

      {/* Solicitar Saque Modal */}
      <Dialog open={solicitarOpen} onOpenChange={setSolicitarOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Comissão</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSolicitar} className="space-y-4">
            <Card className="bg-slate-50 border-0">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">Saldo Disponível:</span>
                  <span className="text-xl font-bold text-emerald-600">
                    {formatCurrency(user?.saldo_comissao)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {!user?.chave_pix && (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Configure seus dados bancários primeiro!</p>
                    <p className="mt-1">Acesse "Meus Dados" para cadastrar sua chave PIX.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {user?.chave_pix && (
              <>
                <div>
                  <Label htmlFor="valor">Valor do Saque *</Label>
                  <Input
                    id="valor"
                    type="number"
                    step="0.01"
                    value={valorSaque}
                    onChange={(e) => setValorSaque(e.target.value)}
                    placeholder="0,00"
                    max={user?.saldo_comissao}
                  />
                </div>

                <Card className="bg-slate-50 border-0">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Chave PIX:</span>
                      <span className="font-medium">{user.chave_pix}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tipo:</span>
                      <span className="font-medium capitalize">{user.tipo_chave_pix}</span>
                    </div>
                    {user.banco && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Banco:</span>
                        <span className="font-medium">{user.banco}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setSolicitarOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={solicitarMutation.isPending || !user?.chave_pix}
                    className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
                  >
                    {solicitarMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Solicitar
                  </Button>
                </div>
              </>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Aprovar Saque */}
      <AlertDialog open={!!aprovarId} onOpenChange={() => setAprovarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Saque?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirme que o pagamento foi realizado. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aprovarMutation.mutate(aprovarId)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirmar Pagamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rejeitar Saque */}
      <AlertDialog open={!!rejeitarId} onOpenChange={() => setRejeitarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Saque?</AlertDialogTitle>
            <AlertDialogDescription>
              O valor será devolvido ao saldo do vendedor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Motivo da Rejeição</Label>
            <Textarea
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Informe o motivo..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMotivoRejeicao('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!motivoRejeicao) {
                  toast.error('Informe o motivo da rejeição');
                  return;
                }
                rejeitarMutation.mutate({ id: rejeitarId, motivo: motivoRejeicao });
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}