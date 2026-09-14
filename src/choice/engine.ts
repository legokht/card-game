import type { Rng } from '../engine/rng';
import {
  DECK_THICK_AT,
  DECK_THIN_AT,
  ESCAPE_TARGET,
  FIELD_START,
  MAX_HP,
  PAIR_DRAW_WEIGHT_THICK,
  PAIR_DRAW_WEIGHT_THIN,
  PAIR_FLOW_WEIGHT_MID,
  PAIR_INSERT_WEIGHT_THICK,
  PAIR_INSERT_WEIGHT_THIN,
  PAIR_RARITY_WEIGHT,
  RECENT_PAIRS,
  STARTING_DECK,
  TAINT_LEVELS,
  elementDef,
} from './balance';
import { applyEffects, buildDeck, countKind } from './effects';
import {
  countShards,
  curseCounts,
  applyPeekKeep,
  drawOne,
  elementCounts,
  fireSingle,
  onEdge,
  onPlaced,
} from './field';
import { PAIR_TABLE } from './pairs';
import type {
  CardInstance,
  CardKind,
  ChoicePair,
  CurseType,
  Effect,
  ElementType,
  GameState,
  PushState,
} from './types';

/**
 * 선택 루프. 버튼을 누르면 덱과 필드가 바뀐다.
 *
 * 끝나는 길은 둘, 탈출(파편을 목표만큼 모음)과 사망(체력 0)이다.
 */

export interface DeckSummary {
  total: number;
  element: number;
  curse: number;
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

/** 필드에 깔린 속성을 종류별로. 그대로 시너지 진행도다. */
export function fieldElementBreakdown(state: GameState): Record<ElementType, number> {
  return elementCounts(state.field);
}

/** 덱에 남아 있는 속성을 종류별로. 앞으로 무엇을 뽑을 수 있는지 보는 값이다. */
export function deckElementBreakdown(state: GameState): Record<ElementType, number> {
  return elementCounts(state.deck);
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
    element: countKind(owned, 'element'),
    curse,
    shard: countKind(owned, 'shard'),
    taint,
    taintLabel: level.label,
    taintTone: level.tone,
  };
}

function effectsDrawFromDeck(effects: Effect[]): boolean {
  for (const e of effects) {
    if (e.type === 'drawField' || e.type === 'peek' || e.type === 'pushLuck') return true;
    if (e.type === 'ifField' || e.type === 'ifThen' || e.type === 'coinFlip') {
      if (effectsDrawFromDeck(e.then) || effectsDrawFromDeck(e.otherwise)) return true;
    }
    if (e.type === 'lasting' && e.onExpire && effectsDrawFromDeck(e.onExpire)) return true;
  }
  return false;
}

function effectsAddToDeck(effects: Effect[]): boolean {
  for (const e of effects) {
    if (
      e.type === 'addSpecific' ||
      e.type === 'addRandom' ||
      e.type === 'addAny' ||
      e.type === 'shard' ||
      e.type === 'chooseElement'
    ) {
      return true;
    }
    if (e.type === 'ifField' || e.type === 'ifThen' || e.type === 'coinFlip') {
      if (effectsAddToDeck(e.then) || effectsAddToDeck(e.otherwise)) return true;
    }
    if (e.type === 'lasting' && e.onExpire && effectsAddToDeck(e.onExpire)) return true;
  }
  return false;
}

function pairDraws(pair: ChoicePair): boolean {
  return effectsDrawFromDeck(pair.red.effects) || effectsDrawFromDeck(pair.blue.effects);
}

function pairInserts(pair: ChoicePair): boolean {
  return effectsAddToDeck(pair.red.effects) || effectsAddToDeck(pair.blue.effects);
}

function flowMultiplier(pair: ChoicePair, deckSize: number): number {
  const draw = pairDraws(pair);
  const insert = pairInserts(pair);
  if (draw === insert) return PAIR_FLOW_WEIGHT_MID;
  const thin = deckSize <= DECK_THIN_AT;
  const thick = deckSize >= DECK_THICK_AT;
  if (insert) {
    if (thin) return PAIR_INSERT_WEIGHT_THIN;
    if (thick) return PAIR_INSERT_WEIGHT_THICK;
    return PAIR_FLOW_WEIGHT_MID;
  }
  if (thin) return PAIR_DRAW_WEIGHT_THIN;
  if (thick) return PAIR_DRAW_WEIGHT_THICK;
  return PAIR_FLOW_WEIGHT_MID;
}

