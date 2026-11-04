import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface ParamSliderProps {
  label: string;
  symbol: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  step: number;
  digits?: number;
  /** value is computed by the engine — shown read-only */
  computed?: boolean;
  onChange: (v: number) => void;
}

/** Labelled instrument slider with a numeric readout and direct-entry field. */
export function ParamSlider({
  label,
  symbol,
  value,
  unit,
  min,
  max,
  step,
  digits = 1,
  computed = false,
  onChange,
}: ParamSliderProps) {
  return (
    <div className={cn('space-y-1', computed && 'opacity-60')}>
      <div className="flex items-baseline justify-between">
        <label className="text-[11px] text-plant-300">
          <span className="mr-1.5 font-mono text-plant-500">{symbol}</span>
          {label}
          {computed && (
            <span className="ml-1.5 rounded-sm border border-white/10 px-1 font-mono text-[8px] uppercase tracking-wider text-plant-400">
              calc
            </span>
          )}
        </label>
        <span className="flex items-baseline gap-1">
          <input
            type="number"
            value={Number(value.toFixed(digits))}
            min={min}
            max={max}
            step={step}
            disabled={computed}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
            }}
            className="readout w-16 rounded border border-transparent bg-transparent text-right text-xs text-plant-100 outline-none hover:border-white/10 focus:border-signal-liquid/50"
          />
          {unit && <span className="font-mono text-[9px] text-plant-500">{unit}</span>}
        </span>
      </div>
      <Slider
        value={[Math.min(max, Math.max(min, value))]}
        min={min}
        max={max}
        step={step}
        disabled={computed}
        onValueChange={([v]) => v !== undefined && onChange(v)}
      />
    </div>
  );
}
