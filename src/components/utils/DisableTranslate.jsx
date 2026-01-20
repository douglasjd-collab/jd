import { useEffect } from "react";

export default function DisableTranslate() {
  useEffect(() => {
    // 1) Evita tradução no HTML inteiro
    document.documentElement.setAttribute("translate", "no");
    document.documentElement.classList.add("notranslate");

    // 2) Meta tag que bloqueia Google Translate
    let meta = document.querySelector('meta[name="google"][content="notranslate"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "google";
      meta.content = "notranslate";
      document.head.appendChild(meta);
    }

    // 3) Também bloqueia o translate no body
    document.body.setAttribute("translate", "no");
    document.body.classList.add("notranslate");

    return () => {
      // Não remove para manter permanente durante navegação
    };
  }, []);

  return null;
}