function pairPickWeight(pair: ChoicePair, deckSize: number): number {
  return PAIR_RARITY_WEIGHT[pair.rarity] * flowMultiplier(pair, deckSize);
}

/**
 * 다음 짝을 뽑는다.
 *
 * 짝은 고정된 테이블에서 통째로 나온다 — 조합하지 않는다. 희소도와
 * 지금 덱 장수가 "어떤 짝을 얼마나 자주 만나는가"를 정한다.
 *
 * 덱이 비면 꺼내는 짝은 후보에서 뺀다. 최근 몇 개만 걸러
 * "방금 그거 또?"를 막되, 그 이상 거르면 순번 돌리기가 된다.
 */
export function drawPair(state: GameState, rng: Rng): ChoicePair {
  const canShow = (p: ChoicePair) => state.deck.length > 0 || !pairDraws(p);
  const fresh = PAIR_TABLE.filter((p) => !state.recent.includes(p.id) && canShow(p));
  const rest = PAIR_TABLE.filter(canShow);
  const pool = fresh.length > 0 ? fresh : rest.length > 0 ? rest : PAIR_TABLE;

  let total = 0;
  const weights = pool.map((p) => {
    const w = pairPickWeight(p, state.deck.length);
    total += w;
    return w;
  });
  let roll = rng.next() * (total || 1);
  let picked = pool[pool.length - 1]!;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      picked = pool[i]!;
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
    pick: null,
    fate: null,
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
  if (state.escaped || state.dead || state.push || state.pick || state.fate || !state.current) return;

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
  // 횟수가 다한 효과의 지연 대가는 이번 선택 효과가 끝난 뒤에 온다.
  changes.push(...expireLasting(state, rng));

  // 푸시 유어 럭은 모드만 열리고, 첫 장은 여기서 뽑는다 — 저주면 즉시 멈춘다.
  const opened = state.push as PushState | null;
  if (opened && opened.drawn === 0 && !opened.stopped) {
    pushDraw(state, rng);
  }

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

  // 푸시 유어 럭이나 속성 지정이 열렸으면 플레이어가 끝낼 때까지 기다린다.
  if (state.push || state.pick || state.fate) return;

  advance(state, rng);
}

/**
 * 속성 지정에서 한 장을 고른다. 다 고르면 모드가 닫히고 선택 루프가 이어진다.
 *
 * 덱에 넣는다 — 필드로 바로 가지 않는다. 고른 속성이 언제 나올지는 여전히
 * 덱 사정이라, 지정은 조합을 확정하는 것이 아니라 확률을 기울이는 것이다.
 */
export function pickElement(state: GameState, element: ElementType, rng: Rng): void {
  const pick = state.pick;
  if (!pick || pick.remaining <= 0) return;

  const def = elementDef(element);
  state.deck.push(...buildDeck([def.id]));
  pick.remaining -= 1;
  pick.log.push(`${def.name} 1장을 덱에 넣었다`);

  if (pick.remaining > 0) return;

  state.log.push(`   속성 ${pick.count}장 지정 — ${pick.log.join(', ')}`);
  state.pick = null;
  advance(state, rng);
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
    if ((l.side === undefined || l.side === side) && l.damage > 0) {
      state.hp -= l.damage;
      lines.push(`${l.label} — 체력 -${l.damage} (${Math.max(0, state.hp)}/${state.maxHp})`);
    }
    l.remaining -= 1;
  }

  return lines;
}

/** 횟수가 다한 지속 효과를 거두고, 지연된 대가를 적용한다. */
function expireLasting(state: GameState, rng: Rng): string[] {
  const expired = state.lasting.filter((l) => l.remaining <= 0);
  state.lasting = state.lasting.filter((l) => l.remaining > 0);
  const lines: string[] = [];
  for (const l of expired) {
    lines.push(`${l.label} — 풀렸다`);
    if (l.onExpire) lines.push(...applyEffects(state, l.onExpire, rng));
  }
  return lines;
}

