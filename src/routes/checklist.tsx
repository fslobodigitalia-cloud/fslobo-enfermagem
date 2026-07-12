import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ArrowLeft, ClipboardCheck, HeartPulse, Wind, Brain, Utensils, Droplet,
  ShieldAlert, ListChecks, Repeat, Bell, Plus, Trash2, Check, Clock, Share2, Copy, Save, Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthGate } from "@/components/AuthGate";
import { fbqTrack, fbqTrackCustom } from "@/lib/fbq";

export const Route = createFileRoute("/checklist")({
  head: () => ({
    meta: [
      { title: "Check-list de Enfermagem — FSlobo" },
      { name: "description", content: "Check-list clínico completo: avaliação por sistemas, passagem de plantão SBAR, organização do turno e alarmes de aprazamento." },
    ],
  }),
  component: GatedChecklistPage,
});

function GatedChecklistPage() {
  return (
    <AuthGate
      title="Check-list exclusivo para cadastrados"
      description="Crie sua conta grátis para usar avaliação por sistemas, SBAR e organização de plantão."
    >
      <ChecklistPage />
    </AuthGate>
  );
}

type Tool = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  render: () => ReactElement;
};

// ============ Storage helpers ============
const load = <T,>(k: string, fb: T): T => {
  if (typeof window === "undefined") return fb;
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; }
};
const save = (k: string, v: unknown) => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
};

function useLocal<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => { setV(load(key, initial)); /* eslint-disable-next-line */ }, []);
  useEffect(() => { save(key, v); }, [key, v]);
  return [v, setV];
}

// ============ UI atoms ============
function CheckItem({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
        checked ? "bg-primary/8" : "bg-secondary/50 hover:bg-secondary",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ring-1 transition-all",
          checked
            ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-primary shadow-[0_4px_10px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
            : "bg-card ring-border",
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      <span className={cn("text-[12.5px] leading-snug", checked ? "text-muted-foreground line-through" : "text-foreground")}>
        {children}
      </span>
    </button>
  );
}

function SectionTitle({ icon: Icon, title, count, done }: { icon: React.ComponentType<{ className?: string }>; title: string; count: number; done: number }) {
  const pct = count ? Math.round((done / count) * 100) : 0;
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-[15px] w-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-foreground">{title}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] font-bold text-muted-foreground">{done}/{count}</span>
        </div>
      </div>
    </div>
  );
}

function ResetBar({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <Button variant="ghost" size="sm" onClick={onReset} className="text-[11px] text-muted-foreground">
        <Repeat className="mr-1.5 h-3.5 w-3.5" /> Zerar check-list
      </Button>
    </div>
  );
}

