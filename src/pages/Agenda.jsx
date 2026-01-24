import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, MapPin, Search, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function AgendaPage() {
  const [user, setUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [tipoFilter, setTipoFilter] = useState('todos');
  
  const [formData, setFormData] = useState({
    titulo: '',
    tipo: 'reuniao',
    inicio: '',
    fim: '',
    status: 'agendado',
    descricao: '',
    local: '',
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) {
        setUser(null);
        return;
      }

      if (me.role === 'super_admin') {
        setUser({
          ...me,
          auth_id: me.id,
          empresa_id: null,
          perfil: 'super_admin',
        });
        return;
      }

      const colabs = await base44.entities.Colaborador.filter(
        { user_id: me.id, status: 'ativo' },
        '-created_date'
      );

      if (!colabs || colabs.length === 0) {
        setUser({
          ...me,
          auth_id: me.id,
          empresa_id: null,
          perfil: 'vendedor',
        });
        return;
      }

      const colab = colabs[0];
      setUser({
        ...me,
        auth_id: me.id,
        empresa_id: colab.empresa_id || null,
        perfil: colab.perfil || 'vendedor',
        telegram_chat_id: colab.telegram_chat_id || null,
      });
    } catch (e) {
      console.error('Erro ao carregar usuário:', e);
      setUser(null);
    }
  };

  // Buscar compromissos
  const { data: compromissos = [], isLoading } = useQuery({
    queryKey: ['agenda', user?.empresa_id, user?.auth_id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        // Buscar compromissos da empresa ou do usuário
        let items = [];
        
        if (user.empresa_id) {
          // Buscar por empresa_id
          items = await base44.entities.Agenda.filter(
            { empresa_id: user.empresa_id },
            '-inicio'
          );
        } else if (user.auth_id) {
          // Buscar por usuario_id
          items = await base44.entities.Agenda.filter(
            { usuario_id: user.auth_id },
            '-inicio'
          );
        }
        
        return items;
      } catch (error) {
        console.error('Erro ao buscar compromissos:', error);
        return [];
      }
    },
    enabled: !!user,
  });

  // Criar compromisso
  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Agenda.create({
        ...data,
        empresa_id: user.empresa_id,
        usuario_id: user.auth_id,
        usuario_nome: user.full_name,
        telegram_chat_id: user.telegram_chat_id || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['agenda']);
      toast.success('Compromisso criado com sucesso!');
      handleCloseModal();
    },
    onError: (error) => {
      toast.error('Erro ao criar compromisso: ' + error.message);
    },
  });

  // Atualizar compromisso
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Agenda.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['agenda']);
      toast.success('Compromisso atualizado com sucesso!');
      handleCloseModal();
    },
    onError: (error) => {
      toast.error('Erro ao atualizar compromisso: ' + error.message);
    },
  });

  // Deletar compromisso
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Agenda.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['agenda']);
      toast.success('Compromisso excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir compromisso: ' + error.message);
    },
  });

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        titulo: item.titulo || '',
        tipo: item.tipo || 'reuniao',
        inicio: item.inicio ? format(parseISO(item.inicio), "yyyy-MM-dd'T'HH:mm") : '',
        fim: item.fim ? format(parseISO(item.fim), "yyyy-MM-dd'T'HH:mm") : '',
        status: item.status || 'agendado',
        descricao: item.descricao || '',
        local: item.local || '',
      });
    } else {
      setEditingItem(null);
      setFormData({
        titulo: '',
        tipo: 'reuniao',
        inicio: '',
        fim: '',
        status: 'agendado',
        descricao: '',
        local: '',
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setFormData({
      titulo: '',
      tipo: 'reuniao',
      inicio: '',
      fim: '',
      status: 'agendado',
      descricao: '',
      local: '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.titulo || !formData.inicio) {
      toast.error('Preencha os campos obrigatórios!');
      return;
    }

    const dataToSend = {
      ...formData,
      inicio: new Date(formData.inicio).toISOString(),
      fim: formData.fim ? new Date(formData.fim).toISOString() : null,
    };

    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: dataToSend });
    } else {
      createMutation.mutate(dataToSend);
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Tem certeza que deseja excluir este compromisso?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleConcluir = (item) => {
    updateMutation.mutate({
      id: item.id,
      data: { status: 'concluido' },
    });
  };

  const handleCancelar = (item) => {
    const motivo = prompt('Motivo do cancelamento (opcional):');
    updateMutation.mutate({
      id: item.id,
      data: {
        status: 'cancelado',
        cancelado_em: new Date().toISOString(),
        cancelado_motivo: motivo || '',
      },
    });
  };

  // Filtrar compromissos
  const filteredCompromissos = compromissos.filter((item) => {
    const matchSearch = item.titulo?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'todos' || item.status === statusFilter;
    const matchTipo = tipoFilter === 'todos' || item.tipo === tipoFilter;
    return matchSearch && matchStatus && matchTipo;
  });

  const getStatusBadge = (status) => {
    const variants = {
      agendado: 'default',
      confirmado: 'secondary',
      concluido: 'default',
      cancelado: 'destructive',
      remarcado: 'secondary',
    };

    const labels = {
      agendado: 'Agendado',
      confirmado: 'Confirmado',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      remarcado: 'Remarcado',
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getTipoBadge = (tipo) => {
    const labels = {
      reuniao: 'Reunião',
      tarefa: 'Tarefa',
    };
    return <Badge variant="outline">{labels[tipo] || tipo}</Badge>;
  };

  if (!user) {
    return <div className="p-6">Carregando...</div>;
  }



  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle="Gerencie seus compromissos e tarefas"
        actionLabel="Novo Compromisso"
        onAction={() => handleOpenModal()}
      />

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por título..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="agendado">Agendado</SelectItem>
                <SelectItem value="confirmado">Confirmado</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
                <SelectItem value="remarcado">Remarcado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipo</Label>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="reuniao">Reunião</SelectItem>
                <SelectItem value="tarefa">Tarefa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Lista de compromissos */}
      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : filteredCompromissos.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            Nenhum compromisso encontrado.
          </div>
        ) : (
          filteredCompromissos.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-semibold">{item.titulo}</h3>
                    {getTipoBadge(item.tipo)}
                    {getStatusBadge(item.status)}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {format(parseISO(item.inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>

                    {item.fim && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        até {format(parseISO(item.fim), "HH:mm")}
                      </div>
                    )}

                    {item.local && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {item.local}
                      </div>
                    )}
                  </div>

                  {item.descricao && (
                    <p className="text-sm text-slate-600">{item.descricao}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {item.status !== 'concluido' && item.status !== 'cancelado' && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleConcluir(item)}
                        title="Marcar como concluído"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleCancelar(item)}
                        title="Cancelar"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleOpenModal(item)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de criação/edição */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Editar Compromisso' : 'Novo Compromisso'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.titulo}
                onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                placeholder="Ex: Reunião com cliente"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select
                  value={formData.tipo}
                  onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reuniao">Reunião</SelectItem>
                    <SelectItem value="tarefa">Tarefa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendado">Agendado</SelectItem>
                    <SelectItem value="confirmado">Confirmado</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                    <SelectItem value="remarcado">Remarcado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data e Hora de Início *</Label>
                <Input
                  type="datetime-local"
                  value={formData.inicio}
                  onChange={(e) => setFormData({ ...formData, inicio: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label>Data e Hora de Término</Label>
                <Input
                  type="datetime-local"
                  value={formData.fim}
                  onChange={(e) => setFormData({ ...formData, fim: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Local</Label>
              <Input
                value={formData.local}
                onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                placeholder="Ex: Sala de reuniões, Escritório do cliente"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Detalhes do compromisso..."
                rows={4}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingItem ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}