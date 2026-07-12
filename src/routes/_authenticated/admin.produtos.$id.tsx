import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductForm, emptyProduct, type ProductFormValues } from "@/components/admin/ProductForm";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/produtos/$id")({
  component: EditProduct,
});

function EditProduct() {
  const { id } = useParams({ from: "/_authenticated/admin/produtos/$id" });
  const q = useQuery({
    queryKey: ["admin-product", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      const { data: imgs } = await supabase.from("product_images").select("url, display_order").eq("product_id", id).is("deleted_at", null).order("display_order");
      const { data: pvs } = await supabase.from("product_previews").select("file_url, display_order").eq("product_id", id).is("deleted_at", null).order("display_order");
      return {
        product: data,
        gallery: (imgs ?? []).map((i: any) => i.url),
        previews: (pvs ?? []).map((p: any) => p.file_url),
      };
    },
  });
  if (q.isLoading) return <div className="p-10 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!q.data?.product) return <div className="p-10 text-center text-sm text-muted-foreground">Produto não encontrado.</div>;
  const p = q.data.product;
  const initial: ProductFormValues = {
    ...emptyProduct,
    title: p.title ?? "",
    slug: p.slug ?? "",
    category_id: p.category_id,
    product_type: p.product_type,
    short_description: p.short_description ?? "",
    full_description: p.full_description ?? "",
    price: Number(p.price ?? 0),
    promo_price: p.promo_price ? Number(p.promo_price) : null,
    cover_url: p.cover_url,
    video_url: p.video_url,
    preview_pdf_url: p.preview_pdf_url,
    cta_url: (p as { cta_url?: string | null }).cta_url ?? null,
    status: (p.status ?? "draft") as ProductFormValues["status"],
    is_featured: p.is_featured,
    display_order: p.display_order ?? 0,
    rating_avg: Number(p.rating_avg ?? 0),
    rating_count: p.rating_count ?? 0,
    sales_count: p.sales_count ?? 0,
    placements: Array.isArray(p.placements) ? p.placements : [],
    meta_title: p.meta_title ?? "",
    meta_description: p.meta_description ?? "",
    og_image_url: p.og_image_url,
    faq: Array.isArray(p.faq) ? (p.faq as ProductFormValues["faq"]) : [],
    related_ids: p.related_ids ?? [],
  };
  return <ProductForm initial={initial} productId={id} initialGallery={q.data.gallery} initialPreviews={q.data.previews} />;
}