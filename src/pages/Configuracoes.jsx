import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  Settings, 
  Percent, 
  Plus, 
  Trash2,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

export default function Configuracoes() {
  const [novaConfig, setNovaConfig] = useState({
    tipo: 'vendedor',
    percentual: '',
    descricao: ''
  });
  const queryClient = useQueryClient();

  const { data: configuracoes = [], isLoading } = useQuery({
    queryKey: ['configuracoes-comissao'],
    queryFn: () => base44.entities.ConfiguracaoComissao.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ConfiguracaoComissao.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-comissao'] });
      setNovaConfig({ tipo: 'vendedor', percentual: '', descricao: '' });
      toast.success('Configuração adicionada!');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConfiguracaoComissao.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuracoes-comissao'] });
      toast.success('Configuração removida!');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!novaConfig.percentual) {
      toast.error('Informe o percentual');
      return;
    }
    createMutation.mutate({
      ...novaConfig,
      percentual: parseFloat(novaConfig.percentual),
      status: 'ativo'
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        subtitle="Configure as regras do sistema"
      />

      {/* Configuração de Comissões */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Percent className="w-5 h-5" />
            Regras de Comissão
          </CardTitle>
          <CardDescription>
            Configure os percentuais de comissão para vendedores e gerentes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Formulário */}
          <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Tipo</Label>
              <Select
                value={novaConfig.tipo}
                onValueChange={(value) => setNovaConfig({ ...novaConfig, tipo: value })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="gerente">Gerente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Percentual (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={novaConfig.percentual}
                onChange={(e) => setNovaConfig({ ...novaConfig, percentual: e.target.value })}
                placeholder="0,00"
                className="w-32"
              />
            </div>
            <div className="flex-1 min-w-48">
              <Label>Descrição</Label>
              <Input
                value={novaConfig.descricao}
                onChange={(e) => setNovaConfig({ ...novaConfig, descricao: e.target.value })}
                placeholder="Ex: Comissão padrão vendedor"
              />
            </div>
            <Button 
              type="submit" 
              disabled={createMutation.isPending}
              className="bg-[#1e3a5f] hover:bg-[#2a4a73]"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Adicionar
            </Button>
          </form>

          {/* Lista */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Percentual</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configuracoes.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="capitalize font-medium">{config.tipo}</TableCell>
                  <TableCell>{config.percentual}%</TableCell>
                  <TableCell>{config.descricao || '-'}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(config.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {configuracoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                    Nenhuma configuração cadastrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Informações do Sistema */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Informações do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Versão</p>
              <p className="font-semibold">1.0.0</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl">
              <p className="text-sm text-slate-500">Ambiente</p>
              <p className="font-semibold">Produção</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}