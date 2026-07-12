import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactElement } from "react";
import {
  ArrowLeft, Droplets, Syringe, Scale, FlaskConical, Ruler, Baby,
  Activity, HeartPulse, Calculator as CalcIcon, Thermometer, Brain, CalendarDays,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AuthGate } from "@/components/AuthGate";
import { fbqTrack } from "@/lib/fbq";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora de Enfermagem — FSlobo" },
      { name: "description", content: "Calculadora profissional para enfermeiros e técnicos: gotejamento, bomba de infusão, dose por peso, diluição, IMC, superfície corporal, clearance, Glasgow e mais." },
    ],
  }),
  component: GatedCalcPage,
});

function GatedCalcPage() {
  return (
    <AuthGate
      title="Calculadora exclusiva para cadastrados"
      description="Crie sua conta grátis para acessar gotejamento, doses, diluições e todas as ferramentas clínicas."
    >
      <CalcPage />
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

// ---------- helpers ----------
const n = (v: string) => (v.trim() === "" ? NaN : Number(v.replace(",", ".")));
const fmt = (x: number, d = 2) =>
  !isFinite(x) ? "—" : x.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const int = (x: number) => (!isFinite(x) ? "—" : Math.round(x).toLocaleString("pt-BR"));

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-semibold text-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Result({ items }: { items: { label: string; value: string; unit?: string; hint?: string }[] }) {
  return (
    <div className="mt-6 space-y-3">
      {items.map((it) => (
        <div
          key={it.label}
          className="group relative overflow-hidden rounded-2xl p-[1.5px] shadow-[0_20px_45px_-20px_rgb(15_23_42/0.35),0_6px_18px_-8px_rgb(15_23_42/0.15)]"
          style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 90%, transparent), color-mix(in oklab, var(--primary) 60%, white) 50%, color-mix(in oklab, var(--primary) 90%, transparent))" }}
        >
          <div className="relative overflow-hidden rounded-[15px] bg-gradient-to-br from-primary via-primary to-primary/80 p-5 text-primary-foreground">
            <div className="pointer-events-none absolute -top-10 -right-6 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-black/25 blur-2xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.15] mix-blend-overlay"
              style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }}
            />
            <div className="relative">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-white/85">{it.label}</p>
              <p className="mt-1.5 text-[32px] font-black leading-none tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
                {it.value}
                {it.unit && <span className="ml-1.5 text-[14px] font-bold text-white/85">{it.unit}</span>}
              </p>
              {it.hint && <p className="mt-2 text-[11.5px] font-medium text-white/80">{it.hint}</p>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Individual calculators ----------
function Gotejamento() {
  const [vol, setVol] = useState("500");
  const [tempo, setTempo] = useState("8");
  const v = n(vol), t = n(tempo);
  const macro = (v / (t * 3));
  const micro = (v / t);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Volume total (mL)"><Input inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} /></Field>
      <Field label="Tempo de infusão (horas)"><Input inputMode="decimal" value={tempo} onChange={(e) => setTempo(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[
          { label: "Macrogotas", value: int(macro), unit: "gts/min", hint: "1 mL = 20 gotas · V ÷ (T × 3)" },
          { label: "Microgotas", value: int(micro), unit: "mgts/min", hint: "1 mL = 60 microgotas · V ÷ T" },
        ]} />
      </div>
    </div>
  );
}

function BombaInfusao() {
  const [vol, setVol] = useState("250");
  const [tempo, setTempo] = useState("2");
  const v = n(vol), t = n(tempo);
  const mlh = v / t;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Volume (mL)"><Input inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} /></Field>
      <Field label="Tempo (horas)"><Input inputMode="decimal" value={tempo} onChange={(e) => setTempo(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[{ label: "Velocidade da bomba", value: fmt(mlh), unit: "mL/h", hint: "V ÷ T em horas" }]} />
      </div>
    </div>
  );
}

function DosePeso() {
  const [peso, setPeso] = useState("70");
  const [dose, setDose] = useState("10");
  const [conc, setConc] = useState("100");
  const [volAmp, setVolAmp] = useState("2");
  const p = n(peso), d = n(dose), c = n(conc), va = n(volAmp);
  const doseTotal = p * d;
  const mlDose = (doseTotal * va) / c;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Peso do paciente (kg)"><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
      <Field label="Dose prescrita (mg/kg)"><Input inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} /></Field>
      <Field label="Concentração da ampola (mg)"><Input inputMode="decimal" value={conc} onChange={(e) => setConc(e.target.value)} /></Field>
      <Field label="Volume da ampola (mL)"><Input inputMode="decimal" value={volAmp} onChange={(e) => setVolAmp(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[
          { label: "Dose total", value: fmt(doseTotal), unit: "mg" },
          { label: "Volume a administrar", value: fmt(mlDose), unit: "mL", hint: "(dose × vol. ampola) ÷ concentração" },
        ]} />
      </div>
    </div>
  );
}

function RegraTres() {
  const [a, setA] = useState("500");
  const [b, setB] = useState("100");
  const [c, setC] = useState("250");
  const va = n(a), vb = n(b), vc = n(c);
  const x = (vc * vb) / va;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Valor A"><Input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} /></Field>
      <Field label="Corresponde a B"><Input inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      <Field label="Quanto vale C?"><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      <div className="sm:col-span-3">
        <Result items={[{ label: "Resultado (X)", value: fmt(x, 3), hint: "X = (C × B) ÷ A" }]} />
      </div>
    </div>
  );
}

function Diluicao() {
  const [c1, setC1] = useState("100");
  const [c2, setC2] = useState("10");
  const [v2, setV2] = useState("50");
  const vc1 = n(c1), vc2 = n(c2), vv2 = n(v2);
  const v1 = (vc2 * vv2) / vc1;
  const diluente = vv2 - v1;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Concentração inicial (C1)"><Input inputMode="decimal" value={c1} onChange={(e) => setC1(e.target.value)} /></Field>
      <Field label="Concentração final (C2)"><Input inputMode="decimal" value={c2} onChange={(e) => setC2(e.target.value)} /></Field>
      <Field label="Volume final (V2, mL)"><Input inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value)} /></Field>
      <div className="sm:col-span-3">
        <Result items={[
          { label: "Volume do fármaco (V1)", value: fmt(v1), unit: "mL", hint: "C1·V1 = C2·V2" },
          { label: "Volume de diluente", value: fmt(diluente), unit: "mL" },
        ]} />
      </div>
    </div>
  );
}

