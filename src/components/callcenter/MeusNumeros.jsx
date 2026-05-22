import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Phone, Hash, Users } from 'lucide-react';

const statusColor = {
  'Online': 'bg-green-100 text-green-700',
  'Offline': 'bg-slate-100 text-slate-500',
  'Pending': 'bg-yellow-100 text-yellow-700',
};

export default function MeusNumeros() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await base44.functions.invoke('nvoipCallCenter', { action: 'listarUsuarios' });
      if (res.data?.error) {
        setErro(res.data.error);
      } else {
        setUsers(res.data?.users || []);
      }
    } catch (e) {
      setErro(e.message || 'Erro ao carregar ramais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Ramais SIP cadastrados na sua conta NVOIP</p>
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
          <Users className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Erro ao carregar ramais</p>
          <p className="text-xs mt-1 text-slate-400">{erro}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={carregar}>Tentar novamente</Button>
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Hash className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p>Nenhum ramal encontrado</p>
        </div>
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
                    <Badge className={statusColor[u.status] || 'bg-slate-100 text-slate-500'}>
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
  );
}