export const DRIVE_MIME_TYPES = {
  'application/vnd.google-apps.document': { label: 'Google Docs', path: 'document' },
  'application/vnd.google-apps.spreadsheet': { label: 'Google Sheets', path: 'spreadsheets' },
  'application/vnd.google-apps.presentation': { label: 'Google Slides', path: 'presentation' },
  'application/pdf': { label: 'PDF', path: null },
} as const;
export interface DriveFile {
  id: string;
  name: string;
  mimeType: keyof typeof DRIVE_MIME_TYPES;
  resourceKey?: string;
  height?: number;
}
export function normalizeDriveFile(value: unknown): DriveFile {
  if (!value || typeof value !== 'object') throw new Error('Choose a Google document, spreadsheet, presentation, or PDF.');
  const file = value as Record<string, unknown>;
  if (typeof file.id !== 'string' || !/^[\w-]{1,200}$/.test(file.id) || typeof file.mimeType !== 'string' || !Object.hasOwn(DRIVE_MIME_TYPES, file.mimeType)) {
    throw new Error('This file cannot be embedded. Choose a Google Doc, Sheet, Slide deck, or PDF.');
  }
  return {
    id: file.id, name: typeof file.name === 'string' ? file.name.slice(0, 300) : 'Google Drive document',
    mimeType: file.mimeType as DriveFile['mimeType'],
    ...(typeof file.resourceKey === 'string' && /^[\w-]{1,200}$/.test(file.resourceKey) ? { resourceKey: file.resourceKey } : {}),
    height: typeof file.height === 'number' && Number.isFinite(file.height) ? Math.min(1200, Math.max(320, Math.round(file.height))) : 560,
  };
}
export function driveFileUrls(value: DriveFile): { embed: string; original: string } {
  const file = normalizeDriveFile(value);
  const path = DRIVE_MIME_TYPES[file.mimeType].path;
  const original = new URL(path ? `https://docs.google.com/${path}/d/${file.id}/edit` : `https://drive.google.com/file/d/${file.id}/view`);
  const embed = new URL(path ? `https://docs.google.com/${path}/d/${file.id}/${path === 'presentation' ? 'embed' : 'preview'}` : `https://drive.google.com/file/d/${file.id}/preview`);
  if (file.resourceKey) { original.searchParams.set('resourcekey', file.resourceKey); embed.searchParams.set('resourcekey', file.resourceKey); }
  return { embed: embed.href, original: original.href };
}
