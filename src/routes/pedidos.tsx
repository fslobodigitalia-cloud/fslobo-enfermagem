import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/pedidos")({
  head: () => ({ meta: [{ title: "Pedidos — FSlobo" }] }),
  component: () => (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center animate-fade-in">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <ShoppingBag className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-[20px] font-extrabold text-foreground">Seus pedidos</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">Você ainda não tem pedidos por aqui.</p>
    </div>
  ),
});