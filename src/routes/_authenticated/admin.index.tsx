import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingBag, Users, FileText, Tag, Image as ImageIcon, DollarSign, Download, Cloud, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { currency } from "@/lib/slug";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard,
});

function useCount(table: "products" | "orders" | "profiles" | "blog_posts" | "categories" | "banners", filter?: (q: any) => any) {
  return useQuery({
    queryKey: ["admin-count", table, filter?.toString()],
    queryFn: async () => {
      let q: any = supabase.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
      if (filter) q = filter(q);
      const { count } = await q;
      return count ?? 0;
    },
  });
}

function StatCard({ icon: Icon, label, value, loading }: { icon: typeof Package; label: string; value: string | number; loading?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      )}
    </div>
  );
}

function Dashboard() {
  const products = useCount("products");
  const digital = useCount("products", (q) => q.eq("product_type", "digital"));
  const physical = useCount("products", (q) => q.eq("product_type", "physical"));
  const affiliate = useCount("products", (q) => q.eq("product_type", "affiliate"));
  const orders = useCount("orders");
  const customers = useCount("profiles");
  const cats = useCount("categories");
  const banners = useCount("banners");
  const posts = useCount("blog_posts");

  const revenue = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("total, status, created_at").is("deleted_at", null);
      return data ?? [];
    },
  });

  const recentOrders = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total, status, created_at, user_id")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const topProducts = useQuery({
    queryKey: ["admin-top-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, title, sales_count, price, cover_url")
        .is("deleted_at", null)
        .order("sales_count", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const newCustomers = useQuery({
    queryKey: ["admin-new-customers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at, avatar_url")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const totalRevenue = (revenue.data ?? [])
    .filter((o: any) => o.status === "paid" || o.status === "delivered" || o.status === "completed")
    .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0);

  // Group by day (last 30)
  const days: { date: string; total: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key.slice(5), total: 0 });
  }
  (revenue.data ?? []).forEach((o: any) => {
    const key = String(o.created_at).slice(5, 10);
    const bucket = days.find((d) => d.date === key);
    if (bucket) bucket.total += Number(o.total ?? 0);
  });

  const statusCounts: Record<string, number> = {};
  (revenue.data ?? []).forEach((o: any) => {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua loja em tempo real.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={DollarSign} label="Receita" value={currency(totalRevenue)} loading={revenue.isLoading} />
        <StatCard icon={ShoppingBag} label="Pedidos" value={orders.data ?? 0} loading={orders.isLoading} />
        <StatCard icon={Users} label="Clientes" value={customers.data ?? 0} loading={customers.isLoading} />
        <StatCard icon={Package} label="Produtos" value={products.data ?? 0} loading={products.isLoading} />
        <StatCard icon={Tag} label="Categorias" value={cats.data ?? 0} loading={cats.isLoading} />
        <StatCard icon={Cloud} label="Digitais" value={digital.data ?? 0} loading={digital.isLoading} />
        <StatCard icon={Truck} label="Físicos" value={physical.data ?? 0} loading={physical.isLoading} />
        <StatCard icon={FileText} label="Artigos" value={posts.data ?? 0} loading={posts.isLoading} />
        <StatCard icon={ImageIcon} label="Banners" value={banners.data ?? 0} loading={banners.isLoading} />
        <StatCard icon={Download} label="Afiliados" value={affiliate.data ?? 0} loading={affiliate.isLoading} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Receita (últimos 30 dias)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => currency(v)} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4">Pedidos por status</h2>
          <div className="h-64">
            {statusData.length === 0 ? (
              <div className="grid h-full place-items-center text-xs text-muted-foreground">Sem pedidos ainda</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="status" fontSize={11} />
                  <YAxis fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Pedidos recentes</h2>
            <Link to="/admin/pedidos" className="text-xs text-primary">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {(recentOrders.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">Sem pedidos ainda.</p>
            )}
            {(recentOrders.data ?? []).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between border-b last:border-0 py-2">
                <div>
                  <p className="text-xs font-medium">{o.order_number ?? o.id.slice(0, 8)}</p>
                  <p className="text-[10px] text-muted-foreground">{o.status}</p>
                </div>
                <p className="text-xs font-bold">{currency(o.total)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Mais vendidos</h2>
            <Link to="/admin/produtos" className="text-xs text-primary">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {(topProducts.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">Nenhum produto ainda.</p>
            )}
            {(topProducts.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 border-b last:border-0 py-2">
                {p.cover_url ? (
                  <img src={p.cover_url} alt="" className="h-9 w-9 rounded object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded bg-muted grid place-items-center">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">{p.sales_count ?? 0} vendas</p>
                </div>
                <p className="text-xs font-bold">{currency(p.price)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Novos clientes</h2>
            <Link to="/admin/clientes" className="text-xs text-primary">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {(newCustomers.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground py-6 text-center">Nenhum cliente ainda.</p>
            )}
            {(newCustomers.data ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 border-b last:border-0 py-2">
                {c.avatar_url ? (
                  <img src={c.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-muted grid place-items-center text-xs font-bold text-muted-foreground">
                    {(c.full_name ?? c.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{c.full_name ?? "(sem nome)"}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}