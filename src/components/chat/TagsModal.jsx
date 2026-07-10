import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

const DEFAULT_TAGS = [
  { nome: 'Cliente', cor: '#3B82F6' },
  { nome: 'Lead', cor: '#8B5CF6' },
  { nome: 'Quente', cor: '#EF4444' },
  { nome: 'Frio', cor: '#6B7280' },
  { nome: 'Aguardando retorno', cor: '#F59E0B' },
  { nome: 'Fechado', cor: '#10B981' },
  { nome: 'Cobrança', cor: '#DC2626' },
  { nome: 'Pós-venda', cor: '#0EA5E9' },
];

export default function TagsModal({ open, onOpenChange, contato, empresaId, onTagsChange }) {
  const queryClient = useQueryClient();
  const [tags, setTags] = useState([]);
  const [contatoTags, setContatoTags] = useState([]);
  const [novaTagNome, setNovaTagNome] = useState('');
  const [novaTagCor, setNovaTagCor] = useState('#3B82F6');
  const [criandoTag, setCriandoTag] = useState(false);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!open || !empresaId || !contato?.cliente_telefone) return;
    carregarTags();
  }, [open, empresaId, contato?.cliente_telefone]);

  const carregarTags = async () => {
    setCarregando(true);
    try {
      // Buscar todas as tags da empresa
      const todasTags = await base44.entities.ContatoTag.filter(
        { empresa_id: empresaId },
        '-created_date',
        200
      );
      setTags(todasTags || []);

      // Buscar tags do contato pelo telefone (não pelo ID da conversa)
      if (contato?.cliente_telefone) {
        const telefoneLimpo = contato.cliente_telefone.replace(/\D/g, '');
        const contatosExistentes = await base44.entities.ContatoWhatsapp.filter({
          empresa_id: empresaId,
          telefone: telefoneLimpo
        });
        
        if (contatosExistentes?.length > 0) {
          const tagIds = contatosExistentes[0].tags_ids || [];
          setContatoTags(Array.isArray(tagIds) ? tagIds : []);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar tags:', e);
      toast.error('Erro ao carregar tags');
    } finally {
      setCarregando(false);
    }
  };

  const criarNovaTag = async () => {
    if (!novaTagNome.trim()) {
      toast.error('Nome da tag é obrigatório');
      return;
    }

    // Verificar se já existe tag com este nome
    if (tags.some(t => t.nome?.toLowerCase() === novaTagNome.toLowerCase())) {
      toast.error('Tag com este nome já existe');
      return;
    }

    setCriandoTag(true);
    try {
      const novaTag = await base44.entities.ContatoTag.create({
        empresa_id: empresaId,
        nome: novaTagNome,
        cor: novaTagCor,
      });
      setTags(prev => [...prev, novaTag]);
      setNovaTagNome('');
      setNovaTagCor('#3B82F6');
      queryClient.invalidateQueries({ queryKey: ['tags-crm', empresaId] });
      toast.success('Tag criada com sucesso!');
    } catch (e) {
      toast.error('Erro ao criar tag');
    } finally {
      setCriandoTag(false);
    }
  };

  const adicionarTagAoContato = async (tagId) => {
    if (!contato?.cliente_telefone || !empresaId) {
      toast.error('Contato ou empresa não encontrados');
      return;
    }

    try {
      // Buscar ou criar contato no CRM
      let contatoCRM = null;
      const telefoneLimpo = contato.cliente_telefone.replace(/\D/g, '');

      // Sempre buscar contato existente por telefone
      const contatosExistentes = await base44.entities.ContatoWhatsapp.filter({
        empresa_id: empresaId,
        telefone: telefoneLimpo
      });
      
      if (contatosExistentes?.length > 0) {
        contatoCRM = contatosExistentes[0];
      } else {
        // Criar novo contato se não existir
        contatoCRM = await base44.entities.ContatoWhatsapp.create({
          empresa_id: empresaId,
          telefone: telefoneLimpo,
          nome: contato.cliente_nome || 'Sem nome'
        });
      }

      // Validar que temos um ID válido
      if (!contatoCRM?.id) {
        toast.error('Erro: contato inválido');
        return;
      }

      // Recarregar tags atuais do contato no banco (em caso de desincronização)
      const contatosAtualizados = await base44.entities.ContatoWhatsapp.filter({ id: contatoCRM.id });
      const tagsAtuais = contatosAtualizados?.[0]?.tags_ids || [];
      
      // Atualizar as tags do contato
      if (tagsAtuais.includes(tagId)) {
        const novasTags = tagsAtuais.filter(id => id !== tagId);
        setContatoTags(novasTags);
        await base44.entities.ContatoWhatsapp.update(contatoCRM.id, {
          tags_ids: novasTags,
        });
        onTagsChange?.(novasTags);
        toast.success('Tag removida');
      } else {
        const novasTags = [...tagsAtuais, tagId];
        setContatoTags(novasTags);
        await base44.entities.ContatoWhatsapp.update(contatoCRM.id, {
          tags_ids: novasTags,
        });
        onTagsChange?.(novasTags);
        toast.success('Tag adicionada');
      }
    } catch (e) {
      console.error('Erro ao atualizar tag:', e);
      toast.error('Erro ao atualizar tag: ' + e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags do Contato</DialogTitle>
        </DialogHeader>

        {carregando ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Criar nova tag */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Criar nova tag</Label>
              <div className="flex gap-2">
                <Input
                  value={novaTagNome}
                  onChange={e => setNovaTagNome(e.target.value)}
                  placeholder="Nome da tag"
                  className="text-sm"
                  onKeyDown={e => e.key === 'Enter' && criarNovaTag()}
                />
                <input
                  type="color"
                  value={novaTagCor}
                  onChange={e => setNovaTagCor(e.target.value)}
                  className="w-10 h-9 rounded cursor-pointer border border-slate-200"
                  title="Cor da tag"
                />
              </div>
              <Button
                size="sm"
                onClick={criarNovaTag}
                disabled={criandoTag}
                className="w-full gap-1.5"
                variant="outline"
              >
                {criandoTag ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Criar Tag
                  </>
                )}
              </Button>
            </div>

            {/* Lista de tags */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Tags disponíveis</Label>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {tags.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2">
                    Nenhuma tag criada ainda
                  </p>
                ) : (
                  tags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => adicionarTagAoContato(tag.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all text-sm ${
                        contatoTags.includes(tag.id)
                          ? 'border-slate-400 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center"
                        style={{
                          backgroundColor: contatoTags.includes(tag.id)
                            ? tag.cor
                            : 'transparent',
                        }}
                      >
                        {contatoTags.includes(tag.id) && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1"
                        style={{ backgroundColor: tag.cor }}
                      />
                      <span className="flex-1 text-left">{tag.nome}</span>
                      {contatoTags.includes(tag.id) && (
                        <span className="text-slate-400">✓</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}