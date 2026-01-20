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

    // 2) Se o tradutor injetar <font>, removemos mantendo o texto
    const unwrapFonts = (root) => {
      if (!root) return;
      const fonts = root.querySelectorAll?.("font");
      if (!fonts || fonts.length === 0) return;

      fonts.forEach((f) => {
        // troca <font>texto</font> por "texto" (preserva conteúdo)
        const parent = f.parentNode;
        if (!parent) return;

        while (f.firstChild) {
          parent.insertBefore(f.firstChild, f);
        }
        parent.removeChild(f);
      });
    };

    // Rodar uma vez no carregamento
    unwrapFonts(document.body);

    // 3) Observar mudanças: se aparecer <font>, remove na hora
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes?.forEach((n) => {
            if (n.nodeType === 1) {
              // Element
              if (n.tagName === "FONT") {
                unwrapFonts(n.parentNode);
              } else {
                unwrapFonts(n);
              }
            }
          });
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });

    return () => obs.disconnect();
  }, []);

  return null;
}