import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/ui/PageHeader';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, FileJson, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function SyncTests() {
  const [payload, setPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [historico, setHistorico] = useState([]);

  const handleValidateClientes = async () => {
    await executarFuncao('validateClientes', 'Validar Clientes');
  };

  const handleSyncClientes = async () => {
    await executarFuncao('syncClientes', 'Sincronizar Clientes');
  };

  const handleValidateVendas = async () => {
    await executarFuncao('validateVendas', 'Validar Vendas');
  };

  const handleSyncVendas = async () => {
    await executarFuncao('syncVendas', 'Sincronizar Vendas');
  };

  const handleSyncComissoes = async () => {
    await executarFuncao('syncComissoes', 'Sincronizar Comissões');
  };

  const executarFuncao = async (funcao, label) => {
    try {
      setLoading(true);
      setResultado(null);

      let parsedPayload;
      try {
        parsedPayload = JSON.parse(payload);
      } catch (e) {
        toast.error('JSON inválido. Verifique o formato.');
        setLoading(false);
        return;
      }

      const response = await base44.functions.invoke(funcao, parsedPayload);
      
      const resultado = {
        funcao,
        label,
        timestamp: new Date().toISOString(),
        success: response.data.success,
        summary: response.data.summary || response.data.validation,
        errors: response.data.errors,
        raw: response.data
      };

      setResultado(resultado);
      setHistorico(prev => [resultado, ...prev.slice(0, 9)]);
      
      if (response.data.success) {
        toast.success(`${label} executado com sucesso!`);
      } else {
        toast.error(`${label} falhou`);
      }
    } catch (error) {
      toast.error('Erro: ' + (error.message || 'Erro desconhecido'));
      setResultado({
        funcao,
        label,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        raw: error
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerLogs = async () => {
    try {
      setLoading(true);
      const logs = await base44.entities.SyncLog.list('-created_date', 10);
      setResultado({
        funcao: 'verLogs',
        label: 'Últimos Logs',
        timestamp: new Date().toISOString(),
        logs
      });
      toast.success('Logs carregados');
    } catch (error) {
      toast.error('Erro ao carregar logs');
    } finally {
      setLoading(false);
    }
  };

  const formatJson = (obj) => {
    return JSON.stringify(obj, null, 2);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testes de Sincronização"
        subtitle="Validar e sincronizar dados do sistema Venda Web"
      />

      {/* Área de Payload */}
      <Card className="p-6">
        <Label className="text-lg font-semibold mb-2 block">Payload JSON</Label>
        <Textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          placeholder={`Cole aqui o JSON do sistema origem. Exemplo:

Para Clientes:
{
  "clientes": [
    {
      "id": "123",
      "nome": "João Silva",
      "cpf": "12345678900",
      "telefone": "11999999999"
    }
  ],
  "empresa_id": "emp_xxx",
  "data_desde": "2025-01-01T00:00:00Z"
}

Para Vendas:
{
  "vendas": [
    {
      "id": "456",
      "cliente_id": "123",
      "administradora_id": "adm_xxx",
      "tabela_id": "tab_xxx",
      "grupo": "1234",
      "vendedor_id": "vend_xxx",
      "data_venda": "2025-01-01",
      "valorCredito": 50000,
      "taxaAdministracao": 15
    }
  ],
  "empresa_id": "emp_xxx"
}`}
          className="h-64 font-mono text-sm"
        />
      </Card>

      {/* Botões de Ação */}
      <Card className="p-6">
        <Label className="text-lg font-semibold mb-4 block">Ações</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Button
            onClick={handleValidateClientes}
            disabled={loading || !payload}
            variant="outline"
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            Validar Clientes
          </Button>

          <Button
            onClick={handleSyncClientes}
            disabled={loading || !payload}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Sincronizar Clientes
          </Button>

          <Button
            onClick={handleValidateVendas}
            disabled={loading || !payload}
            variant="outline"
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            Validar Vendas
          </Button>

          <Button
            onClick={handleSyncVendas}
            disabled={loading || !payload}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Sincronizar Vendas
          </Button>

          <Button
            onClick={handleSyncComissoes}
            disabled={loading || !payload}
            className="gap-2 bg-purple-600 hover:bg-purple-700"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Sincronizar Comissões
          </Button>

          <Button
            onClick={handleVerLogs}
            disabled={loading}
            variant="outline"
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            Ver Últimos Logs
          </Button>
        </div>
      </Card>

      {/* Resultado */}
      {resultado && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Label className="text-lg font-semibold">Resultado: {resultado.label}</Label>
            {resultado.success ? (
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            ) : resultado.error ? (
              <XCircle className="w-6 h-6 text-red-600" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600" />
            )}
          </div>

          <div className="text-sm text-slate-500 mb-4">
            {format(new Date(resultado.timestamp), 'dd/MM/yyyy HH:mm:ss')}
          </div>

          {/* Summary */}
          {resultado.summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-100 rounded-lg p-4">
                <div className="text-sm text-slate-600">Total</div>
                <div className="text-2xl font-bold">{resultado.summary.total}</div>
              </div>
              {resultado.summary.successCount !== undefined && (
                <div className="bg-green-100 rounded-lg p-4">
                  <div className="text-sm text-green-700">Criados</div>
                  <div className="text-2xl font-bold text-green-700">{resultado.summary.successCount}</div>
                </div>
              )}
              {resultado.summary.updatedCount !== undefined && (
                <div className="bg-blue-100 rounded-lg p-4">
                  <div className="text-sm text-blue-700">Atualizados</div>
                  <div className="text-2xl font-bold text-blue-700">{resultado.summary.updatedCount}</div>
                </div>
              )}
              {resultado.summary.errorCount !== undefined && (
                <div className="bg-red-100 rounded-lg p-4">
                  <div className="text-sm text-red-700">Erros</div>
                  <div className="text-2xl font-bold text-red-700">{resultado.summary.errorCount}</div>
                </div>
              )}
              {resultado.summary.validCount !== undefined && (
                <div className="bg-green-100 rounded-lg p-4">
                  <div className="text-sm text-green-700">Válidos</div>
                  <div className="text-2xl font-bold text-green-700">{resultado.summary.validCount}</div>
                </div>
              )}
            </div>
          )}

          {/* Erros */}
          {resultado.errors && resultado.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-red-700 mb-3">Erros Encontrados ({resultado.errors.length})</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {resultado.errors.map((error, idx) => (
                  <div key={idx} className="border border-red-200 rounded-lg p-4 bg-red-50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="font-semibold text-red-800">#{error.index}</span>
                        {error.external_id && (
                          <span className="ml-2 text-sm text-red-600">ID: {error.external_id}</span>
                        )}
                      </div>
                      <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">{error.type}</span>
                    </div>
                    <div className="text-sm mb-2">
                      <span className="font-medium">Campo:</span> <code className="bg-red-100 px-1 rounded">{error.field}</code>
                    </div>
                    <div className="text-sm text-red-700 mb-2">{error.message}</div>
                    <div className="text-xs text-red-600 bg-red-100 p-2 rounded">
                      💡 {error.suggestion}
                    </div>
                    {error.raw_data && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-600 cursor-pointer">Ver dados brutos</summary>
                        <pre className="text-xs bg-red-100 p-2 rounded mt-1 overflow-x-auto">
                          {formatJson(error.raw_data)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Logs (Ver Últimos Logs) */}
          {resultado.logs && (
            <div>
              <h3 className="font-semibold mb-3">Últimos 10 Logs de Sincronização</h3>
              <div className="space-y-2">
                {resultado.logs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-4 bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold">{log.tipo}</span>
                        <span className="text-sm text-slate-500 ml-2">({log.origem})</span>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        log.status === 'sucesso' ? 'bg-green-100 text-green-700' :
                        log.status === 'parcial' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>Total: <strong>{log.total}</strong></div>
                      <div>Sucesso: <strong>{log.success}</strong></div>
                      <div>Atualizados: <strong>{log.updated}</strong></div>
                      <div>Erros: <strong>{log.failed}</strong></div>
                    </div>
                    <div className="text-xs text-slate-500 mt-2">
                      {log.created_by_nome} • {format(new Date(log.created_date), 'dd/MM/yyyy HH:mm')}
                    </div>
                    {log.data_desde && (
                      <div className="text-xs text-slate-500">
                        Filtro: dados desde {format(new Date(log.data_desde), 'dd/MM/yyyy HH:mm')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Raw Response */}
          <details className="mt-4">
            <summary className="text-sm font-semibold cursor-pointer text-slate-600">Ver resposta completa</summary>
            <pre className="text-xs bg-slate-100 p-4 rounded mt-2 overflow-x-auto">
              {formatJson(resultado.raw)}
            </pre>
          </details>
        </Card>
      )}

      {/* Histórico */}
      {historico.length > 0 && (
        <Card className="p-6">
          <Label className="text-lg font-semibold mb-4 block">Histórico de Execuções</Label>
          <div className="space-y-2">
            {historico.map((item, idx) => (
              <div
                key={idx}
                onClick={() => setResultado(item)}
                className="border rounded-lg p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.label}</span>
                  {item.success ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600" />
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {format(new Date(item.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}