function IMC() {
  const [peso, setPeso] = useState("70");
  const [altura, setAltura] = useState("1.70");
  const p = n(peso), a = n(altura);
  const imc = p / (a * a);
  const classe =
    imc < 18.5 ? "Abaixo do peso" :
    imc < 25 ? "Peso normal" :
    imc < 30 ? "Sobrepeso" :
    imc < 35 ? "Obesidade grau I" :
    imc < 40 ? "Obesidade grau II" :
    "Obesidade grau III";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Peso (kg)"><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
      <Field label="Altura (m)"><Input inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[{ label: "IMC", value: fmt(imc), unit: "kg/m²", hint: isFinite(imc) ? classe : undefined }]} />
      </div>
    </div>
  );
}

function SC() {
  const [peso, setPeso] = useState("70");
  const [altura, setAltura] = useState("170");
  const p = n(peso), a = n(altura);
  const sc = Math.sqrt((p * a) / 3600);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Peso (kg)"><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
      <Field label="Altura (cm)"><Input inputMode="decimal" value={altura} onChange={(e) => setAltura(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[{ label: "Superfície corporal", value: fmt(sc), unit: "m²", hint: "Mosteller: √((peso × altura) ÷ 3600)" }]} />
      </div>
    </div>
  );
}

function Clearance() {
  const [idade, setIdade] = useState("60");
  const [peso, setPeso] = useState("70");
  const [cr, setCr] = useState("1.0");
  const [sexo, setSexo] = useState<"M" | "F">("M");
  const i = n(idade), p = n(peso), c = n(cr);
  const base = ((140 - i) * p) / (72 * c);
  const clcr = sexo === "F" ? base * 0.85 : base;
  const est =
    clcr >= 90 ? "Função normal (≥ 90)" :
    clcr >= 60 ? "Redução leve (60–89)" :
    clcr >= 30 ? "Redução moderada (30–59)" :
    clcr >= 15 ? "Redução grave (15–29)" :
    "Falência (< 15)";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Idade (anos)"><Input inputMode="decimal" value={idade} onChange={(e) => setIdade(e.target.value)} /></Field>
      <Field label="Peso (kg)"><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
      <Field label="Creatinina sérica (mg/dL)"><Input inputMode="decimal" value={cr} onChange={(e) => setCr(e.target.value)} /></Field>
      <Field label="Sexo">
        <Select value={sexo} onValueChange={(x) => setSexo(x as "M" | "F")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="M">Masculino</SelectItem>
            <SelectItem value="F">Feminino</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Result items={[{ label: "Clearance de creatinina", value: fmt(clcr), unit: "mL/min", hint: `Cockcroft-Gault · ${isFinite(clcr) ? est : ""}` }]} />
      </div>
    </div>
  );
}

