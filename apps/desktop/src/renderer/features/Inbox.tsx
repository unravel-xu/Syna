import { Inbox as InboxIcon, Link2, FileText, ArrowDown } from 'lucide-react';
import { DemoBadge } from '../shell/primitives';
export function Inbox() {
  return <div className="page-container inbox-page"><div className="page-title-row"><h1>Inbox</h1><DemoBadge>Not connected</DemoBadge></div><p className="page-description">A landing place for what catches your attention.</p><div className="empty-state inbox-empty"><div className="inbox-illustration" aria-hidden="true"><span><Link2 size={19} /></span><span><FileText size={20} /></span><ArrowDown size={19} /><InboxIcon size={49} strokeWidth={1.1} /></div><h2>Let the interesting things find a home.</h2><p>Links, papers, and passing thoughts will start here.<br />Capture and triage are not connected in this preview.</p><button className="button secondary" disabled title="Capture will be available in a later phase">Capture an input <span className="subtle-label">Coming later</span></button></div></div>;
}
