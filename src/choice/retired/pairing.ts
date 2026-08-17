import type { Rng } from '../engine/rng';
import {
  CRISIS_AT_ESCAPE,
  CRISIS_AT_START,
  HIGH_VALUE_PARTNER,
  PAIR_MIX,
  RARITY_WEIGHT,
  ULTRA_PARTNER,
} from './balance';
import { OPTION_POOL } from './options';
import type { ChoicePair, GameState, OptionDef, OptionValue, PairType } from './types';

/**
 * 짝 조합.
 *
 * 선택지는 낱개로 존재하고, 한 화면에 뜨는 두 개는 매번 여기서 만들어진다.
 * 유형별 비율이 아니라 **짝 유형의 비율**을 관리하기 위해서다.
 *
 * 순서는 항상 이렇다: 짝 유형을 먼저 정하고 → 한쪽을 뽑고 → 그 짝 유형과
 * 반대편 규칙을 동시에 만족하는 상대를 뽑는다. 상대를 못 찾으면 첫 장을
 * 다시 뽑는다. 유형을 먼저 정하는 이유는, 옵션을 먼저 뽑으면 그 옵션이
 * 속할 수 있는 유형 쪽으로 비율이 끌려가기 때문이다.
 */

const CRISIS_POOL = OPTION_POOL.filter((o) => o.crisis);
const NORMAL_POOL = OPTION_POOL.filter((o) => !o.crisis);

/** 위기 짝이 뜰 확률(0~1). 탈출이 가까울수록 올라간다. */
export function crisisChance(shards: number, escapeTarget: number): number {
  const progress = escapeTarget <= 0 ? 1 : Math.min(1, Math.max(0, shards / escapeTarget));
  const pct = CRISIS_AT_START + (CRISIS_AT_ESCAPE - CRISIS_AT_START) * progress;
  return pct / 100;
}

/** 이번 화면의 짝 유형. 위기를 먼저 판정하고 남은 몫을 대립과 동류가 나눈다. */
export function pickPairType(shards: number, escapeTarget: number, rng: Rng): PairType {
  if (rng.next() < crisisChance(shards, escapeTarget)) return 'crisis';
  const clash = PAIR_MIX.clash / (PAIR_MIX.clash + PAIR_MIX.kin);
  return rng.next() < clash ? 'clash' : 'kin';
}

/**
 * 고밸류 선택지의 반대편에 허용되는 밸류.
 *
 * 이 규칙이 없으면 "덱의 저주를 전부 제거" 맞은편에 시시한 것이 놓여
 * 딜레마가 아니라 무료 보상이 된다.
 */
export function allowedPartnerValues(o: OptionDef): OptionValue[] | null {
  if (o.rarity === 'ultra') return ULTRA_PARTNER;
  if (o.value === 'high') return HIGH_VALUE_PARTNER;
  return null; // 제약 없음
}

/** 양쪽 모두의 반대편 규칙을 만족하는가. 규칙은 대칭으로 건다. */
export function partnerOk(a: OptionDef, b: OptionDef): boolean {
  const forA = allowedPartnerValues(a);
  if (forA && !forA.includes(b.value)) return false;
  const forB = allowedPartnerValues(b);
  if (forB && !forB.includes(a.value)) return false;
  return true;
}

/** 짝 유형이 요구하는 관계를 만족하는가. */
function typeOk(type: PairType, a: OptionDef, b: OptionDef): boolean {
  if (a.id === b.id) return false;
  switch (type) {
    case 'crisis':
      return Boolean(a.crisis && b.crisis);
    case 'clash':
      return a.dir !== b.dir;
    case 'kin':
      return a.dir === b.dir;
  }
}

function weightedPick(pool: OptionDef[], rng: Rng): OptionDef | null {
  if (pool.length === 0) return null;
  let total = 0;
  for (const o of pool) total += RARITY_WEIGHT[o.rarity];
  let roll = rng.next() * total;
  for (const o of pool) {
    roll -= RARITY_WEIGHT[o.rarity];
    if (roll <= 0) return o;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * 짝 하나를 만든다.
 *
 * 첫 장을 뽑고 상대를 찾는 것을 여러 번 시도한다. 매우 희귀 선택지는
 * 상대 후보가 아주 좁아서(고밸류만) 한 번에 실패할 수 있기 때문이다.
 * 끝내 못 만들면 유형을 포기하고 아무 짝이나 돌려준다 — 루프가 끊기는 것보다 낫다.
 */
export function composePair(state: GameState, rng: Rng, forced?: PairType): ChoicePair {
  const type = forced ?? pickPairType(state.shards, state.escapeTarget, rng);
  const base = type === 'crisis' ? CRISIS_POOL : NORMAL_POOL;

  // 최근에 나온 것은 피한다. 다 걸러지면 그냥 원래 풀에서 뽑는다.
  const fresh = base.filter((o) => !state.recent.includes(o.id));
  const pool = fresh.length >= 2 ? fresh : base;

  for (let attempt = 0; attempt < 24; attempt++) {
    const first = weightedPick(pool, rng);
    if (!first) break;
    const mates = pool.filter((o) => typeOk(type, first, o) && partnerOk(first, o));
    const second = weightedPick(mates, rng);
    if (!second) continue;

    const redFirst = rng.next() < 0.5;
    return {
      type,
      prompt: rng.pick(PROMPTS[type]),
      red: redFirst ? first : second,
      blue: redFirst ? second : first,
    };
  }

  // 규칙을 만족하는 조합을 못 찾았다. 동류로 물러난다.
  return type === 'kin'
    ? fallbackPair(pool, rng)
    : composePair(state, rng, 'kin');
}

function fallbackPair(pool: OptionDef[], rng: Rng): ChoicePair {
  const a = rng.pick(pool);
  const rest = pool.filter((o) => o.id !== a.id && partnerOk(a, o));
  const b = rest.length > 0 ? rng.pick(rest) : rng.pick(pool.filter((o) => o.id !== a.id));
  return { type: 'kin', prompt: rng.pick(PROMPTS.kin), red: a, blue: b };
}

/**
 * 상황 문구.
 *
 * 짝이 매번 조합되므로 이벤트별 서사는 붙일 수 없다. 대신 짝 유형이 무슨
 * 판단인지를 문구가 거든다 — 대립은 갈림길, 동류는 저울질, 위기는 막다른 길.
 */
const PROMPTS: Record<PairType, string[]> = {
  clash: [
    '길이 두 갈래로 갈린다.',
    '지금 살릴 것인가, 나중을 살릴 것인가.',
    '한쪽 손에는 앞날이, 다른 손에는 지금이 있다.',
    '멀리 볼 것인가, 발밑을 볼 것인가.',
    '두 갈래 다 어딘가로는 이어진다.',
  ],
  kin: [
    '같은 방향에 두 개의 문이 있다.',
    '어느 쪽이든 결은 같다. 정도가 다를 뿐.',
    '고르는 것은 방향이 아니라 깊이다.',
    '둘 다 같은 곳으로 간다. 값이 다르다.',
  ],
  crisis: [
    '어느 쪽으로 가도 무언가를 잃는다.',
    '빠져나갈 길은 없다. 덜 아픈 쪽이 있을 뿐.',
    '값을 치르지 않고는 지나갈 수 없다.',
  ],
};
