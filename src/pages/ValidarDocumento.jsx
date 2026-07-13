import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, ShieldCheck, ShieldAlert, FileText } from 'lucide-react';
import { format } from 'date-fns';

export default function ValidarDocumento() {
  const { termoId } = useParams();
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);

  useEffect(() => {
    base44.functions.invoke('validarDocumentoPublico', { termoId })
      .then((res) => setDados(res.data))
      .finally(() => setLoading(false));
  }, [termoId]);

  const fmt = (d) => (d ? format(new Date(d), 'dd/MM/yyyy HH:mm') : '-');

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  if (!dados?.encontrado) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-slate-700 font-medium">Documento não encontrado.</p>
        </div>
      </div>
    );
  }

  const valido = dados.status === 'valido';
  const alterado = dados.status === 'alterado';

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="text-center space-y-1">
          <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Validação de Documento</p>
          <h1 className="text-lg font-bold text-slate-800 flex items-center justify-center gap-2">
            <FileText className="w-5 h-5" /> Termo de Autorização
          </h1>
        </div>

        <div className={`rounded-xl border p-4 flex items-center gap-3 ${valido ? 'bg-green-50 border-green-200' : alterado ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          {valido ? <ShieldCheck className="w-8 h-8 text-green-600 flex-shrink-0" /> : <ShieldAlert className="w-8 h-8 text-red-600 flex-shrink-0" />}
          <p className={`font-semibold ${valido ? 'text-green-700' : alterado ? 'text-red-700' : 'text-amber-700'}`}>
            {valido ? '✓ Documento válido' : alterado ? '⚠ Documento alterado' : 'Documento ainda não finalizado'}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
          <p><span className="font-semibold text-slate-500">Número do Termo:</span> {dados.numero_termo}</p>
          <p><span className="font-semibold text-slate-500">Número da Versão:</span> {dados.versao}</p>
          <p><span className="font-semibold text-slate-500">Data da geração:</span> {fmt(dados.data_geracao)}</p>
          <p><span className="font-semibold text-slate-500">Data da assinatura:</span> {fmt(dados.data_assinatura)}</p>
          <p><span className="font-semibold text-slate-500">Empresa:</span> {dados.empresa || '-'}</p>
          <p><span className="font-semibold text-slate-500">Cliente:</span> {dados.cliente_nome || '-'}</p>
          <p className="break-all"><span className="font-semibold text-slate-500">Hash do documento:</span> {dados.hash_documento || '-'}</p>
          <p className="break-all"><span className="font-semibold text-slate-500">Hash registrado:</span> {dados.hash_registrado || '-'}</p>
          <p><span className="font-semibold text-slate-500">Situação:</span> {valido ? 'Documento íntegro' : alterado ? 'Documento alterado após assinatura' : 'Aguardando finalização'}</p>
        </div>
      </div>
    </div>
  );
}