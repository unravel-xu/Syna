import { useState } from 'react';
import { ArrowUpRight, Search, FileText, Layers3, X } from 'lucide-react';
import { useShell } from '../app/AppProvider';
import { searchResults } from '../fixtures/demo';
import { DemoBadge } from '../shell/primitives';
export function SearchView({ compact = false, initialQuery, onNavigate }: { compact?: boolean; initialQuery?: string; onNavigate?(): void }) {
  const { application, navigation, notesWorkspace } = useShell();
  const [query, setQuery] = useState(initialQuery ?? (navigation.location.page === 'search' ? navigation.location.query ?? '' : ''));
  const [selected, setSelected] = useState(0);
  const results = searchResults.filter(result => `${result.title} ${result.description} ${result.category}`.toLowerCase().includes(query.toLowerCase().trim()));
  function open(index: number) { if (results[index]) { application.navigate(results[index].location.page === 'library' && notesWorkspace ? { page: 'library', section: 'notes' } : results[index].location); onNavigate?.(); } }
  return <div className={compact ? 'search-view compact-search' : 'search-view page-container'}>
    {!compact && <><div className="eyebrow">FIND A THREAD</div><h1>Search your space.</h1><p className="page-description">A note, a question, a place to pick up where you left off.</p></>}
    <div className="search-input-wrap"><Search size={19} /><input aria-label="Search demo notes and projects" autoFocus={compact} placeholder="Search notes, projects, and ideas…" value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setSelected(current => Math.max(0, Math.min(results.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); }
      if (event.key === 'Enter') { event.preventDefault(); open(Math.min(selected, results.length - 1)); }
    }} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}{compact && <kbd>esc</kbd>}</div>
    <div className="search-meta"><span>{query ? `${results.length} matching fixtures` : 'Explore the demo fixtures'}</span><DemoBadge>Demo results</DemoBadge></div>
    <div className="search-results" aria-label="Demo search results">{results.map((result, i) => <button key={result.id} className={`search-result ${i === selected ? 'keyboard-selected' : ''}`} onFocus={() => setSelected(i)} onClick={() => open(i)}><span className="result-icon">{result.category === 'Note' ? <FileText size={18} /> : <Layers3 size={18} />}</span><span className="result-copy"><strong>{result.title}</strong><span>{result.description}</span></span><span className="result-category">{result.category}</span><ArrowUpRight size={15} /></button>)}</div>
    {results.length === 0 && <div className="search-empty"><Search size={25} /><h3>No demo matches</h3><p>Try “thinking”, “questions”, or “Agentic”.</p></div>}
    <p className="search-disclaimer">Fixed development fixtures. Your files are not indexed or accessed.</p>
  </div>;
}
