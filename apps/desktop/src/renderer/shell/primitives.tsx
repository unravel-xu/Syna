import type { ButtonHTMLAttributes } from 'react';
import { BookOpen, Building2, CalendarDays, Clock3, FileText, FolderClosed, GraduationCap, Inbox, Layers3, Microscope, Star, Trash2, Image, MessagesSquare } from 'lucide-react';
export const icons = { notes: FileText, recent: Clock3, favorites: Star, daily: CalendarDays, references: BookOpen, assets: Image, collections: Layers3, trash: Trash2, research: Microscope, interview: MessagesSquare, course: GraduationCap, company: Building2, inbox: Inbox, folder: FolderClosed };
export function FixtureIcon({ name, size = 16 }: { name: string; size?: number }) { const Icon = icons[name as keyof typeof icons] ?? FileText; return <Icon size={size} strokeWidth={1.65} aria-hidden="true" />; }
export function IconButton({ label, title = label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} aria-label={label} title={title} className={`icon-button ${className}`}>{children}</button>;
}
export function DemoBadge({ children = 'Demo' }: { children?: React.ReactNode }) { return <span className="demo-badge">{children}</span>; }
export function Brand({ small = false }: { small?: boolean }) { return <svg width={small ? 20 : 28} height={small ? 20 : 28} viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M21 7.5H11a4.5 4.5 0 0 0 0 9h6a3 3 0 0 1 0 6H7M7 20.5h10a4.5 4.5 0 0 0 0-9h-6a3 3 0 0 1 0-6h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
