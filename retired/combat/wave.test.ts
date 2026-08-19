import { describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { allocateWave, pickPattern } from '../src/engine/wave';
import { DISTRIBUTION_PATTERNS, WAVE_COUNT, waveTotalPower } from '../src/data/balance';

const flat = [0, 0, 0];

describe('waveTotalPower', () => {
  it('웨이브가 진행될수록 커진다', () => {
    const totals = Array.from({ length: WAVE_COUNT }, (_, i) => waveTotalPower(i + 1));
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    }
  });

  it('첫 웨이브가 가장 작다', () => {
    expect(waveTotalPower(1)).toBeLessThan(waveTotalPower(WAVE_COUNT));
    expect(waveTotalPower(1)).toBeGreaterThan(0);
  });
});

describe('allocateWave', () => {
  it('분배 합은 항상 총 전력과 같다', () => {
    const rng = new Rng('sum');
    for (let wave = 1; wave <= WAVE_COUNT; wave++) {
      for (let k = 0; k < 60; k++) {
        const total = waveTotalPower(wave);
        const { perLane } = allocateWave(total, wave, flat, rng, 0.5);
        expect(perLane.reduce((a, b) => a + b, 0)).toBe(total);
        expect(perLane).toHaveLength(3);
        expect(perLane.every((v) => v >= 0)).toBe(true);
      }
    }
  });

  it('레인 수만큼의 배열을 돌려준다', () => {
    const { perLane } = allocateWave(12, 1, [0, 0, 0, 0], new Rng('lanes'), 0.5);
    expect(perLane).toHaveLength(4);
  });

  it('총 전력 0이면 전부 0이다', () => {
    const { perLane } = allocateWave(0, 1, flat, new Rng('zero'), 0.5);
    expect(perLane).toEqual([0, 0, 0]);
  });

  it('같은 시드는 같은 분배를 만든다', () => {
    const a = allocateWave(12, 4, [5, 2, 9], new Rng('same'), 0.6);
    const b = allocateWave(12, 4, [5, 2, 9], new Rng('same'), 0.6);
    expect(a.perLane).toEqual(b.perLane);
    expect(a.pattern.id).toBe(b.pattern.id);
  });
});

describe('반응 강도 (reactivity)', () => {
  /**
   * 가장 얇은 레인이 최대 몫을 받은 비율.
   *
   * 균등형(4/4/4)이나 2분할형(6/6/0)은 최대값이 여러 레인에 걸쳐 있어 "노렸다"고
   * 볼 수 없다. 최대값이 하나뿐인 분배만 세야 반응 강도가 제대로 측정된다.
   */
  function thinnestHitRate(reactivity: number, defense: number[], runs = 3000): number {
    const rng = new Rng(`react-${reactivity}`);
    const thinnest = defense.indexOf(Math.min(...defense));
    let hits = 0;
    let decisive = 0;
    for (let i = 0; i < runs; i++) {
      const { perLane } = allocateWave(12, 1, defense, rng, reactivity);
      const max = Math.max(...perLane);
      if (perLane.filter((v) => v === max).length !== 1) continue;
      decisive += 1;
      if (perLane[thinnest] === max) hits += 1;
    }
    return hits / decisive;
  }

  it('1이면 항상 가장 얇은 레인이 최대 몫을 받는다', () => {
    expect(thinnestHitRate(1, [10, 2, 7])).toBe(1);
  });

  it('0이면 무작위에 가깝다', () => {
    // 3레인 무작위면 1/3 근처. 폭을 넉넉히 잡아 흔들림을 허용한다.
    const rate = thinnestHitRate(0, [10, 2, 7]);
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.5);
  });

  it('중간값은 경향은 있되 확정적이지 않다', () => {
    const rate = thinnestHitRate(0.55, [10, 2, 7]);
    expect(rate).toBeGreaterThan(0.45);
    expect(rate).toBeLessThan(1);
  });

  it('강도를 올릴수록 얇은 레인이 더 자주 맞는다', () => {
    const low = thinnestHitRate(0.2, [12, 1, 8]);
    const high = thinnestHitRate(0.85, [12, 1, 8]);
    expect(high).toBeGreaterThan(low);
  });

  it('방어가 모두 같으면 특정 레인에 쏠리지 않는다', () => {
    const rng = new Rng('uniform');
    const hits = [0, 0, 0];
    for (let i = 0; i < 900; i++) {
      const { perLane } = allocateWave(12, 1, [4, 4, 4], rng, 1);
      const max = Math.max(...perLane);
      perLane.forEach((v, idx) => {
        if (v === max) hits[idx]! += 1;
      });
    }
    // 어느 레인도 독점하거나 배제되지 않아야 한다.
    for (const h of hits) expect(h).toBeGreaterThan(150);
  });
});

describe('패턴 분포', () => {
  function patternMix(wave: number, runs = 3000): Record<string, number> {
    const rng = new Rng(`mix-${wave}`);
    const counts: Record<string, number> = {};
    for (const p of DISTRIBUTION_PATTERNS) counts[p.id] = 0;
    for (let i = 0; i < runs; i++) counts[pickPattern(wave, rng).id]! += 1;
    for (const k of Object.keys(counts)) counts[k]! /= runs;
    return counts;
  }

  it('초반에는 균등형이 가장 흔하다', () => {
    const mix = patternMix(1);
    for (const p of DISTRIBUTION_PATTERNS) {
      if (p.id !== 'even') expect(mix['even']!).toBeGreaterThan(mix[p.id]!);
    }
  });

  it('후반에는 균등형이 줄고 몰빵형이 늘어난다', () => {
    const early = patternMix(1);
    const late = patternMix(WAVE_COUNT);
    expect(late['even']!).toBeLessThan(early['even']!);
    expect(late['allin']!).toBeGreaterThan(early['allin']!);
  });

  it('모든 패턴이 언젠가는 나온다', () => {
    const mix = patternMix(Math.ceil(WAVE_COUNT / 2));
    for (const p of DISTRIBUTION_PATTERNS) expect(mix[p.id]!).toBeGreaterThan(0);
  });
});
