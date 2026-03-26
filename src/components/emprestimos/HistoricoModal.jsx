import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, History, Send, User, CheckCircle2, Edit2, Star, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TIPO_ICON = {
  criacao: <Plus className="w-3.5 h-3.5 text-blue-500" />,
  status: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  alteracao: <Edit2 className="w-3.5 h-3.5 text-orange-500" />,
  responsavel: <Star className="w-3.5 h-3.5 text-purple-500" />,
  comentario: <User className="w-3.5 h-3.5 text-slate-500" />,
};

const TIPO_LABEL = {
  criacao: 'Criação',
  status: 'Mudança de Status',
  alteracao: 'Alteração',
  responsavel: 'Responsável',
  comentario: 'Comentário',
};

const TIPO_BG = {
  criacao: 'bg-blue-50 border-blue-100',
  status: 'bg-emerald-50 border-emerald-100',
  alteracao: 'bg-orange-50 border-orange-100',
  responsavel: 'bg-purple-50 border-purple-100',
  comentario: 'bg-slate-50 border-slate-100',
};

function formatDate(d) {
  if (!d) return '';
  try {
    return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch { return d; }
}

export default function HistoricoModal({ open, onOpenChange, proposta, empresaId }) {
  const [novoComentario, setNovoComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();

  const { data: historico = [], isLoading } = useQuery({
    queryKey: ['historico-proposta', proposta?.id],
    enabled: !!proposta?.id && open,
    queryFn: async () => {
      const [hist, coments] = await Promise.all([
        base44.entities.HistoricoProposta.filter({ proposta_id: proposta.id }, '-created_date', 200),
        base44.entities.ComentarioProposta.filter({ proposta_id: proposta.id }, '-created_date', 200),
      ]);

      // Montar linha de criação da proposta
      // Busca o nome do colaborador e empresa pelo email do created_by
      let criadorNome = 'Sistema';
      let criadorEmpresaNome = null;

      if (proposta.created_by && proposta.empresa_id) {
        try {
          const [colabs, empresas] = await Promise.all([
            base44.entities.Colaborador.filter({ empresa_id: proposta.empresa_id }, '-created_date', 500),
            base44.entities.Empresa.filter({ id: proposta.empresa_id }, '-created_date', 1),
          ]);
          const found = colabs.find(c =>
            (c.email && c.email.toLowerCase() === proposta.created_by.toLowerCase()) ||
            (c.user_id && c.user_id === proposta.created_by)
          );
          if (found) criadorNome = found.nome || proposta.created_by;
          else criadorNome = proposta.vendedor_nome || proposta.created_by;
          if (empresas?.[0]) criadorEmpresaNome = empresas[0].nome_fantasia || empresas[0].razao_social || null;
        } catch {
          criadorNome = proposta.vendedor_nome || proposta.created_by || 'Sistema';
        }
      } else if (proposta.vendedor_nome) {
        criadorNome = proposta.vendedor_nome;
      }

      const descricaoCriacao = criadorEmpresaNome
        ? `Proposta criada por ${criadorEmpresaNome}, ${criadorNome}`
        : `Proposta criada por ${criadorNome}`;

      const criacao = {
        id: `criacao_${proposta.id}`,
        tipo: 'criacao',
        descricao_evento: descricaoCriacao,
        usuario_nome: criadorEmpresaNome ? `${criadorEmpresaNome} (${criadorNome})` : criadorNome,
        created_date: proposta.created_date,
        _isCriacao: true,
      };

      const histMapped = hist.map(h => ({
        ...h,
        tipo: h.tipo || (h.status ? 'status' : 'alteracao'),
        descricao_evento: h.descricao_evento || (h.status ? `Status: ${h.status}` : 'Alteração'),
      }));

      const comentsMapped = coments.map(c => ({
        id: c.id,
        tipo: 'comentario',
        descricao_evento: c.texto,
        usuario_nome: c.usuario_nome,
        usuario_id: c.usuario_id,
        created_date: c.created_date,
      }));

      // Merge e ordena por data
      const todos = [...histMapped, ...comentsMapped, criacao].sort((a, b) => {
        const da = new Date(a.data_status || a.created_date || 0);
        const db = new Date(b.data_status || b.created_date || 0);
        return db - da;
      });

      return todos;
    },
  });

  const handleEnviar = async () => {
    if (!novoComentario.trim()) return;
    setEnviando(true);
    try {
      const me = await base44.auth.me();
      const colabs = await base44.entities.Colaborador.filter({ user_id: me.id, status: 'ativo' });
      const colab = colabs[0];

      await base44.entities.ComentarioProposta.create({
        proposta_id: proposta.id,
        empresa_id: colab?.empresa_id || proposta.empresa_id,
        usuario_id: me.id,
        usuario_nome: colab?.nome || me.full_name,
        texto: novoComentario.trim(),
      });

      setNovoComentario('');
      queryClient.invalidateQueries({ queryKey: ['historico-proposta', proposta.id] });
      toast.success('Comentário adicionado!');
    } catch (e) {
      toast.error('Erro ao salvar comentário');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Histórico
          </DialogTitle>
          {proposta && (
            <p className="text-sm text-slate-500 mt-1">{proposta.cliente_nome}</p>
          )}
        </DialogHeader>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[200px] max-h-[380px] pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : historico.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <History className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum histórico ainda</p>
            </div>
          ) : (
            historico.map((item) => {
              const tipo = item.tipo || 'comentario';
              const bg = TIPO_BG[tipo] || TIPO_BG.comentario;
              const icon = TIPO_ICON[tipo] || TIPO_ICON.comentario;
              const label = TIPO_LABEL[tipo] || 'Evento';
              const data = item.data_status || item.created_date;

              return (
                <div key={item.id} className={`rounded-xl p-3 border ${bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex-shrink-0">{icon}</span>
                    <span className="text-xs font-semibold text-slate-700">{label}</span>
                    {item.usuario_nome && (
                      <span className="text-xs text-slate-500">· {item.usuario_nome}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-auto">{formatDate(data)}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed pl-5">{item.descricao_evento}</p>
                </div>
              );
            })
          )}
        </div>

        {/* Adicionar comentário manual */}
        <div className="border-t pt-3 space-y-2 mt-2">
          <p className="text-xs text-slate-500 font-medium">Adicionar ao histórico</p>
          <Textarea
            placeholder="Escreva uma observação... (Ctrl+Enter para enviar)"
            value={novoComentario}
            onChange={(e) => setNovoComentario(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleEnviar(); }}
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleEnviar}
              disabled={!novoComentario.trim() || enviando}
              className="bg-[#23BE84] hover:bg-[#1da570] gap-2"
              size="sm"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}