function Glasgow() {
  const [olhos, setOlhos] = useState("4");
  const [verbal, setVerbal] = useState("5");
  const [motora, setMotora] = useState("6");
  const total = n(olhos) + n(verbal) + n(motora);
  const cls =
    total >= 13 ? "Leve (13–15)" :
    total >= 9 ? "Moderada (9–12)" :
    total >= 3 ? "Grave (3–8)" : "—";
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Abertura ocular (1–4)">
        <Select value={olhos} onValueChange={setOlhos}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="4">4 · Espontânea</SelectItem>
            <SelectItem value="3">3 · Ao chamado</SelectItem>
            <SelectItem value="2">2 · À dor</SelectItem>
            <SelectItem value="1">1 · Ausente</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Resposta verbal (1–5)">
        <Select value={verbal} onValueChange={setVerbal}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 · Orientada</SelectItem>
            <SelectItem value="4">4 · Confusa</SelectItem>
            <SelectItem value="3">3 · Palavras inapropriadas</SelectItem>
            <SelectItem value="2">2 · Sons incompreensíveis</SelectItem>
            <SelectItem value="1">1 · Ausente</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Resposta motora (1–6)">
        <Select value={motora} onValueChange={setMotora}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="6">6 · Obedece comandos</SelectItem>
            <SelectItem value="5">5 · Localiza dor</SelectItem>
            <SelectItem value="4">4 · Retirada</SelectItem>
            <SelectItem value="3">3 · Flexão anormal</SelectItem>
            <SelectItem value="2">2 · Extensão anormal</SelectItem>
            <SelectItem value="1">1 · Ausente</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="sm:col-span-3">
        <Result items={[{ label: "Escala de Coma de Glasgow", value: int(total), unit: "pts", hint: cls }]} />
      </div>
    </div>
  );
}

function HollidaySegar() {
  const [peso, setPeso] = useState("25");
  const p = n(peso);
  let dia = NaN;
  if (isFinite(p)) {
    if (p <= 10) dia = p * 100;
    else if (p <= 20) dia = 1000 + (p - 10) * 50;
    else dia = 1500 + (p - 20) * 20;
  }
  const hora = dia / 24;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Peso (kg)" hint="Holliday-Segar (pediatria)"><Input inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[
          { label: "Necessidade hídrica diária", value: int(dia), unit: "mL/24h" },
          { label: "Taxa de infusão", value: fmt(hora), unit: "mL/h" },
        ]} />
      </div>
    </div>
  );
}

