import type { Rng } from '../engine/rng';
import {
  CURSE_BURN_ORDER,
  CURSE_RULES,
  DARK_HP_COST,
  DOOM_THRESHOLD,
  ELEMENT_ORDER,
  ELEMENT_RULES,
  ELEMENT_SYNERGY_COUNT,
  ERODE_DAMAGE,
  LIGHT_HP_GAIN,
  MIN_MAX_HP,
  ROT_MAX_HP_LOSS,
  ROT_THRESHOLD,
  WATER_MAX_HP_GAIN,
  cardById,
  curseWeights,
  poolOf,
} from './balance';
import type { CardInstance, CurseType, ElementType, GameState } from './types';

/**
 * 필드.
 *
 * 뽑은 카드는 쓰는 것이 아니라 필드에 펼쳐진 채로 남는다 — 잉카의 황금에서
 * 뒤집힌 카드가 계속 앞에 쌓이는 것과 같다. 소모라는 개념이 없다.
 *
 * 카드는 **덱 → 필드 한 방향으로만** 흐른다. 되돌아가는 길은 없다.
 *
 * 필드에서 벗어나는 길은 셋이다 — 제거 선택지, 발동한 부패, 그리고 **터진
 * 시너지**. 한때는 제거 선택지뿐이라 필드가 스스로 줄지 않고 무한정 쌓였다.
 * 지금은 모으는 것 자체가 소모처다.
 *
 * **저주도 속성도 전부 "필드에 놓이는 순간" 판정한다.** 매 선택마다 훑는
 * 지속 효과는 없다. 그래서 같은 것이 반복 발동하지 않고, 발동 시점이 항상
 * 플레이어가 뽑기를 누른 순간과 일치한다.
 *
 * 좋은 것과 나쁜 것이 **같은 문법**을 쓴다 — 필드에 같은 것이 모이면 터진다.
 * 그래서 플레이어가 배울 규칙이 하나뿐이다.
 */

let fieldUid = 0;

export function resetFieldUid(): void {
  fieldUid = 0;
}

