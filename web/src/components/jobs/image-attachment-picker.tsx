import { useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImageAttachment } from "@/lib/types";

type Props = {
  images: ImageAttachment[];
  disabled: boolean;
  supported: boolean;
  error: string;
  onAdd: (files: File[]) => Promise<void>;
  onRemove: (index: number) => void;
};

export function ImageAttachmentPicker({ images, disabled, supported, error, onAdd, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple
        className="sr-only" aria-label="Select image attachments" disabled={disabled || !supported}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          void onAdd(files);
        }} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || !supported || images.length >= 3}
          onClick={() => input.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" /> Attach images
        </Button>
        <span className="text-xs text-muted-foreground">
          {supported ? "PNG, JPEG, WebP · 3 images · 5 MB each" : "Select Codex to attach images"}
        </span>
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((image, index) => (
            <div key={index} className="relative w-24">
              <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name}
                className="h-24 w-24 rounded-md border object-cover" />
              <Button type="button" variant="secondary" size="icon" disabled={disabled}
                className="absolute right-1 top-1 h-6 w-6" aria-label={`Remove ${image.name}`}
                onClick={() => onRemove(index)}><X className="h-4 w-4" /></Button>
              <p className="truncate text-xs text-muted-foreground" title={image.name}>{image.name}</p>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!supported && images.length > 0 && <p role="alert" className="text-sm text-destructive">Select Codex or remove the images before sending.</p>}
    </div>
  );
}
