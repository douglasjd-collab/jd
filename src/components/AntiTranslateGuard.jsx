import { useEffect } from "react";

function setNoTranslate() {
  try {
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");
    if (document.body) {
      document.body.setAttribute("translate", "no");
      document.body.classList.add("notranslate");
    }

    // meta notranslate
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
  } catch {}
}

function unwrapFonts(root) {
  if (!root || !root.querySelectorAll) return;
  const fonts = root.querySelectorAll("font");
  if (!fonts.length) return;

  fonts.forEach((f) => {
    const p = f.parentNode;
    if (!p) return;

    while (f.firstChild) p.insertBefore(f.firstChild, f);
    p.removeChild(f);
  });
}

export default function AntiTranslateGuard() {
  useEffect(() => {
    // roda imediatamente e em intervalos curtos no começo
    setNoTranslate();
    unwrapFonts(document.body);

    const t = setInterval(() => {
      setNoTranslate();
      unwrapFonts(document.body);
    }, 300);

    // depois de 6s, para o intervalo (já estabilizou)
    const stop = setTimeout(() => clearInterval(t), 6000);

    // observa mudanças e remove <font> assim que aparecer
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes?.forEach((n) => {
            if (n?.nodeType === 1) {
              if (n.tagName === "FONT") unwrapFonts(n.parentNode);
              else unwrapFonts(n);
            }
          });
        }
      }
    });

    if (document.body) obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearInterval(t);
      clearTimeout(stop);
      obs.disconnect();
    };
  }, []);

  return null;
}