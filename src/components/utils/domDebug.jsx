export function installDomDebug() {
  if (typeof window === "undefined") return;

  // Evita instalar 2x
  if (window.__DOM_DEBUG_INSTALLED__) return;
  window.__DOM_DEBUG_INSTALLED__ = true;

  // Painel fixo na tela (aparece mesmo com React morto)
  const panel = document.createElement("div");
  panel.id = "__dom_debug_panel__";
  panel.style.position = "fixed";
  panel.style.right = "12px";
  panel.style.bottom = "12px";
  panel.style.width = "520px";
  panel.style.maxWidth = "calc(100vw - 24px)";
  panel.style.maxHeight = "55vh";
  panel.style.overflow = "auto";
  panel.style.zIndex = "2147483647";
  panel.style.background = "white";
  panel.style.border = "1px solid #e2e8f0";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 10px 30px rgba(0,0,0,.15)";
  panel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
  panel.style.fontSize = "12px";
  panel.style.padding = "12px";
  panel.style.display = "none";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.marginBottom = "8px";
  header.innerHTML = `<strong style="color:#0f172a">DOM DEBUG</strong>`;

  const btns = document.createElement("div");
  const btnClear = document.createElement("button");
  btnClear.textContent = "Limpar";
  btnClear.style.padding = "6px 10px";
  btnClear.style.borderRadius = "8px";
  btnClear.style.border = "1px solid #e2e8f0";
  btnClear.style.background = "#f8fafc";
  btnClear.style.cursor = "pointer";

  const btnHide = document.createElement("button");
  btnHide.textContent = "Fechar";
  btnHide.style.padding = "6px 10px";
  btnHide.style.borderRadius = "8px";
  btnHide.style.border = "1px solid #e2e8f0";
  btnHide.style.background = "#0f172a";
  btnHide.style.color = "white";
  btnHide.style.cursor = "pointer";
  btnHide.style.marginLeft = "8px";

  btns.appendChild(btnClear);
  btns.appendChild(btnHide);
  header.appendChild(btns);

  const body = document.createElement("pre");
  body.style.whiteSpace = "pre-wrap";
  body.style.wordBreak = "break-word";
  body.style.margin = "0";
  body.style.color = "#0f172a";

  panel.appendChild(header);
  panel.appendChild(body);
  document.documentElement.appendChild(panel);

  function showPanel(text) {
    panel.style.display = "block";
    body.textContent = text;
  }

  btnHide.onclick = () => (panel.style.display = "none");
  btnClear.onclick = () => (body.textContent = "");

  function formatError(title, err) {
    const stack = err?.stack ? String(err.stack) : "";
    const msg = err?.message ? String(err.message) : String(err || "");
    return `[${new Date().toISOString()}] ${title}\n${msg}\n\n${stack}\n`;
  }

  // Captura erro global
  window.addEventListener("error", (e) => {
    const err = e.error || new Error(e.message);
    const text = formatError("window.error", err);
    console.error(text);
    showPanel(text);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
    const text = formatError("unhandledrejection", err);
    console.error(text);
    showPanel(text);
  });

  // Patch removeChild pra mostrar quem é o pai/filho e onde estourou
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    try {
      return originalRemoveChild.call(this, child);
    } catch (err) {
      const extra =
        "\n--- removeChild debug ---\n" +
        "Parent: " + (this?.nodeName || "") + "\n" +
        "Child: " + (child?.nodeName || "") + "\n" +
        "Parent innerHTML (inicio):\n" +
        String(this?.innerHTML || "").slice(0, 1200) +
        "\n-------------------------\n";

      const text = formatError("removeChild QUEBROU", err) + extra;
      console.error(text);
      showPanel(text);
      throw err;
    }
  };

  // Botãozinho pequeno pra abrir painel manualmente
  const mini = document.createElement("button");
  mini.textContent = "Debug";
  mini.style.position = "fixed";
  mini.style.right = "12px";
  mini.style.bottom = "12px";
  mini.style.zIndex = "2147483646";
  mini.style.padding = "8px 12px";
  mini.style.borderRadius = "999px";
  mini.style.border = "1px solid #e2e8f0";
  mini.style.background = "white";
  mini.style.cursor = "pointer";
  mini.onclick = () => (panel.style.display = panel.style.display === "none" ? "block" : "none");
  document.documentElement.appendChild(mini);
}