import { EditorSelection, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
export interface SlashCommand { id: string; label: string; symbol: string; keywords: string; prefix: string; suffix?: string; caret?: number }
// Real Markdown transactions only. Future contributions can extend this list without a plugin host.
export const slashCommands: readonly SlashCommand[] = [
  { id: 'paragraph', label: '普通文本', symbol: '¶', keywords: 'paragraph text plain 普通 文本', prefix: '' },
  { id: 'h1', label: 'Heading 1', symbol: 'H1', keywords: 'heading title h1 标题 一级', prefix: '# ' },
  { id: 'h2', label: 'Heading 2', symbol: 'H2', keywords: 'heading subtitle h2 标题 二级', prefix: '## ' },
  { id: 'h3', label: 'Heading 3', symbol: 'H3', keywords: 'heading subtitle h3 标题 三级', prefix: '### ' },
  { id: 'bullet', label: 'Bullet List', symbol: '•', keywords: 'bullet unordered list 无序 列表', prefix: '- ' },
  { id: 'numbered', label: 'Numbered List', symbol: '1.', keywords: 'numbered ordered list 有序 列表', prefix: '1. ' },
  { id: 'task', label: 'Task List', symbol: '☑', keywords: 'todo task checklist 待办 清单', prefix: '- [ ] ' },
  { id: 'quote', label: 'Quote', symbol: '❯', keywords: 'quote blockquote 引用', prefix: '> ' },
  { id: 'code', label: 'Code Block', symbol: '</>', keywords: 'code fence 代码', prefix: '```\n', suffix: '\n```', caret: 4 },
  { id: 'divider', label: 'Divider', symbol: '─', keywords: 'divider horizontal rule 分割线', prefix: '---\n\n', caret: 5 }
];
export function filterCommands(query: string) { const search = query.toLowerCase().trim(); return slashCommands.filter(command => `${command.label} ${command.keywords}`.toLowerCase().includes(search)); }
export function insertCommand(view: EditorView, command: SlashCommand, trigger?: { from: number; to: number }) {
  if (view.state.readOnly || view.composing) return false;
  const range = trigger ?? view.state.selection.main, line = view.state.doc.lineAt(range.from);
  const end = trigger ? range.to : view.state.doc.lineAt(range.to).to;
  const before = view.state.sliceDoc(line.from, trigger ? trigger.from : end);
  const indent = before.match(/^\s*/)?.[0] ?? '';
  const content = trigger ? view.state.sliceDoc(trigger.to, line.to) : before.replace(/^\s*(?:(?:#{1,6}|>|[-+*]|\d+\.)\s+(?:\[[ xX]\]\s+)?)?/, '');
  const insert = indent + command.prefix + content + (command.suffix ?? '');
  const caret = line.from + indent.length + (command.caret ?? command.prefix.length);
  view.dispatch({ changes: { from: line.from, to: trigger ? line.to : end, insert }, selection: EditorSelection.cursor(caret), annotations: [Transaction.userEvent.of('input.slash'), isolateHistory.of('full')], scrollIntoView: true });
  view.focus(); return true;
}
