import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Tag,
  ShoppingBag,
  Users,
  FileText,
  Image as ImageIcon,
  Search,
  Settings,
  ArrowLeft,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/produtos", label: "Produtos", icon: Package },
  { to: "/admin/categorias", label: "Categorias", icon: Tag },
  { to: "/admin/pedidos", label: "Pedidos", icon: ShoppingBag },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/blog", label: "Blog", icon: FileText },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon },
  { to: "/admin/seo", label: "SEO", icon: Search },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

function NavList({ pathname, onNav }: { pathname: string; onNav?: () => void }) {
  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to as never}
            onClick={onNav}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-muted/30 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-card sticky top-0 h-screen">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 grid place-items-center">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">FSlobo</p>
            <p className="text-[10px] text-muted-foreground">Admin</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <NavList pathname={pathname} />
        </div>
        <div className="border-t p-3">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar à loja
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card px-4">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SheetTitle className="sr-only">Menu do administrador</SheetTitle>
              <div className="flex h-14 items-center gap-2 border-b px-5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 grid place-items-center">
                  <Package className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold leading-none">FSlobo Admin</p>
                </div>
              </div>
              <div className="py-4">
                <NavList pathname={pathname} />
              </div>
            </SheetContent>
          </Sheet>
          <p className="text-sm font-bold">FSlobo Admin</p>
          <Link to="/" className="ml-auto text-xs text-muted-foreground">
            Loja
          </Link>
        </header>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}