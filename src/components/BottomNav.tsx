import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Calculator, ClipboardCheck, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Início", icon: Home },
  { to: "/calculadora", label: "Calc", icon: Calculator },
  { to: "/checklist", label: "Check-list", icon: ClipboardCheck },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Navegação principal"
      className="absolute inset-x-0 bottom-0 z-40 h-[74px] rounded-t-[28px] bg-card/95 backdrop-blur-xl shadow-[0_-8px_30px_-8px_rgb(15_23_42_/_0.08)] border-t border-border/40"
    >
      <ul className="flex h-full items-stretch justify-between px-3">
        {ITEMS.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "group flex h-full flex-col items-center justify-center gap-1 rounded-2xl tap-scale",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-2xl transition-all duration-300",
                    active && "bg-primary/10 scale-110",
                  )}
                >
                  <Icon className={cn("h-[22px] w-[22px]", active && "stroke-[2.4]")} />
                </span>
                <span className={cn("text-[10.5px] font-medium tracking-tight", active && "font-semibold")}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}