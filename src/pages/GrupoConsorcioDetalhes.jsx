import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/ui/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import AssembleiasGrupoTab from '@/components/grupos/AssembleiasGrupoTab';
import GrupoDashboardTab from '@/components/grupos/GrupoDashboardTab';
import { CATEGORIA_LABELS } from '@/components/utils/gruposConsorcioHelpers';

const initialForm = {
  administradora_id: '',
  categoria_bem: '',
  nome_grupo: '',
  numero_grupo: '',
  status: 'ativo',
  credito_minimo: '',
  credito_maximo: '',
  prazo_maximo: '',
  qtd_participantes: '',
  prioridade_comercial: 'media',
  observacoes: ''
};

export default function GrupoConsorcioDetalhes() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const [grupoId, setGrupoId] = useState(urlParams.get('id') || null);
  const [empresaId, setEmpresaId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadEmpresa = async () => {
      const user = await base44.auth.me();
      if (!user) return;
      const colabs = await base44.entities.Colaborador.filter({ user_id: user.id, status: 'ativo' }, '-created_date', 1);
      if (colabs?.length) setEmpresaId(colabs[0].empresa_id);
    };
    loadEmpresa();
  }, []);

  const { data: grupo, isLoading: loadingGrupo } = useQuery({
    queryKey: ['grupo-consorcio', grupoId],
    enabled: !!grupoId,
    queryFn: () => base44.entities.GrupoConsorcio.get(grupoId)
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras-ativas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Administradora.filter({ empresa_id: empresaId, status: 'ativa' })
  });

  useEffect(() => {
    if (grupo) {
      setForm({
        administradora_id: grupo.administradora_id || '',
        categoria_bem: grupo.categoria_bem || '',
        nome_grupo: grupo.nome_grupo || '',
        numero_grupo: grupo.numero_grupo || '',
        status: grupo.status || 'ativo',
        credito_minimo: grupo.credito_minimo ?? '',
        credito_maximo: grupo.credito_maximo ?? '',
        prazo_maximo: grupo.prazo_maximo ?? '',
        qtd_participantes: grupo.qtd_participantes ?? '',
        prioridade_comercial: grupo.prioridade_comercial || 'media',
        observacoes: grupo.observacoes || ''
      });
    }
  }, [grupo]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.administradora_id) throw new Error('Selecione a administradora');
      if (!form.categoria_bem) throw new Error('Selecione a categoria do bem');
      if (!form.numero_grupo) throw new Error('Informe o número do grupo');

      const administradora = administradoras.find(a => a.id === form.administradora_id);
      const payload = {
        empresa_id: empresaId,
        administradora_id: form.administradora_id,
        administradora_nome: administradora?.nome_fantasia || administradora?.razao_social || '',
        categoria_bem: form.categoria_bem,
        nome_grupo: form.nome_grupo || null,
        numero_grupo: form.numero_grupo,
        status: form.status,
        credito_minimo: form.credito_minimo === '' ? null : Number(form.credito_minimo),
        credito_maximo: form.credito_maximo === '' ? null : Number(form.credito_maximo),
        prazo_maximo: form.prazo_maximo === '' ? null : Number(form.prazo_maximo),
        qtd_participantes: form.qtd_participantes === '' ? null : Number(form.qtd_participantes),
        prioridade_comercial: form.prioridade_comercial,
        observacoes: form.observacoes || null
      };

      if (grupoId) {
        await base44.entities.GrupoConsorcio.update(grupoId, payload);
        return grupoId;
      } else {
        const novo = await base44.entities.GrupoConsorcio.create(payload);
        return novo.id;
      }
    },
    onSuccess: (id) => {
      toast.success('Grupo salvo com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['grupos-consorcio'] });
      if (!grupoId) {
        setGrupoId(id);
        navigate(createPageUrl('GrupoConsorcioDetalhes') + `?id=${id}`, { replace: true });
      } else {
        queryClient.invalidateQueries({ queryKey: ['grupo-consorcio', id] });
      }
    },
    onError: (error) => toast.error(error.message || 'Erro ao salvar grupo')
  });

  if (grupoId && loadingGrupo) {
    return <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={grupoId ? `Grupo ${form.numero_grupo || ''}` : 'Novo Grupo de Consórcio'}
        subtitle="Cadastro de grupo, histórico de assembleias e dashboard"
        backTo="GruposConsorcio"
      />

      <Tabs defaultValue="dados-gerais">
        <TabsList>
          <TabsTrigger value="dados-gerais">Dados Gerais</TabsTrigger>
          <TabsTrigger value="assembleias" disabled={!grupoId}>Assembleias</TabsTrigger>
          <TabsTrigger value="dashboard" disabled={!grupoId}>Dashboard</TabsTrigger>
        </TabsList>

        <TabsContent value="dados-gerais" className="mt-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 space-y-6">
              <div>
                <h3 className="font-semibold text-slate-800 mb-3">Dados Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Administradora *</Label>
                    <Select value={form.administradora_id} onValueChange={(v) => setForm({ ...form, administradora_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {administradoras.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.nome_fantasia || a.razao_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Categoria do Bem *</Label>
                    <Select value={form.categoria_bem} onValueChange={(v) => setForm({ ...form, categoria_bem: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORIA_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Nome do Grupo</Label>
                    <Input value={form.nome_grupo} onChange={(e) => setForm({ ...form, nome_grupo: e.target.value })} placeholder="Ex: Automóvel Médio" />
                  </div>
                  <div>
                    <Label>Número do Grupo *</Label>
                    <Input value={form.numero_grupo} onChange={(e) => setForm({ ...form, numero_grupo: e.target.value })} placeholder="Ex: 8110" />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ativo">Ativo</SelectItem>
                        <SelectItem value="inativo">Inativo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="font-semibold text-slate-800 mb-3">Informações Comerciais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Crédito Mínimo</Label>
                    <Input type="number" value={form.credito_minimo} onChange={(e) => setForm({ ...form, credito_minimo: e.target.value })} placeholder="25000" />
                  </div>
                  <div>
                    <Label>Crédito Máximo</Label>
                    <Input type="number" value={form.credito_maximo} onChange={(e) => setForm({ ...form, credito_maximo: e.target.value })} placeholder="50000" />
                  </div>
                  <div>
                    <Label>Prazo Máximo (meses)</Label>
                    <Input type="number" value={form.prazo_maximo} onChange={(e) => setForm({ ...form, prazo_maximo: e.target.value })} placeholder="106" />
                  </div>
                  <div>
                    <Label>Quantidade de Participantes</Label>
                    <Input type="number" value={form.qtd_participantes} onChange={(e) => setForm({ ...form, qtd_participantes: e.target.value })} placeholder="1000" />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Prioridade Comercial</Label>
                    <Select value={form.prioridade_comercial} onValueChange={(v) => setForm({ ...form, prioridade_comercial: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">⭐⭐⭐ Alta</SelectItem>
                        <SelectItem value="media">⭐⭐ Média</SelectItem>
                        <SelectItem value="baixa">⭐ Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-400 mt-1">Usada apenas para ordenar os grupos no simulador.</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas" rows={3} />
              </div>

              <div className="flex justify-end">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2 bg-[#23BE84] hover:bg-[#1da570]">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Grupo
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assembleias" className="mt-4">
          {grupoId && <AssembleiasGrupoTab grupoId={grupoId} empresaId={empresaId} />}
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4">
          {grupo && <GrupoDashboardTab grupo={grupo} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}