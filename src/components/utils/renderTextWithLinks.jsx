import React from 'react';

/**
 * Detecta URLs válidas e links markdown [texto](url) no texto e os converte em links clicáveis.
 * Suporta: https://, http://, www. e formato [label](url)
 * Seguro: target="_blank" + rel="noopener noreferrer", sem execução de scripts.
 */
const COMBINED_REGEX = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+)/gi;

export function renderTextWithLinks(text, linkClassName = '') {
  if (!text || typeof text !== 'string') return text;

  const parts = [];
  let lastIndex = 0;
  let match;
  const regex = new RegExp(COMBINED_REGEX.source, 'gi');

  while ((match = regex.exec(text)) !== null) {
    // Texto antes do match
    if (match.index > lastIndex) {
      parts.push(<React.Fragment key={lastIndex}>{text.slice(lastIndex, match.index)}</React.Fragment>);
    }

    const full = match[0];
    const mdLabel = match[2]; // grupo [label]
    const mdUrl = match[3];   // grupo (url) do markdown

    if (mdLabel && mdUrl) {
      // Formato markdown: [nome](url)
      parts.push(
        <a
          key={match.index}
          href={mdUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 break-all hover:opacity-80 transition-opacity ${linkClassName}`}
          onClick={e => e.stopPropagation()}
        >
          {mdLabel}
        </a>
      );
    } else {
      // URL simples
      const href = full.startsWith('www.') ? `https://${full}` : full;
      parts.push(
        <a
          key={match.index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 break-all hover:opacity-80 transition-opacity ${linkClassName}`}
          onClick={e => e.stopPropagation()}
        >
          {full}
        </a>
      );
    }

    lastIndex = match.index + full.length;
  }

  // Texto restante
  if (lastIndex < text.length) {
    parts.push(<React.Fragment key={lastIndex}>{text.slice(lastIndex)}</React.Fragment>);
  }

  return parts.length > 0 ? parts : text;
}