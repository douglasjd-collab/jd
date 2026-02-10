import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Banknote, Wallet, ArrowRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function NovaVendaEmprestimo() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova Venda de Empréstimo"
        subtitle="Escolha o tipo de empréstimo que deseja cadastrar"
        backTo="VendasEmprestimos"
      />

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
        {/* Consignado */}
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-purple-200">
          <CardHeader className="pb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4">
              <Banknote className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Empréstimo Consignado</CardTitle>
            <CardDescription className="text-base">
              Cadastre uma nova proposta de empréstimo consignado com desconto em folha
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={createPageUrl('NovaVendaConsignado')}>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" size="lg">
                Criar Proposta Consignado
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Pessoal */}
        <Card className="hover:shadow-xl transition-all duration-300 border-2 hover:border-orange-200">
          <CardHeader className="pb-4">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center mb-4">
              <Wallet className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Empréstimo Pessoal</CardTitle>
            <CardDescription className="text-base">
              Cadastre uma nova proposta de empréstimo pessoal (Crefaz ou Débito em Conta)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={createPageUrl('NovaVendaEmprestimoPessoal')}>
              <Button className="w-full bg-orange-600 hover:bg-orange-700" size="lg">
                Criar Proposta Pessoal
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}