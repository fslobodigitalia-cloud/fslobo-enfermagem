import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Flame, Trophy, Zap, Target, BookOpen, PlayCircle, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { ImagePlaceholder, safeImageUrl } from "@/components/ImagePlaceholder";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Meu painel — FSlobo" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const { user } = useAuth();
  const uid = user?.id;

  const stats = useQuery({
    queryKey: ["user-stats", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_stats")
        .select("xp, level, current_streak, longest_streak, last_activity_date")
        .eq("user_id", uid!)
        .maybeSingle();
      return data ?? { xp: 0, level: 1, current_streak: 0, longest_streak: 0, last_activity_date: null };
    },
  });

  const progress = useQuery({
    queryKey: ["user-progress", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_progress")
        .select("progress_pct, last_accessed_at, products(id, slug, title, cover_url, categories(name))")
        .eq("user_id", uid!)
        .order("last_accessed_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const achievements = useQuery({
    queryKey: ["achievements-all"],
    queryFn: async () => {
      const { data } = await supabase
        .from("achievements")
        .select("id, code, name, description, icon, xp_reward, display_order")
        .is("deleted_at", null)
        .order("display_order", { ascending: true });
      return data ?? [];
    },
  });

  const unlocks = useQuery({
    queryKey: ["user-achievements", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_achievements")
        .select("achievement_id, unlocked_at")
        .eq("user_id", uid!);
      return data ?? [];
    },
  });

  const unlockedIds = new Set((unlocks.data ?? []).map((u) => u.achievement_id));
  const s = stats.data ?? { xp: 0, level: 1, current_streak: 0, longest_streak: 0 };
  const xpInLevel = s.xp % 100;
  const xpToNext = 100 - xpInLevel;

  return (
    <div className="animate-fade-in pb-8">
      {/* Header */}
      <header className="bg-gradient-to-b from-primary/15 via-primary/5 to-transparent px-5 pt-4 pb-6">
        <div className="flex items-center gap-3">
          <Link to="/perfil" aria-label="Voltar" className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-sm tap-scale">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-primary">Progresso</p>
            <h1 className="text-[20px] font-extrabold text-foreground">Meu painel</h1>
          </div>
        </div>

        {/* Level card */}
        <div className="mt-5 rounded-3xl bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground shadow-[var(--shadow-elevated)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">Nível</p>
              <p className="text-[36px] font-extrabold leading-none">{s.level}</p>
            </div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Zap className="h-7 w-7" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-semibold opacity-90">
              <span>{xpInLevel} / 100 XP</span>
              <span>Faltam {xpToNext} XP</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${xpInLevel}%` }} />
            </div>
          </div>
          <p className="mt-3 text-[12px] opacity-90">
            Você tem <span className="font-bold">{s.xp}</span> XP acumulados
          </p>
        </div>

        {/* Stats grid */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <StatCard icon={Flame} label="Sequência" value={`${s.current_streak}d`} hint={`Recorde: ${s.longest_streak}d`} tone="orange" />
          <StatCard icon={BookOpen} label="Estudando" value={String((progress.data ?? []).length)} hint="produtos ativos" tone="blue" />
        </div>
      </header>

      {/* Continue */}
      <section className="px-5 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><PlayCircle className="h-4 w-4" /></span>
          <h2 className="text-[15px] font-extrabold text-foreground">Continuar estudando</h2>
        </div>
        {progress.isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />)}
          </div>
        ) : (progress.data ?? []).length === 0 ? (
          <EmptyState icon={BookOpen} title="Nada em andamento" description="Explore produtos e comece seus estudos." actionLabel="Ver produtos" actionHref="/" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {(progress.data ?? []).map((p: any) => {
              const prod = p.products;
              if (!prod) return null;
              const img = safeImageUrl(prod.cover_url);
              return (
                <Link key={prod.id} to="/produto/$id" params={{ id: prod.slug ?? prod.id }} className="rounded-2xl bg-card p-3 shadow-[var(--shadow-card)] tap-scale">
                  <div className="aspect-square overflow-hidden rounded-xl bg-secondary">
                    {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <ImagePlaceholder />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12px] font-semibold text-foreground">{prod.title}</p>
                  <div className="mt-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress_pct ?? 0}%` }} />
                    </div>
                    <p className="mt-1 text-[10px] font-semibold text-muted-foreground">{p.progress_pct ?? 0}% concluído</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Achievements */}
      <section className="px-5 mt-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-4 w-4" /></span>
            <h2 className="text-[15px] font-extrabold text-foreground">Conquistas</h2>
          </div>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {unlockedIds.size} / {(achievements.data ?? []).length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(achievements.data ?? []).map((a: any) => {
            const unlocked = unlockedIds.has(a.id);
            return (
              <div key={a.id} className={cn(
                "rounded-2xl p-4 shadow-[var(--shadow-card)] transition-all",
                unlocked ? "bg-card ring-1 ring-primary/20" : "bg-secondary/60"
              )}>
                <div className="flex items-start justify-between">
                  <span className={cn("text-[28px] leading-none", !unlocked && "opacity-30 grayscale")}>
                    {a.icon ?? "🏆"}
                  </span>
                  {unlocked ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-bold text-primary">+{a.xp_reward} XP</span>
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className={cn("mt-2 text-[13px] font-bold", unlocked ? "text-foreground" : "text-muted-foreground")}>{a.name}</p>
                {a.description && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">{a.description}</p>}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, tone }: { icon: any; label: string; value: string; hint?: string; tone: "orange" | "blue" }) {
  const toneCls = tone === "orange" ? "bg-orange-500/15 text-orange-600" : "bg-primary/15 text-primary";
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[var(--shadow-card)]">
      <div className={cn("grid h-9 w-9 place-items-center rounded-xl", toneCls)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-[22px] font-extrabold text-foreground leading-tight">{value}</p>
      {hint && <p className="text-[10.5px] font-semibold text-muted-foreground">{hint}</p>}
    </div>
  );
}