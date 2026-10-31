import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Sticker, Plus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Figurinhas no estilo "Joinha" — personagem com boné e óculos
const FIGURINHAS = [
  {
    id: 'joinha',
    label: 'Joinha',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/3911acfc5_exec-febfd105-0c47-40eb-9f8e-03e8fe728026.png',
    nome: 'sticker_joinha.png',
  },
  {
    id: 'bom_dia',
    label: 'Bom dia',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/f9fc0fde7_exec-61780b3a-21bf-4ad8-8008-a4e581138495.png',
    nome: 'sticker_bom_dia.png',
  },
  {
    id: 'boa_tarde',
    label: 'Boa tarde',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/457e5b33a_exec-0e0262cd-9231-43db-ab01-8b5f6f68b914.png',
    nome: 'sticker_boa_tarde.png',
  },
  {
    id: 'boa_noite',
    label: 'Boa noite',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/9253f5874_exec-1579e045-eaa5-426d-bde4-c449457e1e4c.png',
    nome: 'sticker_boa_noite.png',
  },
  {
    id: 'tchau',
    label: 'Até logo (finalizar)',
    url: 'https://media.base44.com/images/public/6950a9860c8af0e2ff10fc9e/225722926_exec-3f115dbf-932c-4e4e-85c4-0594dfe6ea21.png',
    nome: 'sticker_ate_logo.png',
  },
];

