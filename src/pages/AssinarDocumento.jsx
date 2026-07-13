import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck, FileText, CheckCircle2, XCircle } from 'lucide-react';
import AssinaturaCanvas from '@/components/assinatura/AssinaturaCanvas';
import CapturaCamera from '@/components/assinatura/CapturaCamera';

const ROLE_LABELS = { cliente: 'Cliente', testemunha1: 'Testemunha 1', testemunha2: 'Testemunha 2', representante: 'Representante da empresa' };

const CLIENTE_ACEITES = [
  'Confirmo que conferi meu nome, CPF e dados pessoais.',
  'Confirmo que conferi o banco e o tipo de operação.',
  'Confirmo que conferi o valor, a parcela e o prazo.',
  'Confirmo que solicitei esta operação de forma livre e consciente.',
  'Autorizo a empresa identificada no termo a intermediar e acompanhar esta operação.',
  'Estou ciente de que a aprovação e as condições finais dependem da instituição financeira.',
];

const TESTEMUNHA_ACEITES = [
  'Li o documento.',
  'Identifico o(a) autorizante indicado(a) neste documento.',
  'Declaro que acompanhei ou presenciei sua manifestação de vontade.',
  'Estou assinando esta declaração de forma livre.',
];

const getDeviceInfo = () => ({
  navegador: navigator.userAgent,
  sistema_operacional: navigator.platform || '',
  idioma: navigator.language,
  resolucao_tela: `${window.screen.width}x${window.screen.height}`,
});