function instantiate(defId: string): CardInstance {
  const def = cardById(defId);
  fieldUid += 1;
  return {
    uid: `f${fieldUid}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
    ...(def.curseType ? { curseType: def.curseType } : {}),
    ...(def.element ? { element: def.element } : {}),
  };
}

/**
 * 파편 장수. 종류가 하나뿐이라 kind만 세면 된다.
 *
 * **필드에 나온 파편만 탈출 진척이다.** 덱에 넣는 것은 시작일 뿐이고,
 * 실제로 꺼내는 것이 과제다 — 덱이 두꺼우면 좀처럼 뽑히지 않는다.
 */
export function countShards(cards: CardInstance[]): number {
  return cards.filter((c) => c.kind === 'shard').length;
}

/** 유예가 걸려 있으면 새로 들어오는 저주를 받지 않는다. */
export function cursesBlocked(state: GameState): boolean {
  return state.lasting.some((l) => l.blockCurses);
}

/** 속성별 장수. 필드에 쓰면 시너지 진행도가 된다. */
export function elementCounts(cards: CardInstance[]): Record<ElementType, number> {
  const counts: Record<ElementType, number> = { fire: 0, water: 0, dark: 0, light: 0 };
  for (const c of cards) if (c.element) counts[c.element] += 1;
  return counts;
}

/** 덱 안의 저주 종류별 장수. 파멸 상한을 지키는 데 쓴다. */
export function curseCounts(cards: CardInstance[]): Record<CurseType, number> {
  const counts: Record<CurseType, number> = { doom: 0, rot: 0, erode: 0 };
  for (const c of cards) if (c.curseType) counts[c.curseType] += 1;
  return counts;
}

/** 덱 상한을 지키면서 저주 한 장을 만든다. */
export function makeCurse(state: GameState, rng: Rng): CardInstance {
  const counts = curseCounts([...state.deck, ...state.field]);
  const type = rng.pick(curseWeights(counts));
  return instantiate(type);
}

/**
 * 한 장만 더 놓이면 발동하는 저주 종류. UI가 강하게 경고하는 대상이다.
 *
 * - 파멸: 문턱(3) 바로 아래, 즉 2장일 때. 이 구간이 최대 긴장이다.
 * - 부패: 문턱(2) 바로 아래부터. 1장이어도 하나 더 오면 터진다.
 * - 침식: 문턱이 없어 여기 들어오지 않는다 — 놓이면 무조건 발동한다.
 */
export function onEdge(field: CardInstance[]): CurseType[] {
  const counts = curseCounts(field);
  return (Object.keys(counts) as CurseType[]).filter((t) => {
    const threshold = CURSE_RULES[t].threshold;
    return threshold !== null && counts[t] >= threshold - 1;
  });
}

/** 한 장만 더 모으면 쓸 수 있게 되는 속성. 아직 발동은 아니다. */
export function elementsOnEdge(field: CardInstance[]): ElementType[] {
  const counts = elementCounts(field);
  const n = ELEMENT_SYNERGY_COUNT;
  return ELEMENT_ORDER.filter((t) => counts[t] === n - 1);
}

/** 속성 시너지를 **지금 쓸 수 있는지.** 네 속성 모두 같은 문턱이다. */
export function canFireSingle(field: CardInstance[], element: ElementType): boolean {
  return elementCounts(field)[element] >= ELEMENT_SYNERGY_COUNT;
}

export interface TriggerResult {
  type: CurseType;
  lines: string[];
  /** 즉사했는지. */
  fatal: boolean;
}

/** 필드 최고 도달 장수를 갱신한다. 종류별 존재감을 재는 값이다. */
function notePeak(state: GameState): void {
  const counts = curseCounts(state.field);
  for (const t of Object.keys(counts) as CurseType[]) {
    if (counts[t] > state.peakField[t]) state.peakField[t] = counts[t];
  }
}

/** 필드에서 해당 속성을 뒤에서부터 count장 걷어낸다. */
function removeElementFromField(state: GameState, element: ElementType, count: number): void {
  let left = count;
  for (let i = state.field.length - 1; i >= 0 && left > 0; i--) {
    if (state.field[i]!.element === element) {
      state.field.splice(i, 1);
      left -= 1;
    }
  }
}

/** 덱이나 필드에서 저주 한 장을 태운다. 위험한 종류부터 집는다. */
function burnCurse(pile: CardInstance[]): CardInstance | null {
  for (const type of CURSE_BURN_ORDER) {
    const i = pile.findIndex((c) => c.curseType === type);
    if (i >= 0) return pile.splice(i, 1)[0]!;
  }
  return null;
}

/**
 * 속성 시너지를 **플레이어가 쓴다.** 문턱을 넘겨 계속 쌓아 두는 것도 선택이다.
 *
 * 문턱을 넘겨도 **정확히 문턱만큼만** 소모한다. 7장을 들고 있다가 쓰면 5장이
 * 나가고 2장이 남는다 — 그래서 "지금 쓸까, 한 번 더 쓸 만큼 모을까"가 선다.
 * 나가는 것은 가장 나중에 놓인 쪽이다.
 *
 * 언제 쓰는지가 곧 판단이다. 물은 부패에 최대 체력을 깎인 뒤에 써야 이득이
 * 크고, 어둠은 체력이 버틸 때만 쓸 수 있다.
 */
export function fireSingle(state: GameState, element: ElementType, rng: Rng): string[] | null {
  if (!canFireSingle(state.field, element)) return null;

  const rule = ELEMENT_RULES[element];
  removeElementFromField(state, element, ELEMENT_SYNERGY_COUNT);
  const lines = [`${rule.name} 시너지 — ${ELEMENT_SYNERGY_COUNT}장을 썼다`];

  switch (element) {
    case 'fire': {
      const burned = burnCurse(state.deck);
      lines.push(burned ? `덱의 ${burned.name} 1장을 소각했다` : '덱에 태울 저주가 없었다');
      break;
    }

    case 'water': {
      state.maxHp += WATER_MAX_HP_GAIN;
      lines.push(`최대 체력 +${WATER_MAX_HP_GAIN} (${state.hp}/${state.maxHp})`);
      break;
    }

    case 'dark': {
      state.hp -= DARK_HP_COST;
      const burned = burnCurse(state.field);
      lines.push(`체력 -${DARK_HP_COST} (${Math.max(0, state.hp)}/${state.maxHp})`);
      lines.push(burned ? `필드의 ${burned.name} 1장을 소각했다` : '필드에 태울 저주가 없었다');
      break;
    }

    case 'light': {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + LIGHT_HP_GAIN);
      const gained = state.hp - before;
      lines.push(`체력 +${gained} (${state.hp}/${state.maxHp})`);
      if (cursesBlocked(state)) {
        lines.push('저주를 받지 않았다 (유예 중)');
        break;
      }
      const curse = makeCurse(state, rng);
      state.deck.push(curse);
      lines.push(`덱에 ${curse.name} 1장을 넣었다`);
      break;
    }
  }

  return lines;
}

/**
 * 저주 한 장이 필드에 놓인 직후의 발동 판정.
 *
 * **저주만 저절로 터진다.** 시너지는 조건이 차도 기다렸다가 플레이어가
 * 쓴다 — 저주는 닥치는 것이고 시너지는 쓰는 것이라, 여기서 갈린다.
 *
 * 세 저주는 공격 대상이 다르다 — 파멸은 목숨, 부패는 최대 체력, 침식은 체력.
 */
export function onPlaced(state: GameState, card: CardInstance, rng: Rng): TriggerResult | null {
  void rng; // 지금 세 저주 중 무작위를 쓰는 것은 없다. 시그니처는 유지한다.
  notePeak(state);

  const type = card.curseType;
  if (!type) return null;

  const counts = curseCounts(state.field);
  const rule = CURSE_RULES[type];
  const lines: string[] = [];
  let fatal = false;

  switch (type) {
    case 'doom': {
      if (counts.doom < DOOM_THRESHOLD) return null;
      state.hp = 0;
      fatal = true;
      lines.push(`파멸이 ${counts.doom}장 모였다 — 즉사.`);
      break;
    }

    case 'rot': {
      // 새로 놓인 이 장을 포함해 문턱에 닿아야 발동한다.
      if (counts.rot < ROT_THRESHOLD) return null;

      const before = state.maxHp;
      state.maxHp = Math.max(MIN_MAX_HP, state.maxHp - ROT_MAX_HP_LOSS);
      const lost = before - state.maxHp;
      state.rotMaxHpLost += lost;
      // 현재 체력이 새 최대치를 넘으면 최대치까지 끌어내린다.
      if (state.hp > state.maxHp) state.hp = state.maxHp;

      // 발동한 2장은 소멸한다 — 그래서 필드에 무한정 쌓이지 않고,
      // 부패는 반복해서 다시 쌓인다.
      removeFromField(state, 'rot', ROT_THRESHOLD);

      lines.push(
        lost > 0
          ? `부패 ${ROT_THRESHOLD}장이 모였다 — 최대 체력 ${before} → ${state.maxHp}`
          : `부패 ${ROT_THRESHOLD}장이 모였다 — 최대 체력은 하한(${MIN_MAX_HP})이라 그대로다`,
      );
      lines.push(`부패 ${ROT_THRESHOLD}장이 소멸했다 (${state.hp}/${state.maxHp})`);
      break;
    }

    case 'erode': {
      // 문턱도 중첩도 없다. 놓일 때마다 매번 문다.
      state.hp -= ERODE_DAMAGE;
      state.erodeDamage += ERODE_DAMAGE;
      lines.push(`침식이 놓였다 — 체력 -${ERODE_DAMAGE} (${Math.max(0, state.hp)}/${state.maxHp})`);
      break;
    }
  }

  state.triggers[type] += 1;
  if (state.firstPairAt === null) {
    state.firstPairAt = state.step;
    state.log.push(`   첫 저주 발동 — ${state.step}수째 (${rule.name})`);
  }

  return { type, lines, fatal };
}

/** 필드에서 해당 종류의 저주를 뒤에서부터 count장 걷어낸다. */
function removeFromField(state: GameState, type: CurseType, count: number): void {
  let left = count;
  for (let i = state.field.length - 1; i >= 0 && left > 0; i--) {
    if (state.field[i]!.curseType === type) {
      state.field.splice(i, 1);
      left -= 1;
    }
  }
}

/** 방금 놓인 카드들을 순서대로 판정한다. 부패는 놓인 순서가 결과를 바꾼다. */
export function resolvePlaced(
  state: GameState,
  placed: CardInstance[],
  rng: Rng,
): TriggerResult[] {
  const results: TriggerResult[] = [];
  for (const card of placed) {
    const result = onPlaced(state, card, rng);
    if (!result) continue;
    results.push(result);
    if (result.fatal) break;
  }
  return results;
}

/**
 * 덱에서 필드로 한 장 가져온다. 덱이 비면 null.
 * 발동 판정은 하지 않는다 — 호출하는 쪽이 onPlaced를 부른다.
 */
export function drawOne(state: GameState, rng: Rng): CardInstance | null {
  if (state.deck.length === 0) return null;
  const index = rng.int(0, state.deck.length - 1);
  const [card] = state.deck.splice(index, 1);
  if (!card) return null;
  state.field.push(card);
  return card;
}

/**
 * 여러 장 뽑는다. 한 장 놓을 때마다 바로 판정한다.
 *
 * 한꺼번에 놓고 나중에 훑지 않는 이유는 부패 때문이다 — 발동 장수가 "그
 * 시점의 필드 부패 수"라서, 두 장이 연달아 놓이면 2장·3장으로 두 번 터진다.
 */
export function drawToField(state: GameState, count: number, rng: Rng): string[] {
  const drawn: string[] = [];
  const lines: string[] = [];
  let stopped = false;

  for (let i = 0; i < count && !stopped; i++) {
    const card = drawOne(state, rng);
    if (!card) {
      drawn.push('덱이 비어 더 뽑을 수 없다');
      break;
    }
    drawn.push(card.name);

    const result = onPlaced(state, card, rng);
    if (result) {
      lines.push(...result.lines);
      if (result.fatal) stopped = true;
    }
  }

  return drawn.length ? [`뽑음: ${drawn.join(', ')}`, ...lines] : lines;
}

/** 필드에서 저주를 없앤다. 종류를 지정하면 그 종류만. 덱으로 돌아가지 않는다. */
export function purgeCurse(state: GameState, count: number, type?: CurseType): string[] {
  const targets = state.field.filter((c) => c.kind === 'curse' && (!type || c.curseType === type));
  if (targets.length === 0) {
    return [type ? `필드에 ${CURSE_RULES[type].name}이(가) 없었다` : '필드에 저주가 없었다'];
  }

  const removed = targets.slice(0, count);
  for (const card of removed) {
    const i = state.field.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.splice(i, 1);
  }
  return [`필드에서 없앰: ${removed.map((c) => c.name).join(', ')}`];
}

/** 필드에서 무작위로 없앤다. 저주가 걸릴지는 운이다. */
export function purgeRandom(state: GameState, count: number, rng: Rng): string[] {
  if (state.field.length === 0) return ['필드가 비어 없앨 것이 없다'];

  const picked = rng.shuffle(state.field).slice(0, count);
  for (const card of picked) {
    const i = state.field.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.splice(i, 1);
  }
  return [`필드에서 없앰: ${picked.map((c) => c.name).join(', ')}`];
}

/** 필드를 통째로 비운다. 저주도 보상도 전부 사라진다. */
export function purgeAll(state: GameState): string[] {
  if (state.field.length === 0) return ['필드가 이미 비어 있다'];
  const size = state.field.length;
  const curses = state.field.filter((c) => c.kind === 'curse').length;
  state.field = [];
  return [`필드 ${size}장을 전부 쓸어냈다 (저주 ${curses}장 포함)`];
}

/** 덱에서 count장을 고른다. 순서는 섞이지만 덱 자체는 건드리지 않는다. */
export function sampleDeck(state: GameState, count: number, rng: Rng): CardInstance[] {
  if (state.deck.length === 0) return [];
  return rng.shuffle(state.deck).slice(0, count);
}

/** 확인한 카드 중 taken만 필드로 옮긴다. 나머지는 덱에 남는다. */
export function applyPeekKeep(
  state: GameState,
  seen: CardInstance[],
  taken: CardInstance[],
  rng: Rng,
): string[] {
  for (const card of taken) {
    const i = state.deck.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.push(...state.deck.splice(i, 1));
  }

  const lines = [
    `확인: ${seen.map((c) => c.name).join(', ')}`,
    `가져옴: ${taken.map((c) => c.name).join(', ') || '없음'}`,
  ];
  for (const t of resolvePlaced(state, taken, rng)) lines.push(...t.lines);
  return lines;
}

/** 덱 맨 위 count장을 보고 keep장만 필드로. 나머지는 덱에 그대로 남는다. */
export function peek(state: GameState, count: number, keep: number, rng: Rng): string[] {
  if (state.deck.length === 0) return ['덱이 비어 볼 것이 없다'];

  const seen = sampleDeck(state, count, rng);
  // 멀쩡한 카드를 값어치 높은 순으로 고른다. 저주는 마지막에.
  const ranked = [...seen].sort((a, b) => {
    const ca = a.kind === 'curse' ? 1 : 0;
    const cb = b.kind === 'curse' ? 1 : 0;
    return ca - cb || b.value - a.value;
  });
  return applyPeekKeep(state, seen, ranked.slice(0, keep), rng);
}

/** 속성 풀에서 필드로 바로 넣는다. 저주는 이 경로로 들어오지 않는다. */
export function addToField(
  state: GameState,
  kind: 'element',
  count: number,
  rng: Rng,
): string[] {
  const pool = poolOf(kind);
  const added: string[] = [];
  for (let i = 0; i < count; i++) {
    const def = rng.pick(pool);
    state.field.push(instantiate(def.id));
    added.push(def.name);
  }
  return added.length ? [`필드에 추가: ${added.join(', ')}`] : [];
}
