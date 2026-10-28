import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const INTERVALO_MS = 60 * 1000;

/**
 * Busca as pendências de atendimento (espera > 5 min e revisão de 1 hora).
 * O relógio é do servidor: recarregar a página não reinicia a contagem.
 */
export default function useAlertasAtendimento({ empresaId, ativo }) {
  const [dados, setDados] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const emAndamento = useRef(false);
  const [nomesAtuais, setNomesAtuais] = useState({});

  useEffect(() => {
    setNomesAtuais({});
    if (!ativo || !empresaId) return;
    const atualizarNomes = (evento) => {
      if (evento.detail?.empresaId === empresaId) setNomesAtuais(evento.detail.nomes || {});
    };
    window.addEventListener('atendimento:nomes-atualizados', atualizarNomes);
    return () => window.removeEventListener('atendimento:nomes-atualizados', atualizarNomes);
  }, [ativo, empresaId]);

  const buscar = useCallback(async () => {
    if (!empresaId || emAndamento.current) return;
    emAndamento.current = true;
    try {
      const { data } = await base44.functions.invoke('alertasAtendimento', { empresa_id: empresaId });
      if (data && !data.error) setDados(data);
    } catch (erro) {
      console.error('Falha ao carregar alertas de atendimento:', erro?.message);
    } finally {
      emAndamento.current = false;
      setAtualizando(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (!ativo || !empresaId) return;
    setAtualizando(true);
    buscar();

    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') buscar();
    }, INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') buscar();
    };
    document.addEventListener('visibilitychange', aoVoltar);

    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [ativo, empresaId, buscar]);

  // Sobrepor só a apresentação: nome novo não reinicia relógios nem adiamentos.
  const dadosAtuais = dados ? {
    ...dados,
    ...Object.fromEntries(['aguardando', 'recentes', 'revisao', 'adiados'].map(tipo => [
      tipo,
      (dados[tipo] || []).map(item => ({
        ...item,
        cliente_nome: nomesAtuais[item.conversa_id] || item.cliente_nome,
      })),
    ])),
  } : null;

  return { dados: dadosAtuais, atualizando, buscar };
}