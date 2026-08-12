import type { Rng } from '../engine/rng';
import {
  ESCAPE_TARGET,
  MAX_HP,
  RECENT_WINDOW,
  SHARD_EVENT_RATE,
  STARTING_DECK,
  TAINT_LEVELS,
} from './balance';
import { collectHand, isOver, startBattle } from './battle';
import { applyEffects, buildDeck, countKind } from './effects';
import { EVENTS } from './events';
import type { BattleRecord, CardInstance, CardKind, ChoiceEvent, GameState } from './types';

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
export function ownedCards(state: GameState): CardInstance[] {
  return state.battle ? [...state.deck, ...state.battle.hand] : state.deck;
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
    battle: null,
    pendingBattle: null,
    current: null,
    recent: [],
    log: [],
    records: [],
    battles: [],
  };

  state.current = drawEvent(state, rng);
  remember(state, state.current.id);
  state.log.push(
    `시작. 덱 ${state.deck.length}장, 체력 ${MAX_HP}. 탈출구 파편 0/${ESCAPE_TARGET}.`,
  );

  return state;
}

/** 한쪽을 고르고 덱에 즉시 반영한 뒤 다음 선택지를 제시한다. */
export function choose(state: GameState, side: 'red' | 'blue', rng: Rng): void {
  if (state.escaped || state.dead || state.battle || !state.current) return;

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
    hpAfter: Math.max(0, state.hp),
  });

  state.log.push(`${state.step}. [${side === 'red' ? '빨강' : '파랑'}] ${option.text}`);
  for (const c of changes) state.log.push(`   ${c}`);

  // 전투가 예약됐으면 여기서 연다. 다음 선택지는 전투가 끝난 뒤에 뽑는다.
  const pending = state.pendingBattle;
  state.pendingBattle = null;
  if (pending && state.hp > 0) {
    const hpBefore = state.hp;
    startBattle(state, pending.enemyId, pending.onWin, rng);
    // 낼 카드가 하나도 없어 시작하자마자 끝난 경우도 여기서 정리된다.
    // finishBattle이 다음 선택지까지 세우므로 어느 쪽이든 여기서 끝난다.
    if (state.battle && isOver(state.battle)) finishBattle(state, rng, hpBefore);
    return;
  }

  advance(state, rng);
}

/** 전투가 끝난 뒤 정리하고 다음 선택지로 넘어간다. */
export function finishBattle(state: GameState, rng: Rng, hpBefore: number): void {
  const battle = state.battle;
  if (!battle || !isOver(battle)) return;

  collectHand(state);

  const record: BattleRecord = {
    step: state.step,
    enemyId: battle.enemy.id,
    outcome: battle.outcome,
    cursesDrawn: battle.cursesDrawn,
    handSize: battle.handSize,
    taintAtStart: battle.taintAtStart,
    spent: battle.spent,
    turns: battle.turn,
    hpLost: Math.max(0, hpBefore - state.hp),
  };
  state.battles.push(record);

  const label =
    battle.outcome === 'won' ? '승리' : battle.outcome === 'fled' ? '도망' : '패배';
  state.log.push(
    `   전투 ${label} — ${battle.enemy.name}, ${battle.turn}턴, 카드 ${battle.spent}장 소모, ` +
      `체력 -${record.hpLost} (시작 손패 저주 ${battle.cursesDrawn}/${battle.handSize}, ` +
      `덱 저주 ${Math.round(battle.taintAtStart * 100)}%)`,
  );

  if (battle.outcome === 'won') {
    const rewards = applyEffects(state, battle.onWin, rng);
    for (const r of rewards) state.log.push(`   ${r}`);
  }

  state.battle = null;

  if (state.hp <= 0) {
    state.hp = 0;
    state.dead = true;
    state.current = null;
    state.log.push(`사망 — 파편 ${state.shards}/${state.escapeTarget}에서 멈췄다.`);
    return;
  }

  advance(state, rng);
}

/**
 * 다음 선택지를 세운다. 탈출·사망 판정도 여기서 한다.
 * 죽음이 탈출보다 먼저다 — 마지막 파편을 쥐고 죽으면 죽은 것이다.
 */
function advance(state: GameState, rng: Rng): void {
  if (state.hp <= 0) {
    state.hp = 0;
    state.dead = true;
    state.current = null;
    state.log.push(`사망 — 파편 ${state.shards}/${state.escapeTarget}에서 멈췄다.`);
    return;
  }

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
