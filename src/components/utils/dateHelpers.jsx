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

/**
 * Converte um timestamp ISO do backend (geralmente armazenado em UTC mas sem o sufixo 'Z')
 * para um Date válido no fuso horário local do usuário.
 *
 * O Base44 armazena created_date/updated_date como ISO sem o 'Z' final, então new Date()
 * interpreta incorretamente como hora local quando na verdade é UTC — causando deslocamento
 * de horas (ex: +3h para UTC-3 em Pernambuco). Esta função anexa 'Z' quando necessário.
 */
export function parseUTCTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value !== "string") return null;

  const s = value.trim();
  if (!s) return null;

  // Se já tem timezone info (Z ou +/-offset), parse normal
  const hasTimezone = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (hasTimezone) {
    const d = new Date(s);
    return isValid(d) ? d : null;
  }

  // Sem timezone info: assume UTC e anexa 'Z'
  // Só anexa se for um datetime ISO (contém 'T'), evitando datas-only
  if (s.includes("T")) {
    const d = new Date(s + "Z");
    return isValid(d) ? d : null;
  }

  // Fallback: date-only ou outro formato
  const d = new Date(s);
  return isValid(d) ? d : null;
}

/**
 * Formata timestamp ISO do backend em formato dd/MM HH:mm no fuso local do usuário.
 * Corrige o problema de timestamps UTC sem sufixo 'Z' sendo exibidos como UTC.
 */
export function formatDateTimeBR(value, fallback = "") {
  const d = parseUTCTimestamp(value);
  if (!d) return fallback;
  return format(d, "dd/MM HH:mm");
}

/**
 * Formata timestamp ISO do backend em formato dd/MM/yyyy HH:mm no fuso local.
 */
export function formatDateTimeFullBR(value, fallback = "") {
  const d = parseUTCTimestamp(value);
  if (!d) return fallback;
  return format(d, "dd/MM/yyyy HH:mm");
}