function DPP() {
  const [dum, setDum] = useState("");
  let ig = "—", dpp = "—";
  if (dum) {
    const d = new Date(dum);
    if (!isNaN(d.getTime())) {
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      const weeks = Math.floor(days / 7);
      ig = `${weeks} semanas e ${days % 7} dias`;
      const dp = new Date(d); dp.setDate(dp.getDate() + 280);
      dpp = dp.toLocaleDateString("pt-BR");
    }
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Data da última menstruação" hint="Regra de Naegele (+280 dias)">
        <Input type="date" value={dum} onChange={(e) => setDum(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Result items={[
          { label: "Idade gestacional", value: ig },
          { label: "Data provável do parto", value: dpp },
        ]} />
      </div>
    </div>
  );
}

function Temperatura() {
  const [c, setC] = useState("37");
  const val = n(c);
  const f = val * 9 / 5 + 32;
  const k = val + 273.15;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Temperatura (°C)"><Input inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[
          { label: "Fahrenheit", value: fmt(f), unit: "°F" },
          { label: "Kelvin", value: fmt(k), unit: "K" },
        ]} />
      </div>
    </div>
  );
}

function Conversao() {
  const [val, setVal] = useState("1");
  const [de, setDe] = useState("g");
  const [para, setPara] = useState("mg");
  const units: Record<string, number> = { mcg: 0.000001, mg: 0.001, g: 1, kg: 1000 };
  const v = n(val);
  const out = (v * units[de]) / units[para];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Valor"><Input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} /></Field>
      <Field label="De">
        <Select value={de} onValueChange={setDe}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(units).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Para">
        <Select value={para} onValueChange={setPara}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(units).map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <div className="sm:col-span-3">
        <Result items={[{ label: "Resultado", value: fmt(out, 4), unit: para }]} />
      </div>
    </div>
  );
}

function BalancoHidrico() {
  const [ent, setEnt] = useState("");
  const [sai, setSai] = useState("");
  const e = n(ent), s = n(sai);
  const bh = e - s;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Entradas totais (mL)" hint="Soro, dieta, medicações, hídrica VO"><Input inputMode="decimal" value={ent} onChange={(e) => setEnt(e.target.value)} /></Field>
      <Field label="Saídas totais (mL)" hint="Diurese, drenos, perdas insensíveis"><Input inputMode="decimal" value={sai} onChange={(e) => setSai(e.target.value)} /></Field>
      <div className="sm:col-span-2">
        <Result items={[{ label: "Balanço hídrico", value: fmt(bh), unit: "mL", hint: bh > 0 ? "Positivo" : bh < 0 ? "Negativo" : "Zerado" }]} />
      </div>
    </div>
  );
}

// ---------- Page ----------
const TOOLS: Tool[] = [
  { id: "gtt",  label: "Gotejamento",         icon: Droplets,      desc: "Macrogotas e microgotas por minuto",   render: () => <Gotejamento /> },
  { id: "bic",  label: "Bomba de infusão",    icon: Activity,      desc: "Velocidade em mL/h",                    render: () => <BombaInfusao /> },
  { id: "dose", label: "Dose por peso",       icon: Syringe,       desc: "Cálculo por mg/kg com ampola",          render: () => <DosePeso /> },
  { id: "r3",   label: "Regra de três",       icon: CalcIcon,      desc: "Proporção simples direta",              render: () => <RegraTres /> },
  { id: "dil",  label: "Diluição",            icon: FlaskConical,  desc: "C1·V1 = C2·V2",                         render: () => <Diluicao /> },
  { id: "un",   label: "Conversão de peso",   icon: Scale,         desc: "mcg · mg · g · kg",                     render: () => <Conversao /> },
  { id: "imc",  label: "IMC",                 icon: Scale,         desc: "Índice de massa corporal",              render: () => <IMC /> },
  { id: "sc",   label: "Superfície corporal", icon: Ruler,         desc: "Fórmula de Mosteller",                  render: () => <SC /> },
  { id: "clcr", label: "Clearance creatinina",icon: HeartPulse,    desc: "Cockcroft-Gault",                       render: () => <Clearance /> },
  { id: "gcs",  label: "Glasgow",             icon: Brain,         desc: "Escala de coma",                        render: () => <Glasgow /> },
  { id: "ped",  label: "Hidratação pediátrica",icon: Baby,          desc: "Holliday-Segar",                        render: () => <HollidaySegar /> },
  { id: "dpp",  label: "IG e DPP",            icon: CalendarDays,  desc: "Idade gestacional / parto",             render: () => <DPP /> },
  { id: "temp", label: "Temperatura",         icon: Thermometer,   desc: "°C · °F · K",                           render: () => <Temperatura /> },
  { id: "bh",   label: "Balanço hídrico",     icon: Droplets,      desc: "Entradas − saídas",                     render: () => <BalancoHidrico /> },
];