export default function AssinarDocumento() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [info, setInfo] = useState(null);
  // identidade -> selfie -> rg_frente -> rg_verso -> resumo -> doc -> aceites -> frase -> assinatura -> concluido
  const [step, setStep] = useState('identidade');
  const [enviandoEvidencia, setEnviandoEvidencia] = useState(false);
  const [aceites, setAceites] = useState([]);
  const [frase, setFrase] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [recusando, setRecusando] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (step === 'doc' && token) {
      base44.functions.invoke('assinaturaPublica', { action: 'registrar_evento', token, evento: 'termo_visualizado', device: getDeviceInfo() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('assinaturaPublica', { action: 'status', token });
      setInfo(res.data);
      if (res.data.error) {
        setErro(res.data.error);
      } else {
        const ev = res.data.evidencias || {};
        setStep(ev.selfie && ev.rg_frente && ev.rg_verso ? 'doc' : 'identidade');
      }
    } catch (e) {
      setErro('Não foi possível carregar este link.');
    } finally {
      setLoading(false);
    }
  };

  const toggleAceite = (texto) => {
    setAceites((prev) => (prev.includes(texto) ? prev.filter((a) => a !== texto) : [...prev, texto]));
  };

  const listaAceites = info?.role === 'cliente' ? CLIENTE_ACEITES : TESTEMUNHA_ACEITES;
  const todosAceitos = listaAceites.every((a) => aceites.includes(a));
  const exigeFrase = info?.role === 'cliente';

  const enviarEvidencia = async (tipoEvidencia, dataUrl, proximoStep) => {
    setEnviandoEvidencia(true);
    try {
      const res = await base44.functions.invoke('assinaturaPublica', {
        action: 'enviar_evidencia', token, tipo: tipoEvidencia, data_url: dataUrl, device: getDeviceInfo(),
      });
      if (res.data.error) {
        setErro(res.data.error);
        return;
      }
      setStep(proximoStep);
    } catch (e) {
      setErro('Erro ao enviar a captura. Tente novamente.');
    } finally {
      setEnviandoEvidencia(false);
    }
  };

  const handleAssinar = async () => {
    if (!canvasRef.current || canvasRef.current.isEmpty()) return;
    setEnviando(true);
    try {
      const dataUrl = canvasRef.current.getDataURL();
      const res = await base44.functions.invoke('assinaturaPublica', { action: 'assinar', token, assinatura_data_url: dataUrl, device: getDeviceInfo() });
      if (res.data.error) {
        setErro(res.data.error);
      } else {
        setConcluido(true);
      }
    } catch (e) {
      setErro('Erro ao registrar sua assinatura. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  const handleRecusar = async (motivo) => {
    setEnviando(true);
    try {
      await base44.functions.invoke('assinaturaPublica', { action: 'recusar', token, motivo, device: getDeviceInfo() });
      setErro('Você optou por não assinar este documento. O responsável pela proposta foi notificado.');
    } finally {
      setEnviando(false);
      setRecusando(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  if (erro) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-3">
          <XCircle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-slate-700 font-medium">{erro}</p>
        </div>
      </div>
    );
  }

  if (concluido) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-slate-800">Assinatura concluída com sucesso.</h1>
          <p className="text-slate-500 text-sm">Sua confirmação foi registrada e vinculada ao Termo de Autorização.</p>
        </div>
      </div>
    );
  }

  if (!info?.pode_assinar) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-3">
          <ShieldCheck className="w-10 h-10 text-amber-500 mx-auto" />
          <p className="text-slate-700 font-medium">Esta assinatura ainda não está liberada.</p>
          <p className="text-slate-500 text-sm">Aguarde a conclusão da(s) assinatura(s) anterior(es) e tente novamente mais tarde.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Assinatura Eletrônica</p>
          <h1 className="text-lg font-bold text-slate-800">Termo de Autorização</h1>
          <p className="text-sm text-slate-500">Signatário: {ROLE_LABELS[info.role]}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 text-sm">
          <p><span className="font-semibold text-slate-500">Cliente:</span> {info.cliente_nome}</p>
          <p><span className="font-semibold text-slate-500">Banco:</span> {info.banco}</p>
          <p><span className="font-semibold text-slate-500">Operação:</span> {info.tipo_operacao}</p>
          <p><span className="font-semibold text-slate-500">Contrato:</span> {info.contrato}</p>
        </div>

        {step === 'identidade' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 text-center">
            <ShieldCheck className="w-10 h-10 text-[#23BE84] mx-auto" />
            <h2 className="font-semibold text-slate-800">Confirmação de Identidade</h2>
            <p className="text-sm text-slate-600">
              Para proteger sua identidade e evitar assinaturas realizadas por terceiros, será necessário confirmar sua identidade antes da assinatura.
            </p>
            <Button className="w-full bg-[#23BE84] hover:bg-[#1da570]" onClick={() => setStep('selfie')}>
              Iniciar confirmação de identidade
            </Button>
          </div>
        )}

        {step === 'selfie' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <CapturaCamera
              titulo="Etapa 1 — Selfie"
              instrucao="Capture uma selfie em tempo real. Posicione seu rosto dentro da câmera."
              facingModeInicial="user"
              confirmando={enviandoEvidencia}
              onConfirmar={(dataUrl) => enviarEvidencia('selfie', dataUrl, 'rg_frente')}
            />
          </div>
        )}

        {step === 'rg_frente' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <CapturaCamera
              titulo="Frente do RG"
              instrucao="Fotografe a frente do seu documento."
              facingModeInicial="environment"
              confirmando={enviandoEvidencia}
              onConfirmar={(dataUrl) => enviarEvidencia('rg_frente', dataUrl, 'rg_verso')}
            />
          </div>
        )}

        {step === 'rg_verso' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <CapturaCamera
              titulo="Verso do RG"
              instrucao="Fotografe o verso do seu documento."
              facingModeInicial="environment"
              confirmando={enviandoEvidencia}
              onConfirmar={(dataUrl) => enviarEvidencia('rg_verso', dataUrl, 'resumo')}
            />
          </div>
        )}

        {step === 'resumo' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold text-slate-700">Identidade confirmada</h2>
            <div className="space-y-1.5 text-sm text-green-700">
              <p className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Selfie</p>
              <p className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Frente do RG</p>
              <p className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Verso do RG</p>
            </div>
            <Button className="w-full bg-[#23BE84] hover:bg-[#1da570]" onClick={() => setStep('doc')}>
              Continuar para leitura do documento
            </Button>
          </div>
        )}

        {step === 'doc' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold text-slate-700 flex items-center gap-1.5"><FileText className="w-4 h-4" /> Termo de Autorização</h2>
            {info.termo_pdf_url ? (
              <iframe src={info.termo_pdf_url} title="Termo de Autorização" className="w-full h-80 rounded-lg border" />
            ) : (
              <p className="text-sm text-slate-500">Documento indisponível.</p>
            )}
            <Button className="w-full bg-[#23BE84] hover:bg-[#1da570]" onClick={() => setStep('aceites')}>
              Já li o documento — Continuar
            </Button>
          </div>
        )}

        {step === 'aceites' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold text-slate-700">Confirme as declarações abaixo</h2>
            <div className="space-y-2">
              {listaAceites.map((texto) => (
                <label key={texto} className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={aceites.includes(texto)} onCheckedChange={() => toggleAceite(texto)} className="mt-0.5" />
                  <span>{texto}</span>
                </label>
              ))}
            </div>
            <Button
              className="w-full bg-[#23BE84] hover:bg-[#1da570]"
              disabled={!todosAceitos}
              onClick={() => setStep(exigeFrase ? 'frase' : 'assinatura')}
            >
              Continuar
            </Button>
          </div>
        )}

        {step === 'frase' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold text-slate-700">Digite exatamente a frase abaixo</h2>
            <p className="text-center font-bold tracking-wide text-slate-800">EU LI E AUTORIZO</p>
            <Input value={frase} onChange={(e) => setFrase(e.target.value)} placeholder="Digite aqui" />
            <Button
              className="w-full bg-[#23BE84] hover:bg-[#1da570]"
              disabled={frase.trim().toUpperCase() !== 'EU LI E AUTORIZO'}
              onClick={() => setStep('assinatura')}
            >
              Continuar
            </Button>
          </div>
        )}

        {step === 'assinatura' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-semibold text-slate-700">Assine dentro do espaço abaixo</h2>
            <AssinaturaCanvas ref={canvasRef} />
            <Button className="w-full bg-[#23BE84] hover:bg-[#1da570] gap-1.5" disabled={enviando} onClick={handleAssinar}>
              {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
              Assinar e concluir
            </Button>
          </div>
        )}

        <div className="text-center">
          {!recusando ? (
            <button className="text-xs text-red-500 underline" onClick={() => setRecusando(true)}>
              Não reconheço ou não desejo assinar
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-red-200 p-4 space-y-2 text-left">
              <p className="text-sm font-medium text-slate-700">Selecione o motivo:</p>
              {['Não reconheço esta solicitação', 'Os dados estão incorretos', 'Não concordo com as condições', 'Não solicitei esta operação', 'Outro motivo'].map((m) => (
                <Button key={m} variant="outline" size="sm" className="w-full justify-start" disabled={enviando} onClick={() => handleRecusar(m)}>
                  {m}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}