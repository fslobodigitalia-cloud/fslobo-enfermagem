import * as React from "react";
import { Button } from "@/components/ui/button";
import { CalcField, CalcSelect } from "@/components/tools/CalcField";
import { CalcResultCard } from "@/components/tools/CalcResultCard";
import { CalcCard } from "@/components/tools/CalcCard";
import {
  CONVERSION_DEFINITIONS,
  type ConversionUnitPair,
  formatDecimal,
  formatHoursAndMinutes,
  isPositiveFinite,
  parseDecimal,
  safeDivide,
} from "@/lib/toolsMath";

/**
 * As 6 ferramentas da Calculadora de Enfermagem
 * (src/pages/tools/CalculadoraEnfermagemPage.tsx). Cada uma é só um
 * executor de fórmula — nunca recomenda dose, via, velocidade clínica ou
 * qualquer decisão assistencial (ver aviso de segurança na página). Todas
 * seguem o mesmo padrão: campos (CalcField/CalcSelect) → validação
 * (src/lib/toolsMath.ts, nunca NaN/Infinity/divisão por zero) → botões
 * Calcular/Limpar → CalcResultCard com a fórmula já substituída pelos
 * valores usados.
 */

const ACTIONS_ROW = "mt-4 flex flex-col gap-3 sm:flex-row";

function ActionsRow({ onCalculate, onClear }: { onCalculate: () => void; onClear: () => void }) {
  return (
    <div className={ACTIONS_ROW}>
      <Button type="button" full onClick={onCalculate} className="sm:w-auto sm:flex-1">
        Calcular
      </Button>
      <Button type="button" variant="outline" full onClick={onClear} className="sm:w-auto">
        Limpar
      </Button>
    </div>
  );
}

/* ─────────────────────────── A) Volume por hora ─────────────────────────── */

