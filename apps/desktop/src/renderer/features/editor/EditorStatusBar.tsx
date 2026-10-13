import { AlertCircle, Check, LoaderCircle } from 'lucide-react';
import type { DocumentSessionSnapshot } from '@syna/contracts';
export function EditorStatusBar({ session, retry, details }: { session: DocumentSessionSnapshot; retry: () => void; details: () => void }) {
  const time = new Date(session.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const label = session.state === 'clean' ? `已保存 · ${time}` : session.state === 'dirty' ? '有未保存修改' : session.state === 'saving' ? '保存中…' : session.state === 'error' ? '保存失败 · 重试' : '版本冲突 · 查看详情';
  return <div className="document-status"><span>Markdown</span><output aria-label="Save status" aria-live="polite" data-save-state={session.state} data-saved-at={session.savedAt} title={`Last confirmed commit: ${session.savedAt}`}>
    {session.state === 'clean' ? <Check size={12} /> : session.state === 'saving' ? <LoaderCircle size={12} className="saving-spinner" /> : session.state === 'error' || session.state === 'conflict' ? <AlertCircle size={12} /> : <span className="unsaved-dot" />}
    {session.state === 'error' || session.state === 'conflict' ? <button onClick={session.state === 'error' ? retry : details}>{label}</button> : label}
  </output></div>;
}
