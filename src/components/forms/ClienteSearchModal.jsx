import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Search, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import ClienteForm from './ClienteForm';

export default function ClienteSearchModal({ open, onOpenChange, onSelectCliente, currentUser }) {
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [clienteFormOpen, setClienteFormOpen] = useState(false);

  const handleBuscar = async () => {
    if (!busca.trim()) {
      toast.error('Digite um CPF ou nome para buscar');
      return;
    }

    setBuscando(true);
    try {
      // Buscar clientes
      const allClientes = await base44.entities.Cliente.filter({ status: 'ativo' });
      
      // Filtrar por CPF ou nome
      const cpfLimpo = busca.replace(/\D/g, '');
      const buscaLower = busca.toLowerCase();
      
      const clientesFiltrados = allClientes.filter(c => {
        const cpfMatch = cpfLimpo && c.cpf?.replace(/\D/g, '').includes(cpfLimpo);
        const nomeMatch = c.nome?.toLowerCase().includes(buscaLower);
        return cpfMatch || nomeMatch;
      });

      setResultados(clientesFiltrados);

      if (clientesFiltrados.length === 0) {
        toast.info('Nenhum cliente encontrado');
      }
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      toast.error('Erro ao buscar clientes');
    } finally {
      setBuscando(false);
    }
  };

  const handleSelecionarCliente = (cliente) => {
    onSelectCliente(cliente);
    onOpenChange(false);
    setBusca('');
    setResultados([]);
  };

  const handleNovoCliente = () => {
    setClienteFormOpen(true);
  };

  const handleClienteCriado = (novoCliente) => {
    toast.success('Cliente cadastrado com sucesso!');
    setClienteFormOpen(false);
    handleSelecionarCliente(novoCliente);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Buscar Cliente</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Campo de Busca */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="busca">CPF ou Nome do Cliente</Label>
                <Input
                  id="busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBuscar();
                    }
                  }}
                  placeholder="Digite CPF ou nome..."
                  className="mt-1"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  onClick={handleBuscar}
                  disabled={buscando}
                  className="bg-[#23BE84] hover:bg-[#1da570]"
                >
                  {buscando ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Resultados da Busca */}
            {resultados.length > 0 && (
              <div className="border rounded-lg">
                <div className="bg-slate-50 p-3 border-b">
                  <h4 className="font-semibold text-sm">
                    {resultados.length} cliente(s) encontrado(s)
                  </h4>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {resultados.map((cliente) => (
                    <div
                      key={cliente.id}
                      className="p-4 border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => handleSelecionarCliente(cliente)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-900">{cliente.nome}</h4>
                          <div className="text-sm text-slate-600 mt-1 space-y-1">
                            <p>CPF: {cliente.cpf}</p>
                            {cliente.telefone && <p>Telefone: {cliente.telefone}</p>}
                            {cliente.email && <p>Email: {cliente.email}</p>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelecionarCliente(cliente);
                          }}
                        >
                          Selecionar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sem resultados - Botão Cadastrar */}
            {busca && !buscando && resultados.length === 0 && (
              <div className="text-center py-8 border rounded-lg bg-slate-50">
                <div className="mb-4">
                  <UserPlus className="w-12 h-12 mx-auto text-slate-400" />
                </div>
                <p className="text-slate-600 mb-4">
                  Nenhum cliente encontrado com "{busca}"
                </p>
                <Button
                  onClick={handleNovoCliente}
                  className="bg-[#23BE84] hover:bg-[#1da570]"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Cadastrar Novo Cliente
                </Button>
              </div>
            )}

            {/* Botão Cadastrar Sempre Visível */}
            {!busca && (
              <div className="text-center py-4">
                <Button
                  onClick={handleNovoCliente}
                  variant="outline"
                  className="w-full"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Cadastrar Novo Cliente
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Cadastro de Cliente */}
      <ClienteForm
        open={clienteFormOpen}
        onOpenChange={setClienteFormOpen}
        cliente={null}
        onSubmit={async (data) => {
          try {
            const novoCliente = await base44.entities.Cliente.create({
              ...data,
              empresa_id: currentUser?.empresa_id,
              status: 'ativo'
            });
            handleClienteCriado(novoCliente);
          } catch (error) {
            console.error('Erro ao cadastrar cliente:', error);
            toast.error('Erro ao cadastrar cliente');
            throw error;
          }
        }}
        isLoading={false}
      />
    </>
  );
}