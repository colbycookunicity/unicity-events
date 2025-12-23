import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
  recommendedSize?: string;
  testId?: string;
}

export function ImageUploader({
  value,
  onChange,
  label = "Background Image",
  placeholder = "https://example.com/image.jpg",
  recommendedSize = "1920 x 1080 pixels (16:9 aspect ratio)",
  testId = "image-uploader",
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setError("Image must be less than 10MB");
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const filename = `hero-${Date.now()}.${ext}`;
      const relativePath = `images/${filename}`;

      const presignRes = await apiRequest("POST", "/api/objects/presign", {
        objectPath: relativePath,
        permission: "public-read",
      });
      const { uploadUrl } = await presignRes.json();

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("Upload error response:", errorText);
        throw new Error(`Upload failed: ${uploadRes.statusText || uploadRes.status}`);
      }

      const publicUrl = `/api/objects/public/${relativePath}`;
      onChange(publicUrl);
    } catch (err: any) {
      console.error("Upload error:", err);
      let errorMessage = "Failed to upload image. Please try again.";
      if (err.message) {
        const jsonMatch = err.message.match(/\{.*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            errorMessage = parsed.error || errorMessage;
          } catch {
            errorMessage = err.message;
          }
        }
      }
      setError(errorMessage);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClear = () => {
    onChange("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2 items-start">
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <Input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              data-testid={`${testId}-url`}
              className="flex-1"
            />
            {value && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={handleClear}
                data-testid={`${testId}-clear`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              data-testid={`${testId}-file`}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid={`${testId}-upload`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Image
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Recommended: {recommendedSize}
            </span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        {value && (
          <div className="w-20 h-12 rounded border overflow-hidden flex-shrink-0 bg-muted">
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}
        {!value && (
          <div className="w-20 h-12 rounded border overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
