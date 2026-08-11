import type { Rng } from './rng';
import type { DistributionPattern } from '../data/balance';
import { DISTRIBUTION_PATTERNS, REACTIVITY, WAVE_COUNT } from '../data/balance';

/**
 * 웨이브 총 전력을 레인별로 쪼개는 로직.
 *
 * 플레이어에게는 총합만 공개하고, 이 분배 결과는 배치를 확정한 뒤에야 밝힌다.
 * 그래서 플레이어는 "12가 어디로 올 것인가"를 추론하고 베팅하게 된다.
 */

/** 웨이브 진행도 0(첫 웨이브) ~ 1(마지막 웨이브). */
function progress(wave: number): number {
  if (WAVE_COUNT <= 1) return 1;
  return Math.min(1, Math.max(0, (wave - 1) / (WAVE_COUNT - 1)));
}

/** 진행도에 따라 early/late 가중치를 보간해 패턴 하나를 뽑는다. */
export function pickPattern(wave: number, rng: Rng): DistributionPattern {
  const t = progress(wave);
  const weights = DISTRIBUTION_PATTERNS.map((p) => p.weightEarly + (p.weightLate - p.weightEarly) * t);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return DISTRIBUTION_PATTERNS[0]!;

  let roll = rng.next() * total;
  for (let i = 0; i < DISTRIBUTION_PATTERNS.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return DISTRIBUTION_PATTERNS[i]!;
  }
  return DISTRIBUTION_PATTERNS[DISTRIBUTION_PATTERNS.length - 1]!;
}

/**
 * 비율을 정수 몫으로 바꾼다. 최대잉여법이라 합이 정확히 total과 같다.
 * 반환값은 내림차순으로 정렬돼 있다.
 */
function splitByShares(total: number, shares: number[], laneCount: number): number[] {
  const padded = Array.from({ length: laneCount }, (_, i) => Math.max(0, shares[i] ?? 0));
  const sum = padded.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return Array.from({ length: laneCount }, () => 0);

  const raw = padded.map((s) => (total * s) / sum);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);

  // 소수부가 큰 순서로 남은 1씩을 나눠준다.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && left > 0; k++) {
    floors[order[k]!.i]! += 1;
    left -= 1;
  }

  return floors.sort((a, b) => b - a);
}

/**
 * 각 레인의 방어 두께로 배분 순서를 정한다.
 *
 * reactivity 0이면 순수 무작위, 1이면 가장 얇은 레인이 항상 가장 큰 몫을 받는다.
 * 그 사이에서는 "얇은 곳을 노리는 경향 + 흔들림"이 되어, 일부러 비워 유인하는
 * 플레이가 성립하되 완전히 읽히지는 않는다.
 */
function orderLanesByExposure(defense: number[], rng: Rng, reactivity: number): number[] {
  const min = Math.min(...defense);
  const max = Math.max(...defense);
  const span = max - min;

  const scored = defense.map((d, i) => {
    // 얇을수록 1에 가깝다. 전부 같으면 무차별이 되도록 0.5로 둔다.
    const thinness = span === 0 ? 0.5 : 1 - (d - min) / span;
    const score = (1 - reactivity) * rng.next() + reactivity * thinness;
    return { i, score };
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.i);
}

export interface Allocation {
  pattern: DistributionPattern;
  /** 레인 순서 그대로의 배분값. 합은 total과 같다. */
  perLane: number[];
}

/**
 * 웨이브 총 전력을 레인별로 분배한다.
 *
 * @param defense 레인별 플레이어 배치 전력(공격력+체력 합). 적은 쪽이 얇은 레인.
 */
export function allocateWave(
  total: number,
  wave: number,
  defense: number[],
  rng: Rng,
  reactivity: number = REACTIVITY,
): Allocation {
  const laneCount = defense.length;
  const pattern = pickPattern(wave, rng);
  const amounts = splitByShares(total, pattern.shares, laneCount);
  const laneOrder = orderLanesByExposure(defense, rng, reactivity);

  // 가장 큰 몫을 가장 노출된 레인에 얹는다.
  const perLane = Array.from({ length: laneCount }, () => 0);
  laneOrder.forEach((laneIndex, rank) => {
    perLane[laneIndex] = amounts[rank] ?? 0;
  });

  return { pattern, perLane };
}