/** 사망 처리. 무엇에 죽었는지 남긴다. */
function die(state: GameState): void {
  state.hp = 0;
  state.dead = true;
  state.current = null;
  state.push = null;
  state.fate = null;

  // 마지막 몇 줄에서 사인을 읽는다. 저주마다 노리는 것이 달라서, 무엇에
  // 죽었는지가 곧 "이번 판은 어느 저주가 위험했는가"의 답이 된다.
  const last = state.log.slice(-8).reverse();
  const cause = last.find((l) => l.includes('즉사'))
    ? '파멸이 쌓였다'
    : last.find((l) => l.includes('침식이 놓였다'))
      ? '침식에 체력이 깎였다'
      : last.find((l) => l.includes('필드의') && l.includes('소각'))
        ? '어둠 시너지가 체력을 가져갔다'
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

  // 뽑기를 끊는 것은 저주뿐이다. 시너지는 조건이 차도 저절로 터지지 않으므로
  // 뽑던 흐름을 건드리지 않는다 — 오히려 "한 장 더"가 시너지를 완성시킨다.
  const triggered = onPlaced(state, card, rng);
  if (card.kind === 'curse') {
    if (edged) state.riskyDraws.paired += 1;
    if (triggered) push.log.push(...triggered.lines);
    push.stopped = true;
    push.log.push('저주가 나왔다 — 뽑기가 여기서 끝난다');
    return;
  }
  if (triggered) {
    if (edged) state.riskyDraws.paired += 1;
    push.log.push(...triggered.lines);
    push.stopped = true;
    push.log.push('저주가 발동했다 — 뽑기가 여기서 끝난다');
  }
}

/**
 * 확인한 카드 중 고른 장을 필드로 옮기고 선택 루프를 이어간다.
 *
 * 어떤 장을 가져올지만 바뀐다. 필드로 옮긴 뒤의 판정은 엿보기와 같다.
 */
export function resolveFate(state: GameState, takenUids: string[], rng: Rng): void {
  const fate = state.fate;
  if (!fate) return;

  const taken: CardInstance[] = [];
  for (const uid of takenUids) {
    if (taken.length >= fate.keep) break;
    const card = fate.cards.find((c) => c.uid === uid);
    if (card && !taken.some((t) => t.uid === card.uid)) taken.push(card);
  }

  const lines = applyPeekKeep(state, fate.cards, taken, rng);
  state.fate = null;

  const rec = state.records[state.records.length - 1];
  if (rec) rec.changes.push(...lines);
  for (const line of lines) state.log.push(`   ${line}`);

  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);
  advance(state, rng);
}

/** 추적을 포기하고 확인한 장 중에서 무작위로 가져온다. 게임 난수는 쓰지 않는다. */
export function abandonFate(state: GameState, rng: Rng): void {
  const fate = state.fate;
  if (!fate) return;
  const pool = fate.cards.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = a;
  }
  resolveFate(
    state,
    pool.slice(0, fate.keep).map((c) => c.uid),
    rng,
  );
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
  if (settle(state)) return;

  state.step += 1;
  state.current = drawPair(state, rng);
  remember(state, state.current);
}

/**
 * 판이 끝났는지만 본다. 다음 선택지는 세우지 않는다.
 *
 * 시너지 사용은 선택 한 번을 쓰지 않지만 판을 끝낼 수는 있다 — 어둠은 체력을
 * 가져간다. 그래서 판정만 따로 떼어 둔다.
 */
function settle(state: GameState): boolean {
  if (state.hp <= 0) {
    die(state);
    return true;
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
    return true;
  }

  return false;
}

/**
 * 시너지를 쓴다. **선택 한 번을 소모하지 않는다.**
 *
 * 조건이 찬 채로 기다렸다가 원할 때 쓰는 것이 이 시스템의 전부라, 쓰는 데
 * 턴이 들면 "언제 쓸까"가 다시 "쓸 수 있을 때 쓴다"로 돌아간다.
 */
export function useSynergy(state: GameState, target: ElementType, rng: Rng): void {
  if (state.escaped || state.dead || state.push || state.pick || state.fate) return;

  const lines = fireSingle(state, target, rng);
  if (!lines) return;

  state.log.push(`${state.step}. [시너지]`);
  for (const l of lines) state.log.push(`   ${l}`);

  // 기록에 남겨야 직전 결과 줄에 뜬다 — 무엇이 사라지고 무엇을 얻었는지가
  // 화면에서 바로 읽혀야 한다.
  state.records.push({
    step: state.step,
    pairId: `synergy:${target}`,
    side: 'red',
    text: '시너지 사용',
    changes: lines,
    deckSize: state.deck.length,
    fieldSize: state.field.length,
    curseCount: summarize(state).curse,
    hp: Math.max(0, state.hp),
  });

  settle(state);
}

/** 종류별 장수를 세어 정렬된 목록으로. UI에서 덱 확인용. */
export function deckByKind(state: GameState): { kind: CardKind; cards: { name: string; value: number; count: number }[] }[] {
  const kinds: CardKind[] = ['element', 'curse', 'shard'];

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
