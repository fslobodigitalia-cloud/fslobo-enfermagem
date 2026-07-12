import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Share2 } from "lucide-react";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fbqTrackCustom } from "@/lib/fbq";

export const Route = createFileRoute("/blog/$slug")({
  head: () => ({ meta: [{ title: "Artigo — FSlobo" }] }),
  component: BlogPostPage,
});

function BlogPostPage() {
  const { slug } = useParams({ from: "/blog/$slug" });

  const q = useQuery({
    queryKey: ["blog-post", slug],
    queryFn: async () => {
      const { data } = await supabase
        .from("blog_posts")
        .select("id, slug, title, excerpt, content, cover_url, published_at, blog_categories(name, slug), profiles(full_name, avatar_url)")
        .eq("slug", slug)
        .eq("status", "published")
        .is("deleted_at", null)
        .maybeSingle();
      return data;
    },
  });

  if (q.isLoading) {
    return <div className="p-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!q.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Artigo não encontrado.</p>
        <Link to="/blog" className="mt-4 inline-block text-primary font-semibold">Voltar ao blog</Link>
      </div>
    );
  }

  const p: any = q.data;
  const cover = safeImageUrl(p.cover_url);

  return (
    <article className="animate-fade-in pb-10">
      <div className="flex items-center justify-between px-5 pt-4">
        <Link to="/blog" aria-label="Voltar" className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-sm tap-scale">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <button
          onClick={() => {
            fbqTrackCustom("Share", { content_type: "article", content_name: p.title, method: "native" });
            if (navigator.share) navigator.share({ title: p.title, url: window.location.href }).catch(()=>{});
          }}
          className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-sm tap-scale"
          aria-label="Compartilhar"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      <div className="px-5 mt-4">
        {p.blog_categories?.name && (
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-primary">{p.blog_categories.name}</p>
        )}
        <h1 className="mt-2 text-[24px] font-extrabold leading-tight text-foreground">{p.title}</h1>
        <div className="mt-3 flex items-center gap-2">
          {p.profiles?.avatar_url ? (
            <img src={p.profiles.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary/10" />
          )}
          <div className="text-[11.5px]">
            <p className="font-bold text-foreground">{p.profiles?.full_name ?? "FSlobo"}</p>
            {p.published_at && (
              <p className="text-muted-foreground">{format(new Date(p.published_at), "d 'de' MMMM, yyyy", { locale: ptBR })}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 aspect-[16/9] overflow-hidden bg-secondary mx-5 rounded-3xl">
        {cover ? <img src={cover} alt={p.title} className="h-full w-full object-cover" /> : <ImagePlaceholder iconClassName="h-10 w-10" />}
      </div>

      <div className="px-5 mt-6">
        {p.excerpt && <p className="text-[15px] font-medium leading-relaxed text-foreground">{p.excerpt}</p>}
        {p.content && (
          <div className="mt-4 whitespace-pre-line text-[14.5px] leading-relaxed text-muted-foreground">
            {p.content}
          </div>
        )}
      </div>
    </article>
  );
}