import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

export default function DebugFinanto() {
  const [url, setUrl] = useState('https://finanto.joinbank.com.br/loans');
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  const testar = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('debugFinantoAPI', { url });
      setResultado(res.data);
    } catch (e) {
      setResultado({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Debug Finanto API</h1>
      
      <div className="space-y-2">
        <label className="block text-sm font-medium">URL para testar:</label>
        <Input 
          value={url} 
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://finanto.joinbank.com.br/loans"
        />
      </div>

      <Button onClick={testar} disabled={loading} className="gap-2">
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Testar
      </Button>

      {resultado && (
        <div className="border rounded p-4 bg-slate-50 space-y-4">
          {resultado.error && (
            <div className="text-red-600 font-mono text-sm">{resultado.error}</div>
          )}
          
          {resultado.success === true && (
            <>
              <div>
                <p className="font-semibold text-sm mb-1">HTTP Status:</p>
                <p className="text-lg font-mono">{resultado.status}</p>
              </div>

              <div>
                <p className="font-semibold text-sm mb-1">Chaves encontradas:</p>
                <pre className="bg-white p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(resultado.chaves_totais, null, 2)}
                </pre>
              </div>

              <div>
                <p className="font-semibold text-sm mb-1">Estrutura:</p>
                <pre className="bg-white p-3 rounded text-xs overflow-auto max-h-48">
                  {JSON.stringify(resultado.estrutura_resposta, null, 2)}
                </pre>
              </div>

              <div>
                <p className="font-semibold text-sm mb-1">JSON Completo:</p>
                <Textarea 
                  value={resultado.resposta_completa_json} 
                  readOnly
                  rows={20}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}