function CalcPage() {
  const [active, setActive] = useState<string>(TOOLS[0].id);
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => TOOLS.filter((t) => (t.label + " " + t.desc).toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const current = TOOLS.find((t) => t.id === active) ?? TOOLS[0];

  return (
    <div className="relative min-w-0 animate-[slide-in-right_0.3s_ease-out] pb-8">
      {/* ============ HEADER ============ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent" />
        <div className="absolute -top-20 -left-16 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -top-10 -right-10 -z-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />

        <div className="flex items-center gap-3 px-5 pt-4">
          <Link
            to="/"
            aria-label="Voltar"
            className="grid h-10 w-10 place-items-center rounded-full bg-card/95 shadow-md backdrop-blur tap-scale ring-1 ring-border/40"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </Link>
        </div>

        <div className="px-5 pt-4 pb-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary ring-1 ring-primary/20">
            <CalcIcon className="h-3 w-3" /> Ferramentas clínicas
          </div>
          <h1 className="mt-2.5 text-[26px] font-black leading-[1.05] tracking-tight text-foreground">
            Calculadora
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              de Enfermagem
            </span>
          </h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {TOOLS.length} cálculos profissionais — precisão em segundos.
          </p>
        </div>
      </section>

      {/* ============ SEARCH ============ */}
      <div className="px-5">
        <div className="relative">
          <Input
            placeholder="Buscar cálculo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 rounded-2xl bg-card pl-10 text-[13px] ring-1 ring-border/50 shadow-[0_8px_24px_-12px_rgb(15_23_42/0.15)]"
          />
          <CalcIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* ============ TOOL GRID (mobile-friendly, wraps inside phone frame) ============ */}
      <div className="mt-4 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActive(t.id);
                  fbqTrack("ViewContent", {
                    content_type: "calculator_tool",
                    content_name: t.label,
                    content_ids: [t.id],
                  });
                }}
                className={cn(
                  "group relative flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition-all",
                  on
                    ? "bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-[0_10px_25px_-10px_color-mix(in_oklab,var(--primary)_55%,transparent),inset_0_-2px_0_rgb(0_0_0/0.12)]"
                    : "bg-card ring-1 ring-border/50 hover:ring-primary/40",
                )}
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all",
                    on ? "bg-white/20 text-primary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <t.icon className="h-[16px] w-[16px]" />
                </span>
                <p
                  className={cn(
                    "min-w-0 flex-1 truncate text-[12px] font-bold leading-tight",
                    on ? "text-primary-foreground" : "text-foreground",
                  )}
                >
                  {t.label}
                </p>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-[12px] text-muted-foreground">Nenhum cálculo encontrado</p>
        )}
      </div>

      {/* ============ ACTIVE TOOL CARD ============ */}
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
              <h2 className="mt-0.5 truncate text-[18px] font-black tracking-tight text-foreground">
                {current.label}
              </h2>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{current.desc}</p>
            </div>
          </div>

          <div className="relative min-w-0">{current.render()}</div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-3.5 py-2.5">
          <span aria-hidden className="text-[13px]">⚠</span>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Ferramenta de apoio clínico. Sempre confira a prescrição médica e os protocolos institucionais.
          </p>
        </div>
      </section>
    </div>
  );
}