import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Download,
  Users,
  Building2,
  Calendar,
  TrendingUp
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const COLORS = ['#1e3a5f', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function Relatorios() {
  const [activeTab, setActiveTab] = useState('vendedores');
  const [dateStart, setDateStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateEnd, setDateEnd] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedAdmin, setSelectedAdmin] = useState('todos');

  const { data: vendas = [] } = useQuery({
    queryKey: ['vendas'],
    queryFn: () => base44.entities.Venda.list('-created_date'),
  });

  const { data: comissoes = [] } = useQuery({
    queryKey: ['comissoes'],
    queryFn: () => base44.entities.Comissao.list(),
  });

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios'],
    queryFn: () => base44.entities.User.list(),
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras'],
    queryFn: () => base44.entities.Administradora.list(),
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  // Filtrar vendas por período
  const vendasFiltradas = vendas.filter(v => {
    const dataVenda = new Date(v.data_venda);
    const matchDate = dataVenda >= new Date(dateStart) && dataVenda <= new Date(dateEnd);
    const matchAdmin = selectedAdmin === 'todos' || v.administradora_id === selectedAdmin;
    return matchDate && matchAdmin;
  });

  // Relatório por vendedor
  const relatorioVendedores = React.useMemo(() => {
    const data = {};
    vendasFiltradas.forEach(v => {
      const nome = v.vendedor_nome || 'Sem vendedor';
      if (!data[nome]) {
        data[nome] = { vendas: 0, valor: 0, comissao: 0 };
      }
      data[nome].vendas++;
      data[nome].valor += v.valor_carta || 0;
      data[nome].comissao += v.comissao_total_prevista || 0;
    });
    return Object.entries(data)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.vendas - a.vendas);
  }, [vendasFiltradas]);

  // Relatório por administradora
  const relatorioAdmins = React.useMemo(() => {
    const data = {};
    vendasFiltradas.forEach(v => {
      const nome = v.administradora_nome || 'Sem administradora';
      if (!data[nome]) {
        data[nome] = { vendas: 0, valor: 0, comissao: 0 };
      }
      data[nome].vendas++;
      data[nome].valor += v.valor_carta || 0;
      data[nome].comissao += v.comissao_total_prevista || 0;
    });
    return Object.entries(data)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.valor - a.valor);
  }, [vendasFiltradas]);

  // Comissões a pagar por vendedor
  const comissoesPorVendedor = React.useMemo(() => {
    const data = {};
    comissoes
      .filter(c => c.tipo === 'pagar' && c.status !== 'paga')
      .forEach(c => {
        const nome = c.usuario_nome || 'Sem nome';
        if (!data[nome]) {
          data[nome] = { total: 0, quantidade: 0, perfil: c.usuario_perfil };
        }
        data[nome].total += c.valor || 0;
        data[nome].quantidade++;
      });
    return Object.entries(data)
      .map(([nome, dados]) => ({ nome, ...dados }))
      .sort((a, b) => b.total - a.total);
  }, [comissoes]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle="Análise de vendas e comissões"
      />

      {/* Filtros */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Data Inicial</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
              />
            </div>
            <div>
              <Label>Data Final</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
              />
            </div>
            <div>
              <Label>Administradora</Label>
              <Select value={selectedAdmin} onValueChange={setSelectedAdmin}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {administradoras.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome_fantasia || a.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full gap-2">
                <Download className="w-4 h-4" />
                Exportar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-white border shadow-sm">
          <TabsTrigger value="vendedores" className="gap-2">
            <Users className="w-4 h-4" />
            Por Vendedor
          </TabsTrigger>
          <TabsTrigger value="administradoras" className="gap-2">
            <Building2 className="w-4 h-4" />
            Por Administradora
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-2">
            <TrendingUp className="w-4 h-4" />
            Comissões a Pagar
          </TabsTrigger>
        </TabsList>

        {/* Por Vendedor */}
        <TabsContent value="vendedores">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Vendas por Vendedor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={relatorioVendedores.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="nome" type="category" width={100} fontSize={12} />
                      <Tooltip />
                      <Bar dataKey="vendas" fill="#1e3a5f" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Detalhamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Vendas</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorioVendedores.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-right">{r.vendas}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.valor)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.comissao)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Por Administradora */}
        <TabsContent value="administradoras">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Distribuição por Administradora</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={relatorioAdmins}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="valor"
                        nameKey="nome"
                        label={({ nome, percent }) => `${nome}: ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {relatorioAdmins.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Detalhamento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Administradora</TableHead>
                        <TableHead className="text-right">Vendas</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Comissão</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {relatorioAdmins.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-right">{r.vendas}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.valor)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.comissao)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Comissões a Pagar */}
        <TabsContent value="comissoes">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Comissões Pendentes de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Total a Pagar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comissoesPorVendedor.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell className="capitalize">{r.perfil}</TableCell>
                      <TableCell className="text-right">{r.quantidade}</TableCell>
                      <TableCell className="text-right font-semibold text-amber-600">
                        {formatCurrency(r.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {comissoesPorVendedor.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                        Nenhuma comissão pendente
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {/* Total */}
              {comissoesPorVendedor.length > 0 && (
                <div className="mt-4 p-4 bg-slate-50 rounded-xl flex justify-between items-center">
                  <span className="font-semibold">Total a Pagar:</span>
                  <span className="text-2xl font-bold text-amber-600">
                    {formatCurrency(comissoesPorVendedor.reduce((acc, r) => acc + r.total, 0))}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}