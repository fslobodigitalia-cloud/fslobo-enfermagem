import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BookOpen, Newspaper } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: [
      { title: "Blog — FSlobo Enfermagem" },
      { name: "description", content: "Artigos, dicas e conteúdos de enfermagem da FSlobo." },
      { property: "og:title", content: "Blog — FSlobo Enfermagem" },
      { property: "og:description", content: "Artigos, dicas e conteúdos de enfermagem." },
    ],
  }),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  const q = useQuery({
    queryKey: ["blog-posts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, cover_url, published_at, blog_categories(name, slug)")
        .eq("status", "published")
        .is("deleted_at", null)
        .order("published_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const posts = q.data ?? [];
  const [featured, ...rest] = posts;

  return (
    <div className="animate-fade-in pb-6">
      <header className="px-5 pt-4 pb-2 flex items-center gap-3">
        <Link to="/" aria-label="Voltar" className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-sm tap-scale">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">Conteúdo</p>
          <h1 className="text-[22px] font-extrabold text-foreground">Blog</h1>
        </div>
      </header>

      {q.isLoading ? (
        <div className="px-5 mt-3 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState icon={Newspaper} title="Nenhum artigo publicado" description="Volte em breve — novidades a caminho." />
      ) : (
        <div className="px-5 mt-3">
          {featured && (
            <Link to="/blog/$slug" params={{ slug: featured.slug }} className="block tap-scale">
              <article className="overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-card)]">
                <div className="aspect-[16/9] overflow-hidden bg-secondary">
                  {safeImageUrl(featured.cover_url) ? (
                    <img src={safeImageUrl(featured.cover_url)!} alt={featured.title} className="h-full w-full object-cover" />
                  ) : <ImagePlaceholder iconClassName="h-10 w-10" />}
                </div>
                <div className="p-4">
                  {featured.blog_categories?.name && (
                    <p className="text-[10.5px] font-bold uppercase tracking-wider text-primary">{featured.blog_categories.name}</p>
                  )}
                  <h2 className="mt-1.5 text-[17px] font-extrabold leading-snug text-foreground line-clamp-2">{featured.title}</h2>
                  {featured.excerpt && <p className="mt-2 line-clamp-2 text-[12.5px] text-muted-foreground">{featured.excerpt}</p>}
                  {featured.published_at && (
                    <p className="mt-2 text-[10.5px] font-semibold text-muted-foreground">
                      {formatDistanceToNow(new Date(featured.published_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  )}
                </div>
              </article>
            </Link>
          )}

          {rest.length > 0 && (
            <ul className="mt-4 space-y-3">
              {rest.map((p) => (
                <li key={p.id}>
                  <Link to="/blog/$slug" params={{ slug: p.slug }} className="block tap-scale">
                    <article className="flex gap-3 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)]">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
                        {safeImageUrl(p.cover_url) ? (
                          <img src={safeImageUrl(p.cover_url)!} alt={p.title} className="h-full w-full object-cover" />
                        ) : <ImagePlaceholder />}
                      </div>
                      <div className="min-w-0 flex-1">
                        {p.blog_categories?.name && (
                          <p className="text-[9.5px] font-bold uppercase tracking-wider text-primary">{p.blog_categories.name}</p>
                        )}
                        <h3 className="mt-0.5 line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground">{p.title}</h3>
                        {p.published_at && (
                          <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground">
                            {formatDistanceToNow(new Date(p.published_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        )}
                      </div>
                    </article>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}