export default function StickerPicker({ onEnviar, isLoading = false, empresaId }) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(null);

  const [excluindo, setExcluindo] = useState(null);
  const excluirFigurinha = async (fig) => {
    if (!empresaId || excluindo || enviando || !window.confirm('Excluir a figurinha "' + fig.label + '" da coleção da empresa?')) return;
    setExcluindo(fig.id);
    try {
      if (fig.personalizada) {
        await base44.entities.Figurinha.delete(fig.id);
      } else {
        // Registra a remoção dos itens originais somente para esta empresa.
        await base44.entities.Figurinha.create({ empresa_id: empresaId, nome: '__oculta_padrao__' + fig.id, url: fig.url });
      }
      await queryClient.invalidateQueries({ queryKey: ['figurinhas', empresaId] });
      toast.success('Figurinha excluída da coleção.');
    } catch {
      toast.error('Não foi possível excluir a figurinha. Tente novamente.');
    } finally { setExcluindo(null); }
  };

  const inputRef = useRef(null);
  const [adicionando, setAdicionando] = useState(false);
  const queryClient = useQueryClient();
  const { data: personalizadas = [], isError: erroCarregamento } = useQuery({
    queryKey: ['figurinhas', empresaId],
    enabled: aberto && !!empresaId,
    queryFn: () => base44.entities.Figurinha.filter({ empresa_id: empresaId }, '-created_date', 500),
  });
  const adicionarFigurinhas = async (event) => {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    if (!empresaId || !arquivos.length || adicionando) return;
    setAdicionando(true);
    let salvas = 0;
    try {
      for (const arquivo of arquivos) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(arquivo.type) || arquivo.size > 5 * 1024 * 1024) {
          toast.error(arquivo.name + ': use PNG, JPG ou WebP de até 5 MB.');
          continue;
        }
        // Não remove cores da imagem importada; mantém proporção e transparência.
        const local = URL.createObjectURL(arquivo);
        try {
          const blob = await prepararFigurinha(local, false);
          const file = new File([blob], 'figurinha.webp', { type: 'image/webp' });
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          if (!file_url) throw new Error('Upload não retornou o arquivo');
          await base44.entities.Figurinha.create({
            empresa_id: empresaId, nome: arquivo.name.replace(/\.[^.]+$/, ''), url: file_url,
          });
          salvas++;
        } finally { URL.revokeObjectURL(local); }
      }
    } catch {
      toast.error('Não foi possível salvar todas as figurinhas. Tente novamente.');
    } finally {
      if (salvas) {
        toast.success(salvas + ' figurinha(s) adicionada(s)!');
        await queryClient.invalidateQueries({ queryKey: ['figurinhas', empresaId] });
      }
      setAdicionando(false);
    }
  };

  // Prepara uma figurinha real: WebP de 512 px e fundo transparente.
  // O recorte remove somente o fundo conectado à borda; assim, o boné, óculos
  // e camisa escuros do personagem não desaparecem.
  const prepararFigurinha = async (url, removerFundo = true) => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Falha ao baixar figurinha');
    const objectUrl = URL.createObjectURL(await resp.blob());

    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = objectUrl;
      });

      const size = 512;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const escala = Math.min(size / img.width, size / img.height);
      const largura = img.width * escala, altura = img.height * escala;
      ctx.drawImage(img, (size - largura) / 2, (size - altura) / 2, largura, altura);

      const imageData = ctx.getImageData(0, 0, size, size);
      const { data } = imageData;
      const visitado = new Uint8Array(size * size);
      const fila = [];
      const colocarSeFundo = (x, y) => {
        const pos = y * size + x;
        if (visitado[pos]) return;
        const i = pos * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Fundo preto/cinza quase neutro, sem apagar detalhes escuros internos.
        if (Math.max(r, g, b) < 60 && Math.max(r, g, b) - Math.min(r, g, b) < 18) {
          visitado[pos] = 1;
          fila.push(pos);
        }
      };

      if (removerFundo) {
      for (let x = 0; x < size; x++) { colocarSeFundo(x, 0); colocarSeFundo(x, size - 1); }
      for (let y = 1; y < size - 1; y++) { colocarSeFundo(0, y); colocarSeFundo(size - 1, y); }

      for (let cursor = 0; cursor < fila.length; cursor++) {
        const pos = fila[cursor];
        const x = pos % size, y = Math.floor(pos / size);
        data[pos * 4 + 3] = 0;
        if (x > 0) colocarSeFundo(x - 1, y);
        if (x < size - 1) colocarSeFundo(x + 1, y);
        if (y > 0) colocarSeFundo(x, y - 1);
        if (y < size - 1) colocarSeFundo(x, y + 1);
      }
      ctx.putImageData(imageData, 0, 0);
      }

      const webpBlob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
      if (!webpBlob || !webpBlob.size) throw new Error('Seu navegador não conseguiu preparar a figurinha');
      return webpBlob;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const lerBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',').pop());
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const enviarFigurinha = async (fig) => {
    if (isLoading || enviando) return;
    setEnviando(fig.id);
    try {
      const blob = await prepararFigurinha(fig.url, !fig.personalizada);
      const nome = fig.nome.replace(/\.png$/, '.webp');
      const base64 = await lerBase64(blob);
      onEnviar({
        texto: '',
        arquivo: {
          nome,
          tipo: 'image/webp',
          base64,
          tamanho: blob.size || 0,
          is_sticker: true,
        },
      });
      setAberto(false);
    } catch (err) {
      console.error('Erro ao enviar figurinha:', err);
      toast.error('Não foi possível preparar a figurinha para envio.');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="pb-1 pr-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setAberto((prev) => !prev)}
        className={`rounded-full w-9 h-9 transition-all ${aberto ? 'text-purple-600' : 'text-slate-400 hover:text-purple-600'}`}
        title="Figurinhas"
      >
        <Sticker className="w-5 h-5" />
      </Button>

      {aberto && (
        <>
          {/* Backdrop para fechar ao clicar fora */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setAberto(false)}
          />
          <div className="absolute bottom-full left-0 right-0 mb-2 mx-3 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 z-40">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Sticker className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-slate-600">Figurinhas</span>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={adicionarFigurinhas} />
              <Button type="button" variant="outline" size="sm" className="ml-auto gap-1 text-purple-600 text-xs" disabled={!empresaId || adicionando} onClick={() => inputRef.current?.click()}>
                {adicionando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                {adicionando ? 'Adicionando...' : 'Adicionar figurinhas'}
              </Button>
            </div>
            {erroCarregamento && <p className="text-xs text-red-500 mb-2">Não foi possível carregar as figurinhas salvas. Feche e abra para tentar novamente.</p>}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-h-[45vh] overflow-y-auto">
              {[...FIGURINHAS.filter(f => !personalizadas.some(p => p.nome === '__oculta_padrao__' + f.id)), ...personalizadas.filter(f => !f.nome?.startsWith('__oculta_padrao__')).map(f => ({ id: f.id, label: f.nome, nome: 'figurinha.webp', url: f.url, personalizada: true }))].map((fig) => (
                <div key={fig.id} className="relative">
                <button
                  type="button"
                  disabled={!!enviando || !!excluindo}
                  onClick={() => enviarFigurinha(fig)}
                  className="group relative w-full aspect-square rounded-xl overflow-hidden border border-slate-200 hover:border-purple-400 hover:shadow-md transition-all disabled:opacity-50"
                  title={fig.label}
                >
                  <img
                    src={fig.url}
                    alt={fig.label}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                  {enviando === fig.id && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </button>
                <button type="button" title={'Excluir ' + fig.label} aria-label={'Excluir ' + fig.label}
                  disabled={!empresaId || !!excluindo || !!enviando || adicionando}
                  onClick={() => excluirFigurinha(fig)}
                  className="absolute top-1 right-1 p-2 rounded-full bg-white border border-red-100 text-red-500 hover:bg-red-50 shadow-sm disabled:opacity-50">
                  {excluindo === fig.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Toque em uma figurinha para enviar
            </p>
          </div>
        </>
      )}
    </div>
  );
}