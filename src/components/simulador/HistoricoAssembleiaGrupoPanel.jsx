import React from 'react';
import {
  formatPercent,
  obterUltimasAssembleias,
  calcularResumoPeriodo,
  calcularTendencia
} from '@/components/utils/gruposConsorcioHelpers';

const formatData = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-');

function TabelaLance({ titulo, corTexto, ultimas, campoMenor, campoQtd }) {
  return (
    <div>
      <p className={`font-semibold mb-1 ${corTexto}`}>{titulo}</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 text-left">
            <th className="font-normal pb-1">Assembleia</th>
            <th className="font-normal pb-1">Contemplados</th>
            <th className="font-normal pb-1">Menor lance</th>
          </tr>
        </thead>
        <tbody>
          {ultimas.map(a => (
            <tr key={a.id} className="border-t border-slate-100">
              <td className="py-1">{formatData(a.data_assembleia)}</td>
              <td className="py-1">{a[campoQtd] ?? 0}</td>
              <td className={`py-1 font-medium ${corTexto}`}>{formatPercent(a[campoMenor])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoricoAssembleiaGrupoPanel({ assembleias, lanceClientePercentual }) {
  const ultimas = obterUltimasAssembleias(assembleias, 3);

  if (ultimas.length === 0) {
    return <p className="text-xs text-slate-400 mt-3 pt-3 border-t">Nenhuma assembleia registrada para este grupo.</p>;
  }

  const resumo = calcularResumoPeriodo(ultimas);
  const tendenciaLivre = calcularTendencia(ultimas, 'lance_livre_menor_percentual');
  const ultimaAssembleia = ultimas[0];

  const temComparacaoCliente = lanceClientePercentual != null && ultimaAssembleia.lance_livre_menor_percentual != null;
  const diferencaCliente = temComparacaoCliente
    ? lanceClientePercentual - ultimaAssembleia.lance_livre_menor_percentual
    : null;

  return (
    <div className="mt-3 pt-3 border-t space-y-4 text-xs">
      <TabelaLance
        titulo="Lance Livre"
        corTexto="text-blue-700"
        ultimas={ultimas}
        campoMenor="lance_livre_menor_percentual"
        campoQtd="lance_livre_qtd_contemplados"
      />

      <TabelaLance
        titulo="Lance Limitado"
        corTexto="text-orange-700"
        ultimas={ultimas}
        campoMenor="lance_limitado_menor_percentual"
        campoQtd="lance_limitado_qtd_contemplados"
      />

      <div>
        <p className="font-semibold text-slate-700 mb-1">Outras contemplações</p>
        <div className="space-y-2">
          {ultimas.map(a => (
            <div key={a.id} className="p-2 bg-slate-50 rounded-lg">
              <p className="font-semibold text-slate-600 mb-1">{formatData(a.data_assembleia)}</p>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                <li>Sorteio: {a.sorteio_qtd_contemplados || 0} contemplado(s)</li>
                <li>Lance Fixo 30%: {a.lance_fixo_30_qtd_contemplados || 0} contemplado(s)</li>
                <li>Lance Fixo 50%: {a.lance_fixo_50_qtd_contemplados || 0} contemplado(s)</li>
              </ul>
            </div>
          ))}
        </div>
      </div>

      {resumo && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <p className="font-semibold text-slate-700 mb-2">Resumo dos últimos {ultimas.length} meses</p>
          <div className="grid grid-cols-2 gap-1 text-slate-600">
            <p>Média do lance livre: <span className="font-semibold text-blue-700">{formatPercent(resumo.mediaLivre)}</span></p>
            <p>Menor lance livre: <span className="font-semibold">{formatPercent(resumo.menorLivre)}</span></p>
            <p>Maior lance livre: <span className="font-semibold">{formatPercent(resumo.maiorLivre)}</span></p>
            <p>Contemplados por lance livre: <span className="font-semibold">{resumo.contempladosLivre}</span></p>
            <p>Média do lance limitado: <span className="font-semibold text-orange-700">{formatPercent(resumo.mediaLimitado)}</span></p>
            <p>Menor lance limitado: <span className="font-semibold">{formatPercent(resumo.menorLimitado)}</span></p>
            <p>Maior lance limitado: <span className="font-semibold">{formatPercent(resumo.maiorLimitado)}</span></p>
            <p>Contemplados por lance limitado: <span className="font-semibold">{resumo.contempladosLimitado}</span></p>
            <p>Contemplados por sorteio: <span className="font-semibold">{resumo.contempladosSorteio}</span></p>
            <p>Contemplados por lance fixo 30%: <span className="font-semibold">{resumo.contempladosFixo30}</span></p>
            <p>Contemplados por lance fixo 50%: <span className="font-semibold">{resumo.contempladosFixo50}</span></p>
            <p>Total geral de contemplados: <span className="font-semibold">{resumo.totalGeral}</span></p>
          </div>
        </div>
      )}

      {tendenciaLivre && (
        <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
          <p>{tendenciaLivre.emoji} Lance livre {tendenciaLivre.classificacao.toLowerCase()} nos últimos {ultimas.length} meses.</p>
          <p className="text-slate-500 mt-1">{tendenciaLivre.valores.map(v => formatPercent(v)).join(' → ')}</p>
          <p className="text-slate-400 mt-1">Esse indicador representa somente o histórico, sem prometer contemplação.</p>
        </div>
      )}

      {temComparacaoCliente && (
        <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
          <p className="font-semibold text-purple-700 mb-1">Comparação com o lance do cliente</p>
          <p>Lance do cliente: <span className="font-semibold">{formatPercent(lanceClientePercentual)}</span></p>
          <p>Último lance livre: <span className="font-semibold">{formatPercent(ultimaAssembleia.lance_livre_menor_percentual)}</span></p>
          <p>Média dos {ultimas.length} meses: <span className="font-semibold">{formatPercent(resumo.mediaLivre)}</span></p>
          <p>Diferença para o último resultado: <span className="font-semibold">{diferencaCliente >= 0 ? '+' : ''}{diferencaCliente.toFixed(2)} pontos percentuais</span></p>
          <p>Classificação: <span className="font-semibold">
            {diferencaCliente > 1 ? 'acima do histórico recente' : diferencaCliente < -1 ? 'abaixo do histórico recente' : 'em linha com o histórico recente'}
          </span></p>
          <p className="text-slate-400 mt-1">Esta análise utiliza apenas os resultados anteriores do grupo e não representa garantia de contemplação.</p>
        </div>
      )}
    </div>
  );
}