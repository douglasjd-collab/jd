import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, RotateCcw, Check, SwitchCamera, Loader2, Image as ImageIcon } from 'lucide-react';

// Captura de foto pela câmera do dispositivo. Quando permitirGaleria=true (usado apenas
// para frente/verso do RG), também permite escolher uma imagem já existente da galeria.
export default function CapturaCamera({ titulo, instrucao, facingModeInicial = 'user', onConfirmar, confirmando, permitirGaleria = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const galeriaInputRef = useRef(null);
  const [facingMode, setFacingMode] = useState(facingModeInicial);
  const [foto, setFoto] = useState(null);
  const [erro, setErro] = useState(null);

  const escolherDaGaleria = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    pararStream();
    const reader = new FileReader();
    reader.onload = () => setFoto(reader.result);
    reader.readAsDataURL(file);
  };

  const pararStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const iniciarCamera = useCallback(async () => {
    setErro(null);
    pararStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setErro('Não foi possível acessar a câmera. Verifique as permissões do navegador.');
    }
  }, [facingMode]);

  useEffect(() => {
    if (!foto) iniciarCamera();
    return () => pararStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, foto]);

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    setFoto(canvas.toDataURL('image/jpeg', 0.9));
    pararStream();
  };

  return (
    <div className="space-y-3">
      {titulo && <h2 className="font-semibold text-slate-700">{titulo}</h2>}
      {instrucao && <p className="text-sm text-slate-500">{instrucao}</p>}

      {!foto ? (
        <div className="space-y-2">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4] flex items-center justify-center">
            {erro ? (
              <p className="text-red-300 text-sm p-4 text-center">{erro}</p>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="gap-1.5 flex-1" onClick={() => setFacingMode((f) => (f === 'user' ? 'environment' : 'user'))}>
              <SwitchCamera className="w-4 h-4" /> Trocar câmera
            </Button>
            <Button type="button" className="gap-1.5 flex-1 bg-[#23BE84] hover:bg-[#1da570]" disabled={!!erro} onClick={capturar}>
              <Camera className="w-4 h-4" /> Capturar
            </Button>
          </div>
          {permitirGaleria && (
            <>
              <Button type="button" variant="outline" className="gap-1.5 w-full" onClick={() => galeriaInputRef.current?.click()}>
                <ImageIcon className="w-4 h-4" /> Escolher da galeria
              </Button>
              <input ref={galeriaInputRef} type="file" accept="image/*" className="hidden" onChange={escolherDaGaleria} />
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="rounded-lg overflow-hidden aspect-[3/4] bg-black">
            <img src={foto} alt="Foto capturada" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="gap-1.5 flex-1" onClick={() => setFoto(null)} disabled={confirmando}>
              <RotateCcw className="w-4 h-4" /> Refazer
            </Button>
            <Button type="button" className="gap-1.5 flex-1 bg-[#23BE84] hover:bg-[#1da570]" disabled={confirmando} onClick={() => onConfirmar(foto)}>
              {confirmando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}