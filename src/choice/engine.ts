import type { Rng } from '../engine/rng';
import {
  ESCAPE_TARGET,
  FIELD_START,
  MAX_HP,
  PAIR_RARITY_WEIGHT,
  RECENT_PAIRS,
  STARTING_DECK,
  TAINT_LEVELS,
} from './balance';
import { applyEffects, buildDeck, countKind } from './effects';
import {
  countShards,
  curseCounts,
  drawOne,
  onEdge,
  onPlaced,
  spendRewards as spendFieldRewards,
} from './field';
import { PAIR_TABLE } from './pairs';
import type {
  CardInstance,
  CardKind,
  ChoicePair,
  CurseType,
  GameState,
} from './types';

/**
 * 선택 루프. 버튼을 누르면 덱과 필드가 바뀐다.
 *
 * 끝나는 길은 둘, 탈출(파편을 목표만큼 모음)과 사망(체력 0)이다.
 */

export interface DeckSummary {
  total: number;
  reward: number;
  curse: number;
  neutral: number;
  shard: number;
  /** 저주 비율 0~1. */
  taint: number;
  taintLabel: string;
  taintTone: string;
}

/** 덱과 필드를 합친 전체 보유 카드. */
export function ownedCards(state: GameState): CardInstance[] {
  return [...state.deck, ...state.field];
}

/** 필드에 깔린 저주를 종류별로. "다음에 뭐가 겹칠까"를 보는 값이다. */
export function fieldCurseBreakdown(state: GameState): Record<CurseType, number> {
  return curseCounts(state.field);
}

/** 덱에 남아 있는 저주를 종류별로. UI에 "파멸 2 / 부패 5 / 침식 3"으로 뜬다. */
export function deckCurseBreakdown(state: GameState): Record<CurseType, number> {
  return curseCounts(state.deck);
}

export function summarize(state: GameState): DeckSummary {
  const owned = ownedCards(state);
  const total = owned.length;
  const curse = countKind(owned, 'curse');
  const taint = total === 0 ? 0 : curse / total;
  const level = TAINT_LEVELS.find((l) => taint < l.max) ?? TAINT_LEVELS[TAINT_LEVELS.length - 1]!;

  return {
    total,
    reward: countKind(owned, 'reward'),
    curse,
    neutral: countKind(owned, 'neutral'),
    shard: countKind(owned, 'shard'),
    taint,
    taintLabel: level.label,
    taintTone: level.tone,
  };
}

/**
 * 다음 짝을 뽑는다.
 *
 * 짝은 고정된 테이블에서 통째로 나온다 — 조합하지 않는다. 희소도만이
 * "어떤 짝을 얼마나 자주 만나는가"를 정한다.
 *
 * 짝이 9개뿐이라 반복은 당연하고 의도된 것이다. 최근 몇 개만 걸러
 * "방금 그거 또?"를 막되, 그 이상 거르면 순번 돌리기가 된다.
 */
export function drawPair(state: GameState, rng: Rng): ChoicePair {
  const fresh = PAIR_TABLE.filter((p) => !state.recent.includes(p.id));
  const pool = fresh.length > 0 ? fresh : PAIR_TABLE;

  let total = 0;
  for (const p of pool) total += PAIR_RARITY_WEIGHT[p.rarity];
  let roll = rng.next() * total;
  let picked = pool[pool.length - 1]!;
  for (const p of pool) {
    roll -= PAIR_RARITY_WEIGHT[p.rarity];
    if (roll <= 0) {
      picked = p;
      break;
    }
  }

  const stat = (state.pairStats[picked.id] ??= { seen: 0, red: 0, blue: 0 });
  stat.seen += 1;
  state.rarityStats[picked.rarity] += 1;
  return picked;
}

function remember(state: GameState, pair: ChoicePair): void {
  state.recent.push(pair.id);
  while (state.recent.length > RECENT_PAIRS) state.recent.shift();
}

