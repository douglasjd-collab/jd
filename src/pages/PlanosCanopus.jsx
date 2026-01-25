import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  Package
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

export default function PlanosCanopusPage() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;

      let empresaId = me.empresa_id;
      if (!empresaId) {
        const colabs = await base44.entities.Colaborador.filter(
          { user_id: me.id, status: 'ativo' },
          '-created_date',
          1
        );
        if (colabs?.length) empresaId = colabs[0].empresa_id;
      }

      setUser({
        ...me,
        empresa_id: empresaId,
        perfil: me.perfil || me.role || 'vendedor'
      });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
    }
  };

  const { data: planos = [], isLoading } = useQuery({
    queryKey: ['planos-canopus', user?.empresa_id],
    queryFn: async () => {
      if (!user?.empresa_id) return [];
      const res = await base44.entities.PlanoCanopus.filter(
        { empresa_id: user.empresa_id },
        '-ultima_sincronizacao',
        1000
      );
      return Array.isArray(res) ? res : (res?.items ?? []);
    },
    enabled: !!user?.empresa_id
  });

  // Verificação de permissão
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!['admin', 'super_admin', 'master'].includes(user.perfil)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <XCircle className="w-16 h-16 text-red-500" />
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900">Acesso Negado</h2>
          <p className="text-slate-600 mt-2">Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  const filteredPlanos = planos.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.nome_bem?.toLowerCase().includes(s) ||
      p.plano?.toLowerCase().includes(s) ||
      p.tipo_venda?.toLowerCase().includes(s)
    );
  });

  const produtoLabel = (id) => {
    const map = { '101': 'Automóveis', '102': 'Imóveis', '103': 'Motos' };
    return map[id] || id;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos Canopus"
        subtitle="Planos sincronizados do sistema Canopus"
        backTo="Configuracoes"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total de Planos</p>
              <p className="text-2xl font-bold text-slate-900">{planos.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Ativos</p>
              <p className="text-2xl font-bold text-slate-900">
                {planos.filter(p => p.status === 'ativo').length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-xl">
              <Package className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Produtos</p>
              <p className="text-2xl font-bold text-slate-900">
                {new Set(planos.map(p => p.produto_id)).size}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Buscar por nome do bem, plano ou tipo de venda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Lista de Planos */}
      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : filteredPlanos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Database className="w-12 h-12 text-slate-300" />
            <p className="text-slate-500">
              {search ? 'Nenhum plano encontrado' : 'Nenhum plano sincronizado ainda'}
            </p>
            {!search && (
              <p className="text-sm text-slate-400">
                Acesse Configurações → Sincronização Canopus
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {filteredPlanos.map((plano) => (
              <div key={plano.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900 truncate">
                        {plano.nome_bem}
                      </h3>
                      <Badge variant={plano.status === 'ativo' ? 'default' : 'secondary'}>
                        {plano.status}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-slate-500">Produto</p>
                        <p className="font-medium text-slate-700">
                          {produtoLabel(plano.produto_id)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Valor do Bem</p>
                        <p className="font-medium text-slate-700">
                          {plano.valor_bem?.toLocaleString('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL' 
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Parcela</p>
                        <p className="font-medium text-slate-700">
                          {plano.parcela?.toLocaleString('pt-BR', { 
                            style: 'currency', 
                            currency: 'BRL' 
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500">Prazo</p>
                        <p className="font-medium text-slate-700">
                          {plano.prazo_meses} meses
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      {plano.plano && (
                        <span>Plano: <strong>{plano.plano}</strong></span>
                      )}
                      {plano.tipo_venda && (
                        <span>Tipo: <strong>{plano.tipo_venda}</strong></span>
                      )}
                      {plano.permite_reserva && (
                        <span>
                          Reserva: <strong>{plano.permite_reserva === 'S' ? 'Sim' : 'Não'}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}