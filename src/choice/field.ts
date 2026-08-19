import type { Rng } from '../engine/rng';
import {
  CURSE_RULES,
  ERODE_CONVERT,
  ROT_BURST,
  ROT_DRAIN,
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
 * 벗어나는 경우는 둘뿐이다: 선택지를 통한 제거, 그리고 같은 종류의 저주 2장이
 * 겹쳐 소멸하는 것.
 *
 * 그래서 필드는 스스로 줄지 않는다. 뽑을수록 겹칠 확률이 올라가고, 유일한
 * 출구는 제거 선택지다 — 필드가 더러울수록 그 선택지가 생명줄이 된다.
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

/** 필드에 같은 종류 저주가 정확히 1장 있는지 — 다음 한 장이 위험한 상태. */
export function onEdge(field: CardInstance[]): CurseType[] {
  const counts = curseCounts(field);
  return (Object.keys(counts) as CurseType[]).filter((t) => counts[t] === 1);
}

export interface TriggerResult {
  type: CurseType;
  lines: string[];
  /** 즉사했는지. */
  fatal: boolean;
}

/**
 * 필드에서 겹친 저주를 발동시킨다. 한 번에 여러 종류가 겹칠 수 있으므로 반복한다.
 * 발동한 2장은 필드에서 소멸한다 — 덱으로 돌아가지 않는다.
 */
export function resolvePairs(state: GameState, rng: Rng): TriggerResult[] {
  const results: TriggerResult[] = [];

  for (;;) {
    const counts = curseCounts(state.field);
    const paired = (Object.keys(counts) as CurseType[]).find((t) => counts[t] >= 2);
    if (!paired) break;

    // 겹친 2장을 필드에서 뺀다. 어디로도 돌아가지 않는다.
    const taken: CardInstance[] = [];
    for (let i = state.field.length - 1; i >= 0 && taken.length < 2; i--) {
      if (state.field[i]!.curseType === paired) taken.push(...state.field.splice(i, 1));
    }

    const rule = CURSE_RULES[paired];
    state.triggers[paired] += 1;

    // 첫 겹침이 몇 수째에 터졌는지 한 번만 남긴다. 시작 덱에 저주를 넣은
    // 목적이 "초반부터 긴장"이므로, 그게 실제로 언제 오는지가 지표다.
    if (state.firstPairAt === null) {
      state.firstPairAt = state.step;
      state.log.push(`   첫 겹침 — ${state.step}수째 (${rule.name})`);
    }
    const lines: string[] = [`${rule.name} 2장이 겹쳤다`];
    let fatal = false;

    switch (paired) {
      case 'doom':
        state.hp = 0;
        fatal = true;
        lines.push('파멸이 완성됐다.');
        break;

      case 'rot':
        state.hp -= ROT_BURST;
        lines.push(`부패가 터졌다 — 체력 -${ROT_BURST}`);
        break;

      case 'erode': {
        const targets = state.field.filter((c) => c.kind !== 'curse');
        const picked = rng.shuffle(targets).slice(0, ERODE_CONVERT);
        if (picked.length === 0) {
          lines.push('바꿀 멀쩡한 카드가 필드에 없었다');
        } else {
          for (const card of picked) {
            const i = state.field.findIndex((c) => c.uid === card.uid);
            const curse = makeCurse(state, rng);
            state.field[i] = curse;
            lines.push(`${card.name} → ${curse.name}`);
          }
        }
        break;
      }
    }

    results.push({ type: paired, lines, fatal });
    if (fatal) break;
  }

  return results;
}

/**
 * 덱에서 필드로 한 장 가져온다. 덱이 비면 null.
 * 겹침 판정은 하지 않는다 — 호출하는 쪽이 뽑기를 끝낸 뒤 resolvePairs를 부른다.
 */
export function drawOne(state: GameState, rng: Rng): CardInstance | null {
  if (state.deck.length === 0) return null;
  const index = rng.int(0, state.deck.length - 1);
  const [card] = state.deck.splice(index, 1);
  if (!card) return null;
  state.field.push(card);
  return card;
}

/** 여러 장 뽑고 겹침까지 처리한다. */
export function drawToField(state: GameState, count: number, rng: Rng): string[] {
  const drawn: string[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawOne(state, rng);
    if (!card) {
      drawn.push('덱이 비어 더 뽑을 수 없다');
      break;
    }
    drawn.push(card.name);
  }

  const lines = drawn.length ? [`뽑음: ${drawn.join(', ')}`] : [];
  for (const t of resolvePairs(state, rng)) lines.push(...t.lines);
  return lines;
}

/** 필드의 부패가 매 선택마다 갉아먹는다. 겹치지 않아도 아픈 유일한 저주다. */
export function applyRotDrain(state: GameState): string[] {
  const rot = state.field.filter((c) => c.curseType === 'rot').length;
  if (rot === 0) return [];
  const damage = rot * ROT_DRAIN;
  state.hp -= damage;
  return [`부패 ${rot}장이 갉아먹는다 — 체력 -${damage}`];
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
  for (const t of resolvePairs(state, rng)) lines.push(...t.lines);
  return lines;
}

/** 보상 풀에서 필드로 바로 넣는다. 침식이 카드를 바꿀 때도 쓴다. */
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
