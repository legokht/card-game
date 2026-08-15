import type { Rng } from '../engine/rng';
import {
  ESCAPE_TARGET,
  FIELD_START,
  MAX_HP,
  RECENT_WINDOW,
  SHARD_EVENT_RATE,
  STARTING_DECK,
  TAINT_LEVELS,
} from './balance';
import { applyEffects, buildDeck, countKind } from './effects';
import { applyRotDrain, curseCounts, drawOne, onEdge, resolvePairs } from './field';
import { EVENTS } from './events';
import type {
  CardInstance,
  CardKind,
  ChoiceEvent,
  CurseType,
  GameState,
} from './types';

/**
 * 선택 루프. 전투도 승패도 없고, 버튼을 누르면 덱이 바뀌는 것만 있다.
 *
 * 종료 조건은 탈출(파편 5개) 하나뿐이고, 그 전까지는 무한히 돈다.
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

/**
 * 전투 중에는 손패가 덱에서 빠져나와 있다. 안 낸 카드는 그대로 돌아오므로,
 * 덱 요약은 손패까지 합쳐서 센다 — 안 그러면 전투 중에 덱이 0장으로 보이고
 * 저주 비율도 사라진다.
 */
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

const SHARD_EVENTS = EVENTS.filter((e) => e.hasShard);
const PLAIN_EVENTS = EVENTS.filter((e) => !e.hasShard);

/**
 * 다음 선택지를 뽑는다.
 *
 * 파편형은 확률로만 등장한다. 매번 파편을 당길 수 있으면 다섯 번 눌러 끝나서
 * "누적되면 덱이 달라진다"를 검증할 수 없기 때문이다.
 */
export function drawEvent(state: GameState, rng: Rng): ChoiceEvent {
  const wantShard = rng.next() < SHARD_EVENT_RATE;
  const primary = wantShard ? SHARD_EVENTS : PLAIN_EVENTS;

  // 최근에 나온 것은 피하되, 다 걸러지면 그냥 원래 풀에서 뽑는다.
  const fresh = primary.filter((e) => !state.recent.includes(e.id));
  const pool = fresh.length > 0 ? fresh : primary;

  return rng.pick(pool);
}

function remember(state: GameState, id: string): void {
  state.recent.push(id);
  while (state.recent.length > RECENT_WINDOW) state.recent.shift();
}

export function createGame(rng: Rng): GameState {
  const state: GameState = {
    step: 1,
    deck: buildDeck(STARTING_DECK),
    shards: 0,
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
    triggers: { doom: 0, rot: 0, erode: 0 },
    causeOfDeath: null,
    fieldSizes: [],
    riskyDraws: { taken: 0, paired: 0 },
    deckEmptiedAt: null,
  };

  // 필드는 비어서 시작한다. 오직 선택지를 통해서만 채워진다.
  void FIELD_START;

  state.current = drawEvent(state, rng);
  remember(state, state.current.id);
  state.log.push(
    `시작. 덱 ${state.deck.length}장, 필드 ${state.field.length}장, 체력 ${MAX_HP}. ` +
      `탈출구 파편 0/${ESCAPE_TARGET}.`,
  );

  return state;
}

/** 한쪽을 고르고 덱에 즉시 반영한 뒤 다음 선택지를 제시한다. */
export function choose(state: GameState, side: 'red' | 'blue', rng: Rng): void {
  if (state.escaped || state.dead || state.push || !state.current) return;

  const event = state.current;
  const option = event[side];
  const changes = applyEffects(state, option.effects, rng);

  // 겹침은 뽑을 때 처리되지만, 필드에 저주를 놓는 경로가 뽑기만은 아니다
  // (침식의 변환, 앞으로 추가될 효과들). 매 선택 끝에 한 번 더 확인해
  // "같은 저주 2장이 필드에 남아 있는" 상태가 생기지 않게 못박는다.
  for (const t of resolvePairs(state, rng)) changes.push(...t.lines);

  // 필드의 부패는 겹치지 않아도 매 선택마다 갉아먹는다.
  changes.push(...applyRotDrain(state));
  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);

  const summary = summarize(state);
  state.records.push({
    step: state.step,
    eventId: event.id,
    side,
    text: option.text,
    changes,
    deckSizeAfter: summary.total,
    curseCountAfter: summary.curse,
    hpAfter: Math.max(0, state.hp),
  });

  state.log.push(`${state.step}. [${side === 'red' ? '빨강' : '파랑'}] ${option.text}`);
  for (const c of changes) state.log.push(`   ${c}`);

  // 푸시 유어 럭이 열렸으면 플레이어가 멈출 때까지 기다린다.
  if (state.push) return;

  advance(state, rng);
}

/** 사망 처리. 무엇에 죽었는지 남긴다. */
function die(state: GameState): void {
  state.hp = 0;
  state.dead = true;
  state.current = null;
  state.push = null;

  // 마지막에 발동한 저주가 사인이다. 파멸이면 즉사, 아니면 누적 피해.
  const last = state.log.slice(-6).reverse();
  const cause = last.find((l) => l.includes('파멸이 완성'))
    ? '파멸 2장이 겹쳤다'
    : last.find((l) => l.includes('부패가 터졌다'))
      ? '부패가 터졌다'
      : last.find((l) => l.includes('갉아먹는다'))
        ? '필드의 부패에 갉아먹혔다'
        : '체력이 바닥났다';
  state.causeOfDeath = cause;
  state.log.push(
    `사망 — ${cause}. 필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음, ` +
      `파편 ${state.shards}/${state.escapeTarget}.`,
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

  const triggered = resolvePairs(state, rng);
  if (triggered.length > 0) {
    if (edged) state.riskyDraws.paired += 1;
    for (const t of triggered) push.log.push(...t.lines);
    push.stopped = true;
    push.log.push('겹쳤다 — 뽑기가 여기서 끝난다');
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

  if (state.shards >= state.escapeTarget) {
    state.escaped = true;
    state.current = null;
    state.log.push(
      `탈출 성공 — 파편 ${state.shards}/${state.escapeTarget}. ` +
        `필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음.`,
    );
    return;
  }

  state.step += 1;
  state.current = drawEvent(state, rng);
  remember(state, state.current.id);
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
