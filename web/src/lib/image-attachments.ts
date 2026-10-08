import { useEffect, useRef, useState } from "react";
import { IMAGE_TYPES, MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES } from "../../../shared/image-limits.mjs";
import type { ImageAttachment } from "@/lib/types";

function readImage(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Try selecting it again.`));
    reader.onload = () => resolve({ name: file.name, mimeType: file.type, data: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  });
}

export function useImageAttachments(context: string) {
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [error, setError] = useState("");
  const [isReading, setIsReading] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setImages([]);
    setError("");
    setIsReading(false);
    return () => { generation.current += 1; };
  }, [context]);

  async function addImages(files: File[]) {
    if (!files.length || isReading) return;
    setError("");
    const total = images.reduce((sum, image) => sum + image.data.length * 3 / 4, 0)
      + files.reduce((sum, file) => sum + file.size, 0);
    if (images.length + files.length > MAX_IMAGES || total > MAX_TOTAL_IMAGE_BYTES
      || files.some((file) => !IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES || !file.size)) {
      setError("Choose up to 3 PNG, JPEG, or WebP images (5 MB each, 10 MB total).");
      return;
    }
    const currentGeneration = generation.current;
    setIsReading(true);
    try {
      const selected = await Promise.all(files.map(readImage));
      if (currentGeneration === generation.current) setImages((current) => [...current, ...selected]);
    } catch (failure) {
      if (currentGeneration === generation.current) setError(failure instanceof Error ? failure.message : "Could not read image.");
    } finally {
      if (currentGeneration === generation.current) setIsReading(false);
    }
  }

  return { images, setImages, error, isReading, addImages };
}
