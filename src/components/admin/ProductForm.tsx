import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, Trash2, Copy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ImageUploader, GalleryUploader, uploadFileToBucket } from "./ImageUploader";
import { slugify } from "@/lib/slug";

type ProductType = "digital" | "physical" | "affiliate";
type Status = "draft" | "published" | "archived";

export type ProductFormValues = {
  title: string;
  slug: string;
  category_id: string | null;
  product_type: ProductType;
  short_description: string;
  full_description: string;
  price: number;
  promo_price: number | null;
  cover_url: string | null;
  video_url: string | null;
  preview_pdf_url: string | null;
  cta_url: string | null;
  status: Status;
  is_featured: boolean;
  display_order: number;
  rating_avg: number;
  rating_count: number;
  sales_count: number;
  placements: string[];
  meta_title: string;
  meta_description: string;
  og_image_url: string | null;
  faq: { question: string; answer: string }[];
  related_ids: string[];
};

export const emptyProduct: ProductFormValues = {
  title: "",
  slug: "",
  category_id: null,
  product_type: "digital",
  short_description: "",
  full_description: "",
  price: 0,
  promo_price: null,
  cover_url: null,
  video_url: null,
  preview_pdf_url: null,
  cta_url: null,
  status: "published",
  is_featured: false,
  display_order: 0,
  rating_avg: 0,
  rating_count: 0,
  sales_count: 0,
  placements: [],
  meta_title: "",
  meta_description: "",
  og_image_url: null,
  faq: [],
  related_ids: [],
};

export const PLACEMENT_OPTIONS: { id: string; label: string }[] = [
  { id: "bestsellers", label: "Mais vendidos" },
  { id: "promo", label: "Promoções" },
  { id: "launches", label: "Lançamentos" },
  { id: "recommended", label: "Recomendados" },
];

