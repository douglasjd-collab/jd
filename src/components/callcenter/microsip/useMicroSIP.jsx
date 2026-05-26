import { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Hook principal da integração MicroSIP.
 *
 * Fluxo SAÍDA:
 *   ligar(numero) → window.location.href = "microsip:<numero>" → MicroSIP discou
 *
 * Fluxo ENTRADA:
 *   MicroSIP não tem API push nativa para o browser, então usamos duas estratégias:
 *   1. BroadcastChannel: se MicroSIP estiver em outra aba com nosso helper page
 *   2. LocalStorage polling: gravamos o CallerID via um pequeno listener page (opcional)
 *   3. Fallback manual: botão "Identificar chamada" que o usuário clica ao receber
 *
 *   Na prática o usuário vai configurar o MicroSIP para abrir uma URL ao receber chamada:
 *   http://localhost:PORT/callcenter?incoming=CALLERID
 *   E o CRM detecta o parâmetro ?incoming= na URL.
 */
export default function useMicroSIP({ empresaId, usuario, sipConfig }) {
  const [chamadaAtiva, setChamadaAtiva] = useState(null); // { numero, direcao, status, inicio, historicoId, clienteNome, clienteId }
  const [chamadaEntrante, setChamadaEntrante] = useState(null); // { numero, clienteNome, clienteId }
  const [loading, setLoading] = useState(false);

  const timerRef = useRef(null);
  const duracaoRef = useRef(0);
  const [duracao, setDuracao] = useState(0);
  const channelRef = useRef(null);

  // ── Timer de duração ──────────────────────────────────────────────────────
  useEffect(() => {
    if (chamadaAtiva?.status === 'atendida') {
      duracaoRef.current = 0;
      timerRef.current = setInterval(() => {
        duracaoRef.current += 1;
        setDuracao(d => d + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
      setDuracao(0);
      duracaoRef.current = 0;
    }
    return () => clearInterval(timerRef.current);
  }, [chamadaAtiva?.status]);

  // ── Detectar eventos via URL (incoming / answer / hangup / outgoing) ──────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get('incoming');
    const answer   = params.get('answer');
    const hangup   = params.get('hangup');
    const outgoing = params.get('outgoing');

    // Limpa todos os params do MicroSIP da URL sem reload
    const cleanUrl = () => {
      const url = new URL(window.location.href);
      ['incoming','answer','hangup','outgoing'].forEach(k => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.toString());
    };

    if (incoming) {
      const numero = incoming.replace(/\D/g, '');
      if (numero) { cleanUrl(); _processarChamadaEntrante(numero); }
    } else if (answer) {
      // MicroSIP atendeu a chamada → marcar como atendida
      cleanUrl();
      setChamadaAtiva(prev => prev ? { ...prev, status: 'atendida' } : null);
    } else if (hangup) {
      // MicroSIP encerrou
      cleanUrl();
      _encerrarChamadaLocal();
    } else if (outgoing) {
      // Chamada sainte iniciada pelo MicroSIP (ex: discagem direta no app)
      const numero = outgoing.replace(/\D/g, '');
      if (numero) {
        cleanUrl();
        // Se já há chamada ativa com esse número, só atualiza; senão registra nova
        setChamadaAtiva(prev => {
          if (prev?.numero === numero) return { ...prev, status: 'chamando' };
          return { numero, direcao: 'saida', status: 'chamando', inicio: new Date().toISOString(), historicoId: null, clienteNome: null, clienteId: null };
        });
      }
    }
  }, []);

  // ── BroadcastChannel — detecta eventos de outras abas/helper ─────────────
  useEffect(() => {
    if (!window.BroadcastChannel) return;
    const ch = new BroadcastChannel('microsip_events');
    channelRef.current = ch;
    ch.onmessage = (e) => {
      const { type, numero } = e.data || {};
      if (type === 'incoming' && numero) _processarChamadaEntrante(numero.replace(/\D/g, ''));
      if (type === 'hangup') _encerrarChamadaLocal();
      if (type === 'answered') {
        setChamadaAtiva(prev => prev ? { ...prev, status: 'atendida' } : null);
      }
    };
    return () => ch.close();
  }, []);

  // ── LocalStorage polling (fallback) ──────────────────────────────────────
  useEffect(() => {
    const poll = setInterval(() => {
      const evt = localStorage.getItem('microsip_incoming');
      if (evt) {
        localStorage.removeItem('microsip_incoming');
        const numero = evt.replace(/\D/g, '');
        if (numero) _processarChamadaEntrante(numero);
      }
      const hangup = localStorage.getItem('microsip_hangup');
      if (hangup) {
        localStorage.removeItem('microsip_hangup');
        _encerrarChamadaLocal();
      }
    }, 800);
    return () => clearInterval(poll);
  }, []);

  // ── Buscar cliente pelo número ────────────────────────────────────────────
  const buscarCliente = useCallback(async (numero) => {
    if (!empresaId || !numero) return null;
    const numLimpo = numero.replace(/\D/g, '');
    // Tenta com 8 dígitos finais (compatibilidade)
    const sufixo = numLimpo.slice(-8);
    const clientes = await base44.entities.Cliente.filter({ empresa_id: empresaId });
    const encontrado = clientes.find(c => {
      const tel = (c.telefone || '').replace(/\D/g, '');
      const cel = (c.celular || '').replace(/\D/g, '');
      return tel.endsWith(sufixo) || cel.endsWith(sufixo);
    });
    return encontrado || null;
  }, [empresaId]);

  // ── Processar chamada entrante ────────────────────────────────────────────
  const _processarChamadaEntrante = useCallback(async (numero) => {
    if (!numero) return;
    setLoading(true);
    const cliente = await buscarCliente(numero);
    setLoading(false);
    setChamadaEntrante({
      numero,
      clienteNome: cliente?.nome || null,
      clienteId: cliente?.id || null,
    });
  }, [buscarCliente]);

  // ── Encerrar chamada (local, sem API) ─────────────────────────────────────
  const _encerrarChamadaLocal = useCallback(() => {
    setChamadaAtiva(prev => {
      if (prev) _salvarHistorico(prev, duracaoRef.current);
      return null;
    });
    setChamadaEntrante(null);
    clearInterval(timerRef.current);
  }, []);

  // ── Salvar histórico ──────────────────────────────────────────────────────
  const _salvarHistorico = async (chamada, duracaoSeg) => {
    if (!empresaId) return;
    const fim = new Date().toISOString();
    const data = {
      empresa_id: empresaId,
      usuario_id: usuario?.id || '',
      usuario_nome: usuario?.nome_perfil || usuario?.full_name || '',
      direcao: chamada.direcao,
      numero: chamada.numero,
      cliente_id: chamada.clienteId || '',
      cliente_nome: chamada.clienteNome || '',
      status: duracaoSeg > 0 ? 'atendida' : 'nao_atendida',
      inicio: chamada.inicio,
      fim,
      duracao_segundos: duracaoSeg,
    };
    if (chamada.historicoId) {
      await base44.entities.HistoricoChamadaMicroSIP.update(chamada.historicoId, data);
    } else {
      await base44.entities.HistoricoChamadaMicroSIP.create(data);
    }
  };

  // ── API pública ───────────────────────────────────────────────────────────

  const ligar = useCallback(async (numero, clienteNome = null, clienteId = null) => {
    const numLimpo = numero.replace(/\D/g, '');
    if (!numLimpo) return;

    const inicio = new Date().toISOString();
    // Salvar histórico "em_andamento" para ter o ID
    let historicoId = null;
    if (empresaId) {
      const reg = await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: empresaId,
        usuario_id: usuario?.id || '',
        usuario_nome: usuario?.nome_perfil || usuario?.full_name || '',
        direcao: 'saida',
        numero: numLimpo,
        cliente_id: clienteId || '',
        cliente_nome: clienteNome || '',
        status: 'em_andamento',
        inicio,
      });
      historicoId = reg?.id;
    }

    setChamadaAtiva({
      numero: numLimpo,
      direcao: 'saida',
      status: 'chamando',
      inicio,
      historicoId,
      clienteNome,
      clienteId,
    });

    // Dispara MicroSIP via SIP URI — usa window.open para não sair da página
    // O link microsip: é um custom protocol handler registrado pelo MicroSIP
    const a = document.createElement('a');
    a.href = `microsip:${numLimpo}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 500);
  }, [empresaId, usuario]);

  const atenderChamada = useCallback(async () => {
    if (!chamadaEntrante) return;
    const { numero, clienteNome, clienteId } = chamadaEntrante;
    const inicio = new Date().toISOString();

    let historicoId = null;
    if (empresaId) {
      const reg = await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: empresaId,
        usuario_id: usuario?.id || '',
        usuario_nome: usuario?.nome_perfil || usuario?.full_name || '',
        direcao: 'entrada',
        numero,
        cliente_id: clienteId || '',
        cliente_nome: clienteNome || '',
        status: 'em_andamento',
        inicio,
      });
      historicoId = reg?.id;
    }

    setChamadaEntrante(null);
    setChamadaAtiva({ numero, direcao: 'entrada', status: 'atendida', inicio, historicoId, clienteNome, clienteId });
  }, [chamadaEntrante, empresaId, usuario]);

  const ignorarChamada = useCallback(async () => {
    if (!chamadaEntrante) return;
    const { numero, clienteNome, clienteId } = chamadaEntrante;
    if (empresaId) {
      await base44.entities.HistoricoChamadaMicroSIP.create({
        empresa_id: empresaId,
        usuario_id: usuario?.id || '',
        usuario_nome: usuario?.nome_perfil || usuario?.full_name || '',
        direcao: 'entrada',
        numero,
        cliente_id: clienteId || '',
        cliente_nome: clienteNome || '',
        status: 'nao_atendida',
        inicio: new Date().toISOString(),
        fim: new Date().toISOString(),
        duracao_segundos: 0,
      });
    }
    setChamadaEntrante(null);
  }, [chamadaEntrante, empresaId]);

  const encerrarChamada = useCallback(async () => {
    if (!chamadaAtiva) return;
    const dur = duracaoRef.current;
    await _salvarHistorico(chamadaAtiva, dur);
    setChamadaAtiva(null);
    clearInterval(timerRef.current);
    setDuracao(0);
  }, [chamadaAtiva]);

  // Simular chamada entrante manual (para testes)
  const simularEntrada = useCallback((numero) => {
    _processarChamadaEntrante(numero || '81999999999');
  }, [_processarChamadaEntrante]);

  return {
    chamadaAtiva,
    chamadaEntrante,
    loading,
    duracao,
    ligar,
    atenderChamada,
    ignorarChamada,
    encerrarChamada,
    simularEntrada,
  };
}