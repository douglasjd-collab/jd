import React from 'react';

/**
 * Detecta URLs válidas no texto e as converte em links clicáveis.
 * Suporta: https://, http://, www.
 * Seguro: target="_blank" + rel="noopener noreferrer", sem execução de scripts.
 */
const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+)/gi;

export function renderTextWithLinks(text, linkClassName = '') {
  if (!text || typeof text !== 'string') return text;

  const parts = text.split(URL_REGEX);

  return parts.map((part, i) => {
    if (URL_REGEX.test(part)) {
      // Reset lastIndex após o test()
      URL_REGEX.lastIndex = 0;
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 break-all hover:opacity-80 transition-opacity ${linkClassName}`}
          onClick={e => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return part ? <React.Fragment key={i}>{part}</React.Fragment> : null;
  });
}