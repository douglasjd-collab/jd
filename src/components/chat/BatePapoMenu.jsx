import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  ImageIcon,
  RefreshCw,
  Users,
  MessageCircle,
  Lock,
  Trash2,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function BatePapoMenu({
  empresaId,
  sincronizando,
  setSincronizando,
  setGerenciamentoTagsOpen,
  setGruposBloqueadosOpen,
  limparHistoricoCompleto,
  limpandoTudo,
  refetchConversas,
  sincronizarTodosContatosEvolution,
  sincronizarHistoricoTodasConversas,
}) {
  const handleSincronizarFotosAgressivo = async () => {
    setSincronizando(true);
    try {
      console.log('🔥 Sincronizando TODAS as fotos agressivamente...');
      const resp = await base44.functions.invoke('sincronizarFotosContatosAgressivoFinal', {
        empresa_id: empresaId,
      });
      const data = resp?.data;
      if (data?.success) {
        toast.success(`✅ ${data.atualizados}/${data.totalConversas || data.totalContatos} fotos sincronizadas`);
        await new Promise(r => setTimeout(r, 1000));
        refetchConversas();
      } else {
        const erro = data?.error || data?.mensagem || 'Erro desconhecido';
        console.error('Erro na sincronização:', erro);
        toast.error('Erro: ' + erro);
      }
    } catch (e) {
      console.error('Erro ao invocar função:', e);
      const mensagem = e?.response?.data?.error || e?.message || 'Erro ao sincronizar';
      toast.error('❌ ' + mensagem);
    } finally {
      setSincronizando(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => setGerenciamentoTagsOpen(true)}>
          <Tag className="mr-2 h-4 w-4" />
          Gerenciar Tags
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={handleSincronizarFotosAgressivo}
          disabled={sincronizando}
          title="Sincroniza TODAS as fotos de contatos com a API"
        >
          <ImageIcon className="mr-2 h-4 w-4" />
          {sincronizando ? 'Sincronizando...' : 'Sincronizar fotos'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={sincronizarTodosContatosEvolution} disabled={sincronizando}>
          <Users className="mr-2 h-4 w-4" />
          Importar contatos
        </DropdownMenuItem>
        <DropdownMenuItem onClick={sincronizarHistoricoTodasConversas} disabled={sincronizando}>
          <MessageCircle className="mr-2 h-4 w-4" />
          Sincronizar histórico
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setGruposBloqueadosOpen(true)}>
          <Lock className="mr-2 h-4 w-4" />
          Grupos Bloqueados
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={limparHistoricoCompleto} 
          disabled={limpandoTudo} 
          className="text-red-600"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Limpar histórico
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}