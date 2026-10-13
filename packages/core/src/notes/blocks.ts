import { parser, GFM } from '@lezer/markdown';
import type { BlockIdentity } from '@syna/contracts';
import { uuidV7 } from './identity';
const markdownParser = parser.configure(GFM);
export interface TextEdit { from: number; to: number; insert: string }
function map(position: number, edits: readonly TextEdit[], association: -1 | 1): number {
  let delta = 0;
  for (const edit of edits) {
    if (position < edit.from || position === edit.from && association < 0) break;
    if (position <= edit.to) return edit.from + delta + (association < 0 ? 0 : edit.insert.length);
    delta += edit.insert.length - (edit.to - edit.from);
  }
  return position + delta;
}
// Reuse the legacy principle: identity follows edit coordinates, never text equality.
export function reconcileBlocks(source: string, previous: readonly BlockIdentity[] = [], edits: readonly TextEdit[] = []): readonly BlockIdentity[] {
  const blocks: BlockIdentity[] = [], used = new Set<string>();
  const tree = markdownParser.parse(source);
  const mapped = previous.map(block => ({ block, left: map(block.from, edits, -1), right: map(block.from, edits, 1), to: map(block.to, edits, 1) }));
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    const from = node.from, to = node.to, kind = node.name;
    const available = mapped.filter(item => !used.has(item.block.id) && item.to > item.left);
    const old = available.find(item => item.block.kind === kind && (item.right === from || item.left === from) && item.to === to)
      ?? available.find(item => item.left === from && item.to >= to && (item.left === item.right || to > item.right));
    const id = old?.block.id ?? uuidV7(); used.add(id); blocks.push({ id, kind, from, to });
  }
  return blocks;
}
