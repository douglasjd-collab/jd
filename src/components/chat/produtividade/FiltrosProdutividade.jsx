import React from 'react';
import { format } from 'date-fns';
import { CANAL_LABELS } from './produtividadeHelpers';

const PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7dias', 'Últimos 7 dias'], ['30dias', 'Últimos 30 dias'], ['personalizado', 'Personalizado']];

export default function FiltrosProdutividade({
  periodo, setPeriodo, dataInicioCustom, setDataInicioCustom, dataFimCustom, setDataFimCustom,
  canalFiltro, setCanalFiltro, vendedorFiltro, setVendedorFiltro, colaboradores,
  inicio, fim, lastUpdate, countdown,
}) {
  return (
    <div className="flex flex-wrap items-center gap-3" style={{ background: '#111720', border: '1px solid #1e2a38', borderRadius: '10px', padding: '10px 16px' }}>
      <span className="text-xs font-medium" style={{ color: '#5a7190' }}>Período:</span>
      <div className="flex gap-1 flex-wrap">
        {PERIODOS.map(([v, l]) => (
          <button key={v} className="prod-period" style={periodo === v ? { background: '#22d07a', color: '#0b0f14' } : {}} onClick={() => setPeriodo(v)}>{l}</button>
        ))}
      </div>
      {periodo === 'personalizado' && (
        <div className="flex items-center gap-1">
          <input type="date" value={dataInicioCustom} onChange={e => setDataInicioCustom(e.target.value)} className="text-xs rounded-lg px-2 py-1.5" style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040' }} />
          <span style={{ color: '#5a7190' }}>até</span>
          <input type="date" value={dataFimCustom} onChange={e => setDataFimCustom(e.target.value)} className="text-xs rounded-lg px-2 py-1.5" style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040' }} />
        </div>
      )}
      <div style={{ width: '1px', height: '20px', background: '#1e2a38' }} />
      <span className="text-xs font-medium" style={{ color: '#5a7190' }}>Canal:</span>
      <select value={canalFiltro} onChange={e => setCanalFiltro(e.target.value)} className="text-xs rounded-lg px-3 py-1.5" style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040', outline: 'none' }}>
        {Object.entries(CANAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span className="text-xs font-medium" style={{ color: '#5a7190' }}>Vendedor:</span>
      <select value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)} className="text-xs rounded-lg px-3 py-1.5" style={{ background: '#1e2a38', color: '#e2eaf4', border: '1px solid #243040', outline: 'none' }}>
        <option value="all">Todos</option>
        {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <div className="w-full flex items-center gap-3 mt-1 text-xs" style={{ color: '#3a5068' }}>
        <span>De <b style={{ color: '#e2eaf4' }}>{format(inicio, 'dd/MM/yyyy')}</b> até <b style={{ color: '#e2eaf4' }}>{format(fim, 'dd/MM/yyyy')}</b></span>
        {lastUpdate && <span>Última atualização: <b style={{ color: '#e2eaf4' }}>{format(lastUpdate, 'HH:mm:ss')}</b></span>}
        <span>🔄 Atualiza em <b style={{ color: '#e2eaf4' }}>{countdown}s</b></span>
      </div>
    </div>
  );
}