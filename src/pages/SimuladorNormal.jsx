import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select.jsx';
import { Switch } from '@/components/ui/switch';
import { Calculator, Plus, Download, Loader2, TrendingUp, X, Copy, ShoppingBag, History } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';
import SelecionarPlanoCanopusModal from '@/components/simulador/SelecionarPlanoCanopusModal';
import LancesDoGrupoPanel from '@/components/simulador/LancesDoGrupoPanel';
import RelogioContemplacao from '@/components/simulador/RelogioContemplacao';
import { calcularRelogioContemplacao } from '@/components/utils/calcularRelogioContemplacao';
import AnaliseContemplacao from '@/components/simulador/AnaliseContemplacao';
import CadastroMenorLanceModal from '@/components/simulador/CadastroMenorLanceModal';
import GruposDisponiveisPanel from '@/components/simulador/GruposDisponiveisPanel';

export default function SimuladorNormal() {
  const [currentUser, setCurrentUser] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [clienteNome, setClienteNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoGrupo, setTipoGrupo] = useState('automovel');
  const [grupo, setGrupo] = useState('');
  const [administradoraId, setAdministradoraId] = useState('');
  const [cartas, setCartas] = useState([{ credito: '', parcela: '', prazo: '', parcelaReduzida: '', planoDecrescente: false, parcelaMeio: '', ultimaParcela: '', nomePlano: '' }]);
  const [aplicarRegraCanopus, setAplicarRegraCanopus] = useState(false);
  const [parcelasCarencia, setParcelasCarencia] = useState(3);
  const [parcelaAtoContratacao, setParcelaAtoContratacao] = useState(1);
  const [usarLanceProprio, setUsarLanceProprio] = useState(false);
  const [lanceProprio, setLanceProprio] = useState('');
  const [modoReducao, setModoReducao] = useState('parcela'); // 'parcela' | '5050'
  const [usarLanceEmbutido, setUsarLanceEmbutido] = useState(false);
  const [lanceEmbutidoPercentual, setLanceEmbutidoPercentual] = useState('30');
  const [lanceEmbutidoJaIncluso, setLanceEmbutidoJaIncluso] = useState(false);
  const [usarParcelaReduzida, setUsarParcelaReduzida] = useState(false); // false = parcela normal, true = parcela reduzida
  const [resultado, setResultado] = useState(null);
  const [planoModalOpen, setPlanoModalOpen] = useState(false);
  const [cartaIndex, setCartaIndex] = useState(null);
  const [historicoLances, setHistoricoLances] = useState(null);
  const [planoSelecionadoInfo, setPlanoSelecionadoInfo] = useState('');
  const [modalidadeLance, setModalidadeLance] = useState('limitado'); // 'livre' | 'limitado'
  const [analiseContemplacao, setAnaliseContemplacao] = useState(null);
  const [cadastroLanceOpen, setCadastroLanceOpen] = useState(false);

  useEffect(() => {
    loadUser();
    carregarPlanoSelecionado();

    // Restaurar nome e telefone da última simulação
    const ultimoNome = localStorage.getItem('simulacao_ultima_nome');
    const ultimoTelefone = localStorage.getItem('simulacao_ultimo_telefone');
    if (ultimoNome) setClienteNome(ultimoNome);
    if (ultimoTelefone) setTelefone(ultimoTelefone);
  }, []);

  const carregarPlanoSelecionado = async () => {
    const dadosPlano = localStorage.getItem('planoSelecionado');
    if (dadosPlano) {
      try {
        const plano = JSON.parse(dadosPlano);
        
        // Verificar se o plano NÃO é de 50% nem 70%
        const nomeBem = plano.nome_bem?.toUpperCase() || '';
        const is50ou70 = nomeBem.includes('50%') || nomeBem.includes('70%');
        
        let parcelaReduzida = '';
        
        // Se não for 50% nem 70%, buscar o equivalente de 50%
        if (!is50ou70 && plano.valor_credito && plano.prazo) {
          try {
            const user = await base44.auth.me();
            if (user) {
              const colabs = await base44.entities.Colaborador.filter(
                { user_id: user.id, status: 'ativo' },
                '-created_date',
                1
              );
              
              if (colabs?.[0]?.empresa_id) {
                // Buscar plano de 50% com mesmo valor e prazo
                const planos50 = await base44.entities.PlanoCanopus.filter({
                  empresa_id: colabs[0].empresa_id,
                  valor_bem: plano.valor_credito,
                  prazo_meses: plano.prazo,
                  status: 'ativo'
                });
                
                // Encontrar o plano que contém "50%" no nome
                const plano50 = planos50.find(p => 
                  p.nome_bem?.toUpperCase().includes('50%')
                );
                
                if (plano50?.parcela) {
                  parcelaReduzida = plano50.parcela.toString();
                  toast.success('Parcela reduzida (50%) preenchida automaticamente!');
                }
              }
            }
          } catch (e) {
            console.error('Erro ao buscar plano 50%:', e);
          }
        }
        
        const nomePlanoCarregado = plano.nome_bem || '';
        // Verificar também o campo "plano" (ex: "21 - PLANO EXCLUSIVO 70%") para detectar embutido
        const textoCompleto = (nomePlanoCarregado + ' ' + (plano.plano || '')).toUpperCase();
        if (textoCompleto.includes('50%')) {
          setUsarLanceEmbutido(true);
          setLanceEmbutidoPercentual('50');
          setLanceEmbutidoJaIncluso(true);
        } else if (textoCompleto.includes('70%')) {
          setUsarLanceEmbutido(true);
          setLanceEmbutidoPercentual('30');
          setLanceEmbutidoJaIncluso(true);
        }
        setPlanoSelecionadoInfo(nomePlanoCarregado);
        setCartas([{
          credito: plano.valor_credito?.toString() || '',
          parcela: plano.parcela?.toString() || '',
          prazo: plano.prazo?.toString() || '',
          parcelaReduzida: parcelaReduzida,
          nomePlano: nomePlanoCarregado,
          planoDecrescente: false,
          parcelaMeio: '',
          ultimaParcela: ''
        }]);
        
        localStorage.removeItem('planoSelecionado');
      } catch (e) {
        console.error('Erro ao carregar plano selecionado:', e);
      }
    }
  };

  const loadUser = async () => {
    const user = await base44.auth.me();
    setCurrentUser(user);
    
    // Buscar empresa_id do colaborador
    if (user) {
      const colabs = await base44.entities.Colaborador.filter(
        { user_id: user.id, status: 'ativo' },
        '-created_date',
        1
      );
      const colab = colabs?.[0];
      let empId = colab?.empresa_id || null;
      if (!empId && ['master', 'super_admin'].includes(colab?.perfil)) {
        const empresas = await base44.entities.Empresa.filter({ status: 'ativa' }, '-created_date', 1);
        if (empresas?.length) empId = empresas[0].id;
      }
      setEmpresaId(empId);
    }
  };

  const { data: etapas = [] } = useQuery({
    queryKey: ['etapas-funil'],
    queryFn: () => base44.entities.EtapaFunil.filter({ status: 'ativa' }, 'ordem')
  });

  const { data: administradoras = [] } = useQuery({
    queryKey: ['administradoras-ativas', empresaId],
    enabled: !!empresaId,
    queryFn: () => base44.entities.Administradora.filter({ empresa_id: empresaId, status: 'ativa' })
  });

  // Estados para o Relógio de Contemplação
  const [menorLanceLimitado, setMenorLanceLimitado] = useState(null);
  const [maiorLanceLimitado, setMaiorLanceLimitado] = useState(null);
  const [menorLanceLivre, setMenorLanceLivre] = useState(null);
  const [maiorLanceLivre, setMaiorLanceLivre] = useState(null);
  const [relogioContemplacao, setRelogioContemplacao] = useState(null);

  // Seleciona menor/maior lance conforme modalidade
  const menorLanceHistorico = modalidadeLance === 'livre' ? menorLanceLivre : menorLanceLimitado;
  const maiorLanceHistorico = modalidadeLance === 'livre' ? maiorLanceLivre : maiorLanceLimitado;

  const adicionarCarta = () => {
    setCartas([...cartas, { credito: '', parcela: '', prazo: '', parcelaReduzida: '', planoDecrescente: false, parcelaMeio: '', ultimaParcela: '', nomePlano: '' }]);
  };

  const duplicarCarta = (index) => {
    const cartaOriginal = cartas[index];
    setCartas([...cartas, { ...cartaOriginal }]);
    toast.success('Carta duplicada!');
  };

  const removerCarta = (index) => {
    if (cartas.length === 1) {
      toast.error('Deve haver pelo menos uma carta');
      return;
    }
    setCartas(cartas.filter((_, i) => i !== index));
  };

  const atualizarCarta = (index, field, value) => {
    const novasCartas = [...cartas];
    novasCartas[index][field] = value;
    setCartas(novasCartas);

    // Quando o nome do plano é alterado manualmente, verificar se tem 50%/70%
    if (field === 'nomePlano') {
      const upper = (value || '').toUpperCase();
      if (upper.includes('50%')) {
        setUsarLanceEmbutido(true);
        setLanceEmbutidoPercentual('50');
        setLanceEmbutidoJaIncluso(true);
      } else if (upper.includes('70%')) {
        setUsarLanceEmbutido(true);
        setLanceEmbutidoPercentual('30');
        setLanceEmbutidoJaIncluso(true);
      }
    }
  };

  const creditoTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.credito) || 0), 0);
  const parcelaTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.parcela) || 0), 0);
  const parcelaReduzidaTotal = cartas.reduce((acc, carta) => acc + (parseFloat(carta.parcelaReduzida) || 0), 0);
  const prazoOriginal = cartas.find(c => c.prazo)?.prazo || '';
  
  // Define qual parcela usar no ato: conforme escolha do usuário (ou normal se não houver reduzida)
  const primeiraParcelaNoAto = (parcelaReduzidaTotal > 0 && usarParcelaReduzida) ? parcelaReduzidaTotal : parcelaTotal;
  
  // Calcular percentual do lance próprio em cima do crédito - USAR useMemo para evitar loop
  const lanceProprioPercentual = React.useMemo(() => {
    return lanceProprio && creditoTotal > 0 
      ? ((parseFloat(lanceProprio) / creditoTotal) * 100).toFixed(2) 
      : '0';
  }, [lanceProprio, creditoTotal]);

  // Percentual total exibido: no Lance Livre soma embutido + próprio
  const percentualExibido = React.useMemo(() => {
    if (modalidadeLance === 'livre' && usarLanceEmbutido && lanceEmbutidoPercentual && lanceProprio && creditoTotal > 0) {
      const pctProprio = (parseFloat(lanceProprio) / creditoTotal) * 100;
      const pctEmbutido = parseFloat(lanceEmbutidoPercentual) || 0;
      return (pctProprio + pctEmbutido).toFixed(2);
    }
    return lanceProprioPercentual;
  }, [modalidadeLance, usarLanceEmbutido, lanceEmbutidoPercentual, lanceProprio, creditoTotal, lanceProprioPercentual]);

  // Buscar análise de contemplação quando houver lances e grupo/empresa
  useEffect(() => {
    const buscarAnalise = async () => {
      if (!empresaId) { setAnaliseContemplacao(null); return; }
      // Só analisa se houver lance ativo
      const temLance = usarLanceProprio || usarLanceEmbutido;
      if (!temLance) { setAnaliseContemplacao(null); return; }

      const lanceProprioVal = usarLanceProprio ? (parseFloat(lanceProprio) || 0) : 0;
      const lanceEmbutidoVal = usarLanceEmbutido ? (creditoTotal * parseFloat(lanceEmbutidoPercentual || 0) / 100) : 0;
      const lanceTotal = lanceProprioVal + lanceEmbutidoVal;
      const lanceOfertadoPct = creditoTotal > 0 ? (lanceTotal / creditoTotal) * 100 : 0;

      if (lanceOfertadoPct <= 0) { setAnaliseContemplacao(null); return; }

      try {
        // Buscar menor lance cadastrado para o grupo+modalidade ou administradora+tipo_bem+modalidade
        const filtro = { empresa_id: empresaId, modalidade: modalidadeLance };
        if (grupo) filtro.grupo = grupo;
        const registros = await base44.entities.MenorLanceAssembleia.filter(filtro, '-data_assembleia', 10);

        if (!registros || registros.length === 0) {
          // Fallback: usar dados do histórico de lances do grupo já carregados no painel
          const menorDoHistorico = modalidadeLance === 'livre' ? menorLanceLivre : menorLanceLimitado;
          if (menorDoHistorico !== null && menorDoHistorico !== undefined) {
            setAnaliseContemplacao({ modalidade: modalidadeLance, menorLancePct: menorDoHistorico, lanceOfertadoPct });
          } else {
            setAnaliseContemplacao({ sem_historico: true, modalidade: modalidadeLance, lanceOfertadoPct });
          }
          return;
        }

        const menorLancePct = registros[0].menor_lance_percentual;
        setAnaliseContemplacao({ modalidade: modalidadeLance, menorLancePct, lanceOfertadoPct, registro: registros[0] });
      } catch {
        setAnaliseContemplacao(null);
      }
    };
    buscarAnalise();
  }, [usarLanceProprio, usarLanceEmbutido, lanceProprio, lanceEmbutidoPercentual, creditoTotal, grupo, empresaId, modalidadeLance, menorLanceLivre, menorLanceLimitado]);

  // Buscar dados históricos do grupo quando disponível
  useEffect(() => {
    const buscarHistorico = async () => {
      if (!grupo) {
        setHistoricoLances(null);
        return;
      }

      try {
        const todosDetalhes = await base44.entities.HistoricoLanceDetalhe.list();
        const todosHistoricos = await base44.entities.HistoricoLanceGrupo.list();

        const grupoNormalizado = String(grupo).replace(/^0+/, '') || '0';
        const detalhesDoGrupo = todosDetalhes.filter(d => {
          const grupoDetalheNormalizado = String(d.grupo).replace(/^0+/, '') || '0';
          return grupoDetalheNormalizado === grupoNormalizado;
        });

        if (detalhesDoGrupo.length === 0) {
          setHistoricoLances(null);
          return;
        }

        const historicosComDetalhes = todosHistoricos
          .filter(h => detalhesDoGrupo.some(d => d.historico_id === h.id))
          .sort((a, b) => new Date(b.assembleia_data) - new Date(a.assembleia_data));

        if (historicosComDetalhes.length === 0) {
          setHistoricoLances(null);
          return;
        }

        const historicoMaisRecente = historicosComDetalhes[0];
        const detalhesRecentes = detalhesDoGrupo.filter(
          d => d.historico_id === historicoMaisRecente.id
        );

        // Calcular resumos por modalidade
        const resumosPorModalidade = {};
        for (const detalhe of detalhesRecentes) {
          if (!resumosPorModalidade[detalhe.modalidade]) {
            resumosPorModalidade[detalhe.modalidade] = [];
          }
          if (detalhe.lance_percent !== null) {
            resumosPorModalidade[detalhe.modalidade].push(detalhe.lance_percent);
          }
        }

        const resumos = Object.entries(resumosPorModalidade).map(([modalidade, lances]) => {
          const soma = lances.reduce((acc, val) => acc + val, 0);
          return {
            modalidade,
            media_lance_percent: lances.length > 0 ? soma / lances.length : null
          };
        });

        setHistoricoLances(resumos);
      } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        setHistoricoLances(null);
      }
    };

    buscarHistorico();
  }, [grupo]);

  // Atualizar relógio de contemplação quando houver lance próprio
  useEffect(() => {
    if (!usarLanceProprio || !lanceProprio || !menorLanceHistorico || !maiorLanceHistorico) {
      setRelogioContemplacao(null);
      return;
    }

    // Usar percentualExibido: soma próprio + embutido no modo livre, ou só próprio
    const lancePercentualNum = parseFloat(percentualExibido);
    if (isNaN(lancePercentualNum)) {
      setRelogioContemplacao(null);
      return;
    }

    const relogio = calcularRelogioContemplacao({
      lanceCliente: lancePercentualNum,
      menorLance: menorLanceHistorico,
      maiorLance: maiorLanceHistorico,
      tipoLance: 'limitado'
    });

    setRelogioContemplacao(relogio);
  }, [usarLanceProprio, lanceProprio, percentualExibido, menorLanceHistorico, maiorLanceHistorico]);

  // Verificar se alguma carta tem plano decrescente
  const temPlanoDecrescente = cartas.some(c => c.planoDecrescente);

  // Calcular total do plano considerando decrescente (3 faixas)
  const calcularTotalDecrescente = (carta) => {
    const prazo = parseInt(carta.prazo) || 0;
    const parcela = parseFloat(carta.parcela) || 0;
    if (!carta.planoDecrescente || prazo <= 10) return parcela * prazo;
    const parcelaMeio = parseFloat(carta.parcelaMeio) || 0;
    const ultimaP = parseFloat(carta.ultimaParcela) || 0;
    // Faixa 1: parcelas 1 a 10 (10 parcelas)
    const totalFaixa1 = 10 * parcela;
    // Faixa 2: parcelas 11 a (prazo-1) = (prazo - 11) parcelas
    const totalFaixa2 = (prazo - 11) * parcelaMeio;
    // Faixa 3: última parcela (1 parcela)
    const totalFaixa3 = ultimaP;
    return totalFaixa1 + totalFaixa2 + totalFaixa3;
  };

  const totalPlanoDecrescente = cartas.reduce((acc, carta) => acc + calcularTotalDecrescente(carta), 0);

  const calcularSimulacao = () => {
    if (!clienteNome || !telefone) {
      toast.error('Preencha nome e telefone do cliente');
      return;
    }

    if (creditoTotal === 0 || parcelaTotal === 0) {
      toast.error('Informe pelo menos uma carta válida');
      return;
    }

    if (!prazoOriginal || parseFloat(prazoOriginal) <= 0) {
      toast.error('Informe o prazo original');
      return;
    }

    const prazoNum = parseFloat(prazoOriginal);
    // O total do plano SEMPRE usa a parcela cheia, independente da parcela reduzida
    const totalPlano = temPlanoDecrescente ? totalPlanoDecrescente : prazoNum * parcelaTotal;
    
    let lanceProprioValor = 0;
    let lanceEmbutidoValor = 0;
    let saldoDevedorTotal = totalPlano;
    
    // Aplicar lance embutido se ativo (% do crédito total)
    // Se parcela reduzida está selecionada, o lance embutido já está "embutido" na parcela menor,
    // então NÃO desconta do saldo devedor
    if (usarLanceEmbutido && lanceEmbutidoPercentual) {
      const pctEmbutido = parseFloat(lanceEmbutidoPercentual) / 100;
      lanceEmbutidoValor = creditoTotal * pctEmbutido;
    }
    // O lance embutido NÃO desconta do saldo quando o plano já inclui o embutido (50% ou 70% no nome)
    // Nesses planos, a parcela já é calculada pela administradora considerando o embutido,
    // então NÃO se desconta novamente do saldo devedor.
    const planoSelecionadoUpper = planoSelecionadoInfo?.toUpperCase() || '';
    const nomesCartasUpper = cartas.map(c => (c.nomePlano || '').toUpperCase()).join(' ');
    const textoPlanos = planoSelecionadoUpper + ' ' + nomesCartasUpper;
    const planoJaTemEmbutido = textoPlanos.includes('50%') || textoPlanos.includes('70%') || lanceEmbutidoJaIncluso;
    // Se o plano já tem embutido (50%/70%), NÃO desconta do saldo devedor
    // Se parcela reduzida foi selecionada, também NÃO desconta (embutido já refletido na parcela menor)
    const lanceEmbutidoDescontaNoSaldo = usarLanceEmbutido && !planoJaTemEmbutido && !(usarParcelaReduzida && parcelaReduzidaTotal > 0);

    // Aplicar lance próprio se ativo
    if (usarLanceProprio && lanceProprio) {
      lanceProprioValor = parseFloat(lanceProprio);
      if (lanceProprioValor > totalPlano) {
        lanceProprioValor = totalPlano;
        toast.warning('Lance próprio ajustado para o valor máximo do plano');
      }
    }

    // Se parcela reduzida, o lance embutido NÃO desconta do saldo devedor
    const lanceEmbutidoParaSaldo = lanceEmbutidoDescontaNoSaldo ? lanceEmbutidoValor : 0;
    const lanceTotalValor = lanceProprioValor + lanceEmbutidoValor;
    // Saldo: desconta lance próprio sempre; lance embutido só desconta se parcela cheia
    saldoDevedorTotal = totalPlano - lanceProprioValor - lanceEmbutidoParaSaldo;

    const saldoAposLance = saldoDevedorTotal;

    let novaParcelaCalculada = saldoDevedorTotal / prazoNum; // padrão não-decrescente
    let novaParcelaMeio = null;
    let novaUltimaParcela = null;
    // Info extra para o resultado
    let descontoPorParcela = null;
    let parcelasJaPagas = null;
    let parcelaCarenciaValor = null;
    let numParcelasCarenciaLocal = 0;
    let novoPrazo = prazoNum - 1; // padrão não-decrescente (1 paga no ato)

    if (temPlanoDecrescente) {
      const cartaDec = cartas.find(c => c.planoDecrescente && parseInt(c.prazo) > 10);
      if (cartaDec) {
        const prazo = parseInt(cartaDec.prazo) || prazoNum;
        const parcela1a10 = parseFloat(cartaDec.parcela) || 0;
        const parcelaMeio = parseFloat(cartaDec.parcelaMeio) || 0;
        const ultimaParc = parseFloat(cartaDec.ultimaParcela) || 0;

        const carenciaAplicada = aplicarRegraCanopus ? parcelasCarencia : 0;
        const parcelasJaPagasNum = 1; // 1 paga no ato (parcela 1)

        // Primeira parcela restante após ato + carência
        const primeiraParcRestante = parcelasJaPagasNum + carenciaAplicada + 1; // ex: 1+3+1 = 5

        // Parcelas restantes (não inclui ato nem carência)
        novoPrazo = prazo - parcelasJaPagasNum - carenciaAplicada; // ex: 160-1-3 = 156
        numParcelasCarenciaLocal = carenciaAplicada;
        parcelasJaPagas = parcelasJaPagasNum;

        // Parcelas na carência: valor original sem desconto
        parcelaCarenciaValor = parcela1a10;

        const lanceEfetivoDecrescente = lanceProprioValor + lanceEmbutidoParaSaldo;
        if (lanceEfetivoDecrescente > 0) {
          // Saldo após parcela paga no ato
          const saldoAposParcela = totalPlano - parcela1a10;
          // Saldo após lance
          const saldoAposLanceDecrescente = saldoAposParcela - lanceEfetivoDecrescente;

          // Calcular total original apenas das parcelas RESTANTES (após ato + carência)
          // Faixa 1 restante: parcelas primeiraParcRestante a 10
          const qtdFaixa1Restante = Math.max(0, 10 - primeiraParcRestante + 1); // ex: 10-5+1=6
          const totalFaixa1Restante = qtdFaixa1Restante * parcela1a10;

          // Faixa 2: parcelas 11 a (prazo-1)
          const qtdFaixa2 = Math.max(0, (prazo - 1) - 10); // ex: 159-10=149
          const totalFaixa2Restante = qtdFaixa2 * parcelaMeio;

          // Faixa 3: última parcela
          const totalFaixa3Restante = ultimaParc;

          const totalRestanteOriginal = totalFaixa1Restante + totalFaixa2Restante + totalFaixa3Restante;

          // Fator de redução
          const fatorReducao = saldoAposLanceDecrescente / totalRestanteOriginal;
          descontoPorParcela = fatorReducao; // reutilizando campo para exibir o fator

          // Aplicar fator em cada faixa restante
          novaParcelaCalculada = parcela1a10 * fatorReducao; // parcelas 5 a 10
          novaParcelaMeio = parcelaMeio * fatorReducao;      // parcelas 11 a 159
          novaUltimaParcela = ultimaParc * fatorReducao;     // parcela 160

          // Para exibição do saldo devedor
          saldoDevedorTotal = saldoAposLanceDecrescente;
        } else {
          // Sem lance: mantém faixas originais, apenas 1 paga no ato
          novaParcelaCalculada = parcela1a10;
          novaParcelaMeio = parcelaMeio;
          novaUltimaParcela = ultimaParc;
        }
      }
    } else {
      // saldoDevedorTotal já foi calculado sem embutido quando parcela reduzida
      // Sempre desconta a 1ª parcela no ato do saldo devedor (usa a parcela escolhida pelo cliente)
      const saldoDevedorReal = saldoDevedorTotal - primeiraParcelaNoAto;
      novoPrazo = prazoNum - 1;

      // Aplicar regra Canopus se ativado (apenas plano normal)
      if (aplicarRegraCanopus && (tipoGrupo === 'automovel' || tipoGrupo === 'imovel')) {
        const mesesNaoCobrados = parcelasCarencia + parcelaAtoContratacao;
        const mesesCobrados = prazoNum - mesesNaoCobrados;
        novoPrazo = mesesCobrados < 1 ? 1 : mesesCobrados;
      }

      if (modoReducao === '5050' && lanceProprioValor > 0) {
        // Metade do lance quita parcelas do final (reduz prazo)
        // Metade do lance também quita parcelas do final (ambas as metades reduzem prazo)
        // O saldo restante é dividido pelo novo prazo
        const lancePrazo = lanceProprioValor / 2;
        const lanceParcela = lanceProprioValor / 2;

        // Quantas parcelas cada metade do lance consegue quitar
        const parcelasQuitadasPrazo = Math.floor(lancePrazo / parcelaTotal);
        const parcelasQuitadasParcela = Math.floor(lanceParcela / parcelaTotal);
        const parcelasQuitadas = parcelasQuitadasPrazo + parcelasQuitadasParcela;
        const novoPrazo5050 = Math.max(1, novoPrazo - parcelasQuitadasPrazo);

        // Saldo a dividir = saldoDevedorReal (sem 1ª parcela no ato, sem lances)
        // O lance inteiro quitou parcelas, então o saldo restante é dividido pelo novo prazo
        novaParcelaCalculada = saldoDevedorReal / novoPrazo5050;
        novoPrazo = novoPrazo5050;

        // Restaurar saldoDevedorTotal para exibição correta (totalPlano - lanceTotal, antes de 1ª parcela)
        saldoDevedorTotal = saldoDevedorReal + primeiraParcelaNoAto;

        // Guardar info para exibição
        descontoPorParcela = lanceParcela;
        parcelasJaPagas = parcelasQuitadasPrazo;
      } else {
        novaParcelaCalculada = saldoDevedorReal / novoPrazo;
      }
    }

    // Saldo devedor para exibição:
    // No plano decrescente: já calculado como saldoDevedorTotal (saldo após parcela paga e lance)
    // No modo 5050: saldoDevedorTotal foi restaurado para totalPlano - lanceTotal, então subtraímos 1ª parcela normalmente
    // No plano normal: totalPlano - lance - 1ª parcela no ato
    const saldoDevedorExibicao = temPlanoDecrescente
      ? saldoDevedorTotal
      : saldoDevedorTotal - primeiraParcelaNoAto;

    setResultado({
      creditoTotal,
      parcelaTotal,
      totalPlano,
      prazoOriginal: prazoNum,
      novoPrazo,
      novaParcela: novaParcelaCalculada,
      novaParcelaMeio,
      novaUltimaParcela,
      aplicarRegraCanopus: aplicarRegraCanopus && (tipoGrupo === 'automovel' || tipoGrupo === 'imovel'),
      usarLanceProprio,
      lanceProprio: lanceProprioValor,
      usarLanceEmbutido,
      lanceEmbutido: lanceEmbutidoValor,
      lanceEmbutidoPercentual: usarLanceEmbutido ? parseFloat(lanceEmbutidoPercentual) : 0,
      lanceEmbutidoDescontaNoSaldo,
      planoJaTemEmbutido,
      parcelaReduzidaSelecionada: usarParcelaReduzida && parcelaReduzidaTotal > 0,
      lanceTotal: lanceTotalValor,
      saldoAposLance,
      saldoDevedor: saldoDevedorExibicao,
      parcelaReduzida: parcelaReduzidaTotal > 0,
      valorParcelaReduzida: primeiraParcelaNoAto,
      temPlanoDecrescente,
      descontoPorParcela,
      parcelasJaPagas,
      parcelaCarenciaValor,
      numParcelasCarencia: numParcelasCarenciaLocal,
      carenciaDecrescente: aplicarRegraCanopus ? parcelasCarencia : 0,
      modoReducao,
    });
  };

  const gerarSimulacaoMutation = useMutation({
    mutationFn: async () => {
      if (!resultado) throw new Error('Calcule a simulação primeiro');
      if (!currentUser) throw new Error('Usuário não autenticado');

      const colabs = await base44.entities.Colaborador.filter(
        { user_id: currentUser.id, status: 'ativo' },
        '-created_date'
      );
      
      const colab = colabs?.[0];
      if (!colab || !colab.empresa_id) throw new Error('Usuário não vinculado a empresa');

      // Calcula o total da primeira parcela reduzida somando todas as cartas
      const primeira_parcela_reduzida_total = cartas.reduce(
        (acc, c) => acc + Number(c.parcelaReduzida || 0), 
        0
      );

      // Se houver reduzida, o "no ato" deve ser a soma das reduzidas.
      // Senão, deve ser a parcela total cheia.
      const primeira_parcela_no_ato =
        primeira_parcela_reduzida_total > 0 ? primeira_parcela_reduzida_total : parcelaTotal;

      const simulacao = await base44.entities.Simulacao.create({
        empresa_id: colab.empresa_id,
        cliente_nome: clienteNome,
        telefone: telefone,
        tipo_grupo: tipoGrupo,
        cartas: JSON.stringify(cartas),
        credito_total: creditoTotal,
        parcela_total: parcelaTotal,
        prazo_original: resultado.prazoOriginal,
        novo_prazo: resultado.novoPrazo,
        nova_parcela: resultado.novaParcela,
        parcela_reduzida: primeira_parcela_reduzida_total > 0,
        primeira_parcela_reduzida_total: primeira_parcela_reduzida_total,
        primeira_parcela_no_ato: primeira_parcela_no_ato,
        saldo_apos_contemplacao: resultado.saldoDevedor,
        lance_proprio_ativo: resultado.usarLanceProprio || false,
        lance_proprio_valor: resultado.usarLanceProprio ? resultado.lanceProprio : 0,
        lance_embutido_ativo: resultado.usarLanceEmbutido || false,
        lance_embutido_valor: resultado.usarLanceEmbutido ? resultado.lanceEmbutido : 0,
        lance_embutido_percentual: resultado.usarLanceEmbutido ? resultado.lanceEmbutidoPercentual : 0,
        lance_total: resultado.lanceTotal || 0,
        usuario_id: currentUser.id,
        usuario_nome: colab.nome || currentUser.full_name,
        analise_contemplacao_json: analiseContemplacao ? JSON.stringify(analiseContemplacao) : null,
        status: 'ativa'
      });

      await base44.entities.Simulacao.update(simulacao.id, {
        pdf_url: `#simulacao-impressao-${simulacao.id}`
      });

      // Buscar etapa de Simulação do funil consórcio especificamente
      const etapaSimulacao = etapas.find(e => 
        e.produto === 'consorcio' && (
          e.nome.toLowerCase().includes('simulação') || 
          e.nome.toLowerCase().includes('simulacao')
        )
      ) || etapas.find(e => 
        e.produto === 'consorcio'
      ) || etapas[0];

      // Verifica se já existe uma oportunidade aberta para este mesmo lead no funil consórcio.
      // Se existir, apenas atualiza ela (a simulação nova entra só no histórico) em vez de criar outro card.
      const oportunidadesExistentes = await base44.entities.Oportunidade.filter({
        empresa_id: colab.empresa_id,
        telefone_lead: telefone,
        produto: 'consorcio',
        status: 'aberta'
      }, '-data_ultima_movimentacao', 1);

      let oportunidade;
      if (oportunidadesExistentes?.length > 0) {
        oportunidade = oportunidadesExistentes[0];
        await base44.entities.Oportunidade.update(oportunidade.id, {
          empresa_id: colab.empresa_id,
          titulo: oportunidade.titulo,
          vendedor_id: oportunidade.vendedor_id,
          etapa_id: oportunidade.etapa_id,
          valor_estimado: creditoTotal,
          data_ultima_movimentacao: new Date().toISOString()
        });
      } else {
        oportunidade = await base44.entities.Oportunidade.create({
          empresa_id: colab.empresa_id,
          titulo: clienteNome,
          cliente_nome: clienteNome,
          telefone_lead: telefone,
          valor_estimado: creditoTotal,
          etapa_id: etapaSimulacao.id,
          etapa_nome: etapaSimulacao.nome,
          produto: 'consorcio',
          vendedor_id: currentUser.id,
          vendedor_nome: colab.nome || currentUser.full_name,
          origem: 'Simulador com Recursos Próprios',
          status: 'aberta',
          data_ultima_movimentacao: new Date().toISOString()
        });
      }

      await base44.entities.Simulacao.update(simulacao.id, {
        oportunidade_id: oportunidade.id
      });

      return { simulacao };
    },
    onSuccess: ({ simulacao }) => {
      toast.success('Simulação gerada com sucesso!');
      setTimeout(() => {
        window.location.href = createPageUrl('ImprimirSimulacao') + `?id=${simulacao.id}`;
      }, 300);
    }
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const handleMoedaInput = (value) => {
    const numeros = value.replace(/\D/g, '');
    return parseFloat(numeros) / 100;
  };

  const formatarParaExibicao = (valor) => {
    if (!valor) return '';
    const num = parseFloat(valor);
    if (isNaN(num)) return '';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const handleAbrirPlanoModal = (index) => {
    setCartaIndex(index);
    setPlanoModalOpen(true);
  };

  const handleSelecionarPlano = async (plano) => {
    if (cartaIndex !== null) {
      // Verificar se o plano NÃO é de 50% nem 70%
      const nomeBem = plano.nome_bem?.toUpperCase() || '';
      const is50ou70 = nomeBem.includes('50%') || nomeBem.includes('70%');
      
      let parcelaReduzida = '';
      let ativarLanceEmbutido = false;
      let lanceEmbutidoPercentualAuto = '';
      
      // Se o plano é 50% ou 70%, ativar lance embutido e marcar "já incluso"
      if (nomeBem.includes('50%')) {
        ativarLanceEmbutido = true;
        lanceEmbutidoPercentualAuto = '50';
        setLanceEmbutidoJaIncluso(true);
      } else if (nomeBem.includes('70%')) {
        ativarLanceEmbutido = true;
        lanceEmbutidoPercentualAuto = '30';
        setLanceEmbutidoJaIncluso(true);
      }
      
      // Se não for 50% nem 70%, buscar o equivalente de 50%
      if (!is50ou70 && plano.credito && plano.prazo && empresaId) {
        try {
          // Buscar plano de 50% com mesmo valor e prazo
          const planos50 = await base44.entities.PlanoCanopus.filter({
            empresa_id: empresaId,
            valor_bem: plano.credito,
            prazo_meses: plano.prazo,
            status: 'ativo'
          });
          
          // Encontrar o plano que contém "50%" no nome
          const plano50 = planos50.find(p => 
            p.nome_bem?.toUpperCase().includes('50%')
          );
          
          if (plano50?.parcela) {
            parcelaReduzida = plano50.parcela.toString();
            toast.success('Parcela reduzida (50%) preenchida automaticamente!');
          }
        } catch (e) {
          console.error('Erro ao buscar plano 50%:', e);
        }
      }
      
      const nomePlanoFinal = plano.nome_bem || '';
      const novasCartas = [...cartas];
      novasCartas[cartaIndex] = {
        ...novasCartas[cartaIndex],
        credito: plano.credito.toString(),
        parcela: plano.parcela.toString(),
        prazo: plano.prazo.toString(),
        parcelaReduzida: parcelaReduzida,
        nomePlano: nomePlanoFinal
      };
      setCartas(novasCartas);
      setPlanoSelecionadoInfo(nomePlanoFinal);

      // Detectar 50%/70% também quando o nome vem do modal (caso não tenha sido detectado acima)
      if (!ativarLanceEmbutido) {
        const upper = nomePlanoFinal.toUpperCase();
        if (upper.includes('50%')) {
          setUsarLanceEmbutido(true);
          setLanceEmbutidoPercentual('50');
          setLanceEmbutidoJaIncluso(true);
          ativarLanceEmbutido = true;
          lanceEmbutidoPercentualAuto = '50';
        } else if (upper.includes('70%')) {
          setUsarLanceEmbutido(true);
          setLanceEmbutidoPercentual('30');
          setLanceEmbutidoJaIncluso(true);
          ativarLanceEmbutido = true;
          lanceEmbutidoPercentualAuto = '30';
        }
      }
      
      // Ativar lance embutido automaticamente se plano é 50% ou 70%
      if (ativarLanceEmbutido) {
        setUsarLanceEmbutido(true);
        setLanceEmbutidoPercentual(lanceEmbutidoPercentualAuto);
        toast.success(`Plano selecionado: ${plano.nome_bem} — Lance Embutido (${lanceEmbutidoPercentualAuto}%) ativado. Embutido já incluso no plano.`);
      } else {
        setLanceEmbutidoJaIncluso(false);
        toast.success(`Plano selecionado: ${plano.nome_bem}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6950a9860c8af0e2ff10fc9e/1b5f2d0a1_JDPromotoraICON3.png" 
            alt="JD Promotora" 
            className="h-10 w-auto object-contain"
          />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Simulação de Consórcio</h1>
            <p className="text-slate-500 text-sm">Simulação completa com análise de contemplação</p>
          </div>
        </div>
        <Button onClick={() => setCadastroLanceOpen(true)} variant="outline" size="sm" className="gap-2 border-[#10353C] text-[#10353C]">
          <History className="w-4 h-4" />
          Cadastrar Menor Lance de Assembleia
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">📋 Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nome do Cliente *</Label>
                  <Input value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>Telefone *</Label>
                  <Input value={telefone} onChange={(e) => setTelefone(formatPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  <Label className="mb-2 block">Tipo do Consórcio *</Label>
                  <Select value={tipoGrupo} onValueChange={setTipoGrupo}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automovel">Automóvel</SelectItem>
                      <SelectItem value="imovel">Imóvel</SelectItem>
                      <SelectItem value="motocicleta">Motocicleta</SelectItem>
                      <SelectItem value="servico">Serviço</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-2 block">Administradora</Label>
                  <Select value={administradoraId} onValueChange={setAdministradoraId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {administradoras.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.nome_fantasia || a.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Número do Grupo</Label>
                  <Input 
                    value={grupo} 
                    onChange={(e) => setGrupo(e.target.value)} 
                    placeholder="Ex: 8120"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Grupos Disponíveis compatíveis com Administradora + Categoria + Crédito */}
          <GruposDisponiveisPanel
            empresaId={empresaId}
            administradoraId={administradoraId}
            categoriaBem={tipoGrupo}
            credito={creditoTotal}
            grupoSelecionado={grupo}
            onSelectGrupo={setGrupo}
          />

          {/* Histórico de Lances do Grupo */}
          {grupo && (
            <LancesDoGrupoPanel 
              grupo={grupo}
              onMenorLanceLimitadoChange={setMenorLanceLimitado}
              onMaiorLanceLimitadoChange={setMaiorLanceLimitado}
              onMenorLanceLivreChange={setMenorLanceLivre}
              onMaiorLanceLivreChange={setMaiorLanceLivre}
            />
          )}

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">💳 Cartas de Crédito</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => handleAbrirPlanoModal(cartas.length - 1)} size="sm" variant="outline" className="gap-2">
                    <ShoppingBag className="w-4 h-4" />
                    Selecionar Plano
                  </Button>
                  <Button onClick={adicionarCarta} size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Adicionar Carta
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cartas.map((carta, index) => (
                <div key={index} className="relative p-4 bg-slate-50 rounded-lg border">
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleAbrirPlanoModal(index)} className="h-6 w-6 text-blue-600 hover:bg-blue-50" title="Selecionar Plano">
                      <ShoppingBag className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => duplicarCarta(index)} className="h-6 w-6 text-blue-600 hover:bg-blue-50">
                      <Copy className="w-4 h-4" />
                    </Button>
                    {cartas.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => removerCarta(index)} className="h-6 w-6 text-red-600 hover:bg-red-50">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  {/* Switch Plano Decrescente no topo */}
                  <div className="flex items-center gap-2 mb-3">
                    <Switch
                      checked={carta.planoDecrescente || false}
                      onCheckedChange={(v) => atualizarCarta(index, 'planoDecrescente', v)}
                    />
                    <Label className="text-xs font-medium text-purple-700 cursor-pointer">📉 Plano Decrescente</Label>
                  </div>

                  {!carta.planoDecrescente ? (
                    /* Layout Normal */
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Crédito (R$) *</Label>
                          <Input type="text" value={carta.credito ? formatarParaExibicao(carta.credito) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'credito', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Parcela (R$) *</Label>
                          <Input type="text" value={carta.parcela ? formatarParaExibicao(carta.parcela) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'parcela', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Prazo (meses) *</Label>
                          <Input type="number" value={carta.prazo} onChange={(e) => atualizarCarta(index, 'prazo', e.target.value)} placeholder="120" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">1ª Parcela Reduzida</Label>
                          <Input type="text" value={carta.parcelaReduzida ? formatarParaExibicao(carta.parcelaReduzida) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'parcelaReduzida', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-9" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Nome/Código do Plano <span className="text-slate-400">(opcional — ex: CR.43.05 - AUTOMÓVEL LEVE 50%)</span></Label>
                        <Input
                          type="text"
                          value={carta.nomePlano || ''}
                          onChange={(e) => atualizarCarta(index, 'nomePlano', e.target.value)}
                          placeholder="Ex: CR.43.05 - AUTOMÓVEL LEVE 50%"
                          className="h-9 text-xs"
                        />
                        {carta.nomePlano && (carta.nomePlano.toUpperCase().includes('50%') || carta.nomePlano.toUpperCase().includes('70%')) && (
                          <p className="text-xs text-emerald-600 mt-1">✅ Plano com lance embutido identificado — o embutido já está incluso nas parcelas do plano e <strong>não será descontado novamente</strong> do saldo devedor</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Layout Plano Decrescente */
                    <div className="space-y-3">
                      {/* Linha 1: Crédito + Prazo */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Crédito (R$) *</Label>
                          <Input type="text" value={carta.credito ? formatarParaExibicao(carta.credito) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'credito', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-9" />
                        </div>
                        <div>
                          <Label className="text-xs">Prazo Total (meses) *</Label>
                          <Input type="number" value={carta.prazo} onChange={(e) => atualizarCarta(index, 'prazo', e.target.value)} placeholder="222" className="h-9" />
                        </div>
                      </div>

                      {/* Faixas de parcela — só mostra se tiver prazo */}
                      {carta.prazo && parseInt(carta.prazo) > 10 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-purple-700 mb-2">
                            📉 Faixas de Parcela (Prazo: {carta.prazo} meses)
                          </p>
                          {/* Faixa 1: parcelas 1 a 10 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 w-28 shrink-0">Parcelas 1 a 10:</span>
                            <Input type="text" value={carta.parcela ? formatarParaExibicao(carta.parcela) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'parcela', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-8 text-sm" />
                          </div>
                          {/* Faixa 2: parcelas 11 a (prazo-1) */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 w-28 shrink-0">Parcelas 11 a {parseInt(carta.prazo) - 1}:</span>
                            <Input type="text" value={carta.parcelaMeio ? formatarParaExibicao(carta.parcelaMeio) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'parcelaMeio', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-8 text-sm" />
                          </div>
                          {/* Faixa 3: última parcela */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600 w-28 shrink-0">Parcela {carta.prazo} (última):</span>
                            <Input type="text" value={carta.ultimaParcela ? formatarParaExibicao(carta.ultimaParcela) : ''} onChange={(e) => { const val = handleMoedaInput(e.target.value); atualizarCarta(index, 'ultimaParcela', val > 0 ? val.toString() : ''); }} placeholder="0,00" className="h-8 text-sm" />
                          </div>
                        </div>
                      )}

                      {carta.prazo && parseInt(carta.prazo) <= 10 && (
                        <p className="text-xs text-red-500">⚠️ Prazo deve ser maior que 10 meses para plano decrescente.</p>
                      )}
                    </div>
                  )}

                  {/* Resumo da carta */}
                  {carta.credito && carta.parcela && carta.prazo && (
                    <div className="mt-2 text-xs text-slate-600 pt-2 border-t">
                      {carta.planoDecrescente && carta.parcelaMeio ? (
                        <span className="font-semibold">
                          {formatCurrency(parseFloat(carta.credito))} • {carta.prazo} meses •{' '}
                          Parc. 1-10: {formatCurrency(parseFloat(carta.parcela))} •{' '}
                          Parc. 11-{parseInt(carta.prazo)-1}: {formatCurrency(parseFloat(carta.parcelaMeio))} •{' '}
                          Última: {carta.ultimaParcela ? formatCurrency(parseFloat(carta.ultimaParcela)) : '-'}
                        </span>
                      ) : (
                        <span className="font-semibold">
                          {formatCurrency(parseFloat(carta.credito))} • {formatCurrency(parseFloat(carta.parcela))}/mês • {carta.prazo} meses
                          {carta.parcelaReduzida && ` • 1ª Parc. Reduzida: ${formatCurrency(parseFloat(carta.parcelaReduzida))}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                {planoSelecionadoInfo && (
                  <div className="mb-3 pb-3 border-b border-blue-300">
                    <p className="text-xs text-blue-700 font-semibold">📋 Plano Selecionado</p>
                    <p className="text-sm font-medium text-blue-900">{planoSelecionadoInfo}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-blue-700">💰 Crédito Total</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(creditoTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-blue-700">📅 Parcela Total/mês</p>
                    <p className="text-xl font-bold text-blue-900">{formatCurrency(parcelaTotal)}</p>
                  </div>
                  {parcelaReduzidaTotal > 0 && (
                    <div>
                      <p className="text-xs text-orange-700">📉 1ª Parc. Reduzida</p>
                      <p className="text-xl font-bold text-orange-900">{formatCurrency(parcelaReduzidaTotal)}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seletor de parcela - só aparece quando há parcela reduzida */}
          {parcelaReduzidaTotal > 0 && (
            <Card className="border-0 shadow-sm border-l-4 border-l-orange-400">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-orange-700">
                  🏷️ Qual parcela usar na contratação?
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-slate-500">
                  Este plano possui uma 1ª parcela reduzida. Escolha qual será usada no cálculo do saldo devedor.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setUsarParcelaReduzida(false)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${usarParcelaReduzida === false ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <p className={`text-xs font-semibold ${usarParcelaReduzida === false ? 'text-blue-700' : 'text-slate-700'}`}>📋 Parcela Normal</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(parcelaTotal)}</p>
                  </button>
                  <button
                    onClick={() => setUsarParcelaReduzida(true)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${usarParcelaReduzida === true ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <p className={`text-xs font-semibold ${usarParcelaReduzida === true ? 'text-orange-700' : 'text-slate-700'}`}>🏷️ Parcela Reduzida</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{formatCurrency(parcelaReduzidaTotal)}</p>
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">✨ Lance Embutido (Opcional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div>
                  <Label className="text-sm font-medium">Deseja usar Lance Embutido?</Label>
                  <p className="text-xs text-emerald-600 mt-1">Lance pago com o próprio crédito (% do crédito total)</p>
                </div>
                <Switch checked={usarLanceEmbutido} onCheckedChange={(v) => {
                  setUsarLanceEmbutido(v);
                  if (v) setModalidadeLance('livre');
                }} />
              </div>
              {usarLanceEmbutido && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div>
                      <Label className="text-sm font-medium text-amber-800">Plano 50% / 70% (embutido já incluso)?</Label>
                      <p className="text-xs text-amber-600 mt-1">Marque se o plano selecionado já tem o lance embutido nas parcelas (ex: Renovação 50%, Leve 50%, 70%). O embutido <strong>não descontará</strong> do saldo devedor.</p>
                    </div>
                    <Switch checked={lanceEmbutidoJaIncluso} onCheckedChange={setLanceEmbutidoJaIncluso} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Percentual do Lance Embutido (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={lanceEmbutidoPercentual}
                        onChange={(e) => setLanceEmbutidoPercentual(e.target.value)}
                        className="h-9"
                        placeholder="30"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valor do Lance Embutido (R$)</Label>
                      <Input
                        type="text"
                        value={creditoTotal > 0 && lanceEmbutidoPercentual ? formatarParaExibicao((creditoTotal * parseFloat(lanceEmbutidoPercentual || 0) / 100).toString()) : ''}
                        disabled
                        className="h-9 bg-slate-100 text-slate-700 font-semibold"
                      />
                    </div>
                  </div>
                  {creditoTotal > 0 && lanceEmbutidoPercentual && (
                    <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-xs text-emerald-700">✨ Lance Embutido</p>
                      <p className="text-xl font-bold text-emerald-900">{formatCurrency(creditoTotal * parseFloat(lanceEmbutidoPercentual || 0) / 100)}</p>
                      <p className="text-xs text-emerald-700 mt-1">{lanceEmbutidoPercentual}% de {formatCurrency(creditoTotal)}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm" id="card-lance-proprio">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">💰 Lance Próprio (Opcional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Deseja ofertar Recurso Próprio?</Label>
                  <p className="text-xs text-slate-500 mt-1">Oferece um valor adicional para reduzir as parcelas</p>
                </div>
                <Switch checked={usarLanceProprio} onCheckedChange={setUsarLanceProprio} />
              </div>

              {usarLanceProprio && (
                <div className="space-y-3">
                  {/* Modalidade de lance */}
                  <div>
                    <Label className="text-xs font-semibold text-slate-600 uppercase">Modalidade do Lance</Label>
                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                      <button
                        onClick={() => setModalidadeLance('livre')}
                        className={`p-2.5 rounded-lg border-2 text-left transition-all text-xs ${modalidadeLance === 'livre' ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        Lance Livre
                        <p className="text-xs font-normal opacity-70 mt-0.5">Próprio + Embutido</p>
                      </button>
                      <button
                        onClick={() => setModalidadeLance('limitado')}
                        className={`p-2.5 rounded-lg border-2 text-left transition-all text-xs ${modalidadeLance === 'limitado' ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                      >
                        Lance Limitado
                        <p className="text-xs font-normal opacity-70 mt-0.5">Regra da administradora</p>
                      </button>
                    </div>
                  </div>

                  {/* Modo de redução */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setModoReducao('parcela')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${modoReducao === 'parcela' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <p className={`text-xs font-semibold ${modoReducao === 'parcela' ? 'text-blue-700' : 'text-slate-700'}`}>📉 Reduzir Parcela</p>
                      <p className="text-xs text-slate-500 mt-0.5">100% do lance reduz o valor da parcela</p>
                    </button>
                    <button
                      onClick={() => setModoReducao('5050')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${modoReducao === '5050' ? 'border-green-500 bg-green-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <p className={`text-xs font-semibold ${modoReducao === '5050' ? 'text-green-700' : 'text-slate-700'}`}>⚖️ 50% Prazo / 50% Parcela</p>
                      <p className="text-xs text-slate-500 mt-0.5">Metade reduz prazo, metade reduz parcela</p>
                    </button>
                  </div>

                  {/* Preview 50/50 */}
                  {modoReducao === '5050' && lanceProprio && parseFloat(lanceProprio) > 0 && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-green-700 font-semibold">⏱ Redução de Prazo</p>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(parseFloat(lanceProprio) / 2)}</p>
                        <p className="text-xs text-green-600">≈ {Math.floor((parseFloat(lanceProprio) / 2) / (parcelaTotal || 1))} meses a menos</p>
                      </div>
                      <div>
                        <p className="text-xs text-green-700 font-semibold">💵 Redução de Parcela</p>
                        <p className="text-lg font-bold text-green-900">{formatCurrency(parseFloat(lanceProprio) / 2)}</p>
                        <p className="text-xs text-green-600">aplicado no saldo restante</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Label className="text-xs">Valor do Lance Próprio (R$) *</Label>
                      <Input
                        type="text"
                        value={lanceProprio ? formatarParaExibicao(lanceProprio) : ''}
                        onChange={(e) => {
                          const valorNumerico = handleMoedaInput(e.target.value);
                          setLanceProprio(valorNumerico > 0 ? valorNumerico.toString() : '');
                        }}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Percentual {modalidadeLance === 'livre' && usarLanceEmbutido ? '(Próprio + Embutido)' : '(%)'}</Label>
                      <Input
                        type="text"
                        value={percentualExibido + '%'}
                        disabled
                        className="bg-slate-100 text-slate-700 font-semibold"
                      />
                    </div>
                  </div>
                  {lanceProprio && parseFloat(lanceProprio) > 0 && (
                    <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-700">💎 Lance Próprio</p>
                      <p className="text-xl font-bold text-purple-900">{formatCurrency(parseFloat(lanceProprio))}</p>
                      <p className="text-xs text-purple-700 mt-1">
                        {percentualExibido}% do crédito total{modalidadeLance === 'livre' && usarLanceEmbutido ? ' (próprio + embutido)' : ''}
                      </p>
                    </div>
                  )}

                  {/* Relógio + Análise de Contemplação lado a lado */}
                  {(relogioContemplacao || analiseContemplacao) && (
                    <div className={`mt-4 grid gap-4 ${relogioContemplacao && analiseContemplacao ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                      {relogioContemplacao && grupo && (
                        <RelogioContemplacao 
                          relogio={relogioContemplacao}
                          lanceOfertado={parseFloat(percentualExibido)}
                        />
                      )}
                      {analiseContemplacao && (
                        <AnaliseContemplacao analise={analiseContemplacao} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">⚙️ Opções de Pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(tipoGrupo === 'automovel' || tipoGrupo === 'imovel') && (
                <>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <Label className="text-sm font-medium">Aplicar regra Canopus?</Label>
                      <p className="text-xs text-blue-600 mt-1">Carência de 3 parcelas + 1 parcela no ato</p>
                    </div>
                    <Switch checked={aplicarRegraCanopus} onCheckedChange={setAplicarRegraCanopus} />
                  </div>

                  {aplicarRegraCanopus && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Parcelas de Carência</Label>
                        <Input
                          type="number"
                          min="0"
                          value={parcelasCarencia}
                          onChange={(e) => setParcelasCarencia(parseInt(e.target.value) || 0)}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Parcela no Ato</Label>
                        <Input
                          type="number"
                          min="0"
                          value={parcelaAtoContratacao}
                          onChange={(e) => setParcelaAtoContratacao(parseInt(e.target.value) || 0)}
                          className="h-9"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {tipoGrupo !== 'automovel' && tipoGrupo !== 'imovel' && (
                <p className="text-xs text-slate-500 text-center py-2">
                  Regra Canopus disponível apenas para Automóvel e Imóvel
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">📊 Calcular</CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={calcularSimulacao} className="w-full bg-blue-600 hover:bg-blue-700 gap-2">
                <Calculator className="w-4 h-4" />
                Calcular Simulação
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1">
          <Card className="border-0 shadow-sm sticky top-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Resultado
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!resultado ? (
                <div className="text-center py-12 text-slate-500">
                  <Calculator className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="text-sm">Calcule a simulação</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Informações do Cliente */}
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-600 font-semibold mb-2">👤 Cliente</p>
                    <p className="text-sm font-medium text-slate-900">{clienteNome}</p>
                    <p className="text-xs text-slate-600">{telefone}</p>
                    <p className="text-xs text-slate-600 capitalize mt-1">
                      {tipoGrupo === 'automovel' ? 'Automóvel' : tipoGrupo === 'imovel' ? 'Imóvel' : tipoGrupo === 'motocicleta' ? 'Motocicleta' : tipoGrupo}
                    </p>
                  </div>

                  {/* Informações do Plano */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700 font-semibold mb-2">📋 Plano</p>
                    <p className="text-sm font-medium text-blue-900">
                      Crédito Total {formatCurrency(creditoTotal)}
                    </p>
                    <p className="text-xs text-blue-800 mt-1">
                      {prazoOriginal} Meses de {formatCurrency(parcelaTotal)}
                    </p>
                  </div>

                  <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg text-white">
                    <p className="text-xs font-semibold mb-1">💰 Valor a Receber</p>
                    <p className="text-3xl font-bold">{formatCurrency(resultado.creditoTotal - (resultado.usarLanceEmbutido ? resultado.lanceEmbutido : 0))}</p>
                    {resultado.usarLanceEmbutido && (
                      <p className="text-xs mt-1 text-blue-100">Crédito {formatCurrency(resultado.creditoTotal)} - Lance Embutido {formatCurrency(resultado.lanceEmbutido)}</p>
                    )}
                  </div>

                  {resultado.usarLanceEmbutido && (
                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                      <p className="text-xs text-emerald-700 font-semibold mb-2">✨ Lance Embutido</p>
                      <p className="text-2xl font-bold text-emerald-900">{formatCurrency(resultado.lanceEmbutido)}</p>
                      <p className="text-xs text-emerald-700 mt-1">{resultado.lanceEmbutidoPercentual}% do crédito total</p>
                    </div>
                  )}
                  {resultado.usarLanceProprio && (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                      <p className="text-xs text-purple-700 font-semibold mb-2">💎 Lance Próprio</p>
                      <p className="text-2xl font-bold text-purple-900">{formatCurrency(resultado.lanceProprio)}</p>
                      <p className="text-xs text-purple-700 mt-1">
                        {lanceProprioPercentual}% do crédito total
                      </p>
                    </div>
                  )}
                  {resultado.usarLanceEmbutido && resultado.usarLanceProprio && (
                    <div className="p-3 bg-slate-100 rounded-lg border border-slate-300 flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-700">Lance Total:</span>
                      <span className="text-lg font-bold text-slate-900">{formatCurrency(resultado.lanceTotal)}</span>
                    </div>
                  )}

                  {(resultado.aplicarRegraCanopus || resultado.usarLanceProprio || resultado.usarLanceEmbutido || resultado.temPlanoDecrescente) && (
                  <div className="p-3 bg-slate-50 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total do Plano:</span>
                      <span className="font-semibold">{formatCurrency(resultado.totalPlano)}</span>
                    </div>
                    {resultado.usarLanceProprio && resultado.temPlanoDecrescente && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-600">(-) Lance Próprio:</span>
                          <span className="font-semibold text-purple-700">- {formatCurrency(resultado.lanceProprio)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Fator de redução aplicado:</span>
                          <span>{resultado.descontoPorParcela?.toFixed(6)}</span>
                        </div>
                      </>
                    )}
                    {resultado.usarLanceEmbutido && resultado.lanceEmbutidoDescontaNoSaldo && (
                     <div className="flex justify-between">
                       <span className="text-slate-600">(-) Lance Embutido ({resultado.lanceEmbutidoPercentual}%):</span>
                       <span className="font-semibold text-emerald-700">- {formatCurrency(resultado.lanceEmbutido)}</span>
                     </div>
                    )}
                    {resultado.usarLanceEmbutido && !resultado.lanceEmbutidoDescontaNoSaldo && (
                     <div className="flex justify-between text-xs text-emerald-700">
                       <span>✨ Lance Embutido já incluso no plano (não desconta do saldo devedor)</span>
                       <span className="font-semibold">{formatCurrency(resultado.lanceEmbutido)}</span>
                     </div>
                    )}
                    {resultado.usarLanceProprio && !resultado.temPlanoDecrescente && resultado.modoReducao !== '5050' && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">(-) Lance Próprio:</span>
                        <span className="font-semibold text-purple-700">- {formatCurrency(resultado.lanceProprio)}</span>
                      </div>
                    )}
                    {resultado.usarLanceProprio && !resultado.temPlanoDecrescente && resultado.modoReducao === '5050' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-600">(-) 50% no Prazo:</span>
                          <span className="font-semibold text-green-700">- {formatCurrency(resultado.lanceProprio / 2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">(-) 50% na Parcela:</span>
                          <span className="font-semibold text-green-700">- {formatCurrency(resultado.lanceProprio / 2)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Meses quitados:</span>
                          <span>{resultado.parcelasJaPagas} meses</span>
                        </div>
                      </>
                    )}
                    {!resultado.temPlanoDecrescente && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">(-) 1ª Parcela (no ato):</span>
                        <span className="font-semibold text-orange-700">- {formatCurrency(resultado.valorParcelaReduzida)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t pt-2 mt-1">
                      <span className="text-slate-700 font-semibold">Saldo Restante:</span>
                      <span className="font-bold text-slate-900">{formatCurrency(resultado.saldoDevedor)}</span>
                    </div>
                    {resultado.temPlanoDecrescente && resultado.carenciaDecrescente > 0 && (
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="text-slate-500 text-xs">1 no ato + {resultado.carenciaDecrescente} carência</span>
                        <span className="text-slate-500 text-xs font-semibold">= {resultado.prazoOriginal} - {1 + resultado.carenciaDecrescente} = {resultado.novoPrazo} meses</span>
                      </div>
                    )}
                    {resultado.aplicarRegraCanopus && !resultado.temPlanoDecrescente && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Carência:</span>
                          <span className="font-semibold">{parcelasCarencia} meses</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">Parcelas Restantes:</span>
                          <span className="font-semibold">{resultado.novoPrazo} meses</span>
                        </div>
                      </>
                    )}
                  </div>
                  )}

                  <div className="p-4 bg-purple-50 rounded-lg border-2 border-purple-300">
                     <p className="text-xs text-purple-700 font-semibold mb-3">✨ Resultado Final</p>
                     <div className="space-y-2">
                       <div className="flex justify-between items-center">
                         <span className="text-purple-700 text-sm">Novo Prazo:</span>
                         <span className="font-bold text-purple-900 text-xl">{resultado.novoPrazo} meses</span>
                       </div>
                       {resultado.temPlanoDecrescente ? (
                         <>
                           <div className="mt-1 mb-2">
                             <p className="text-xs text-purple-600 font-semibold">📉 Plano Decrescente — Parcelas Restantes</p>
                           </div>
                           <div className="bg-white rounded-lg border border-purple-200 divide-y divide-purple-100 text-sm">
                             <>
                               <div className="flex justify-between items-center px-3 py-2">
                                 <span className="text-slate-500 text-xs">Parcela 1 (no ato):</span>
                                 <span className="text-slate-400 text-xs line-through">Já paga</span>
                               </div>
                               {/* Parcelas na carência: não cobradas */}
                               {resultado.numParcelasCarencia > 0 && (
                                 <div className="flex justify-between items-center px-3 py-2 bg-yellow-50">
                                   <span className="text-yellow-700 text-xs">Parcelas 2 a {1 + resultado.numParcelasCarencia} (carência):</span>
                                   <span className="text-yellow-600 text-xs font-semibold">Não cobradas</span>
                                 </div>
                               )}
                               {/* Parcelas após carência até 10 com novo valor */}
                               <div className="flex justify-between items-center px-3 py-2">
                                 <span className="text-purple-700">Parcelas {1 + resultado.numParcelasCarencia + 1} a 10:</span>
                                 <span className="font-bold text-purple-900">{formatCurrency(resultado.novaParcela)}</span>
                               </div>
                               {resultado.novaParcelaMeio !== null && (
                                 <div className="flex justify-between items-center px-3 py-2">
                                   <span className="text-purple-700">Parcelas 11 a {resultado.prazoOriginal - 1}:</span>
                                   <span className="font-bold text-purple-900">{formatCurrency(resultado.novaParcelaMeio)}</span>
                                 </div>
                               )}
                               <div className="flex justify-between items-center px-3 py-2">
                                 <span className="text-purple-700">Parcela {resultado.prazoOriginal} (última):</span>
                                 <span className="font-bold text-purple-900">{formatCurrency(resultado.novaUltimaParcela)}</span>
                               </div>
                             </>
                           </div>
                         </>
                       ) : (
                         <div className="flex justify-between items-center">
                           <span className="text-purple-700 text-sm">Nova Parcela:</span>
                           <span className="font-bold text-purple-900 text-xl">{formatCurrency(resultado.novaParcela)}</span>
                         </div>
                       )}
                     </div>
                   </div>
                  <Button
                    onClick={() => gerarSimulacaoMutation.mutate()}
                    disabled={gerarSimulacaoMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 gap-2"
                  >
                    {gerarSimulacaoMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Gerando...</>
                    ) : (
                      <><Download className="w-4 h-4" />Gerar e Enviar ao Funil</>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal Cadastro Menor Lance */}
      <CadastroMenorLanceModal
        open={cadastroLanceOpen}
        onOpenChange={setCadastroLanceOpen}
        empresaId={empresaId}
        onSaved={() => setCadastroLanceOpen(false)}
      />

      {/* Modal Seleção de Plano */}
      <SelecionarPlanoCanopusModal
        open={planoModalOpen}
        onOpenChange={setPlanoModalOpen}
        onSelectPlano={handleSelecionarPlano}
        empresaId={empresaId}
      />
    </div>
  );
}