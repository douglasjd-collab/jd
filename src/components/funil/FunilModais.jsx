import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, MessageCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import ClienteSearchModal from '@/components/forms/ClienteSearchModal';
import VendaForm from '@/components/forms/VendaForm';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const getInitials = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
};

export function ModalAlterarResponsavel({
  open, onOpenChange, oportunidade, vendedores, loadingVendedores,
  responsaveisSelecionados, setResponsaveisSelecionados,
  podeAlterarResponsavel, onConfirmar, isPending
}) {
  const [searchResponsavel, setSearchResponsavel] = React.useState('');

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSearchResponsavel(''); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adicionar Responsáveis</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-slate-600">Oportunidade</Label>
            <p className="font-semibold">{oportunidade?.titulo}</p>
          </div>
          <div>
            <Label className="text-sm mb-2 block">Responsáveis *</Label>
            <p className="text-xs text-slate-500 mb-2">O primeiro selecionado será o principal.</p>
            <div className="relative mb-2">
              <input
                type="text"
                value={searchResponsavel}
                onChange={(e) => setSearchResponsavel(e.target.value)}
                placeholder="Buscar vendedor..."
                className="w-full h-8 pl-8 pr-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" /></svg>
            </div>
            <div className="space-y-2 max-h-[260px] overflow-y-auto border rounded-lg p-2">
              {loadingVendedores ? (
                <p className="text-sm text-slate-500 p-2">Carregando...</p>
              ) : vendedores.length === 0 ? (
                <p className="text-sm text-slate-500 p-2">Nenhum vendedor disponível</p>
              ) : vendedores.filter(v => {
                  if (!['vendedor', 'gerente', 'admin', 'master', 'super_admin'].includes(v.perfil) || v.status !== 'ativo') return false;
                  if (!searchResponsavel.trim()) return true;
                  const name = (v.nome || v.razao_social || v.full_name || '').toLowerCase();
                  return name.includes(searchResponsavel.toLowerCase());
                }).map((v) => (
                <div
                  key={v.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                    responsaveisSelecionados.includes(v.id) ? 'bg-blue-100 border border-blue-300' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                  onClick={() => setResponsaveisSelecionados(prev =>
                    prev.includes(v.id) ? prev.filter(id => id !== v.id) : [...prev, v.id]
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={v.foto_perfil} alt={v.full_name} />
                    <AvatarFallback className="text-xs">{getInitials(v.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{v.nome || v.razao_social || v.full_name}</p>
                    <p className="text-xs text-slate-500 capitalize">{v.perfil}</p>
                  </div>
                  {responsaveisSelecionados.includes(v.id) && (
                    <div className="flex items-center gap-1">
                      {responsaveisSelecionados[0] === v.id && <Badge variant="outline" className="text-xs">Principal</Badge>}
                      <div className="h-5 w-5 bg-blue-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {responsaveisSelecionados.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-xs text-blue-700 mb-1">{responsaveisSelecionados.length} responsável(is) selecionado(s)</p>
              <p className="text-xs text-blue-600">Principal: {(() => { const v = vendedores.find(v => v.id === responsaveisSelecionados[0]); return v?.nome || v?.razao_social || v?.full_name || ''; })()}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={onConfirmar} disabled={isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">Confirmar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModalComentarios({
  open, onOpenChange, oportunidade, comentarios,
  novoComentario, setNovoComentario, tipoComentario, setTipoComentario,
  mostrarFormComentario, setMostrarFormComentario,
  onEnviar, isPending
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>💬 Conversas - {oportunidade?.titulo}</DialogTitle>
          <p className="text-sm text-slate-600">Cliente: {oportunidade?.cliente_nome || oportunidade?.telefone_lead || 'Sem cliente'}</p>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-y-auto pr-2">
          {comentarios.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma conversa registrada ainda</p>
            </div>
          ) : comentarios.map((c) => (
            <div key={c.id} className="bg-slate-50 p-3 rounded-lg">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(c.usuario_nome)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.usuario_nome}</p>
                    <p className="text-xs text-slate-500">{format(new Date(c.created_date), 'dd/MM/yyyy HH:mm')}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {c.tipo === 'comentario' && '💬 Comentário'}
                  {c.tipo === 'ligacao' && '📞 Ligação'}
                  {c.tipo === 'reuniao' && '🤝 Reunião'}
                  {c.tipo === 'email' && '📧 Email'}
                </Badge>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.mensagem}</p>
            </div>
          ))}
        </div>
        <div className="border-t pt-4">
          {!mostrarFormComentario ? (
            <div className="flex justify-between items-center">
              <Button variant="outline" onClick={() => { onOpenChange(false); setNovoComentario(''); setMostrarFormComentario(false); }}>Fechar</Button>
              <Button onClick={() => setMostrarFormComentario(true)} className="bg-[#23BE84] hover:bg-[#1da570] gap-2">
                <Plus className="w-4 h-4" /> Adicionar Comentário
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-sm mb-2 block">Tipo de Interação</Label>
                <Select value={tipoComentario} onValueChange={setTipoComentario}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comentario">💬 Comentário</SelectItem>
                    <SelectItem value="ligacao">📞 Ligação</SelectItem>
                    <SelectItem value="reuniao">🤝 Reunião</SelectItem>
                    <SelectItem value="email">📧 Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm mb-2 block">Mensagem *</Label>
                <Textarea value={novoComentario} onChange={(e) => setNovoComentario(e.target.value)} placeholder="Digite sua mensagem..." rows={3} className="resize-none" />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => { setMostrarFormComentario(false); setNovoComentario(''); setTipoComentario('comentario'); }}>Cancelar</Button>
                <Button onClick={onEnviar} disabled={isPending || !novoComentario.trim()} className="bg-[#23BE84] hover:bg-[#1da570]">
                  {isPending ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModalAlterarQuadro({
  open, onOpenChange, oportunidade, etapasOrdenadas, todosOsFunis,
  novaEtapaId, setNovaEtapaId, funilDestino, setFunilDestino,
  onConfirmar, isPending
}) {
  // Determinar o funil atual ou selecionado
  const funiAtualSelecionado = funilDestino && funilDestino !== 'todos' ? funilDestino : oportunidade?.produto || 'consorcio';
  
  // Filtrar etapas: se funil foi selecionado, mostra apenas etapas desse funil; senão mostra todas
  const etapasFiltradas = funilDestino && funilDestino !== 'todos'
    ? etapasOrdenadas.filter(e => e.produto === funilDestino)
    : etapasOrdenadas;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setFunilDestino(''); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Alterar Quadro / Etapa</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-sm text-slate-600">Oportunidade</Label>
            <p className="font-semibold">{oportunidade?.titulo}</p>
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1 block">Quadro Atual</Label>
            <p className="text-sm text-slate-700">{oportunidade?.etapa_nome}</p>
          </div>
          <div>
            <Label>Funil de Destino</Label>
            <Select value={funilDestino} onValueChange={(v) => { setFunilDestino(v); setNovaEtapaId(''); }}>
              <SelectTrigger><SelectValue placeholder="Selecione o funil" /></SelectTrigger>
              <SelectContent>
                {todosOsFunis.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nova Etapa *</Label>
            <Select value={novaEtapaId} onValueChange={setNovaEtapaId}>
              <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
              <SelectContent>
                {etapasFiltradas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: e.cor }} />
                      {e.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => { onOpenChange(false); setFunilDestino(''); }}>Cancelar</Button>
            <Button onClick={onConfirmar} disabled={isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">Confirmar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModalCriarFunil({ open, onOpenChange, novoFunil, setNovoFunil, onCriar, isPending }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Criar Novo Funil</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="nome_funil">Nome do Funil *</Label>
            <Input id="nome_funil" value={novoFunil.nome} onChange={(e) => setNovoFunil({ ...novoFunil, nome: e.target.value })} placeholder="Ex: Funil - Crédito Pessoal" />
          </div>
          <div>
            <Label htmlFor="cor_funil">Cor</Label>
            <div className="flex gap-2 items-center">
              <input id="cor_funil" type="color" value={novoFunil.cor} onChange={(e) => setNovoFunil({ ...novoFunil, cor: e.target.value })} className="h-10 w-20 rounded border border-slate-200 cursor-pointer" />
              <span className="text-sm text-slate-600">{novoFunil.cor}</span>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={onCriar} disabled={isPending} className="bg-[#1e3a5f] hover:bg-[#2a4a73]">Criar Funil</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModalVenda({ open, onOpenChange, oportunidade, currentUser, onSuccess }) {
  const queryClient = useQueryClient();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Registrar Venda - {oportunidade?.titulo}</span>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button>
          </DialogTitle>
        </DialogHeader>
        <VendaForm
          open={open}
          onOpenChange={onOpenChange}
          venda={null}
          oportunidade={oportunidade}
          currentUser={currentUser}
          onSubmit={async (data) => {
            const response = await base44.entities.Venda.create(data);
            await base44.entities.Oportunidade.update(oportunidade.id, {
              venda_id: response.id,
              empresa_id: oportunidade.empresa_id || currentUser?.empresa_id
            });
            toast.success('Venda registrada com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['oportunidades'] });
            onSuccess();
          }}
          isLoading={false}
        />
      </DialogContent>
    </Dialog>
  );
}