import { z } from 'zod';
const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(2_000_000);
export const blockSchema = z.object({ id, kind: z.string().min(1).max(48), from: integer, to: integer }).strict();
const bodySchema = z.object({ title: z.string().max(500), markdown: text }).strict();
export const createSchema = bodySchema.extend({ folderId: id.nullable().optional() }).strict();
export const metaSchema = z.object({ commandId: id }).strict();
export const saveSchema = bodySchema.extend({ noteId: id, expectedRevision: integer.positive(), changeSeq: integer.positive(), blocks: z.array(blockSchema).max(50_000) }).strict();
export const sceneSchema = z.object({ schemaVersion: z.literal(1), recentNoteId: id.nullable(), editors: z.record(id, z.object({ anchor: integer, head: integer, scrollTop: z.number().finite().nonnegative(), scrollLeft: z.number().finite().nonnegative(), viewMode: z.enum(['live', 'reading', 'source']).optional(), readingScrollTop: z.number().finite().nonnegative().optional(), pageWidth: z.enum(['centered', 'full']).optional() }).strict()) }).strict();
export const recoverySchema = bodySchema.extend({ noteId: id, sessionId: id, baseRevision: integer.positive(), changeSeq: integer.positive(), blocks: z.array(blockSchema).max(50_000), updatedAt: z.iso.datetime() }).strict();
export const noteRequestSchemas = {
  listNotes: z.tuple([]), getNote: z.tuple([id]), createNote: z.tuple([createSchema, metaSchema]), saveNote: z.tuple([saveSchema, metaSchema]),
  loadScene: z.tuple([]), saveScene: z.tuple([sceneSchema]), readRecovery: z.tuple([id]), putRecovery: z.tuple([recoverySchema]), clearRecovery: z.tuple([id, id, integer])
};
export type NoteMethod = keyof typeof noteRequestSchemas;
export const noteRequestSchema = z.object({ protocolVersion: z.literal(2), requestId: id, method: z.enum(Object.keys(noteRequestSchemas) as [NoteMethod, ...NoteMethod[]]), args: z.array(z.unknown()).max(3) }).strict();
