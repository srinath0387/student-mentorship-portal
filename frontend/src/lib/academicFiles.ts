import { api } from './api';

/** Shrink a photo to max 1600 px JPEG (~200–400 KB) before upload. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob(b => res(b || file), 'image/jpeg', quality));
  } finally { URL.revokeObjectURL(url); }
}

/** Upload straight to S3 with a presigned URL; returns the stored file key. */
export async function uploadAcademicFile(kind: 'events' | 'lesson-plans' | 'meetings', file: File): Promise<{ key: string; name: string }> {
  const isImg = file.type.startsWith('image/');
  const body = isImg ? await compressImage(file) : file;
  const contentType = isImg ? 'image/jpeg' : file.type;
  const name = isImg ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  const { uploadUrl, fileKey } = await api.getAcademicUploadUrl(kind, name, contentType);
  const r = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!r.ok) throw new Error(`Upload failed (${r.status})`);
  return { key: fileKey, name };
}
