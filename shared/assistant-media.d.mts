export const MAX_PREVIEW_IMAGE_BYTES: number;
export const MAX_PREVIEW_IMAGE_PIXELS: number;
export const MAX_PREVIEW_VIDEO_BYTES: number;
export const PREVIEW_DIRECTORY: string;
export function mediaKind(reference: unknown): "image" | "video" | null;
export function localMediaPath(reference: unknown): string | null;
export function referencedMediaPaths(markdown: unknown): Set<string>;
export function assistantMediaUrl(jobId: string, reference: unknown): string | null;
