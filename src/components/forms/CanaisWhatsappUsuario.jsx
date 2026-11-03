import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { nivelEfetivo, montarPlano, rotuloNivel } from './canaisWhatsappHelper';

// Canais de WhatsApp liberados para o usuário. Grava direto na permissão por
// colaborador e conexão (mesma base usada pelo Bate-papo), permitindo liberar
// um ou vários canais e bloquear os demais.
export default function CanaisWhatsappUsuario({ colaboradorId, empresaId, podeEditar = true, onSelecaoChange }) {
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [conexoes, setConexoes] = useState([]);
  const [mapa, setMapa] = useState({});
  const [responsaveis, setResponsaveis] = useState({});
  const [erro, setErro] = useState('');

  const irrestrito = Object.keys(mapa).length === 0;

  const publicarSelecao = useCallback((lista, mapaAtual) => {
    if (!onSelecaoChange) return;
    const livre = Object.keys(mapaAtual).length === 0;
    onSelecaoChange({
      conexoes: lista.map((c) => c.id),
      selecionados: lista.filter((c) => nivelEfetivo(mapaAtual, c.id, livre) !== 'sem_acesso').map((c) => c.id),
    });
  }, [onSelecaoChange]);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    try {
      const { data } = await base44.functions.invoke('permissoesWhatsapp', { modo: 'matriz', empresa_id: empresaId });
      if (data?.error) throw new Error(data.error);
      const lista = data?.conexoes || [];
      const proximoMapa = {};
      const proximosResponsaveis = {};
      (data?.permissoes || [])
        .filter((p) => p.colaborador_id === colaboradorId)
        .forEach((p) => {
          proximoMapa[p.connection_id] = p.nivel_acesso;
          proximosResponsaveis[p.connection_id] = p.responsavel_padrao === true;
        });
      setConexoes(lista);
      setMapa(proximoMapa);
      setResponsaveis(proximosResponsaveis);
      publicarSelecao(lista, proximoMapa);
    } catch (e) {
      setErro(e?.response?.data?.error || e.message || 'Não foi possível carregar os canais de WhatsApp.');
    } finally {
      setCarregando(false);
    }
  }, [empresaId, colaboradorId, publicarSelecao]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alternar = async (conexao, ativo) => {
    if (!podeEditar || salvando || carregando) return;
    const { desejado, plano } = montarPlano({ conexoes, mapa, alvoId: conexao.id, ativo });
    setMapa(desejado);
    publicarSelecao(conexoes, desejado);
    // Novo usuário: a seleção é aplicada quando o convite for concluído.
    if (!colaboradorId) return;

    setSalvando(true);
    try {
      for (const item of plano) {
        const { data } = await base44.functions.invoke('permissoesWhatsapp', {
          modo: 'salvar',
          empresa_id: empresaId,
          colaborador_id: colaboradorId,
          connection_id: item.connection_id,
          nivel_acesso: item.nivel_acesso,
          responsavel_padrao: item.nivel_acesso === 'sem_acesso' ? false : responsaveis[item.connection_id] === true,
        });
        if (data?.error) throw new Error(data.error);
      }
      toast.success('Canais de WhatsApp atualizados');
    } catch (e) {
      toast.error(e?.response?.data?.error || e.message || 'Não foi possível salvar os canais');
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <p className="flex items-center gap-2 py-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando canais...
      </p>
    );
  }

  if (erro) {
    return <p className="py-2 text-xs text-red-600">{erro}</p>;
  }

  if (!empresaId) {
    return <p className="py-2 text-xs text-slate-500">Selecione a empresa para ver os canais disponíveis.</p>;
  }

  if (conexoes.length === 0) {
    return <p className="py-2 text-xs text-slate-500">Nenhum canal de WhatsApp cadastrado nesta empresa.</p>;
  }

  return (
    <div className="space-y-2">
      {irrestrito && (
        <p className="text-[11px] text-amber-700">
          Sem restrição: hoje este usuário acessa todos os canais. Desmarque um canal para bloqueá-lo.
        </p>
      )}
      <div className="space-y-1.5">
        {conexoes.map((conexao) => {
          const nivel = nivelEfetivo(mapa, conexao.id, irrestrito);
          const liberado = nivel !== 'sem_acesso';
          return (
            <label
              key={conexao.id}
              htmlFor={`canal-${conexao.id}`}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors ${
                liberado ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'
              } ${podeEditar && !salvando ? 'cursor-pointer' : 'cursor-not-allowed opacity-90'}`}
            >
              <Checkbox
                id={`canal-${conexao.id}`}
                checked={liberado}
                disabled={!podeEditar || salvando}
                onCheckedChange={(v) => alternar(conexao, v === true)}
              />
              <Smartphone className={`h-3.5 w-3.5 shrink-0 ${liberado ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-800">
                  {conexao.nome || conexao.session_id || 'Canal WhatsApp'}
                </span>
                <span className="block truncate text-[11px] text-slate-500">
                  {conexao.phone_number || conexao.session_id || ''}
                </span>
              </span>
              <Badge
                className={`shrink-0 text-[10px] ${
                  liberado ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {rotuloNivel(nivel)}
              </Badge>
            </label>
          );
        })}
      </div>
      {!colaboradorId && (
        <p className="text-[11px] text-slate-500">
          A seleção será aplicada automaticamente quando o convite for concluído.
        </p>
      )}
    </div>
  );
}