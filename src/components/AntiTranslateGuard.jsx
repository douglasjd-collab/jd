import { useEffect } from "react";

export default function AntiTranslateGuard() {
  useEffect(() => {
    // 1) Sinalizações padrão contra translate
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    document.body.setAttribute("translate", "no");
    document.body.classList.add("notranslate");

    // meta tags "notranslate"
    const ensureMeta = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) {
        meta = document.createElement("meta");
        meta.name = name;
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    ensureMeta("google", "notranslate");
    ensureMeta("googlebot", "notranslate");

    // 2) Remover <font> tags de forma mais agressiva
    const unwrapFonts = () => {
      try {
        const fonts = document.querySelectorAll("font");
        fonts.forEach((f) => {
          const parent = f.parentNode;
          if (!parent) return;
          
          // Move todos os filhos para fora do <font>
          const fragment = document.createDocumentFragment();
          while (f.firstChild) {
            fragment.appendChild(f.firstChild);
          }
          
          // Substitui <font> pelo fragment
          parent.replaceChild(fragment, f);
        });
      } catch (e) {
        console.warn("Erro ao remover <font>:", e);
      }
    };

    // 3) Executar imediatamente e repetir
    unwrapFonts();
    
    // Verificar a cada 50ms se apareceram novas tags <font>
    const intervalId = setInterval(unwrapFonts, 50);

    // 4) MutationObserver para capturar mudanças em tempo real
    const obs = new MutationObserver(() => {
      unwrapFonts();
    });

    obs.observe(document.body, { 
      childList: true, 
      subtree: true,
      characterData: true,
      attributes: true
    });

    return () => {
      clearInterval(intervalId);
      obs.disconnect();
    };
  }, []);

  return null;
}