export function createGame(rng: Rng): GameState {
  const state: GameState = {
    step: 1,
    deck: buildDeck(STARTING_DECK),
    escapeTarget: ESCAPE_TARGET,
    escaped: false,
    hp: MAX_HP,
    maxHp: MAX_HP,
    dead: false,
    field: [],
    push: null,
    current: null,
    recent: [],
    log: [],
    records: [],
    lasting: [],
    triggers: { doom: 0, rot: 0, erode: 0 },
    peakField: { doom: 0, rot: 0, erode: 0 },
    erodeDamage: 0,
    rotMaxHpLost: 0,
    causeOfDeath: null,
    fieldSizes: [],
    riskyDraws: { taken: 0, paired: 0 },
    deckEmptiedAt: null,
    firstPairAt: null,
    pairStats: {},
    rarityStats: { common: 0, uncommon: 0, rare: 0, ultra: 0 },
  };

  // 필드는 비어서 시작한다. 오직 선택지를 통해서만 채워진다.
  void FIELD_START;

  state.current = drawPair(state, rng);
  remember(state, state.current);
  state.log.push(
    `시작. 덱 ${state.deck.length}장, 필드 ${state.field.length}장, 체력 ${MAX_HP}. ` +
      `필드 파편 0/${ESCAPE_TARGET} (덱에서 뽑아야 진척이 된다).`,
  );

  return state;
}

/** 한쪽을 고르고 덱에 즉시 반영한 뒤 다음 선택지를 제시한다. */
export function choose(state: GameState, side: 'red' | 'blue', rng: Rng): void {
  if (state.escaped || state.dead || state.push || !state.current) return;

  const pair = state.current;
  const option = pair[side];

  // 어느 쪽을 골랐는지는 이번 단계의 핵심 지표다. 짝이 9개뿐이라 반복은
  // 당연하고, 같은 짝에서 매번 같은 쪽만 고른다면 그 짝은 죽은 것이다.
  const stat = (state.pairStats[pair.id] ??= { seen: 0, red: 0, blue: 0 });
  stat[side] += 1;

  // 선택 직전의 상태를 찍어 둔다 — 같은 짝이 상황에 따라 다르게 읽히는지
  // 보려면 "그때 덱과 필드가 어땠는가"가 있어야 한다.
  const before = summarize(state);
  const snapshot = {
    deckSize: state.deck.length,
    fieldSize: state.field.length,
    curseCount: before.curse,
    hp: Math.max(0, state.hp),
  };

  // 지속 효과는 선택의 결과가 적용되기 전에 문다.
  const changes = tickLasting(state, side);
  changes.push(...applyEffects(state, option.effects, rng));

  // 저주는 필드에 놓이는 순간 뽑기 쪽에서 이미 판정됐다. 매 선택 끝에
  // 필드를 다시 훑지 않는다 — 그러면 같은 저주가 반복 발동한다.
  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);

  state.records.push({
    step: state.step,
    pairId: pair.id,
    side,
    text: option.text,
    changes,
    ...snapshot,
  });

  state.log.push(`${state.step}. [${side === 'red' ? '빨강' : '파랑'}] ${option.text}`);
  for (const c of changes) state.log.push(`   ${c}`);

  // 푸시 유어 럭이 열렸으면 플레이어가 멈출 때까지 기다린다.
  if (state.push) return;

  advance(state, rng);
}

/**
 * 필드의 보상을 태워 체력을 회복한다.
 *
 * 선택 한 번을 쓰지 않는다 — 짝을 고르는 것과 별개의 행동이라 다음 짝으로
 * 넘어가지 않는다. 대가는 "체력이 가득할 때 쓰면 회복분을 버린다"는 것뿐이고,
 * 그래서 언제 쓸지가 판단이 된다.
 */
export function useRewards(state: GameState): void {
  if (state.escaped || state.dead) return;

  const lines = spendFieldRewards(state);
  state.log.push(`${state.step}. [보상 사용]`);
  for (const l of lines) state.log.push(`   ${l}`);
}

/**
 * 지속 효과를 한 번 진행시킨다.
 *
 * 봉인된 색을 눌렀으면 피해를 물고, 무슨 선택을 하든 남은 횟수는 1 줄어든다.
 * 0이 되면 사라진다 — 그래서 봉인된 색을 피해 다니면 피해 없이 흘려보낼 수
 * 있고, "5회 동안 한쪽을 못 쓴다"가 제약이 된다.
 */
function tickLasting(state: GameState, side: 'red' | 'blue'): string[] {
  const lines: string[] = [];

  for (const l of state.lasting) {
    if (l.side === undefined || l.side === side) {
      state.hp -= l.damage;
      lines.push(`${l.label} — 체력 -${l.damage} (${Math.max(0, state.hp)}/${state.maxHp})`);
    }
    l.remaining -= 1;
  }

  const expired = state.lasting.filter((l) => l.remaining <= 0);
  for (const l of expired) lines.push(`${l.label} — 풀렸다`);
  state.lasting = state.lasting.filter((l) => l.remaining > 0);

  return lines;
}