// ============ Share helpers ============
function shareWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
}
async function nativeShare(text: string, title = "Check-list de Enfermagem") {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }) : undefined;
  if (nav?.share) { try { await nav.share({ title, text }); return true; } catch { /* fallthrough */ } }
  return false;
}
function ShareBar({ getText, disabled }: { getText: () => string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleShare = async () => {
    const txt = getText();
    fbqTrack("Lead", { content_name: "checklist_share", method: "native" });
    fbqTrackCustom("Share", { content_type: "checklist", method: "native" });
    if (!(await nativeShare(txt))) shareWhatsApp(txt);
  };
  const handleCopy = async () => {
    await copyText(getText());
    fbqTrack("Lead", { content_name: "checklist_copy", method: "clipboard" });
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button
        onClick={() => {
          fbqTrack("Lead", { content_name: "checklist_share", method: "whatsapp" });
          fbqTrackCustom("Share", { content_type: "checklist", method: "whatsapp" });
          shareWhatsApp(getText());
        }}
        disabled={disabled}
        className="flex-1 bg-[#25D366] text-white hover:bg-[#20bd5a]"
      >
        <Share2 className="mr-1.5 h-4 w-4" /> WhatsApp
      </Button>
      <Button onClick={handleShare} disabled={disabled} variant="outline" className="flex-1">
        <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
      </Button>
      <Button onClick={handleCopy} disabled={disabled} variant="outline" size="icon" aria-label="Copiar">
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// ============ Systems assessment ============
const SYSTEMS: { id: string; title: string; icon: React.ComponentType<{ className?: string }>; items: string[] }[] = [
  {
    id: "neuro", title: "Neurológico", icon: Brain,
    items: [
      "Nível de consciência (Glasgow / RASS)",
      "Pupilas: tamanho, simetria e reatividade",
      "Força motora e sensibilidade (4 membros)",
      "Orientação têmporo-espacial",
      "Sinais de dor (EVA / BPS)",
      "Presença de agitação, delirium ou convulsão",
    ],
  },
  {
    id: "cardio", title: "Cardiovascular", icon: HeartPulse,
    items: [
      "PA, FC e ritmo cardíaco (monitor)",
      "Pulsos periféricos e perfusão (TEC)",
      "Ausculta cardíaca (bulhas, sopros)",
      "Edema de MMII / turgência jugular",
      "Acesso venoso: local, permeabilidade, sinais flogísticos",
      "Drogas vasoativas em bomba (dose e via)",
    ],
  },
  {
    id: "resp", title: "Respiratório", icon: Wind,
    items: [
      "FR, padrão respiratório e SpO₂",
      "Ausculta pulmonar (MV, ruídos adventícios)",
      "Uso de musculatura acessória / cianose",
      "Suporte de O₂ (cateter, VNI, TOT/traqueo)",
      "Parâmetros ventilatórios (modo, PEEP, FiO₂)",
      "Aspiração de vias aéreas / secreções",
    ],
  },
  {
    id: "gi", title: "Gastrointestinal / Nutrição", icon: Utensils,
    items: [
      "Ausculta abdominal (RHA) e distensão",
      "Dieta: via, aceitação, resíduo gástrico",
      "Evacuações: frequência, aspecto",
      "Náuseas, vômitos, sinais de sangramento",
      "SNG/SNE: posição, fixação e permeabilidade",
    ],
  },
  {
    id: "gu", title: "Geniturinário / Hidratação", icon: Droplet,
    items: [
      "Diurese: volume, aspecto, densidade",
      "SVD: dia de permanência e sinais infecciosos",
      "Balanço hídrico parcial e acumulado",
      "Sinais de desidratação / sobrecarga",
    ],
  },
  {
    id: "seg", title: "Pele, Segurança e Prevenção", icon: ShieldAlert,
    items: [
      "Integridade da pele (Braden, LPP)",
      "Risco de queda (Morse) e grades elevadas",
      "Identificação do paciente e alergias",
      "Higienização das mãos e EPI",
      "Dispositivos: data, curativo, fixação",
      "Profilaxia de TVP e úlcera de estresse",
    ],
  },
];

function SystemsChecklist() {
  const flatKeys = useMemo(() => SYSTEMS.flatMap((s) => s.items.map((_, i) => `${s.id}:${i}`)), []);
  const [state, setState] = useLocal<Record<string, boolean>>("checklist:systems", {});

  const toggle = (k: string) => setState((p) => ({ ...p, [k]: !p[k] }));
  const reset = () => setState({});

  const buildText = () => {
    const lines: string[] = [`✅ *AVALIAÇÃO POR SISTEMAS*`, `_${new Date().toLocaleString("pt-BR")}_`, ""];
    SYSTEMS.forEach((s) => {
      lines.push(`*${s.title}*`);
      s.items.forEach((it, i) => {
        const on = !!state[`${s.id}:${i}`];
        lines.push(`${on ? "☑" : "☐"} ${it}`);
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  };

  return (
    <div className="space-y-5">
      {SYSTEMS.map((s) => {
        const done = s.items.filter((_, i) => state[`${s.id}:${i}`]).length;
        return (
          <div key={s.id}>
            <SectionTitle icon={s.icon} title={s.title} count={s.items.length} done={done} />
            <div className="space-y-1.5">
              {s.items.map((it, i) => {
                const k = `${s.id}:${i}`;
                return <CheckItem key={k} checked={!!state[k]} onToggle={() => toggle(k)}>{it}</CheckItem>;
              })}
            </div>
          </div>
        );
      })}
      <p className="text-[10.5px] text-muted-foreground">Total de itens: {flatKeys.length}</p>
      <ShareBar getText={buildText} />
      <ResetBar onReset={reset} />
    </div>
  );
}

// ============ SBAR handoff ============
type SBAR = { s: string; b: string; a: string; r: string; paciente: string; leito: string };
const SBAR_EMPTY: SBAR = { paciente: "", leito: "", s: "", b: "", a: "", r: "" };

type SBARSaved = SBAR & { id: string; createdAt: number };

function sbarToText(d: SBAR) {
  return (
    `📋 *PASSAGEM DE PLANTÃO — SBAR*\n` +
    `👤 Paciente: ${d.paciente || "—"}   |   🛏 Leito: ${d.leito || "—"}\n\n` +
    `*S — Situação*\n${d.s || "—"}\n\n` +
    `*B — Breve histórico*\n${d.b || "—"}\n\n` +
    `*A — Avaliação*\n${d.a || "—"}\n\n` +
    `*R — Recomendação*\n${d.r || "—"}`
  );
}

function SBARForm() {
  const [d, setD] = useLocal<SBAR>("checklist:sbar", SBAR_EMPTY);
  const [saved, setSaved] = useLocal<SBARSaved[]>("checklist:sbar:saved", []);
  const [openId, setOpenId] = useState<string | null>(null);
  const set = (k: keyof SBAR, v: string) => setD({ ...d, [k]: v });

  const isEmpty = !d.paciente && !d.leito && !d.s && !d.b && !d.a && !d.r;

  const salvar = () => {
    if (isEmpty) return;
    const entry: SBARSaved = { ...d, id: crypto.randomUUID(), createdAt: Date.now() };
    setSaved([entry, ...saved]);
    setD(SBAR_EMPTY);
    setOpenId(entry.id);
    fbqTrack("SubmitApplication", {
      content_name: "sbar_handoff",
      content_category: "checklist",
    });
  };
  const remover = (id: string) => setSaved(saved.filter((x) => x.id !== id));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold">Paciente</Label>
          <Input value={d.paciente} onChange={(e) => set("paciente", e.target.value)} placeholder="Nome / iniciais" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] font-semibold">Leito / Setor</Label>
          <Input value={d.leito} onChange={(e) => set("leito", e.target.value)} placeholder="Ex.: UTI 03" />
        </div>
      </div>

      {([
        { k: "s", title: "S — Situação", hint: "Motivo da internação, queixa atual, status agora." },
        { k: "b", title: "B — Breve histórico (Background)", hint: "Diagnósticos, cirurgias, alergias, comorbidades." },
        { k: "a", title: "A — Avaliação (Assessment)", hint: "Sinais vitais, exame físico, exames críticos, hipótese." },
        { k: "r", title: "R — Recomendação", hint: "Condutas pendentes, medicações a aprazar, o que vigiar." },
      ] as const).map((f) => (
        <div key={f.k} className="rounded-2xl bg-secondary/40 p-3 ring-1 ring-border/40">
          <p className="text-[12px] font-bold text-foreground">{f.title}</p>
          <p className="mb-2 text-[11px] text-muted-foreground">{f.hint}</p>
          <Textarea
            rows={3}
            value={d[f.k]}
            onChange={(e) => set(f.k, e.target.value)}
            className="bg-card text-[12.5px]"
          />
        </div>
      ))}

      <div className="flex gap-2">
        <Button onClick={salvar} disabled={isEmpty} className="flex-1">
          <Save className="mr-1.5 h-4 w-4" /> Salvar passagem
        </Button>
        <Button variant="outline" onClick={() => setD(SBAR_EMPTY)}>Limpar</Button>
      </div>

      {/* ==== Histórico salvo ==== */}
      {saved.length > 0 && (
        <div className="pt-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold text-foreground">Passagens salvas · {saved.length}</p>
            <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => setSaved([])}>
              Limpar tudo
            </Button>
          </div>
          <div className="space-y-2">
            {saved.map((e) => {
              const open = openId === e.id;
              const txt = sbarToText(e);
              return (
                <div key={e.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
                  <button
                    onClick={() => setOpenId(open ? null : e.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/40"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <ClipboardCheck className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-bold text-foreground">
                        {e.paciente || "Sem paciente"} {e.leito && `· ${e.leito}`}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {open && (
                    <div className="border-t border-border/50 bg-secondary/30 p-3">
                      <pre className="whitespace-pre-wrap break-words rounded-xl bg-card p-3 text-[11.5px] leading-relaxed text-foreground ring-1 ring-border/50">
                        {txt.replace(/\*/g, "")}
                      </pre>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            fbqTrackCustom("Share", { content_type: "sbar", method: "whatsapp" });
                            shareWhatsApp(txt);
                          }}
                          className="flex-1 bg-[#25D366] text-white hover:bg-[#20bd5a]"
                        >
                          <Share2 className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyText(txt)}>
                          <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remover(e.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ Tasks + alarms ============
type Task = { id: string; titulo: string; hora: string; feito: boolean; alertado?: boolean };

function Tasks() {
  const [tasks, setTasks] = useLocal<Task[]>("checklist:tasks", []);
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
  }, []);

  // schedule alarms
  useEffect(() => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    const now = new Date();
    tasks.forEach((t) => {
      if (t.feito || t.alertado || !t.hora) return;
      const [h, m] = t.hora.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return;
      const target = new Date();
      target.setHours(h, m, 0, 0);
      const delay = target.getTime() - now.getTime();
      if (delay <= 0 || delay > 12 * 3600 * 1000) return;
      timers.current[t.id] = setTimeout(() => {
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏰ Aprazamento", { body: `${t.hora} — ${t.titulo}` });
          }
        } catch { /* ignore */ }
        try {
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.001, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
          o.start(); o.stop(ctx.currentTime + 0.6);
        } catch { /* ignore */ }
        setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, alertado: true } : x)));
      }, delay);
    });
    return () => { Object.values(timers.current).forEach(clearTimeout); };
  }, [tasks, setTasks]);

  const add = () => {
    if (!titulo.trim()) return;
    setTasks([...tasks, { id: crypto.randomUUID(), titulo: titulo.trim(), hora, feito: false }]);
    setTitulo(""); setHora("");
  };
  const toggle = (id: string) => setTasks(tasks.map((t) => (t.id === id ? { ...t, feito: !t.feito } : t)));
  const remove = (id: string) => setTasks(tasks.filter((t) => t.id !== id));

  const ordered = [...tasks].sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
  const feitas = tasks.filter((t) => t.feito).length;

  const buildText = () => {
    const lines = [`⏰ *APRAZAMENTO DO TURNO*`, `_${new Date().toLocaleString("pt-BR")}_`, `${feitas}/${tasks.length} concluídas`, ""];
    ordered.forEach((t) => lines.push(`${t.feito ? "☑" : "☐"} ${t.hora || "--:--"}  ${t.titulo}`));
    return lines.join("\n");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-secondary/40 p-3 ring-1 ring-border/40">
        <p className="mb-2 text-[12px] font-bold text-foreground">Nova tarefa aprazada</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Dipirona 1g EV"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-[110px]" />
          <Button onClick={add} size="icon" aria-label="Adicionar"><Plus className="h-4 w-4" /></Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <Bell className="h-3 w-3" /> Alarme sonoro + notificação no horário definido (aba aberta).
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-muted-foreground">Tarefas do turno · {feitas}/{tasks.length} concluídas</p>
        {tasks.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTasks([])} className="h-7 text-[11px]">Limpar tudo</Button>
        )}
      </div>

      {ordered.length === 0 && (
        <p className="rounded-xl bg-secondary/40 py-6 text-center text-[12px] text-muted-foreground">
          Nenhuma tarefa. Adicione um aprazamento acima.
        </p>
      )}

      <div className="space-y-2">
        {ordered.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2.5 rounded-xl p-2.5 ring-1 transition-all",
              t.feito ? "bg-primary/5 ring-primary/20" : "bg-card ring-border/50",
            )}
          >
            <button
              onClick={() => toggle(t.id)}
              className={cn(
                "grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 transition-all",
                t.feito
                  ? "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-primary"
                  : "bg-card ring-border",
              )}
            >
              {t.feito && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[12.5px] font-semibold", t.feito ? "text-muted-foreground line-through" : "text-foreground")}>
                {t.titulo}
              </p>
              {t.hora && (
                <p className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <Clock className="h-3 w-3" /> {t.hora} {t.alertado && "· alertado"}
                </p>
              )}
            </div>
            <button onClick={() => remove(t.id)} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Remover">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <ShareBar getText={buildText} disabled={tasks.length === 0} />
    </div>
  );
}

// ============ Shift organizer ============
const TURNO_ITEMS = [
  "Conferir prescrição médica atualizada",
  "Checar dispositivos e acessos venosos",
  "Verificar estoque de materiais no leito",
  "Preparar medicações do turno",
  "Registrar sinais vitais e evolução",
  "Aprazar próximas medicações",
  "Reavaliar dor e sedação",
  "Comunicar intercorrências à equipe médica",
  "Higiene e conforto do paciente",
  "Passagem de plantão organizada (SBAR)",
];

function Turno() {
  const [st, setSt] = useLocal<Record<number, boolean>>("checklist:turno", {});
  const done = TURNO_ITEMS.filter((_, i) => st[i]).length;
  const buildText = () => {
    const lines = [`📌 *ORGANIZAÇÃO DO PLANTÃO*`, `_${new Date().toLocaleString("pt-BR")}_`, `${done}/${TURNO_ITEMS.length} concluídas`, ""];
    TURNO_ITEMS.forEach((it, i) => lines.push(`${st[i] ? "☑" : "☐"} ${it}`));
    return lines.join("\n");
  };
  return (
    <div>
      <SectionTitle icon={ListChecks} title="Rotina do plantão" count={TURNO_ITEMS.length} done={done} />
      <div className="space-y-1.5">
        {TURNO_ITEMS.map((it, i) => (
          <CheckItem key={i} checked={!!st[i]} onToggle={() => setSt({ ...st, [i]: !st[i] })}>{it}</CheckItem>
        ))}
      </div>
      <ShareBar getText={buildText} />
      <ResetBar onReset={() => setSt({})} />
    </div>
  );
}

// ============ Page ============
const TOOLS: Tool[] = [
  { id: "sist", label: "Avaliação por sistemas", icon: HeartPulse,    desc: "Cardio, respiratório, neuro, GI, GU, pele", render: () => <SystemsChecklist /> },
  { id: "sbar", label: "Passagem SBAR",         icon: ClipboardCheck, desc: "Situação · Breve histórico · Avaliação · Recomendação", render: () => <SBARForm /> },
  { id: "tarefas", label: "Aprazamento & alarmes", icon: Bell,        desc: "Tarefas do dia com alarme sonoro",         render: () => <Tasks /> },
  { id: "turno", label: "Organização do plantão", icon: ListChecks,   desc: "Rotina do turno em ordem",                 render: () => <Turno /> },
];

function ChecklistPage() {
  const [active, setActive] = useState<string>(TOOLS[0].id);
  const current = TOOLS.find((t) => t.id === active) ?? TOOLS[0];

  return (
    <div className="relative min-w-0 animate-[slide-in-right_0.3s_ease-out] pb-8">
      {/* HEADER */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent" />
        <div className="absolute -top-20 -left-16 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -top-10 -right-10 -z-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />

        <div className="flex items-center gap-3 px-5 pt-4">
          <Link to="/" aria-label="Voltar" className="grid h-10 w-10 place-items-center rounded-full bg-card/95 shadow-md backdrop-blur tap-scale ring-1 ring-border/40">
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
        </div>

        <div className="px-5 pt-4 pb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary ring-1 ring-primary/20">
            <ClipboardCheck className="h-3 w-3" /> Segurança do paciente
          </div>
          <h1 className="mt-2.5 text-[26px] font-black leading-[1.05] tracking-tight text-foreground">
            Check-list
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              de Enfermagem
            </span>
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Avaliação por sistemas, passagem SBAR e alarmes de aprazamento — nada se perde.
          </p>
        </div>
      </section>

      {/* TOOL GRID */}
      <div className="mt-1 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          {TOOLS.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={cn(
                  "group relative flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-all",
                  on
                    ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-[0_10px_25px_-10px_color-mix(in_oklab,var(--primary)_55%,transparent),inset_0_-2px_0_rgb(0_0_0/0.12)]"
                    : "bg-card ring-1 ring-border/50 hover:ring-primary/40",
                )}
              >
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all", on ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary")}>
                  <t.icon className="h-[16px] w-[16px]" />
                </span>
                <p className={cn("min-w-0 flex-1 truncate text-[12px] font-bold leading-tight", on ? "text-primary-foreground" : "text-foreground")}>
                  {t.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ACTIVE CARD */}
      <section className="mt-5 px-5">
        <div
          key={current.id}
          className="relative min-w-0 animate-[fade-in_0.3s_ease-out] overflow-hidden rounded-3xl bg-card p-5 shadow-[0_20px_50px_-25px_rgb(15_23_42/0.3),0_8px_20px_-12px_rgb(15_23_42/0.15)] ring-1 ring-border/50"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/8 to-transparent" />

          <div className="relative mb-5 flex items-start gap-3 border-b border-border/50 pb-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[0_10px_25px_-10px_color-mix(in_oklab,var(--primary)_55%,transparent),inset_0_-3px_0_rgb(0_0_0/0.12)]">
              <current.icon className="h-5 w-5 drop-shadow" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Ativo</p>
              <h2 className="mt-0.5 truncate text-[18px] font-black tracking-tight text-foreground">{current.label}</h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{current.desc}</p>
            </div>
          </div>

          <div className="relative min-w-0">{current.render()}</div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
          <span aria-hidden className="text-[13px]">⚠</span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ferramenta de apoio clínico. Sempre siga protocolos institucionais e a prescrição médica.
          </p>
        </div>
      </section>
    </div>
  );
}