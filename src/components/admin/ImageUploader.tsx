import { useState, type ChangeEvent } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Formato inválido. Use JPG, PNG, WEBP, GIF ou SVG.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máximo 5 MB.`;
  }
  return null;
}

async function uploadTo(bucket: string, file: File, validate = true): Promise<string> {
  if (validate) {
    const err = validateImage(file);
    if (err) throw new Error(err);
  }
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  const { data, error: sErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (sErr || !data) throw sErr ?? new Error("Falha ao gerar URL");
  return data.signedUrl;
}

export function ImageUploader({
  value,
  onChange,
  bucket = "products",
  label = "Imagem",
}: {
  value?: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handle(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadTo(bucket, file);
      onChange(url);
      toast.success("Imagem enviada");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha no upload");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {value ? (
        <div className="relative inline-block">
          <img src={value} alt="" className="h-32 w-32 rounded-lg object-cover border" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground hover:bg-muted">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span>{busy ? "Enviando..." : "Enviar"}</span>
          <input type="file" accept="image/*" className="hidden" onChange={handle} disabled={busy} />
        </label>
      )}
    </div>
  );
}

export function GalleryUploader({
  value,
  onChange,
  bucket = "products",
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  bucket?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function handle(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of files) urls.push(await uploadTo(bucket, f));
      onChange([...value, ...urls]);
      toast.success(`${urls.length} imagem(ns) enviada(s)`);
    } catch (err: any) {
      toast.error(err?.message ?? "Falha no upload");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Galeria</p>
      <div className="flex flex-wrap gap-3">
        {value.map((url, i) => (
          <div key={url + i} className="relative">
            <img src={url} alt="" className="h-24 w-24 rounded-lg object-cover border" />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, ix) => ix !== i))}
              className="absolute -top-2 -right-2 grid h-6 w-6 place-items-center rounded-full bg-destructive text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground hover:bg-muted">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span>{busy ? "..." : "Add"}</span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={handle} disabled={busy} />
        </label>
      </div>
    </div>
  );
}

export async function uploadFileToBucket(bucket: string, file: File): Promise<string> {
  return uploadTo(bucket, file, false);
}