export function VolumePorHoraCalc() {
  const [volume, setVolume] = React.useState("");
  const [tempo, setTempo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ value: number; volume: number; tempo: number } | null>(null);

  function handleCalculate() {
    const v = parseDecimal(volume);
    const t = parseDecimal(tempo);
    if (!isPositiveFinite(v) || !isPositiveFinite(t)) {
      setError("Informe volume e tempo válidos, maiores que zero.");
      setResult(null);
      return;
    }
    const value = safeDivide(v, t);
    if (value === null) {
      setError("Não foi possível calcular com esses valores.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ value, volume: v, tempo: t });
  }

  function handleClear() {
    setVolume("");
    setTempo("");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard title="Volume por hora" description="mL/h = volume ÷ tempo">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CalcField id="voh-volume" label="Volume total" unit="mL" value={volume} onChange={setVolume} placeholder="Ex.: 500" />
        <CalcField id="voh-tempo" label="Tempo" unit="horas" value={tempo} onChange={setTempo} placeholder="Ex.: 8" />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Resultado"
          value={result ? formatDecimal(result.value, 1) : null}
          unit="mL/h"
          formula={
            result
              ? `${formatDecimal(result.volume)} mL ÷ ${formatDecimal(result.tempo)} h = ${formatDecimal(result.value, 1)} mL/h`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}

/* ─────────────────────────── B) Tempo de infusão ─────────────────────────── */

export function TempoInfusaoCalc() {
  const [volume, setVolume] = React.useState("");
  const [velocidade, setVelocidade] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ decimalHours: number; volume: number; velocidade: number } | null>(null);

  function handleCalculate() {
    const v = parseDecimal(volume);
    const vel = parseDecimal(velocidade);
    if (!isPositiveFinite(v) || !isPositiveFinite(vel)) {
      setError("Informe volume e velocidade válidos, maiores que zero.");
      setResult(null);
      return;
    }
    const decimalHours = safeDivide(v, vel);
    if (decimalHours === null) {
      setError("Não foi possível calcular com esses valores.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ decimalHours, volume: v, velocidade: vel });
  }

  function handleClear() {
    setVolume("");
    setVelocidade("");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard title="Tempo de infusão" description="tempo = volume ÷ velocidade">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CalcField id="ti-volume" label="Volume" unit="mL" value={volume} onChange={setVolume} placeholder="Ex.: 500" />
        <CalcField id="ti-velocidade" label="Velocidade" unit="mL/h" value={velocidade} onChange={setVelocidade} placeholder="Ex.: 125" />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Tempo estimado"
          value={result ? formatHoursAndMinutes(result.decimalHours) : null}
          formula={
            result
              ? `${formatDecimal(result.volume)} mL ÷ ${formatDecimal(result.velocidade)} mL/h = ${formatHoursAndMinutes(result.decimalHours)}`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}

/* ─────────────────────────── C) Gotejamento ─────────────────────────── */

const FATORES_EQUIPO = [10, 15, 20, 60] as const;

export function GotejamentoCalc() {
  const [volume, setVolume] = React.useState("");
  const [tempoMin, setTempoMin] = React.useState("");
  const [fator, setFator] = React.useState<string>("20");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ value: number; volume: number; tempoMin: number; fator: number } | null>(null);

  function handleCalculate() {
    const v = parseDecimal(volume);
    const t = parseDecimal(tempoMin);
    const f = Number(fator);
    if (!isPositiveFinite(v) || !isPositiveFinite(t)) {
      setError("Informe volume e tempo (em minutos) válidos, maiores que zero.");
      setResult(null);
      return;
    }
    const value = safeDivide(v * f, t);
    if (value === null) {
      setError("Não foi possível calcular com esses valores.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ value, volume: v, tempoMin: t, fator: f });
  }

  function handleClear() {
    setVolume("");
    setTempoMin("");
    setFator("20");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard title="Gotejamento" description="gotas/min = (volume × fator do equipo) ÷ tempo em minutos">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CalcField id="got-volume" label="Volume" unit="mL" value={volume} onChange={setVolume} placeholder="Ex.: 500" />
        <CalcField id="got-tempo" label="Tempo" unit="minutos" value={tempoMin} onChange={setTempoMin} placeholder="Ex.: 480" />
        <CalcSelect id="got-fator" label="Fator do equipo" value={fator} onChange={setFator}>
          {FATORES_EQUIPO.map((f) => (
            <option key={f} value={f}>
              {f} gotas/mL
            </option>
          ))}
        </CalcSelect>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Resultado"
          value={result ? formatDecimal(result.value, 1) : null}
          unit="gotas/min"
          formula={
            result
              ? `Fator utilizado: ${result.fator} gotas/mL — (${formatDecimal(result.volume)} × ${result.fator}) ÷ ${formatDecimal(result.tempoMin)} = ${formatDecimal(result.value, 1)} gotas/min`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}

/* ─────────────────────────── D) Dose-volume ─────────────────────────── */

export function DoseVolumeCalc() {
  const [dosePrescrita, setDosePrescrita] = React.useState("");
  const [doseDisponivel, setDoseDisponivel] = React.useState("");
  const [volumeDisponivel, setVolumeDisponivel] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    value: number;
    dosePrescrita: number;
    doseDisponivel: number;
    volumeDisponivel: number;
  } | null>(null);

  function handleCalculate() {
    const dp = parseDecimal(dosePrescrita);
    const dd = parseDecimal(doseDisponivel);
    const vd = parseDecimal(volumeDisponivel);
    if (!isPositiveFinite(dp) || !isPositiveFinite(dd) || !isPositiveFinite(vd)) {
      setError("Informe dose prescrita, dose disponível e volume disponível válidos, maiores que zero.");
      setResult(null);
      return;
    }
    const value = safeDivide(dp * vd, dd);
    if (value === null) {
      setError("Não foi possível calcular com esses valores.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ value, dosePrescrita: dp, doseDisponivel: dd, volumeDisponivel: vd });
  }

  function handleClear() {
    setDosePrescrita("");
    setDoseDisponivel("");
    setVolumeDisponivel("");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard
      title="Cálculo dose-volume"
      description="Volume a administrar = (dose prescrita × volume disponível) ÷ dose disponível"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CalcField id="dv-prescrita" label="Dose prescrita" value={dosePrescrita} onChange={setDosePrescrita} placeholder="Ex.: 250" />
        <CalcField id="dv-disponivel" label="Dose disponível" value={doseDisponivel} onChange={setDoseDisponivel} placeholder="Ex.: 500" />
        <CalcField id="dv-volume" label="Volume disponível" unit="mL" value={volumeDisponivel} onChange={setVolumeDisponivel} placeholder="Ex.: 10" />
      </div>
      <p className="mt-2 text-[12px] text-slate-400">Use a mesma unidade para dose prescrita e dose disponível (ex.: as duas em mg).</p>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Volume a administrar"
          value={result ? formatDecimal(result.value, 2) : null}
          unit="mL"
          formula={
            result
              ? `(${formatDecimal(result.dosePrescrita)} × ${formatDecimal(result.volumeDisponivel)}) ÷ ${formatDecimal(result.doseDisponivel)} = ${formatDecimal(result.value, 2)} mL`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}

/* ───────────────────── E) Concentração após diluição ───────────────────── */

export function ConcentracaoCalc() {
  const [quantidadeTotal, setQuantidadeTotal] = React.useState("");
  const [volumeFinal, setVolumeFinal] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ value: number; quantidadeTotal: number; volumeFinal: number } | null>(null);

  function handleCalculate() {
    const q = parseDecimal(quantidadeTotal);
    const v = parseDecimal(volumeFinal);
    if (!isPositiveFinite(q) || !isPositiveFinite(v)) {
      setError("Informe a quantidade total e o volume final válidos, maiores que zero.");
      setResult(null);
      return;
    }
    const value = safeDivide(q, v);
    if (value === null) {
      setError("Não foi possível calcular com esses valores.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ value, quantidadeTotal: q, volumeFinal: v });
  }

  function handleClear() {
    setQuantidadeTotal("");
    setVolumeFinal("");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard title="Concentração após diluição/reconstituição" description="concentração = quantidade total ÷ volume final">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CalcField id="conc-total" label="Quantidade total do fármaco" value={quantidadeTotal} onChange={setQuantidadeTotal} placeholder="Ex.: 1000" />
        <CalcField id="conc-volume" label="Volume final" unit="mL" value={volumeFinal} onChange={setVolumeFinal} placeholder="Ex.: 100" />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Concentração"
          value={result ? formatDecimal(result.value, 3) : null}
          unit="por mL"
          formula={
            result
              ? `${formatDecimal(result.quantidadeTotal)} ÷ ${formatDecimal(result.volumeFinal)} mL = ${formatDecimal(result.value, 3)} por mL`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}

/* ─────────────────────────── F) Conversões ─────────────────────────── */

const CONVERSION_PAIRS = Object.keys(CONVERSION_DEFINITIONS) as ConversionUnitPair[];

export function ConversoesCalc() {
  const [pair, setPair] = React.useState<ConversionUnitPair>("g-mg");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ value: number; input: number } | null>(null);

  const definition = CONVERSION_DEFINITIONS[pair];

  function handleCalculate() {
    const v = parseDecimal(value);
    if (v === null || !Number.isFinite(v) || v < 0) {
      setError("Informe um valor numérico válido (zero ou maior).");
      setResult(null);
      return;
    }
    const converted = v * definition.factor;
    if (!Number.isFinite(converted)) {
      setError("Não foi possível calcular com esse valor.");
      setResult(null);
      return;
    }
    setError(null);
    setResult({ value: converted, input: v });
  }

  function handleClear() {
    setValue("");
    setError(null);
    setResult(null);
  }

  return (
    <CalcCard title="Conversões de unidade">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CalcSelect
          id="conv-par"
          label="Conversão"
          value={pair}
          onChange={(v) => {
            setPair(v as ConversionUnitPair);
            setResult(null);
            setError(null);
          }}
        >
          {CONVERSION_PAIRS.map((key) => (
            <option key={key} value={key}>
              {CONVERSION_DEFINITIONS[key].label}
            </option>
          ))}
        </CalcSelect>
        <CalcField id="conv-valor" label="Valor" unit={definition.fromUnit} value={value} onChange={setValue} placeholder="Ex.: 250" />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <ActionsRow onCalculate={handleCalculate} onClear={handleClear} />
      <div className="mt-5">
        <CalcResultCard
          label="Resultado"
          value={result ? formatDecimal(result.value, 4) : null}
          unit={definition.toUnit}
          formula={
            result
              ? `${formatDecimal(result.input)} ${definition.fromUnit} = ${formatDecimal(result.value, 4)} ${definition.toUnit}`
              : undefined
          }
        />
      </div>
    </CalcCard>
  );
}
