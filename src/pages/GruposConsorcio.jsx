import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Search } from 'lucide-react';
import { CATEGORIA_LABELS, CATEGORIA_ICONS, PRIORIDADE_STARS, formatCurrency } from '@/components/utils/gruposConsorcioHelpers';

export default function GruposConsorcio() {
  const navigate = useNavigate();
  const [empresaId, setEmpresaId] = useState(null);
  const [search, setSearch] = useState('');
  const [filtroAdministradora, setFiltroAdministradora] = useState('todas');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');

  useEffect(() => {
    const loadEmpresa = async () => {
      const user = await base44.auth.me();
      if (!user) return;
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }, '-created_date', 1);
      const colab = colabs?.[0];
      let empId = colab?.empresa_id || null;
      if (!empId && ['master', 'super_admin'].includes(colab?.perfil)) {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
        if (empresas?.length) empId = empresas[0].id;
      }
      setEmpresaId(empId);
    };
    loadEmpresa();
  }, []);

  const { data: grupos = [], isLoading } = useQuery({
    queryKey: ['grupos-consorcio', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.GrupoConsorcio.filter({ empresa_id: empresaId }, '-created_date')
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras-ativas'],
    queryFn: () => base44.entities.Administradora.list('-created_date')
  });

  const gruposFiltrados = grupos.filter(g => {
    if (search && !g.numero_grupo?.toLowerCase().includes(search.toLowerCase()) && !g.nome_grupo?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filtroAdministradora !== 'todas' && g.administradora_id !== filtroAdministradora) return false;
    if (filtroCategoria !== 'todas' && g.categoria_bem !== filtroCategoria) return false;
    if (filtroStatus !== 'todos' && g.status !== filtroStatus) return false;
    return true;
  });

  const columns = [
    {
      header: 'Grupo',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="text-xl">{CATEGORIA_ICONS[row.categoria_bem] || '📦'}</span>
          <div>
            <p className="font-medium text-slate-900">{row.numero_grupo}</p>
            <p className="text-xs text-slate-500">{row.nome_grupo || CATEGORIA_LABELS[row.categoria_bem]}</p>
          </div>
        </div>
      )
    },
    { header: 'Administradora', cell: (row) => row.administradora_nome || '-' },
    { header: 'Categoria', cell: (row) => CATEGORIA_LABELS[row.categoria_bem] || row.categoria_bem },
    {
      header: 'Faixa de Crédito',
      cell: (row) => `${formatCurrency(row.credito_minimo)} até ${formatCurrency(row.credito_maximo)}`
    },
    { header: 'Participantes', cell: (row) => row.qtd_participantes ?? '-' },
    { header: 'Prioridade', cell: (row) => PRIORIDADE_STARS[row.prioridade_comercial] || '-' },
    { header: 'Status', cell: (row) => <StatusBadge status={row.status} /> }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos de Consórcio"
        subtitle={`${grupos.length} grupos cadastrados`}
        actionLabel="Novo Grupo"
        onAction={() => navigate(createPageUrl('GrupoConsorcioDetalhes'))}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Buscar por número ou nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={filtroAdministradora} onValueChange={setFiltroAdministradora}>
          <SelectTrigger><SelectValue placeholder="Administradora" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as Administradoras</SelectItem>
            {administradoras.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.nome_fantasia || a.razao_social}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as Categorias</SelectItem>
            {Object.entries(CATEGORIA_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Status</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={gruposFiltrados}
        isLoading={isLoading}
        emptyMessage="Nenhum grupo cadastrado"
        onRowClick={(row) => navigate(createPageUrl('GrupoConsorcioDetalhes') + `?id=${row.id}`)}
      />
    </div>
  );
}