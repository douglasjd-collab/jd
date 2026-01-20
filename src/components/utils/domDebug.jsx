export function installDomDebug() {
  if (typeof window === "undefined") return;

  // Captura qualquer erro JS global
  window.addEventListener("error", (e) => {
    console.error("🌍 window.error:", e.error || e.message);
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("🌍 unhandledrejection:", e.reason);
  });

  // Patch para mostrar QUAL nó está tentando remover
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    try {
      return originalRemoveChild.call(this, child);
    } catch (err) {
      console.error("🧨 removeChild QUEBROU!");
      console.log("Parent node:", this);
      console.log("Child node:", child);
      console.log("Parent innerHTML (inicio):", String(this?.innerHTML || "").slice(0, 500));
      throw err;
    }
  };
}