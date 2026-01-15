import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
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
  const [clienteFormOpen, setClienteFormOpen] = useState(false);

  // Buscar todos os clientes ativos
  const { data: todosClientes = [], isLoading: buscando } = useQuery({
    queryKey: ['clientes-busca-modal'],
    queryFn: () => base44.entities.Cliente.filter({ status: 'ativo' }),
    enabled: open,
  });

  // Filtrar clientes em tempo real
  const resultados = busca.trim() ? todosClientes.filter(c => {
    const cpfLimpo = busca.replace(/\D/g, '');
    const buscaLower = busca.toLowerCase().trim();
    
    const cpfMatch = cpfLimpo && c.cpf?.replace(/\D/g, '').includes(cpfLimpo);
    const nomeMatch = c.nome?.toLowerCase().includes(buscaLower);
    const apelidoMatch = c.apelido?.toLowerCase().includes(buscaLower);
    
    return cpfMatch || nomeMatch || apelidoMatch;
  }) : [];

  // Limpar busca ao abrir
  useEffect(() => {
    if (open) {
      setBusca('');
    }
  }, [open]);

  const handleSelecionarCliente = (cliente) => {
    onSelectCliente(cliente);
    onOpenChange(false);
    setBusca('');
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
            <div>
              <Label htmlFor="busca">CPF ou Nome do Cliente</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="busca"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite para buscar (CPF, nome ou apelido)..."
                  className="pl-10"
                  autoFocus
                />
                {buscando && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Os resultados aparecem conforme você digita
              </p>
            </div>

            {/* Resultados da Busca */}
            {busca.trim() && resultados.length > 0 && (
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
                      className="p-4 border-b last:border-b-0 hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => handleSelecionarCliente(cliente)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-900 truncate">
                            {cliente.nome}
                            {cliente.apelido && (
                              <span className="text-sm text-slate-500 ml-2">({cliente.apelido})</span>
                            )}
                          </h4>
                          <div className="text-sm text-slate-600 mt-1 space-y-0.5">
                            <p className="font-mono">CPF: {cliente.cpf}</p>
                            {cliente.telefone && <p>📞 {cliente.telefone}</p>}
                            {cliente.email && <p className="truncate">✉️ {cliente.email}</p>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="bg-[#23BE84] hover:bg-[#1da570] shrink-0"
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
            {busca.trim() && !buscando && resultados.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed rounded-lg bg-slate-50">
                <div className="mb-4">
                  <UserPlus className="w-12 h-12 mx-auto text-slate-400" />
                </div>
                <p className="text-slate-600 mb-2 font-medium">
                  Nenhum cliente encontrado
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  Busca: "{busca}"
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
            {!busca.trim() && !buscando && (
              <div className="text-center py-8 border-2 border-dashed rounded-lg bg-slate-50">
                <div className="mb-4">
                  <Search className="w-12 h-12 mx-auto text-slate-400" />
                </div>
                <p className="text-slate-600 mb-2 font-medium">
                  Digite para buscar clientes
                </p>
                <p className="text-sm text-slate-500 mb-4">
                  ou cadastre um novo cliente
                </p>
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