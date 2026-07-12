import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ACCENTS, useAccent } from "@/lib/accent-theme";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  User as UserIcon,
  Palette,
  Lock,
  Briefcase,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LEVELS = [
  { id: "estudante", label: "Estudante", emoji: "📚" },
  { id: "tecnico", label: "Técnico", emoji: "🩺" },
  { id: "graduado", label: "Graduado", emoji: "🎓" },
  { id: "residente", label: "Residente", emoji: "🏥" },
  { id: "enfermeiro", label: "Enfermeiro(a)", emoji: "💉" },
  { id: "medico", label: "Médico(a)", emoji: "⚕️" },
  { id: "especialista", label: "Especialista", emoji: "🧠" },
  { id: "outro", label: "Outro", emoji: "✨" },
] as const;

type LevelId = (typeof LEVELS)[number]["id"];

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — FSlobo" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { accent, setAccent } = useAccent();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [level, setLevel] = useState<LevelId | "">("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // password
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles")
      .select("full_name, avatar_url, phone, bio, professional_level")
      .eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        setFullName(data?.full_name ?? "");
        setAvatarUrl(data?.avatar_url ?? null);
        setPhone((data as { phone?: string | null } | null)?.phone ?? "");
        setBio((data as { bio?: string | null } | null)?.bio ?? "");
        setLevel(((data as { professional_level?: LevelId | null } | null)?.professional_level ?? "") as LevelId | "");
      });
  }, [user]);

  if (loading) return <div className="p-8 text-center text-muted-foreground">Carregando…</div>;
  if (!isAuthenticated) {
    return (
      <div className="p-6 pt-16 text-center">
        <p className="text-[14px] text-muted-foreground">Entre para editar suas configurações.</p>
        <Link to="/auth" className="mt-4 inline-flex rounded-2xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground">
          Entrar
        </Link>
      </div>
    );
  }

  async function handleAvatar(file: File) {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Imagem muito grande (máx 5MB)");
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (up.error) throw up.error;
      // Bucket is private on this workspace — use a long-lived signed URL.
      const { data, error } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (error) throw error;
      setAvatarUrl(data.signedUrl);
      toast.success("Foto atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    if (fullName.trim().length > 80) return toast.error("Nome muito longo");
    if (bio.length > 300) return toast.error("Bio muito longa (máx 300)");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: fullName.trim() || null,
      avatar_url: avatarUrl,
      phone: phone.trim() || null,
      bio: bio.trim() || null,
      professional_level: level || null,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Perfil salvo");
    navigate({ to: "/perfil" });
  }

  async function handleChangePassword() {
    if (pwd.length < 8) return toast.error("A senha deve ter no mínimo 8 caracteres");
    if (pwd !== pwd2) return toast.error("As senhas não coincidem");
    setChangingPwd(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setChangingPwd(false);
    if (error) return toast.error(error.message);
    setPwd(""); setPwd2("");
    toast.success("Senha atualizada com sucesso");
  }

  async function handleResetEmail() {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success("E-mail de redefinição enviado");
  }

  return (
    <div className="pb-24 animate-fade-in">
      {/* Premium hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-primary/70 px-5 pt-6 pb-16 text-primary-foreground">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <Link to="/perfil" className="grid h-10 w-10 place-items-center rounded-full bg-white/15 backdrop-blur tap-scale">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] font-medium opacity-80">Sua conta</p>
            <h1 className="text-[20px] font-extrabold leading-tight">Configurações</h1>
          </div>
        </div>
        <p className="relative mt-3 text-[13px] opacity-90 max-w-sm">
          Personalize seu perfil, defina seu nível profissional, ajuste o tema e cuide da segurança da sua conta.
        </p>
      </div>

      <div className="px-5 -mt-10 space-y-5">
        {/* Profile card */}
        <SectionCard icon={UserIcon} title="Perfil" subtitle="Como você aparece no app">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative h-24 w-24 rounded-full overflow-hidden ring-4 ring-primary/15 bg-primary/10 grid place-items-center tap-scale group"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-extrabold text-primary">
                  {(fullName || user?.email || "U").charAt(0).toUpperCase()}
                </span>
              )}
              <span className="absolute bottom-0 inset-x-0 h-7 bg-black/55 text-white grid place-items-center">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </span>
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAvatar(f); }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-foreground truncate">{fullName || "Sem nome"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate flex items-center gap-1">
                <Mail className="h-3 w-3" /> {user?.email}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Toque na foto para alterar (máx 5MB)</p>
            </div>
          </div>

          <Field label="Nome completo">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Seu nome"
              maxLength={80}
              className="w-full rounded-2xl bg-secondary border border-border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Telefone" icon={Phone}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              maxLength={20}
              inputMode="tel"
              className="w-full rounded-2xl bg-secondary border border-border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/30"
            />
          </Field>

          <Field label="Bio" hint={`${bio.length}/300`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 300))}
              placeholder="Conte um pouco sobre você"
              rows={3}
              className="w-full rounded-2xl bg-secondary border border-border px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </Field>
        </SectionCard>

        {/* Professional level */}
        <SectionCard icon={Briefcase} title="Nível profissional" subtitle="Isso será exibido na sua home">
          <div className="grid grid-cols-2 gap-2">
            {LEVELS.map((l) => {
              const active = level === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setLevel(active ? "" : l.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-[13px] font-semibold tap-scale transition",
                    active
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border bg-secondary text-foreground hover:border-primary/40",
                  )}
                >
                  <span className="text-lg">{l.emoji}</span>
                  <span className="flex-1 truncate">{l.label}</span>
                  {active && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Appearance */}
        <SectionCard icon={Palette} title="Aparência" subtitle="Escolha a cor de destaque">
          <div className="grid grid-cols-4 gap-3">
            {ACCENTS.map((a) => {
              const active = accent === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setAccent(a.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl bg-secondary p-3 tap-scale transition",
                    active && "ring-2 ring-primary bg-primary/5",
                  )}
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full shadow-sm"
                    style={{ background: a.hex }}
                  >
                    {active && <Check className="h-4 w-4 text-white" />}
                  </span>
                  <span className="text-[11px] font-semibold">{a.label}</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        {/* Security */}
        <SectionCard icon={ShieldCheck} title="Segurança" subtitle="Altere sua senha">
          <Field label="Nova senha" hint="Mínimo 8 caracteres">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPwd ? "text" : "password"}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl bg-secondary border border-border pl-11 pr-11 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground tap-scale"
                aria-label={showPwd ? "Ocultar" : "Mostrar"}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirme a nova senha">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type={showPwd ? "text" : "password"}
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-2xl bg-secondary border border-border pl-11 pr-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </Field>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              onClick={handleChangePassword}
              disabled={changingPwd || !pwd || !pwd2}
              className="flex-1 rounded-2xl bg-primary py-3 text-[13px] font-semibold text-primary-foreground shadow-md tap-scale disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {changingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
              Alterar senha
            </button>
            <button
              onClick={handleResetEmail}
              className="flex-1 rounded-2xl bg-secondary border border-border py-3 text-[13px] font-semibold text-foreground tap-scale"
            >
              Enviar link por e-mail
            </button>
          </div>
        </SectionCard>
      </div>

      {/* Sticky save */}
      <div className="fixed bottom-20 inset-x-0 z-40 px-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-2xl bg-primary py-3.5 text-[14px] font-bold text-primary-foreground shadow-[var(--shadow-elevated)] tap-scale disabled:opacity-60 flex items-center justify-center gap-2 backdrop-blur"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Salvar alterações
        </button>
      </div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-card p-5 shadow-[var(--shadow-card)] space-y-4">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-[15px] font-extrabold text-foreground leading-tight">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  icon: Icon,
  children,
}: {
  label: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-[12px] font-semibold text-foreground">
        <span className="flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {label}
        </span>
        {hint && <span className="text-[10px] font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}