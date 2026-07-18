import { useMemo } from "react";

interface WaveformProps {
  /** Высоты баров 0..1. Если не задано — генерируется псевдослучайный паттерн. */
  bars?: number[];
  /** Прогресс воспроизведения 0..1. */
  progress?: number;
  /** Количество баров при авто-генерации. */
  count?: number;
  seed?: number;
  height?: number;
  onSeek?: (fraction: number) => void;
}

function pseudoBars(count: number, seed: number): number[] {
  // Детерминированный псевдослучайный паттерн, похожий на речь.
  let s = seed || 1;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    // Формируем «слоги»: огибающая с провалами
    const env = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.35));
    out.push(0.12 + r * 0.88 * env);
  }
  return out;
}

export function Waveform({ bars, progress = 0, count = 64, seed = 7, height = 40, onSeek }: WaveformProps) {
  const data = useMemo(() => bars ?? pseudoBars(count, seed), [bars, count, seed]);
  const playedIdx = Math.floor(progress * data.length);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, frac)));
  };

  return (
    <div className="wave" style={{ height, cursor: onSeek ? "pointer" : "default" }} onClick={handleClick}>
      {data.map((h, i) => {
        const cls = i < playedIdx ? "played" : i === playedIdx && progress > 0 ? "active" : "";
        return <div key={i} className={`wave-bar ${cls}`} style={{ height: `${Math.round(h * 100)}%` }} />;
      })}
    </div>
  );
}
