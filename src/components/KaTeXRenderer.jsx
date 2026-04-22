import React, { useRef, useEffect } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderInlineFormatting(text, keyPrefix) {
  return text.split(/(\*\*.*?\*\*)/gs).map((segment, index) => {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      return <strong key={`${keyPrefix}-bold-${index}`}>{segment.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-text-${index}`}>{segment}</React.Fragment>;
  });
}

export default function KaTeXRenderer({ math, display = false, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !math) return;
    try {
      katex.render(math, ref.current, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        trust: true,
      });
    } catch {
      ref.current.textContent = math;
    }
  }, [math, display]);

  if (!math) return null;
  return <span ref={ref} className={className} />;
}

export function renderMixedContent(text) {
  if (!text) return null;
  const parts = text.split(/(\$\$.*?\$\$|\$.*?\$)/gs);
  return parts.map((part, i) => {
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <KaTeXRenderer key={i} math={part.slice(2, -2)} display />;
    }
    if (part.startsWith('$') && part.endsWith('$')) {
      return <KaTeXRenderer key={i} math={part.slice(1, -1)} />;
    }
    return <span key={i}>{renderInlineFormatting(part, `part-${i}`)}</span>;
  });
}
