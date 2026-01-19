import { format, parseISO, isValid } from "date-fns";

export function safeParseDate(value) {
  if (!value) return null;

  // Se vier como Date já
  if (value instanceof Date) return isValid(value) ? value : null;

  // Se vier timestamp numérico
  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }

  // Se vier string (ISO ou parecido)
  if (typeof value === "string") {
    const s = value.trim();
    if (!s || s === "0000-00-00") return null;

    // tenta ISO primeiro
    const d1 = parseISO(s);
    if (isValid(d1)) return d1;

    // tenta formato brasileiro dd/MM/yyyy
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const d2 = parseISO(isoDate);
        if (isValid(d2)) return d2;
      }
    }

    // fallback: tenta Date nativo
    const d3 = new Date(s);
    return isValid(d3) ? d3 : null;
  }

  return null;
}

export function formatDateBR(value, fallback = "-") {
  const d = safeParseDate(value);
  if (!d) return fallback;
  return format(d, "dd/MM/yyyy");
}