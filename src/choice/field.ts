import type { Rng } from '../engine/rng';
import {
  CURSE_RULES,
  DOOM_THRESHOLD,
  ERODE_DAMAGE,
  ROT_THRESHOLD,
  cardById,
  curseWeights,
  poolOf,
} from './balance';
import type { CardInstance, CurseType, GameState } from './types';

/**
 * 필드.
 *
 * 뽑은 카드는 쓰는 것이 아니라 필드에 펼쳐진 채로 남는다 — 잉카의 황금에서
 * 뒤집힌 카드가 계속 앞에 쌓이는 것과 같다. 소모라는 개념이 없다.
 *
 * 카드는 **덱 → 필드 한 방향으로만** 흐른다. 되돌아가는 길은 없고, 필드에서
 * 벗어나는 길은 선택지를 통한 제거뿐이다 — 발동한 저주도 필드에 남는다.
 *
 * 그래서 필드는 스스로 줄지 않는다. 뽑을수록 위험이 올라가고, 유일한 출구는
 * 제거 선택지다 — 필드가 더러울수록 그 선택지가 생명줄이 된다.
 *
 * **저주는 전부 "필드에 놓이는 순간" 판정한다.** 매 선택마다 훑는 지속 효과는
 * 없다. 그래서 같은 저주가 반복 발동하지 않고, 발동 시점이 항상 플레이어가
 * 뽑기를 누른 순간과 일치한다.
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
  };
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

/** 부패가 지금 하나 더 놓이면 덱에서 몇 장이 바뀌는지. UI가 미리 보여준다. */
export function rotPreview(field: CardInstance[]): number {
  const next = curseCounts(field).rot + 1;
  return next >= ROT_THRESHOLD ? next : 0;
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

/**
 * 저주 한 장이 필드에 놓인 직후의 발동 판정.
 *
 * 세 저주는 공격 대상이 다르다 — 파멸은 목숨, 부패는 덱, 침식은 체력.
 * 어느 것도 발동 후 필드에서 사라지지 않는다.
 */
export function onPlaced(state: GameState, card: CardInstance, rng: Rng): TriggerResult | null {
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
      // 새로 놓인 이 장을 포함해 문턱을 넘어야 발동한다.
      if (counts.rot < ROT_THRESHOLD) return null;
      // 발동 시점의 필드 부패 장수만큼 덱이 썩는다. 자기 자신을 늘리는
      // 저주라 한 번 구르기 시작하면 계단식으로 나빠진다.
      const converted = convertDeckToRot(state, counts.rot, rng);
      state.rotConverted += converted.length;
      lines.push(`부패가 ${counts.rot}장 — 덱에서 ${counts.rot}장이 썩는다`);
      lines.push(
        converted.length > 0
          ? `${converted.join(', ')} → 부패`
          : '덱에 바꿀 보상·중립 카드가 없었다',
      );
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

/**
 * 덱의 보상·중립 카드를 무작위로 골라 부패로 바꾼다.
 *
 * 필드가 아니라 **덱**을 친다. 지금 당장은 아무 일도 없어 보이지만 앞으로
 * 뽑을 것이 나빠진다 — 부패가 노리는 것은 미래다.
 */
function convertDeckToRot(state: GameState, count: number, rng: Rng): string[] {
  const targets = state.deck.filter((c) => c.kind === 'reward' || c.kind === 'neutral');
  const picked = rng.shuffle(targets).slice(0, count);

  const names: string[] = [];
  for (const card of picked) {
    const i = state.deck.findIndex((c) => c.uid === card.uid);
    if (i < 0) continue;
    state.deck[i] = instantiate('rot');
    names.push(card.name);
  }
  return names;
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

/** 덱 맨 위 count장을 보고 keep장만 필드로. 나머지는 덱에 그대로 남는다. */
export function peek(state: GameState, count: number, keep: number, rng: Rng): string[] {
  if (state.deck.length === 0) return ['덱이 비어 볼 것이 없다'];

  const seen = rng.shuffle(state.deck).slice(0, count);
  // 멀쩡한 카드를 값어치 높은 순으로 고른다. 저주는 마지막에.
  const ranked = [...seen].sort((a, b) => {
    const ca = a.kind === 'curse' ? 1 : 0;
    const cb = b.kind === 'curse' ? 1 : 0;
    return ca - cb || b.value - a.value;
  });
  const taken = ranked.slice(0, keep);

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

/** 보상 풀에서 필드로 바로 넣는다. 저주는 이 경로로 들어오지 않는다. */
export function addToField(
  state: GameState,
  kind: 'reward' | 'neutral',
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
