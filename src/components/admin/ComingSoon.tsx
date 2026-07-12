import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4 md:p-8">
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10">
          <Construction className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <p className="mt-6 text-xs text-muted-foreground">Módulo em construção. Foco atual: valide o CRUD de Produtos primeiro.</p>
      </div>
    </div>
  );
}