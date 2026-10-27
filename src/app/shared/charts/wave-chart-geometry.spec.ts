import { describe, expect, it } from 'vitest';
import { WAVE, interpolateWave, pixelY, safeMax, sampleWave, waveEase, wavePath } from './wave-chart-geometry';

describe('document flow wave transition geometry', () => {
  it('uses actual endpoints and stable path structure with different date windows', () => {
    const seven = sampleWave([0, 0, 3, 1, 0, 2, 0]);
    const thirty = sampleWave(Array.from({length:30}, (_, i) => i % 4));
    expect(seven).toHaveLength(WAVE.samples);
    expect(thirty).toHaveLength(WAVE.samples);
    expect(seven.at(0)).toBe(0);
    expect(seven.at(-1)).toBe(0);
    expect(thirty.at(-1)).toBe(1);
    expect(wavePath(seven)).toContain(' C ');
    expect(wavePath(seven, true)).toMatch(/ Z$/);
    expect(wavePath(seven).split(' C ')).toHaveLength(WAVE.samples);
  });
  it('morphs monotonically to exactly the requested target without overshoot', () => {
    const a = sampleWave([0,0,0]);
    const b = sampleWave([2,4,0]);
    expect(interpolateWave(a,b,0)).toEqual(a);
    expect(interpolateWave(a,b,1)).toEqual(b);
    const halfway = interpolateWave(a,b,.5);
    expect(halfway.every((v,i) => v >= 0 && v <= b[i])).toBe(true);
    expect(waveEase(-1)).toBe(0);
    expect(waveEase(2)).toBe(1);
  });
  it('sanitizes non-finite input and avoids dividing by zero', () => {
    expect(sampleWave([NaN, -1, Infinity, 2]).every(Number.isFinite)).toBe(true);
    expect(safeMax([])).toBe(2);
    expect(pixelY(0,0)).toBe(WAVE.height-WAVE.bottom);
    expect(sampleWave([])).toHaveLength(WAVE.samples);
  });
});
