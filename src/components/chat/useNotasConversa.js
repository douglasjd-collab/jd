import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

export default function useNotasConversa(conversa, user, empresaId) {
  const queryClient = useQueryClient();
  const key = ['notas-conversa', empresaId, conversa?.id, user?.id];
  const query = useQuery({
    queryKey: key,
    enabled: !!conversa?.id && !!user?.id && !!empresaId,
    queryFn: async () => {
      // Conferir o acesso atual à conversa antes de consultar as notas.
      await base44.entities.ConversaWhatsapp.get(conversa.id);
      return base44.entities.NotaConversa.filter({
        empresa_id: empresaId, conversa_id: conversa.id,
        $or: [{ visibilidade: 'interna' }, { created_by: user.email }]
      }, 'created_date', 1000);
    },
    staleTime: 15000
  });
  useEffect(() => {
    if (!conversa?.id || !user?.id) return;
    return base44.entities.NotaConversa.subscribe(event => {
      if (event.data?.conversa_id === conversa.id) {
        queryClient.invalidateQueries({queryKey: ['notas-conversa', empresaId, conversa.id, user.id]});
      }
    });
  }, [conversa?.id, empresaId, user?.id, queryClient]);
  const refresh = () => queryClient.invalidateQueries({queryKey: key});
  const salvar = async (texto, visibilidade, nota) => {
    const conteudo = texto.trim();
    if (!conteudo || conteudo.length > 10000) throw new Error('Escreva uma nota de até 10.000 caracteres.');
    const atual = await base44.entities.ConversaWhatsapp.get(conversa.id);
    if (nota) {
      await base44.entities.NotaConversa.update(nota.id, {
        texto: conteudo, visibilidade, editada_em: new Date().toISOString()
      });
    } else {
      await base44.entities.NotaConversa.create({
        empresa_id: atual.empresa_id, conversa_id: atual.id, texto: conteudo, visibilidade,
        autor_nome: user.nome_perfil || user.full_name || user.email,
        tipo_conexao: atual.tipo_conexao || 'empresa',
        colaborador_conversa_id: atual.colaborador_id || ''
      });
    }
    await refresh();
  };
  const excluir = async (nota) => {
    await base44.entities.NotaConversa.delete(nota.id);
    await refresh();
  };
  const notas = (query.data || []).filter(n => n.visibilidade === 'interna' || n.created_by === user?.email);
  return {notas, salvar, excluir, loading: query.isLoading, error: query.error};
}
