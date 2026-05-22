import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Phone, Hash, Users } from 'lucide-react';

const statusSipColor = {
  'Online': 'bg-green-100 text-green-700',
  'Offline': 'bg-slate-100 text-slate-500',
  'Pending': 'bg-yellow-100 text-yellow-700',
};

export default function MeusNumeros() {
  const [numbers, setNumbers] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const [resNumbers, resUsers] = await Promise.all([
        base44.functions.invoke('nvoipCallCenter', { action: 'listarNumeros' }),
        base44.functions.invoke('nvoipCallCenter', { action: 'listarUsuarios' }),
      ]);
      if (resNumbers.data?.error) {
        setErro(resNumbers.data.error);
      } else {
        setNumbers(resNumbers.data?.numbers || []);
        setUsers(resUsers.data?.users || []);
      }
    } catch (e) {
      setErro(e.message || 'Erro ao carregar números');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Números virtuais e ramais SIP da sua conta NVOIP</p>
        <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : erro ? (
        <div className="text-center py-12 text-red-400">
          <Phone className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Erro ao carregar</p>
          <p className="text-xs mt-1 text-slate-400">{erro}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={carregar}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          {/* Números Virtuais (DIDs) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#23BE84]" />
              Números Virtuais (DID)
            </h3>
            {numbers.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nenhum número virtual encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 px-4 font-medium">Número</th>
                      <th className="text-left py-3 px-4 font-medium">País</th>
                      <th className="text-left py-3 px-4 font-medium">Cidade</th>
                      <th className="text-left py-3 px-4 font-medium">Estado</th>
                      <th className="text-left py-3 px-4 font-medium">Custo (F/M)</th>
                      <th className="text-left py-3 px-4 font-medium">Ligações Simult.</th>
                      <th className="text-left py-3 px-4 font-medium">Destino</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numbers.map((n, i) => (
                      <tr key={i} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-semibold text-slate-800">{n.number}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{n.country || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{n.city || '—'}</td>
                        <td className="py-3 px-4 text-slate-600">{n.state || '—'}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {n.activationFee != null ? `R$${n.activationFee}` : '—'}/
                          {n.monthlyPayment != null ? `R$${n.monthlyPayment}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{n.simultaneousCalls ?? '—'}</td>
                        <td className="py-3 px-4 text-slate-500 text-xs">{n.destination || '—'}</td>
                        <td className="py-3 px-4">
                          {n.status
                            ? <Badge className="bg-green-100 text-green-700">Ativado</Badge>
                            : <Badge className="bg-red-100 text-red-700">Inativo</Badge>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Ramais SIP */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              Ramais SIP (NumberSIP)
            </h3>
            {users.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Nenhum ramal encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-slate-500 text-xs uppercase">
                      <th className="text-left py-3 px-4 font-medium">Ramal (NumberSIP)</th>
                      <th className="text-left py-3 px-4 font-medium">Nome</th>
                      <th className="text-left py-3 px-4 font-medium">Email</th>
                      <th className="text-left py-3 px-4 font-medium">WebPhone</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => (
                      <tr key={i} className="border-b hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-[#23BE84]" />
                            <span className="font-mono font-semibold text-slate-800">{u.numbersip}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">{u.name || '—'}</td>
                        <td className="py-3 px-4 text-slate-500">{u.email || '—'}</td>
                        <td className="py-3 px-4">
                          {u.webphone
                            ? <Badge className="bg-blue-100 text-blue-700">Ativo</Badge>
                            : <Badge variant="outline">Inativo</Badge>
                          }
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={statusSipColor[u.status] || 'bg-slate-100 text-slate-500'}>
                            {u.status || 'Desconhecido'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}