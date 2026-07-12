import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, Search, ImageIcon, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  component: BannersPage,
});

type Banner = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string;
  link_url: string | null;
  position: string | null;
  display_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  badge: string | null;
  cta_label: string | null;
};

type FormState = {
  id?: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  position: string;
  display_order: number;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  badge: string;
  cta_label: string;
};

const EMPTY: FormState = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  position: "hero",
  display_order: 0,
  is_active: true,
  starts_at: "",
  ends_at: "",
  badge: "",
  cta_label: "",
};

function BannersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Banner | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const list = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("id, title, subtitle, image_url, link_url, position, display_order, is_active, starts_at, ends_at, badge, cta_label")
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Banner[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list.data ?? [];
    return (list.data ?? []).filter(
      (b) =>
        (b.title ?? "").toLowerCase().includes(q) ||
        (b.subtitle ?? "").toLowerCase().includes(q) ||
        (b.position ?? "").toLowerCase().includes(q),
    );
  }, [list.data, search]);

  function openCreate() { setForm(EMPTY); setDialogOpen(true); }
  function openEdit(b: Banner) {
    setForm({
      id: b.id,
      title: b.title ?? "",
      subtitle: b.subtitle ?? "",
      image_url: b.image_url,
      link_url: b.link_url ?? "",
      position: b.position ?? "home",
      display_order: b.display_order,
      is_active: b.is_active,
      starts_at: b.starts_at ? b.starts_at.slice(0, 16) : "",
      ends_at: b.ends_at ? b.ends_at.slice(0, 16) : "",
      badge: b.badge ?? "",
      cta_label: b.cta_label ?? "",
    });
    setDialogOpen(true);
  }

  const save = useMutation({
    mutationFn: async (s: FormState) => {
      if (!s.image_url) throw new Error("Envie uma imagem do banner");
      if (s.link_url && !/^https?:\/\/.+/i.test(s.link_url))
        throw new Error("URL do link inválida (use http/https)");
      const payload = {
        title: s.title.trim() || null,
        subtitle: s.subtitle.trim() || null,
        image_url: s.image_url,
        link_url: s.link_url.trim() || null,
        position: s.position.trim() || "hero",
        display_order: Number.isFinite(s.display_order) ? s.display_order : 0,
        is_active: s.is_active,
        starts_at: s.starts_at ? new Date(s.starts_at).toISOString() : null,
        ends_at: s.ends_at ? new Date(s.ends_at).toISOString() : null,
        badge: s.badge.trim() || null,
        cta_label: s.cta_label.trim() || null,
      };
      if (s.id) {
        const { error } = await supabase.from("banners").update(payload).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("banners").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Banner atualizado" : "Banner criado");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao salvar"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("banners")
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Banner excluído");
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erro ao excluir"),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os banners exibidos na loja.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Novo banner
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título ou posição"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {list.isLoading ? (
          <div className="grid place-items-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {search ? "Nenhum banner encontrado." : "Nenhum banner ainda."}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((b) => (
              <li key={b.id} className="flex items-center gap-4 p-3">
                <div className="h-16 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                  {b.image_url ? (
                    <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{b.title || <span className="text-muted-foreground">(sem título)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{b.subtitle}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">{b.position || "home"}</span>
                    <span>ordem {b.display_order}</span>
                    {b.link_url && (
                      <a href={b.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> link
                      </a>
                    )}
                  </div>
                </div>
                <span
                  className={
                    b.is_active
                      ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400"
                      : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                  }
                >
                  {b.is_active ? "Ativo" : "Inativo"}
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(b)} aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => setConfirmDelete(b)}
                    aria-label="Excluir"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar banner" : "Novo banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ImageUploader
              bucket="banners"
              label="Imagem do banner *"
              value={form.image_url || null}
              onChange={(u) => setForm((f) => ({ ...f, image_url: u ?? "" }))}
            />
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.title} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Subtítulo</Label>
              <Textarea rows={2} value={form.subtitle} maxLength={240} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Link (opcional)</Label>
              <Input value={form.link_url} placeholder="https://..." onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Etiqueta (badge)</Label>
                <Input
                  value={form.badge}
                  maxLength={24}
                  placeholder="Ex.: Novo, Oferta"
                  onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Texto do botão</Label>
                <Input
                  value={form.cta_label}
                  maxLength={24}
                  placeholder="Ex.: Ver detalhes"
                  onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Posição</Label>
                <Select value={form.position} onValueChange={(v) => setForm((f) => ({ ...f, position: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hero">Hero</SelectItem>
                    <SelectItem value="home">Home</SelectItem>
                    <SelectItem value="sidebar">Sidebar</SelectItem>
                    <SelectItem value="footer">Footer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input type="number" value={form.display_order} onChange={(e) => setForm((f) => ({ ...f, display_order: parseInt(e.target.value || "0", 10) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Término</Label>
                <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-muted-foreground">Banners inativos não são exibidos.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={save.isPending}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir banner?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.title ?? "(sem título)"}" será removido da loja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {remove.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}