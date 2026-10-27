export function formatarEspera(minutos) {
  const total = Math.max(0, Math.floor(Number(minutos) || 0));
  if (total < 60) return `${total} min`;
  const horas = Math.floor(total / 60);
  if (horas < 24) {
    const resto = total % 60;
    return resto ? `${horas}h ${resto}min` : `${horas}h`;
  }
  const dias = Math.floor(horas / 24);
  return `${dias}d ${horas % 24}h`;
}

export function horaLocal(iso) {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}