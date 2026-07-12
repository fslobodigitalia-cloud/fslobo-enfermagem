import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Bell, CheckCheck, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notificacoes")({
  head: () => ({ meta: [{ title: "Notificações — FSlobo" }] }),
  component: NotificacoesPage,
});

function NotificacoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, link, is_read, created_at")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ is_read: true }).eq("user_id", user!.id).eq("is_read", false);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifpage:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, qc]);

  const items = q.data ?? [];
  const hasUnread = items.some((n) => !n.is_read);

  return (
    <div className="animate-fade-in pb-8">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-border/40 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/perfil" aria-label="Voltar" className="grid h-9 w-9 place-items-center rounded-full bg-card shadow-sm tap-scale">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Central</p>
            <h1 className="text-[17px] font-extrabold text-foreground">Notificações</h1>
          </div>
        </div>
        {hasUnread && (
          <button
            onClick={() => markAll.mutate()}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary tap-scale"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
          </button>
        )}
      </header>

      <div className="p-5">
        {q.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-secondary/60 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title="Nenhuma notificação" description="Você receberá aqui novidades, promoções e conquistas." />
        ) : (
          <ul className="space-y-2">
            {items.map((n) => {
              const inner = (
                <div className={cn(
                  "rounded-2xl p-4 shadow-[var(--shadow-card)] transition-all",
                  n.is_read ? "bg-card" : "bg-primary/5 ring-1 ring-primary/15",
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      n.is_read ? "bg-secondary text-muted-foreground" : "bg-primary/15 text-primary")}>
                      <Bell className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-bold text-foreground">{n.title}</p>
                        {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      </div>
                      {n.body && <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{n.body}</p>}
                      <p className="mt-1.5 text-[10.5px] font-semibold text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <a href={n.link} onClick={() => !n.is_read && markRead.mutate(n.id)} className="block tap-scale">
                      {inner}
                    </a>
                  ) : (
                    <button onClick={() => !n.is_read && markRead.mutate(n.id)} className="block w-full text-left tap-scale">
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}