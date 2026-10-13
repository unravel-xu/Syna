import type { LibrarySection, Location, PageId } from '@syna/contracts';
export const DEMO_LABEL = 'Demo content';
export const pageLabels: Record<PageId, string> = { dashboard: 'Dashboard', inbox: 'Inbox', workspaces: 'Workspaces', library: 'Library', search: 'Search' };
export const pageLocations: Record<PageId, Location> = {
  dashboard: { page: 'dashboard' }, inbox: { page: 'inbox' },
  workspaces: { page: 'workspaces', projectId: 'demo-agentic' },
  library: { page: 'library', section: 'notes', noteId: 'demo-connected' }, search: { page: 'search' }
};
export const pipelines = [
  { id: 'research', name: 'Research', icon: 'research', projects: [
    { id: 'demo-agentic', name: 'Agentic Learning', description: 'Exploring how agents learn, reason, and improve.', phase: 'Explore', initials: 'AL' },
    { id: 'demo-rsi', name: 'RSI', description: 'A space for questions about recursive self-improvement.', phase: 'Define', initials: 'RS' }
  ] },
  { id: 'interview', name: 'Interview', icon: 'interview', projects: [] },
  { id: 'course', name: 'Course', icon: 'course', projects: [] },
  { id: 'company', name: 'Company', icon: 'company', projects: [] }
] as const;
export const projects = pipelines.flatMap(p => [...p.projects]);
export const librarySections: { id: LibrarySection; name: string; icon: string }[] = [
  { id: 'notes', name: 'All Notes', icon: 'notes' }, { id: 'recent', name: 'Recent', icon: 'recent' },
  { id: 'favorites', name: 'Favorites', icon: 'favorites' }, { id: 'daily', name: 'Daily Notes', icon: 'daily' },
  { id: 'references', name: 'References', icon: 'references' }, { id: 'assets', name: 'Assets', icon: 'assets' },
  { id: 'collections', name: 'Collections', icon: 'collections' }, { id: 'trash', name: 'Trash', icon: 'trash' }
];
export const noteFolders = [
  { id: 'getting-started', name: 'Getting started', notes: [
    { id: 'demo-connected', title: 'A place for connected thinking', favorite: true, description: 'A quiet home for your ideas, sources, and work.' },
    { id: 'demo-first', title: 'Your first workspace', favorite: false, description: 'Bring a question, a project, or a new direction.' }
  ] },
  { id: 'ideas', name: 'Ideas & fragments', notes: [
    { id: 'demo-fragments', title: 'Questions worth keeping', favorite: true, description: 'The beginning of an idea is often a good question.' }
  ] }
];
export const notes = noteFolders.flatMap(folder => folder.notes);
export const notePreview = {
  eyebrow: 'A SMALL BEGINNING',
  paragraphs: ['Good ideas rarely arrive fully formed. They start as a question, a passage you underline, or a connection you almost missed.',
    'Syna gives those small beginnings a place to grow. Keep your notes close to your sources, and your thinking close to your work.'],
  subheading: 'From information to understanding',
  points: ['Capture what catches your attention.', 'Connect it to a question that matters.', 'Make something of what you learn.'],
  callout: 'A useful knowledge system should make room for your thinking.'
};
export const stages = ['Explore', 'Connect', 'Synthesize'];
export const searchResults: { id: string; title: string; description: string; category: string; location: Location }[] = [
  ...notes.map(note => ({ id: note.id, title: note.title, description: note.description, category: 'Note', location: { page: 'library' as const, section: 'notes' as const, noteId: note.id } })),
  ...projects.map(project => ({ id: project.id, title: project.name, description: project.description, category: 'Project', location: { page: 'workspaces' as const, projectId: project.id } }))
];
export const quickLinks = [
  { page: 'library' as const, title: 'Find your words', description: 'Open the Notes workspace', icon: 'notes' },
  { page: 'workspaces' as const, title: 'Follow a question', description: 'Explore your workspaces', icon: 'research' },
  { page: 'inbox' as const, title: 'Make space for inputs', description: 'Visit your capture inbox', icon: 'inbox' }
];
