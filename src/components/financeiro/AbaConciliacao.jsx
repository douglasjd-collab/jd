import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle, Link, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import moment from 'moment';

const BRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export default function AbaConciliacao({ despesas, receitas, refetchAll }) {
  const [linhas, setLinhas] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [conciliadas, setConciliadas] = useState({});

  const processarArquivo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessando(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: 'object',
          properties: {
            linhas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  data: { type: 'string' },
                  descricao: { type: 'string' },
                  valor: { type: 'number' },
                  tipo: { type: 'string', description: 'credito ou debito' },
                }
              }
            }
          }
        }
      });
      const dados = result?.output?.linhas || result?.output || [];
      const listaExtraida = Array.isArray(dados) ? dados : [];

      // Tentar sugerir correspondências
      const comSugestao = listaExtraida.map(l => {
        const tipo = l.tipo === 'credito' || (l.valor > 0) ? 'credito' : 'debito';
        const valorAbs = Math.abs(l.valor || 0);
        let sugestao = null;
        if (tipo === 'credito') {
          sugestao = receitas.find(r => r.status !== 'recebida' && Math.abs((r.valor||0) - valorAbs) < 0.01);
        } else {
          sugestao = despesas.find(d => !['pago','paga'].includes(d.status) && Math.abs((d.valor||0) - valorAbs) < 0.01);
        }
        return { ...l, valor: valorAbs, tipo, sugestao };
      });

      setLinhas(comSugestao);
      toast.success(`${listaExtraida.length} linha(s) extraída(s) do extrato`);
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + err.message);
    } finally {
      setProcessando(false);
    }
  };

  const confirmarConciliacao = async (idx, linha) => {
    const sug = linha.sugestao;
    if (!sug) return;
    try {
      if (linha.tipo === 'credito') {
        await base44.entities.Receita.update(sug.id, { status: 'recebida', data_recebimento: linha.data || moment().format('YYYY-MM-DD') });
      } else {
        await base44.entities.Despesa.update(sug.id, { status: 'pago', data_pagamento: linha.data || moment().format('YYYY-MM-DD') });
      }
      setConciliadas(prev => ({ ...prev, [idx]: true }));
      refetchAll();
      toast.success('Conciliado com sucesso!');
    } catch (err) {
      toast.error('Erro: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 border-dashed border-2 border-slate-300 bg-slate-50">
        <div className="text-center space-y-3">
          <Upload className="w-10 h-10 text-slate-400 mx-auto"/>
          <p className="font-semibold text-slate-700">Importar Extrato Bancário</p>
          <p className="text-sm text-slate-500">Arraste ou selecione um arquivo CSV, XLSX ou PDF do extrato</p>
          <label className="inline-block cursor-pointer">
            <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
              {processando ? 'Processando...' : 'Selecionar Arquivo'}
            </span>
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls,.pdf" onChange={processarArquivo} disabled={processando}/>
          </label>
        </div>
      </Card>

      {linhas.length > 0 && (
        <Card>
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">{linhas.length} linha(s) do extrato</h3>
            <div className="flex gap-2 text-xs text-slate-500">
              <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-500"/>Conciliado</span>
              <span className="flex items-center gap-1"><Link className="w-3.5 h-3.5 text-blue-500"/>Sugestão encontrada</span>
              <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-slate-400"/>Sem correspondência</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold text-slate-600">Data</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Descrição</th>
                  <th className="text-right p-3 font-semibold text-slate-600">Valor</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Tipo</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Sugestão de Vínculo</th>
                  <th className="text-left p-3 font-semibold text-slate-600">Ação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const isConciliada = conciliadas[i];
                  return (
                    <tr key={i} className={`border-b ${isConciliada ? 'bg-green-50' : 'hover:bg-slate-50'}`}>
                      <td className="p-3 text-slate-600">{l.data || '-'}</td>
                      <td className="p-3 text-slate-700">{l.descricao || '-'}</td>
                      <td className={`p-3 text-right font-bold ${l.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                        {l.tipo === 'credito' ? '+' : '-'} {BRL(l.valor)}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {l.tipo === 'credito' ? 'Crédito' : 'Débito'}
                        </span>
                      </td>
                      <td className="p-3">
                        {isConciliada ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="w-3.5 h-3.5"/>Conciliado</span>
                        ) : l.sugestao ? (
                          <div className="text-xs">
                            <p className="font-medium text-blue-700">{l.sugestao.descricao}</p>
                            <p className="text-slate-500">{BRL(l.sugestao.valor)}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 flex items-center gap-1"><AlertCircle className="w-3 h-3"/>Sem correspondência</span>
                        )}
                      </td>
                      <td className="p-3">
                        {!isConciliada && l.sugestao && (
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-6 text-xs px-2"
                            onClick={() => confirmarConciliacao(i, l)}>
                            <Link className="w-3 h-3 mr-1"/>Confirmar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}