export function ProductForm({
  initial,
  productId,
  initialGallery = [],
  initialPreviews = [],
}: {
  initial: ProductFormValues;
  productId?: string;
  initialGallery?: string[];
  initialPreviews?: string[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [v, setV] = useState<ProductFormValues>(initial);
  const [gallery, setGallery] = useState<string[]>(initialGallery);
  const [previews, setPreviews] = useState<string[]>(initialPreviews);
  const [autoSlug, setAutoSlug] = useState(!productId);

  useEffect(() => {
    if (autoSlug) setV((s) => ({ ...s, slug: slugify(s.title) }));
  }, [v.title, autoSlug]);

  const cats = useQuery({
    queryKey: ["admin-categories-select"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").is("deleted_at", null).order("name");
      return data ?? [];
    },
  });

  async function syncGallery(productId: string) {
    // Simple approach: soft-delete existing then re-insert
    await supabase.from("product_images").update({ deleted_at: new Date().toISOString() }).eq("product_id", productId).is("deleted_at", null);
    if (gallery.length) {
      await supabase.from("product_images").insert(
        gallery.map((url, i) => ({ product_id: productId, url, display_order: i })),
      );
    }
  }

  async function syncPreviews(productId: string) {
    await supabase.from("product_previews").update({ deleted_at: new Date().toISOString() }).eq("product_id", productId).is("deleted_at", null);
    if (previews.length) {
      await supabase.from("product_previews").insert(
        previews.map((url, i) => ({ product_id: productId, file_url: url, file_type: "image", display_order: i })),
      );
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!v.title.trim()) throw new Error("Título é obrigatório");
      if (!v.slug.trim()) throw new Error("Slug é obrigatório");
      const payload = {
        ...v,
        price: Number(v.price) || 0,
        promo_price: v.promo_price ? Number(v.promo_price) : null,
        rating_avg: Math.max(0, Math.min(5, Number(v.rating_avg) || 0)),
        rating_count: Math.max(0, Math.floor(Number(v.rating_count) || 0)),
        sales_count: Math.max(0, Math.floor(Number(v.sales_count) || 0)),
        placements: Array.isArray(v.placements) ? v.placements : [],
      };
      if (productId) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId);
        if (error) throw error;
        await syncGallery(productId);
        await syncPreviews(productId);
        return productId;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
        if (error) throw error;
        await syncGallery(data.id);
        await syncPreviews(data.id);
        return data.id;
      }
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-count"] });
      qc.invalidateQueries({ queryKey: ["public-products"] });
      toast.success(productId ? "Produto atualizado" : "Produto criado");
      if (!productId) navigate({ to: "/admin/produtos/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const duplicate = useMutation({
    mutationFn: async () => {
      const payload = { ...v, slug: `${v.slug}-copia-${Date.now().toString(36)}`, title: `${v.title} (cópia)`, status: "draft" as Status };
      const { data, error } = await supabase.from("products").insert(payload).select("id").single();
      if (error) throw error;
      if (gallery.length) {
        await supabase.from("product_images").insert(gallery.map((url, i) => ({ product_id: data.id, url, display_order: i })));
      }
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      toast.success("Produto duplicado");
      navigate({ to: "/admin/produtos/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!productId) return;
      const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["public-products"] });
      toast.success("Produto excluído");
      navigate({ to: "/admin/produtos" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha"),
  });

  function set<K extends keyof ProductFormValues>(k: K, val: ProductFormValues[K]) {
    setV((s) => ({ ...s, [k]: val }));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  async function onPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadFileToBucket("previews", file);
      set("preview_pdf_url", url);
      toast.success("PDF enviado");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha no upload");
    }
  }

  return (
    <form onSubmit={onSubmit} className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigate({ to: "/admin/produtos" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
        <h1 className="text-xl font-bold flex-1">{productId ? "Editar produto" : "Novo produto"}</h1>
        {productId && (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
              <Copy className="h-4 w-4 mr-1" /> Duplicar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação pode ser revertida no banco (soft delete).</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Salvar
        </Button>
      </div>

      <Tabs defaultValue="basic">
        <TabsList>
          <TabsTrigger value="basic">Básico</TabsTrigger>
          <TabsTrigger value="media">Mídia</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4 pt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Slug *</Label>
              <Input value={v.slug} onChange={(e) => { setAutoSlug(false); set("slug", slugify(e.target.value)); }} required />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={v.category_id ?? "__none"} onValueChange={(x) => set("category_id", x === "__none" ? null : x)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem categoria</SelectItem>
                  {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={v.product_type} onValueChange={(x) => set("product_type", x as ProductType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="digital">Digital</SelectItem>
                  <SelectItem value="physical">Físico</SelectItem>
                  <SelectItem value="affiliate">Afiliado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Preço (R$)</Label>
              <Input type="number" step="0.01" value={v.price} onChange={(e) => set("price", Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Preço promocional (R$)</Label>
              <Input type="number" step="0.01" value={v.promo_price ?? ""} onChange={(e) => set("promo_price", e.target.value ? Number(e.target.value) : null)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={v.status} onValueChange={(x) => set("status", x as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="published">Publicado</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ordem</Label>
              <Input type="number" value={v.display_order} onChange={(e) => set("display_order", Number(e.target.value))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Link do CTA (botão de compra)</Label>
              <Input
                type="url"
                placeholder="https://checkout.exemplo.com/seu-produto"
                value={v.cta_url ?? ""}
                onChange={(e) => set("cta_url", e.target.value || null)}
              />
              <p className="text-[11px] text-muted-foreground">
                Aplicável a produtos digitais e físicos. Se preenchido, o botão &quot;Quero garantir agora&quot; abre este link em nova aba (checkout, WhatsApp, afiliado etc.).
              </p>
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <Switch checked={v.is_featured} onCheckedChange={(x) => set("is_featured", x)} />
              <Label>Produto em destaque</Label>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Avaliação (0–5)</Label>
              <Input
                type="number" step="0.1" min={0} max={5}
                value={v.rating_avg}
                onChange={(e) => set("rating_avg", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nº de avaliações</Label>
              <Input
                type="number" min={0}
                value={v.rating_count}
                onChange={(e) => set("rating_count", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Nº de compras / vendas</Label>
              <Input
                type="number" min={0}
                value={v.sales_count}
                onChange={(e) => set("sales_count", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Exibir nas seções da home</Label>
            <p className="text-xs text-muted-foreground">
              Selecione onde este produto deve aparecer. Deixe vazio para não aparecer em nenhuma seção destacada.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {PLACEMENT_OPTIONS.map((opt) => {
                const active = v.placements.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      set(
                        "placements",
                        active
                          ? v.placements.filter((p) => p !== opt.id)
                          : [...v.placements, opt.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição curta</Label>
            <Textarea rows={2} value={v.short_description} onChange={(e) => set("short_description", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Descrição completa (Markdown)</Label>
            <Textarea rows={10} value={v.full_description} onChange={(e) => set("full_description", e.target.value)} className="font-mono text-xs" />
          </div>
        </TabsContent>

        <TabsContent value="media" className="space-y-6 pt-4">
          <ImageUploader value={v.cover_url} onChange={(u) => set("cover_url", u)} label="Imagem principal" />
          <GalleryUploader value={gallery} onChange={setGallery} />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Prévias do material (aparecem no carrossel do produto, proporção 1080×1350 / 4:5)</p>
            <GalleryUploader value={previews} onChange={setPreviews} />
          </div>
          <div className="space-y-2 max-w-md">
            <Label>URL do vídeo (YouTube, Vimeo)</Label>
            <Input value={v.video_url ?? ""} onChange={(e) => set("video_url", e.target.value || null)} />
          </div>
          <div className="space-y-2 max-w-md">
            <Label>PDF de prévia</Label>
            {v.preview_pdf_url && (
              <p className="text-xs">
                <a href={v.preview_pdf_url} target="_blank" rel="noreferrer" className="text-primary underline">
                  Ver PDF atual
                </a>{" "}
                · <button type="button" className="text-destructive" onClick={() => set("preview_pdf_url", null)}>remover</button>
              </p>
            )}
            <Input type="file" accept="application/pdf" onChange={onPdf} />
          </div>
        </TabsContent>

        <TabsContent value="seo" className="space-y-4 pt-4 max-w-2xl">
          <div className="space-y-2">
            <Label>Meta title</Label>
            <Input value={v.meta_title} onChange={(e) => set("meta_title", e.target.value)} maxLength={70} />
          </div>
          <div className="space-y-2">
            <Label>Meta description</Label>
            <Textarea rows={3} value={v.meta_description} onChange={(e) => set("meta_description", e.target.value)} maxLength={180} />
          </div>
          <ImageUploader value={v.og_image_url} onChange={(u) => set("og_image_url", u)} label="Imagem Open Graph" />
        </TabsContent>

        <TabsContent value="faq" className="space-y-3 pt-4 max-w-2xl">
          {v.faq.map((f, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <Input placeholder="Pergunta" value={f.question} onChange={(e) => {
                const next = [...v.faq]; next[i] = { ...next[i], question: e.target.value }; set("faq", next);
              }} />
              <Textarea rows={2} placeholder="Resposta" value={f.answer} onChange={(e) => {
                const next = [...v.faq]; next[i] = { ...next[i], answer: e.target.value }; set("faq", next);
              }} />
              <Button type="button" size="sm" variant="ghost" onClick={() => set("faq", v.faq.filter((_, ix) => ix !== i))}>
                Remover
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("faq", [...v.faq, { question: "", answer: "" }])}>
            + Adicionar pergunta
          </Button>
        </TabsContent>
      </Tabs>
    </form>
  );
}