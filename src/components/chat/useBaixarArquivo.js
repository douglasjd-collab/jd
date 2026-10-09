import { useState, useCallback, useRef } from 'react';
import { baixarArquivo } from './baixarArquivo';

// Hook de download para botões de visualizador: gerencia o estado "Baixando...",
// apresenta o erro e permite tentar novamente. Um clique gera um único download.
export function useBaixarArquivo() {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');
  const chamandoRef = useRef(false);

  const baixar = useCallback(async (url, nome) => {
    if (!url || chamandoRef.current || baixando) return false;
    chamandoRef.current = true;
    setBaixando(true);
    setErro('');
    try {
      const ok = await baixarArquivo(url, nome);
      if (!ok) setErro('Não foi possível baixar o arquivo. Tente novamente.');
      return ok;
    } finally {
      setBaixando(false);
      chamandoRef.current = false;
    }
  }, [baixando]);

  const limparErro = useCallback(() => setErro(''), []);

  return { baixando, erro, baixar, limparErro };
}