import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { CodeMirrorBufferAdapter } from './CodeMirrorBufferAdapter';
export function ReadingSurface({ markdown, buffer, onLink }: { markdown: string; buffer: CodeMirrorBufferAdapter; onLink: (url: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(markdown, { async: false, gfm: true }), {
    USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'input', 'button', 'form', 'iframe'], FORBID_ATTR: ['contenteditable', 'autofocus', 'tabindex'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|syna):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
  }), [markdown]);
  useEffect(() => {
    const element = root.current; if (!element) return;
    element.scrollTop = buffer.getReadingScroll(); element.focus({ preventScroll: true });
    return buffer.attachReadingViewport(element);
  }, [buffer]);
  return <div ref={root} className="reading-surface" aria-label="Markdown reading view" tabIndex={0} onScroll={event => buffer.setReadingScroll(event.currentTarget.scrollTop)} onClick={event => {
    const anchor = (event.target as Element).closest('a'); if (!anchor) return;
    const href = anchor.getAttribute('href'); if (!href) return;
    if (href.startsWith('#')) {
      event.preventDefault();
      const slug = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/\s+/g, '-');
      let fragment: string; try { fragment = decodeURIComponent(href.slice(1)); } catch { return; }
      const heading = [...(root.current?.querySelectorAll('h1,h2,h3,h4,h5,h6') ?? [])].find(item => slug(item.textContent ?? '') === slug(fragment));
      if (heading && root.current) root.current.scrollTop += heading.getBoundingClientRect().top - root.current.getBoundingClientRect().top - 24;
      return;
    }
    event.preventDefault(); onLink(href);
  }}><article className="reading-content document-column" dangerouslySetInnerHTML={{ __html: html }} /></div>;
}
