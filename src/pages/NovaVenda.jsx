import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Banknote, CreditCard, Wallet, ArrowRight } from 'lucide-react';

export default function NovaVenda() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    const me = await base44.auth.me();
    setUser(me);
  };

  const produtos = [
    {
      id: 'CONSORCIO',
      nome: 'Consórcio',
      descricao: 'Gestão completa de vendas de consórcio',
      icon: FileText,
      color: 'from-blue-500 to-blue-600',
      page: 'Vendas'
    },
    {
      id: 'FINANCIAMENTO',
      nome: 'Financiamento',
      descricao: 'Veículos, motos, caminhões e imóveis',
      icon: CreditCard,
      color: 'from-emerald-500 to-emerald-600',
      page: 'NovaVendaFinanciamento'
    },
    {
      id: 'EMPRESTIMO_CONSIGNADO',
      nome: 'Empréstimo Consignado',
      descricao: 'Novo, refinanciamento e portabilidade',
      icon: Banknote,
      color: 'from-purple-500 to-purple-600',
      page: 'VendasEmprestimos'
    },
    {
      id: 'EMPRESTIMO_PESSOAL',
      nome: 'Empréstimo Pessoal',
      descricao: 'Crefaz e débito em conta',
      icon: Wallet,
      color: 'from-orange-500 to-orange-600',
      page: 'NovaVendaEmprestimoPessoal'
    }
  ];

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova Venda"
        subtitle="Selecione o tipo de produto para iniciar uma nova venda"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {produtos.map((produto) => {
          const Icon = produto.icon;
          return (
            <Card 
              key={produto.id}
              className="cursor-pointer hover:shadow-xl transition-all duration-300 border-2 hover:border-[#23BE84] group"
              onClick={() => navigate(`/${produto.page}`)}
            >
              <CardHeader>
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${produto.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-xl">{produto.nome}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 text-sm mb-4">{produto.descricao}</p>
                <Button className="w-full bg-[#23BE84] hover:bg-[#1da770] group-hover:gap-3 transition-all">
                  Iniciar
                  <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}