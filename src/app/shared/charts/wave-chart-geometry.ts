/** Pure SVG geometry for the DOCU-X document intake chart.
 * Displayed data points are real server values; sampling is for visual path geometry only.
 */
export const WAVE = {width: 960, height: 300, left: 44, right: 20, top: 18, bottom: 48, samples: 80} as const;

export function safeMax(values: readonly number[]): number {
  return Math.max(2, ...values.filter(v => Number.isFinite(v) && v >= 0).map(v => Math.ceil(v + 1)));
}

/** Resample a series onto a common coordinate domain for safe path morphing.
 * This never changes the underlying counts or the exact-value table.
 */
export function sampleWave(values: readonly number[], samples = WAVE.samples): number[] {
  const clean = values.map(v => Number.isFinite(v) && v >= 0 ? v : 0);
  if (!clean.length) return Array(samples).fill(0);
  if (clean.length === 1) return Array(samples).fill(clean[0]);
  return Array.from({length: samples}, (_, index) => {
    const position = index / (samples - 1) * (clean.length - 1);
    const left = Math.floor(position);
    const fraction = position - left;
    return clean[left] * (1 - fraction) + clean[Math.min(clean.length - 1, left + 1)] * fraction;
  });
}

export function pixelY(value: number, maximum: number): number {
  return WAVE.top + (1 - Math.max(0, Math.min(1, value / Math.max(maximum, 1)))) * (WAVE.height - WAVE.top - WAVE.bottom);
}

export function wavePath(y: readonly number[], filled = false): string {
  if (!y.length) return '';
  const left = WAVE.left;
  const span = WAVE.width - WAVE.left - WAVE.right;
  const x = (i: number) => left + span * i / Math.max(1, y.length - 1);
  const coord = (v: number) => Number(v.toFixed(2));
  let path = `M ${coord(x(0))} ${coord(y[0])}`;
  for (let i = 1; i < y.length; i++) {
    const mid = (x(i - 1) + x(i)) / 2;
    path += ` C ${coord(mid)} ${coord(y[i - 1])} ${coord(mid)} ${coord(y[i])} ${coord(x(i))} ${coord(y[i])}`;
  }
  if (filled) path += ` L ${coord(x(y.length - 1))} ${WAVE.height - WAVE.bottom} L ${left} ${WAVE.height - WAVE.bottom} Z`;
  return path;
}

export function waveEase(t: number): number {
  const n = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - n, 3);
}

export function interpolateWave(from: readonly number[], to: readonly number[], t: number): number[] {
  const factor = waveEase(t);
  return to.map((value, index) => (from[index] ?? value) + ((value - (from[index] ?? value)) * factor));
}
