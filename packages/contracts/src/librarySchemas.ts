import { z } from 'zod';
import { metaSchema } from './noteSchemas';
const id = z.uuidv7();
export const libraryTargetSchema = z.object({ kind: z.enum(['note', 'folder']), id }).strict();
const name = z.string().trim().min(1).max(200).refine(value => !/[\\/]/.test(value) && [...value].every(character => character.charCodeAt(0) >= 32) && !['.', '..'].includes(value), 'Invalid folder name');
const scope = z.string().regex(/^(tree|notes|favorites|daily|folder:(root|[0-9a-f-]{36}))$/);
const mode = z.enum(['manual', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'modified-desc', 'modified-asc']);
export const libraryCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create-folder'), name, parentFolderId: id.nullable() }).strict(),
  z.object({ type: z.literal('rename-folder'), id, name }).strict(),
  z.object({ type: z.literal('move'), target: libraryTargetSchema, parentFolderId: id.nullable(), beforeId: id.optional(), scope: scope.optional() }).strict(),
  z.object({ type: z.literal('reorder-view'), key: z.enum(['notes', 'favorites', 'daily']), noteId: id, beforeId: id.optional() }).strict(),
  z.object({ type: z.literal('favorite'), noteId: id, value: z.boolean() }).strict(),
  z.object({ type: z.literal('sort'), key: scope, mode }).strict(),
  z.object({ type: z.literal('visit'), noteId: id }).strict(),
  z.object({ type: z.literal('trash'), planId: id, fingerprint: id }).strict(),
  z.object({ type: z.literal('restore'), batchId: id }).strict()
]);
export const libraryWriteSchema = z.object({ expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), command: libraryCommandSchema }).strict();
export const libraryRequestSchemas = { getLibrary: z.tuple([]), writeLibrary: z.tuple([libraryWriteSchema, metaSchema]), previewTrash: z.tuple([libraryTargetSchema]) };
export type LibraryMethod = keyof typeof libraryRequestSchemas;
export const libraryRequestSchema = z.object({ protocolVersion: z.literal(1), requestId: id, method: z.enum(['getLibrary', 'writeLibrary', 'previewTrash']), args: z.array(z.unknown()).max(2) }).strict();
