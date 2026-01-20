import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("🔥 ErrorBoundary:", error);
    console.error("🧩 Component stack:", info?.componentStack);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-2xl w-full bg-white rounded-xl shadow p-6 border">
            <h2 className="text-lg font-semibold text-slate-900">
              Erro ao renderizar a página
            </h2>
            <p className="text-slate-600 mt-2">
              O sistema travou por causa de um componente. Copie o erro abaixo e me envie.
            </p>

            <div className="mt-4 flex gap-2">
              <button
                className="px-4 py-2 rounded-md bg-slate-900 text-white"
                onClick={() => window.location.reload()}
              >
                Recarregar
              </button>
              <button
                className="px-4 py-2 rounded-md bg-slate-100 text-slate-900"
                onClick={() => {
                  this.setState({ hasError: false, error: null, info: null });
                  window.history.back();
                }}
              >
                Voltar
              </button>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-700 mb-2">Erro:</div>
              <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-48">
                {String(this.state.error || "")}
              </pre>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-700 mb-2">Component Stack:</div>
              <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto max-h-64">
                {String(this.state.info?.componentStack || "")}
              </pre>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}