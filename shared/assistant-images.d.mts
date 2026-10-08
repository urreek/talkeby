export const MAX_ASSISTANT_IMAGE_BYTES: number;
export function localImagePath(reference: unknown): string | null;
export function referencedImagePaths(markdown: unknown): Set<string>;
export function assistantImageUrl(jobId: string, reference: unknown): string | null;
