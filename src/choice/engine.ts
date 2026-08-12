import type { Rng } from '../engine/rng';
import { ESCAPE_TARGET, RECENT_WINDOW, SHARD_EVENT_RATE, STARTING_DECK, TAINT_LEVELS } from './balance';
import { applyEffects, buildDeck, countKind } from './effects';
import { EVENTS } from './events';
import type { CardKind, ChoiceEvent, GameState } from './types';

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

export function summarize(state: GameState): DeckSummary {
  const total = state.deck.length;
  const curse = countKind(state.deck, 'curse');
  const taint = total === 0 ? 0 : curse / total;
  const level = TAINT_LEVELS.find((l) => taint < l.max) ?? TAINT_LEVELS[TAINT_LEVELS.length - 1]!;

  return {
    total,
    reward: countKind(state.deck, 'reward'),
    curse,
    neutral: countKind(state.deck, 'neutral'),
    shard: countKind(state.deck, 'shard'),
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
    current: null,
    recent: [],
    log: [],
    records: [],
  };

  state.current = drawEvent(state, rng);
  remember(state, state.current.id);
  state.log.push(`시작. 덱 ${state.deck.length}장. 탈출구 파편 0/${ESCAPE_TARGET}.`);

  return state;
}

/** 한쪽을 고르고 덱에 즉시 반영한 뒤 다음 선택지를 제시한다. */
export function choose(state: GameState, side: 'red' | 'blue', rng: Rng): void {
  if (state.escaped || !state.current) return;

  const event = state.current;
  const option = event[side];
  const changes = applyEffects(state, option.effects, rng);

  const summary = summarize(state);
  state.records.push({
    step: state.step,
    eventId: event.id,
    side,
    text: option.text,
    changes,
    deckSizeAfter: summary.total,
    curseCountAfter: summary.curse,
  });

  state.log.push(`${state.step}. [${side === 'red' ? '빨강' : '파랑'}] ${option.text}`);
  for (const c of changes) state.log.push(`   ${c}`);

  if (state.shards >= state.escapeTarget) {
    state.escaped = true;
    state.current = null;
    state.log.push(`탈출 성공 — 파편 ${state.shards}/${state.escapeTarget}을 모두 모았다.`);
    return;
  }

  state.step += 1;
  state.current = drawEvent(state, rng);
  remember(state, state.current.id);
}

/** 종류별 장수를 세어 정렬된 목록으로. UI에서 덱 확인용. */
export function deckByKind(state: GameState): { kind: CardKind; cards: { name: string; value: number; count: number }[] }[] {
  const kinds: CardKind[] = ['reward', 'neutral', 'curse', 'shard'];

  return kinds.map((kind) => {
    const grouped = new Map<string, { name: string; value: number; count: number }>();
    for (const card of state.deck) {
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
