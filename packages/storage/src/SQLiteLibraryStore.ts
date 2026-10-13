import type { DatabaseSync } from 'node:sqlite';
import type { DeletePlan, Folder, LibraryState, Placement, ProjectNoteLink, SortMode, TrashBatch } from '@syna/contracts';
export class SQLiteLibraryStore {
  constructor(private db: DatabaseSync) {}
  read(): LibraryState {
    const meta = this.db.prepare('SELECT revision,preferences FROM library_meta WHERE id=1').get() as { revision: number; preferences: string };
    const folders = this.db.prepare('SELECT payload FROM folders').all().map(row => JSON.parse(row.payload as string) as Folder);
    const placements = this.db.prepare('SELECT kind,entity_id,parent_folder_id,order_key,trashed_by FROM placements').all().map(row => ({ kind: row.kind, id: row.entity_id, parentFolderId: row.parent_folder_id, orderKey: row.order_key, trashedBy: row.trashed_by })) as Placement[];
    const flags = Object.fromEntries(this.db.prepare('SELECT note_id,payload FROM note_flags').all().map(row => [row.note_id, JSON.parse(row.payload as string)]));
    const viewOrders: Record<string, string[]> = {};
    for (const row of this.db.prepare('SELECT view_key,note_id FROM view_placements ORDER BY view_key,order_key,note_id').all()) (viewOrders[row.view_key as string] ??= []).push(row.note_id as string);
    const trash = this.db.prepare('SELECT payload FROM trash_batches').all().map(row => JSON.parse(row.payload as string) as TrashBatch);
    const links = this.db.prepare('SELECT id,project_id,note_id FROM project_note_links').all().map(row => ({ id: row.id, projectId: row.project_id, noteId: row.note_id })) as ProjectNoteLink[];
    return { revision: meta.revision, preferences: JSON.parse(meta.preferences) as Record<string, SortMode>, folders, placements, flags, viewOrders, trash, links };
  }
  write(state: LibraryState) {
    this.db.prepare('UPDATE library_meta SET revision=?,preferences=? WHERE id=1').run(state.revision, JSON.stringify(state.preferences));
    for (const folder of state.folders) this.db.prepare('INSERT INTO folders VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,payload=excluded.payload').run(folder.id, folder.parentId, JSON.stringify(folder));
    for (const item of state.placements) this.db.prepare('INSERT INTO placements VALUES(?,?,?,?,?) ON CONFLICT(kind,entity_id) DO UPDATE SET parent_folder_id=excluded.parent_folder_id,order_key=excluded.order_key,trashed_by=excluded.trashed_by').run(item.kind, item.id, item.parentFolderId, item.orderKey, item.trashedBy);
    for (const [id, flags] of Object.entries(state.flags)) this.db.prepare('INSERT INTO note_flags VALUES(?,?) ON CONFLICT(note_id) DO UPDATE SET payload=excluded.payload').run(id, JSON.stringify(flags));
    this.db.exec('DELETE FROM view_placements; DELETE FROM trash_batches;');
    for (const [key, ids] of Object.entries(state.viewOrders)) ids.forEach((id, index) => this.db.prepare('INSERT INTO view_placements VALUES(?,?,?)').run(key, id, index));
    for (const batch of state.trash) this.db.prepare('INSERT INTO trash_batches VALUES(?,?)').run(batch.id, JSON.stringify(batch));
    // Project memberships are deliberately never rewritten by a Library placement command.
  }
  plan(id: string): DeletePlan | undefined { const row = this.db.prepare('SELECT payload FROM deletion_plans WHERE id=?').get(id); return row ? JSON.parse(row.payload as string) : undefined; }
  retainPlan(plan: DeletePlan) { this.db.prepare('DELETE FROM deletion_plans WHERE expires_at < ?').run(new Date().toISOString()); this.db.prepare('INSERT INTO deletion_plans VALUES(?,?,?)').run(plan.id, plan.expiresAt, JSON.stringify(plan)); }
}
export const libraryMigration = `
  ALTER TABLE notes ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
  UPDATE notes SET created_at=COALESCE((SELECT json_extract(document,'$.updatedAt') FROM note_revisions WHERE note_id=notes.id AND revision=1),updated_at);
  UPDATE notes SET document=json_set(document,'$.createdAt',created_at);
  CREATE TABLE folders(id TEXT PRIMARY KEY,parent_id TEXT REFERENCES folders(id) DEFERRABLE INITIALLY DEFERRED,payload TEXT NOT NULL);
  CREATE TABLE placements(kind TEXT NOT NULL CHECK(kind IN ('note','folder')),entity_id TEXT NOT NULL,parent_folder_id TEXT REFERENCES folders(id) DEFERRABLE INITIALLY DEFERRED,order_key INTEGER NOT NULL,trashed_by TEXT,PRIMARY KEY(kind,entity_id));
  CREATE INDEX placement_children ON placements(parent_folder_id,trashed_by,order_key);
  INSERT INTO placements SELECT 'note',id,NULL,ROW_NUMBER() OVER(ORDER BY created_at,id)-1,NULL FROM notes;
  CREATE TABLE library_meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,preferences TEXT NOT NULL);
  INSERT INTO library_meta VALUES(1,0,'{}');
  CREATE TABLE note_flags(note_id TEXT PRIMARY KEY REFERENCES notes(id),payload TEXT NOT NULL);
  CREATE TABLE view_placements(view_key TEXT NOT NULL,note_id TEXT NOT NULL REFERENCES notes(id),order_key INTEGER NOT NULL,PRIMARY KEY(view_key,note_id));
  CREATE TABLE trash_batches(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  CREATE TABLE deletion_plans(id TEXT PRIMARY KEY,expires_at TEXT NOT NULL,payload TEXT NOT NULL);
  CREATE TABLE project_note_links(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,note_id TEXT NOT NULL REFERENCES notes(id),UNIQUE(project_id,note_id));
  CREATE TRIGGER project_link_insert AFTER INSERT ON project_note_links BEGIN UPDATE library_meta SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER project_link_delete AFTER DELETE ON project_note_links BEGIN UPDATE library_meta SET revision=revision+1 WHERE id=1; END;
  CREATE TRIGGER project_link_update AFTER UPDATE ON project_note_links BEGIN UPDATE library_meta SET revision=revision+1 WHERE id=1; END;
  PRAGMA user_version=2;
`;
