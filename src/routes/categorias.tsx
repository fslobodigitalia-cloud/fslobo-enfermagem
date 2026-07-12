import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/categorias")({
  head: () => ({ meta: [{ title: "Categorias — FSlobo" }] }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const q = useQuery({
    queryKey: ["public-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, description, image_url, slug")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-5 animate-fade-in">
      <h1 className="text-[22px] font-extrabold text-foreground">Categorias</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">Explore todo o conteúdo por tema.</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {q.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {!q.isLoading && (q.data ?? []).length === 0 && (
          <p className="col-span-2 text-center text-[13px] text-muted-foreground py-10">
            Nenhuma categoria cadastrada ainda.
          </p>
        )}
        {(q.data ?? []).map((c) => {
          const img = safeImageUrl(c.image_url);
          return (
            <div key={c.id} className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] tap-scale">
              <div className="aspect-[16/10] overflow-hidden">
                {img ? (
                  <img src={img} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <ImagePlaceholder />
                )}
              </div>
              <div className="p-4">
                <p className="text-[14px] font-bold text-foreground">{c.name}</p>
                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                  {c.description || "Ver materiais"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}