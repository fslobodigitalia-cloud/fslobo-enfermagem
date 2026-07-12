import { createFileRoute } from "@tanstack/react-router";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/favoritos")({
  head: () => ({ meta: [{ title: "Favoritos — FSlobo" }] }),
  component: () => (
    <div className="flex flex-col items-center justify-center px-8 py-24 text-center animate-fade-in">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary">
        <Heart className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-[20px] font-extrabold text-foreground">Seus favoritos</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        Toque no coração dos materiais para salvá-los aqui.
      </p>
    </div>
  ),
});