/** 사망 처리. 무엇에 죽었는지 남긴다. */
function die(state: GameState): void {
  state.hp = 0;
  state.dead = true;
  state.current = null;
  state.push = null;

  // 마지막 몇 줄에서 사인을 읽는다. 저주마다 노리는 것이 달라서, 무엇에
  // 죽었는지가 곧 "이번 판은 어느 저주가 위험했는가"의 답이 된다.
  const last = state.log.slice(-8).reverse();
  const cause = last.find((l) => l.includes('즉사'))
    ? '파멸이 쌓였다'
    : last.find((l) => l.includes('침식이 놓였다'))
      ? '침식에 체력이 깎였다'
      : '체력이 바닥났다';
  state.causeOfDeath = cause;
  state.log.push(
    `사망 — ${cause}. 필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음, ` +
      `필드 파편 ${countShards(state.field)}/${state.escapeTarget}.`,
  );
}

/**
 * 푸시 유어 럭에서 한 장 더 뽑는다.
 *
 * 저주가 겹치면 그 자리에서 발동하고 뽑기가 강제로 끝난다. 손패에 저주 1장을
 * 들고 한 장 더 가는 순간이 이 시스템의 핵심이라, 그 시도와 결과를 따로 센다.
 */
export function pushDraw(state: GameState, rng: Rng): void {
  const push = state.push;
  if (!push || push.stopped) return;

  const edged = onEdge(state.field).length > 0;
  if (edged) state.riskyDraws.taken += 1;

  const card = drawOne(state, rng);
  if (!card) {
    push.stopped = true;
    push.log.push('덱이 비었다');
    return;
  }

  push.drawn += 1;
  push.log.push(`${push.drawn}장째 — ${card.name}`);

  const triggered = onPlaced(state, card, rng);
  if (triggered) {
    if (edged) state.riskyDraws.paired += 1;
    push.log.push(...triggered.lines);
    push.stopped = true;
    push.log.push('저주가 발동했다 — 뽑기가 여기서 끝난다');
  }
}

/** 푸시 유어 럭을 접고 선택 루프로 돌아간다. */
export function pushStop(state: GameState, rng: Rng): void {
  const push = state.push;
  if (!push) return;

  state.log.push(`   ${push.drawn}장 뽑고 ${push.stopped ? '중단됨' : '멈췄다'}`);
  for (const line of push.log) state.log.push(`   ${line}`);
  state.push = null;

  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);
  advance(state, rng);
}

/** 덱이 바닥난 시점을 한 번만 기록한다. 이후 처리는 아직 설계 전이다. */
function noteDeckEmpty(state: GameState): void {
  if (state.deck.length === 0 && state.deckEmptiedAt === null) {
    state.deckEmptiedAt = state.step;
    state.log.push(`   덱이 바닥났다 (${state.step}수째) — 더 뽑을 수 없다`);
  }
}

/**
 * 다음 선택지를 세운다. 탈출·사망 판정도 여기서 한다.
 * 죽음이 탈출보다 먼저다 — 마지막 파편을 쥐고 죽으면 죽은 것이다.
 */
function advance(state: GameState, rng: Rng): void {
  if (state.hp <= 0) {
    die(state);
    return;
  }

  // 탈출은 **필드에 나온** 파편으로만 센다. 덱에 아무리 많아도 뽑지 못하면
  // 진척이 아니다 — 덱 관리가 곧 탈출이다.
  if (countShards(state.field) >= state.escapeTarget) {
    state.escaped = true;
    state.current = null;
    state.log.push(
      `탈출 성공 — 필드 파편 ${countShards(state.field)}/${state.escapeTarget}. ` +
        `필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음.`,
    );
    return;
  }

  state.step += 1;
  state.current = drawPair(state, rng);
  remember(state, state.current);
}

/** 종류별 장수를 세어 정렬된 목록으로. UI에서 덱 확인용. */
export function deckByKind(state: GameState): { kind: CardKind; cards: { name: string; value: number; count: number }[] }[] {
  const kinds: CardKind[] = ['reward', 'neutral', 'curse', 'shard'];

  const owned = ownedCards(state);
  return kinds.map((kind) => {
    const grouped = new Map<string, { name: string; value: number; count: number }>();
    for (const card of owned) {
      if (card.kind !== kind) continue;
      const entry = grouped.get(card.defId);
      if (entry) entry.count += 1;
      else grouped.set(card.defId, { name: card.name, value: card.value, count: 1 });
    }
    return {
      kind,
      cards: [...grouped.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    };
  });
}
