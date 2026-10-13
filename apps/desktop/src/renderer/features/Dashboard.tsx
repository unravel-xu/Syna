import { ArrowUpRight, ArrowRight, FileText, Layers3, Circle, MoveUpRight } from 'lucide-react';
import { useShell } from '../app/AppProvider';
import { notes, projects, pageLocations, quickLinks } from '../fixtures/demo';
import { Brand, DemoBadge, FixtureIcon } from '../shell/primitives';
export function Dashboard() {
  const { application, notesWorkspace } = useShell();
  return <div className="dashboard page-container">
    <div className="dashboard-intro"><div className="eyebrow"><span className="tiny-line" />YOUR KNOWLEDGE, CONNECTED</div><h1>Make room for your<br /><span>next idea.</span></h1><p>A quiet place to collect, connect, and move your work forward.</p><span className="intro-mark"><Brand /></span></div>
    <div className="quick-links">{quickLinks.map(link => <button key={link.page} onClick={() => application.navigate(link.page === 'library' && notesWorkspace ? { page: 'library', section: 'notes' } : pageLocations[link.page])}><FixtureIcon name={link.icon} size={20} /><ArrowUpRight size={15} className="quick-arrow" /><strong>{link.title}</strong><span>{link.description}</span></button>)}</div>
    <div className="dashboard-columns">
      <section className="continue-section"><div className="section-heading"><h2>A place to pick up</h2><DemoBadge>Sample content</DemoBadge></div><p className="section-description">A preview of how your recent work will feel.</p>
        <div className="continue-list"><button className="continue-row" onClick={() => application.navigate({ page: 'library', section: 'notes', ...(notesWorkspace ? {} : { noteId: notes[0].id }) })}><span className="continue-icon"><FileText size={20} /></span><span><strong>{notes[0].title}</strong><small>Library <span>·</span> Getting started</small></span><ArrowUpRight size={16} /></button><button className="continue-row" onClick={() => application.navigate({ page: 'workspaces', projectId: projects[0].id })}><span className="continue-icon"><Layers3 size={20} /></span><span><strong>{projects[0].name}</strong><small>Research <span>·</span> {projects[0].phase}</small></span><ArrowUpRight size={16} /></button></div>
        <button className="text-link" onClick={() => application.navigate(notesWorkspace ? { page: 'library', section: 'notes' } : pageLocations.library)}>Explore the Library <ArrowRight size={14} /></button>
      </section>
      <section className="today-section"><div className="section-heading"><h2>Room to focus</h2><Circle size={13} /></div><div className="focus-placeholder"><span className="focus-glyph"><MoveUpRight size={26} strokeWidth={1.1} /></span><h3>One thing at a time.</h3><p>Your priorities will live here.<br />For now, take a look around.</p><span className="subtle-label">No task system connected</span></div></section>
    </div>
    <div className="dashboard-footnote"><span className="status-dot" /><span>Sample content only. No personal data is loaded.</span></div>
  </div>;
}
