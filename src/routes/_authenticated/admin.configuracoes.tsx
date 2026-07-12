import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useSiteContent,
  SITE_CONTENT_DEFAULTS,
  type BrandSettings,
  type HeroSettings,
  type LabelsSettings,
} from "@/hooks/useSiteContent";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({
  component: ConfigPage,
});

type FormState = {
  brand: BrandSettings;
  hero: HeroSettings;
  labels: LabelsSettings;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const URL_RE = /^https?:\/\/.+/i;

function ConfigPage() {
  const site = useSiteContent();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({
    brand: SITE_CONTENT_DEFAULTS.brand,
    hero: SITE_CONTENT_DEFAULTS.hero,
    labels: SITE_CONTENT_DEFAULTS.labels,
  });

  useEffect(() => {
    if (site.data) setForm(site.data);
  }, [site.data]);

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      // validações
      if (!state.brand.name.trim()) throw new Error("Nome do site é obrigatório");
      if (!HEX_RE.test(state.brand.primary_hex)) throw new Error("Cor primária inválida (use #RRGGBB)");
      if (!state.hero.title.trim()) throw new Error("Título do banner é obrigatório");
      if (!state.hero.cta_label.trim()) throw new Error("Texto do botão é obrigatório");
      if (state.hero.image_url && !URL_RE.test(state.hero.image_url))
        throw new Error("URL da imagem do banner inválida");
      if (!state.labels.search_placeholder.trim()) throw new Error("Placeholder de busca é obrigatório");
      if (!state.labels.bestsellers_title.trim()) throw new Error("Título 'Mais vendidos' é obrigatório");
      if (!state.labels.launches_title.trim()) throw new Error("Título 'Lançamentos' é obrigatório");

      const rows = [
        { key: "site.brand", value: state.brand, is_public: true },
        { key: "site.home.hero", value: state.hero, is_public: true },
        { key: "site.home.labels", value: state.labels, is_public: true },
      ];
      const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["site-content"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações do site</h1>
        <p className="text-sm text-muted-foreground">
          Edite marca, cores e textos exibidos publicamente. As alterações refletem na home.
        </p>
      </div>

      <Tabs defaultValue="brand">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="brand">Marca</TabsTrigger>
          <TabsTrigger value="hero">Banner</TabsTrigger>
          <TabsTrigger value="labels">Textos</TabsTrigger>
        </TabsList>

        <TabsContent value="brand">
          <Card>
            <CardHeader><CardTitle>Marca</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Nome do site">
                <Input
                  value={form.brand.name}
                  maxLength={60}
                  onChange={(e) => setForm((f) => ({ ...f, brand: { ...f.brand, name: e.target.value } }))}
                />
              </Field>
              <Field label="Cor primária">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.brand.primary_hex}
                    onChange={(e) => setForm((f) => ({ ...f, brand: { ...f.brand, primary_hex: e.target.value } }))}
                    className="h-10 w-14 cursor-pointer rounded border border-input bg-background"
                  />
                  <Input
                    value={form.brand.primary_hex}
                    onChange={(e) => setForm((f) => ({ ...f, brand: { ...f.brand, primary_hex: e.target.value } }))}
                    placeholder="#2563EB"
                    className="max-w-[140px] font-mono uppercase"
                  />
                  <span
                    className="inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white shadow"
                    style={{ background: form.brand.primary_hex }}
                  >
                    Prévia
                  </span>
                </div>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hero">
          <Card>
            <CardHeader><CardTitle>Banner da home</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Badge (etiqueta)">
                <Input value={form.hero.badge} maxLength={30}
                  onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, badge: e.target.value } }))} />
              </Field>
              <Field label="Título">
                <Input value={form.hero.title} maxLength={80}
                  onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, title: e.target.value } }))} />
              </Field>
              <Field label="Subtítulo">
                <Textarea rows={2} value={form.hero.subtitle} maxLength={160}
                  onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, subtitle: e.target.value } }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Texto do botão">
                  <Input value={form.hero.cta_label} maxLength={30}
                    onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, cta_label: e.target.value } }))} />
                </Field>
                <Field label="Link do botão">
                  <Input value={form.hero.cta_href} placeholder="/categorias"
                    onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, cta_href: e.target.value } }))} />
                </Field>
              </div>
              <Field label="URL da imagem (opcional)" hint="Deixe vazio para usar a imagem padrão.">
                <Input value={form.hero.image_url} placeholder="https://..."
                  onChange={(e) => setForm((f) => ({ ...f, hero: { ...f.hero, image_url: e.target.value } }))} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labels">
          <Card>
            <CardHeader><CardTitle>Textos da home</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Saudação (topo)">
                <Input value={form.labels.greeting} maxLength={30}
                  onChange={(e) => setForm((f) => ({ ...f, labels: { ...f.labels, greeting: e.target.value } }))} />
              </Field>
              <Field label="Placeholder da busca">
                <Input value={form.labels.search_placeholder} maxLength={60}
                  onChange={(e) => setForm((f) => ({ ...f, labels: { ...f.labels, search_placeholder: e.target.value } }))} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Título 'Mais vendidos'">
                  <Input value={form.labels.bestsellers_title} maxLength={40}
                    onChange={(e) => setForm((f) => ({ ...f, labels: { ...f.labels, bestsellers_title: e.target.value } }))} />
                </Field>
                <Field label="Título 'Lançamentos'">
                  <Input value={form.labels.launches_title} maxLength={40}
                    onChange={(e) => setForm((f) => ({ ...f, labels: { ...f.labels, launches_title: e.target.value } }))} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 flex justify-end gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button variant="outline" onClick={() => site.data && setForm(site.data)} disabled={save.isPending}>
          Desfazer
        </Button>
        <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
          {save.isPending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}