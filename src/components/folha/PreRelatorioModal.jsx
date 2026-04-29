import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Loader2 } from 'lucide-react';

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PreRelatorioModal({ open, onClose, empresaId }) {
  const [loading, setLoading] = useState(false);
  const [dados, setDados] = useState([]);
  const [mes, setMes] = useState('');

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  const carregar = async () => {
    setLoading(true);

    // Mês atual
    const agora = new Date();
    const m = String(agora.getMonth() + 1).padStart(2, '0');
    const a = agora.getFullYear();
    const mesAtual = `${m}/${a}`;
    setMes(mesAtual);

    const filtro = empresaId ? { empresa_id: empresaId } : {};

    const [colaboradores, adiantamentos, folhasExistentes] = await Promise.all([
      base44.entities.FuncionarioColaborador.filter({ ...filtro, status: 'Ativo' }, 'nome', 200),
      base44.entities.AdiantamentoFuncionario.filter({ ...filtro, status: 'Pendente' }, null, 500),
      base44.entities.FolhaSalarial.filter({ ...filtro, mes_referencia: mesAtual }, null, 500),
    ]);

    const linhas = colaboradores.map(colab => {
      const adisColab = adiantamentos.filter(a => a.colaborador_id === colab.id);
      const totalAdi = adisColab.reduce((s, a) => s + (a.valor || 0), 0);
      const salario = colab.salario_base || 0;
      const liquido = salario - totalAdi;
      const jaGerada = folhasExistentes.some(f => f.colaborador_id === colab.id);
      return { colab, salario, totalAdi, liquido, jaGerada };
    });

    setDados(linhas);
    setLoading(false);
  };

  const totalSalarios = dados.reduce((s, d) => s + d.salario, 0);
  const totalAdiantamentos = dados.reduce((s, d) => s + d.totalAdi, 0);
  const totalLiquido = dados.reduce((s, d) => s + d.liquido, 0);
  const pendentes = dados.filter(d => !d.jaGerada).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#10353C]" />
            Pré-Relatório da Folha — {mes}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-[#10353C]" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <p className="text-xs text-slate-500">Total Salários Brutos</p>
                <p className="font-bold text-slate-800">{fmt(totalSalarios)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-xs text-red-500">(-) Adiantamentos</p>
                <p className="font-bold text-red-600">{fmt(totalAdiantamentos)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600">Líquido a Pagar</p>
                <p className="font-bold text-green-700">{fmt(totalLiquido)}</p>
              </div>
            </div>

            {pendentes > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>{pendentes}</strong> colaborador(es) ainda sem folha gerada para {mes}.
              </div>
            )}

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left p-2 font-medium text-slate-600">Colaborador</th>
                    <th className="text-left p-2 font-medium text-slate-600">Cargo</th>
                    <th className="text-right p-2 font-medium text-slate-600">Salário Base</th>
                    <th className="text-right p-2 font-medium text-slate-600">Adiantamentos</th>
                    <th className="text-right p-2 font-medium text-slate-600">Líquido</th>
                    <th className="text-center p-2 font-medium text-slate-600">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.map(({ colab, salario, totalAdi, liquido, jaGerada }) => (
                    <tr key={colab.id} className="border-b hover:bg-slate-50">
                      <td className="p-2 font-medium">{colab.nome}</td>
                      <td className="p-2 text-slate-500">{colab.cargo || '-'}</td>
                      <td className="p-2 text-right">{fmt(salario)}</td>
                      <td className="p-2 text-right text-red-600">
                        {totalAdi > 0 ? `-${fmt(totalAdi)}` : '-'}
                      </td>
                      <td className="p-2 text-right font-bold text-green-700">{fmt(liquido)}</td>
                      <td className="p-2 text-center">
                        {jaGerada
                          ? <Badge className="bg-green-100 text-green-700">Gerada</Badge>
                          : <Badge className="bg-yellow-100 text-yellow-700">Pendente</Badge>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr>
                    <td className="p-2" colSpan={2}>TOTAL</td>
                    <td className="p-2 text-right">{fmt(totalSalarios)}</td>
                    <td className="p-2 text-right text-red-600">-{fmt(totalAdiantamentos)}</td>
                    <td className="p-2 text-right text-green-700">{fmt(totalLiquido)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}