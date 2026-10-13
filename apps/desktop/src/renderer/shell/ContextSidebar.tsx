import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, LayoutGrid, FolderClosed, FileText } from 'lucide-react';
import type { Location } from '@syna/contracts';
import { useShell } from '../app/AppProvider';
import { librarySections, noteFolders, pipelines } from '../fixtures/demo';
import { DemoBadge, FixtureIcon } from './primitives';
import { ResizeHandle } from './ResizeHandle';
import { deriveLayout } from '@syna/core';
import { useFocusTrap } from './Dialog';
import { NotesSidebar, LibraryCreateButton } from '../features/NotesSidebar';
export function ContextSidebar() {
  const { application, navigation: { location, locationsByPage }, layout, libraryExplorer } = useShell();
  const effective = deriveLayout(location, layout);
  const ref = useRef<HTMLElement>(null);
  const overlay = effective.sidebarMode === 'overlay';
  useFocusTrap(ref, overlay, false);
  const title = location.page === 'library' ? 'Library' : 'Workspaces';
  return <>{overlay && <div className="context-backdrop" aria-hidden="true" onClick={() => application.toggleSidebar()} />}<aside id="context-sidebar" ref={ref} className={`context-sidebar ${overlay ? 'overlay' : ''}`} role="complementary" tabIndex={-1} aria-label="Context sidebar" style={{ width: effective.sidebarWidth }} hidden={!effective.sidebarVisible}>
    <div className="sidebar-heading"><span>{title}</span>{location.page === 'library' && libraryExplorer && <LibraryCreateButton />}</div>
    {Object.values(locationsByPage).filter(context => context.page === 'workspaces' || context.page === 'library').map(context => <SidebarContent key={context.page} location={context} active={context.page === location.page} />)}
    <ResizeHandle panel="sidebar" width={effective.sidebarWidth} />
  </aside></>;
}

// Each context stays mounted: hiding the sidebar must not discard its tree or scroll position.
function SidebarContent({ location, active }: { location: Location; active: boolean }) {
  const { application, notesWorkspace } = useShell();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ research: true, 'getting-started': true, ideas: true });
  const toggle = (id: string) => setExpanded(current => ({ ...current, [id]: !current[id] }));
  if (location.page === 'library' && notesWorkspace) return <NotesSidebar location={location} active={active} />;
  return <div className="sidebar-scroll" data-context={location.page} hidden={!active}>
      {location.page === 'workspaces' ? <>
        <button className={`sidebar-item ${!location.projectId && !location.pipelineId ? 'selected' : ''}`} onClick={() => application.navigate({ page: 'workspaces' })}><LayoutGrid size={16} /><span>Overview</span></button>
        <div className="sidebar-section-label">PIPELINES <DemoBadge /></div>
        {pipelines.map(pipeline => <div key={pipeline.id}>
          <div className={`tree-parent ${location.pipelineId === pipeline.id && !location.projectId ? 'selected' : ''}`}>
            <button className="tree-expander" aria-label={`${expanded[pipeline.id] ? 'Collapse' : 'Expand'} ${pipeline.name}`} aria-expanded={!!expanded[pipeline.id]} onClick={() => toggle(pipeline.id)}>{expanded[pipeline.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
            <button className="tree-label" onClick={() => application.navigate({ page: 'workspaces', pipelineId: pipeline.id })}><FixtureIcon name={pipeline.icon} /><span>{pipeline.name}</span><span className="item-count">{pipeline.projects.length || ''}</span></button>
          </div>
          {expanded[pipeline.id] && <div className="tree-children">{pipeline.projects.length ? pipeline.projects.map(project => <button key={project.id} className={`sidebar-item project-item ${location.projectId === project.id ? 'selected' : ''}`} aria-current={location.projectId === project.id ? 'page' : undefined} onClick={() => application.navigate({ page: 'workspaces', projectId: project.id })}><span className="project-dot" /><span>{project.name}</span></button>) : <p className="tree-empty">No demo projects</p>}</div>}
        </div>)}
      </> : location.page === 'library' ? <>
        {librarySections.map((section, i) => <button key={section.id} className={`sidebar-item ${i === 4 ? 'section-divider' : ''} ${location.section === section.id ? 'selected' : ''}`} aria-current={location.section === section.id ? 'page' : undefined} onClick={() => application.navigate({ page: 'library', section: section.id, ...(['notes', 'recent', 'favorites'].includes(section.id) ? { noteId: 'demo-connected' } : {}) })}><FixtureIcon name={section.icon} /><span>{section.name}</span>{section.id === 'notes' && <span className="item-count">3</span>}</button>)}
        {['notes', 'recent', 'favorites'].includes(location.section) && <><div className="sidebar-section-label">NOTES <DemoBadge /></div><div role="group" aria-label="Demo note folders">{noteFolders.map(folder => <div key={folder.id}>
          <button className="sidebar-item folder-item" aria-expanded={!!expanded[folder.id]} onClick={() => toggle(folder.id)}>{expanded[folder.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<FolderClosed size={15} /><span>{folder.name}</span></button>
          {expanded[folder.id] && <div className="tree-children">{folder.notes.filter(note => location.section !== 'favorites' || note.favorite).map(note => <button key={note.id} className={`sidebar-item note-item ${location.noteId === note.id ? 'selected' : ''}`} aria-current={location.noteId === note.id ? 'page' : undefined} onClick={() => application.navigate({ page: 'library', section: location.section, noteId: note.id })}><FileText size={14} /><span>{note.title}</span></button>)}</div>}
        </div>)}</div></>}
      </> : null}
  </div>;
}
