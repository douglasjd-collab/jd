import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

export default function ClienteSearchModal({ open, onOpenChange, onSelectCliente, currentUser, empresaIdSelecionada }) {
  const [busca, setBusca] = useState('');
  const [clienteFormOpen, setClienteFormOpen] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);
  const queryClient = useQueryClient();
  
  const empresaId = empresaIdSelecionada || currentUser?.empresa_id;
  const isMaster = currentUser?.perfil === 'master' || currentUser?.perfil === 'super_admin';

  // Buscar todos os clientes ativos
  const { data: todosClientes = [], isLoading: buscando } = useQuery({
    queryKey: ['clientes-busca-modal', empresaId],
    enabled: open && (!!empresaId || isMaster),
    queryFn: async () => {
      // Se master/super_admin e não selecionou empresa ainda, não busca.
      if (isMaster && !empresaId) return [];
      return await base44.entities.Cliente.filter({ status: 'ativo', empresa_id: empresaId });
    },
  });

  // Filtrar clientes em tempo real
  const resultados = busca.trim() ? todosClientes.filter(c => {
    const cpfLimpo = busca.replace(/\D/g, '');
    const cnpjLimpo = busca.replace(/\D/g, '');
    const buscaLower = busca.toLowerCase().trim();
    
    const cpfMatch = cpfLimpo && c.cpf?.replace(/\D/g, '').includes(cpfLimpo);
    const cnpjMatch = cnpjLimpo && c.pj_cnpj?.replace(/\D/g, '').includes(cnpjLimpo);
    const nomeCompletoMatch = c.nome_completo?.toLowerCase().includes(buscaLower);
    const razaoSocialMatch = c.pj_razao_social?.toLowerCase().includes(buscaLower);
    const nomeFantasiaMatch = c.pj_nome_fantasia?.toLowerCase().includes(buscaLower);
    
    return cpfMatch || cnpjMatch || nomeCompletoMatch || razaoSocialMatch || nomeFantasiaMatch;
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
    if (isMaster && !empresaId) {
      toast.error('Selecione uma empresa na Nova Venda antes de cadastrar cliente.');
      return;
    }
    setClienteFormOpen(true);
  };

  const handleClienteCriado = (novoCliente) => {
    if (!novoCliente) return;
    
    console.log('✅ Cliente criado com sucesso:', novoCliente);
    toast.success('Cliente cadastrado com sucesso!');
    
    // Fechar o form de cadastro
    setClienteFormOpen(false);
    
    // Selecionar cliente PRIMEIRO (dispara no VendaForm)
    onSelectCliente(novoCliente);
    
    // Limpar busca e estado local
    setBusca('');
    
    // O VendaForm vai fechar o modal automaticamente
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header roxo */}
          <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-5 rounded-t-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Buscar Cliente</h2>
                <p className="text-purple-200 text-xs">Pesquise por CPF, nome ou apelido</p>
              </div>
            </div>

            {/* Campo de busca dentro do header */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Digite o CPF, nome ou apelido do cliente..."
                autoFocus
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white text-slate-800 placeholder-slate-400 text-sm outline-none shadow-sm focus:ring-2 focus:ring-purple-300"
              />
              {buscando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-purple-400" />
              )}
            </div>
          </div>

          {/* Corpo */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">

            {/* Resultados */}
            {busca.trim() && resultados.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">
                  {resultados.length} cliente(s) encontrado(s)
                </p>
                <div className="space-y-2 max-h-[380px] overflow-y-auto">
                  {resultados.map((cliente) => (
                    <div
                      key={cliente.id}
                      onClick={() => handleSelecionarCliente(cliente)}
                      className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 cursor-pointer transition-all shadow-sm"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                          <span className="text-purple-700 font-bold text-sm">
                            {(cliente.nome_completo || cliente.pj_razao_social || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {cliente.nome_completo || cliente.pj_razao_social || 'Cliente sem nome'}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {cliente.tipo_pessoa === 'Física' ? 'CPF' : 'CNPJ'}: {cliente.cpf || cliente.pj_cnpj || '-'}
                            {(cliente.celular || cliente.pj_celular) && ` · 📞 ${cliente.celular || cliente.pj_celular}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleSelecionarCliente(cliente); }}
                      >
                        Selecionar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sem resultados */}
            {busca.trim() && !buscando && resultados.length === 0 && (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-3">
                  <UserPlus className="w-8 h-8 text-slate-400" />
                </div>
                <p className="font-semibold text-slate-700 mb-1">Nenhum cliente encontrado</p>
                <p className="text-sm text-slate-400 mb-4">"{busca}" não corresponde a nenhum cadastro</p>
                <Button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleNovoCliente(); }}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Cadastrar Novo Cliente
                </Button>
              </div>
            )}

            {/* Estado inicial */}
            {!busca.trim() && !buscando && (
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center mb-3">
                  <Search className="w-8 h-8 text-purple-400" />
                </div>
                <p className="font-semibold text-slate-700 mb-1">Digite para buscar clientes</p>
                <p className="text-sm text-slate-400 mb-6">ou cadastre um novo cliente abaixo</p>
                <Button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleNovoCliente(); }}
                  className="bg-purple-600 hover:bg-purple-700 w-full max-w-xs"
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
          setSalvandoCliente(true);
          try {
            if (!empresaId) {
              toast.error('Selecione uma empresa antes de cadastrar o cliente.');
              setSalvandoCliente(false);
              return null;
            }
            
            const dadosCliente = {
              ...data,
              empresa_id: empresaId,
              status: 'ativo'
            };
            
            const novoCliente = await base44.entities.Cliente.create(dadosCliente);
            
            // ✅ atualiza caches para aparecer imediatamente
            await queryClient.invalidateQueries({ queryKey: ['clientes-busca-modal', empresaId] });
            await queryClient.invalidateQueries({ queryKey: ['clientes-venda-form', empresaId] });
            
            handleClienteCriado(novoCliente);
            return novoCliente;
          } catch (error) {
            console.error('❌ Erro ao cadastrar cliente:', error);
            toast.error('Erro ao cadastrar cliente: ' + (error?.message || 'Erro desconhecido'));
            return null;
          } finally {
            setSalvandoCliente(false);
          }
        }}
        isLoading={salvandoCliente}
      />
    </>
  );
}