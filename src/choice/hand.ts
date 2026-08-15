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
 * 상시 손패.
 *
 * 덱은 "앞으로 뽑을 것"이고 손패는 "지금 들고 있는 것"이다. 저주는 손패에서
 * 같은 종류가 2장 모이는 순간 발동하므로, 저주를 1장 들고 있는 상태에서
 * "한 장 더 뽑을까"가 이 게임의 핵심 긴장이다.
 */

let handUid = 0;

export function resetHandUid(): void {
  handUid = 0;
}

function instantiate(defId: string): CardInstance {
  const def = cardById(defId);
  handUid += 1;
  return {
    uid: `h${handUid}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
    attack: def.attack,
    block: def.block,
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
  const counts = curseCounts([...state.deck, ...state.hand]);
  const type = rng.pick(curseWeights(counts));
  return instantiate(type);
}

/** 손패에 같은 종류 저주가 정확히 1장 있는지 — 다음 한 장이 위험한 상태. */
export function onEdge(hand: CardInstance[]): CurseType[] {
  const counts = curseCounts(hand);
  return (Object.keys(counts) as CurseType[]).filter((t) => counts[t] === 1);
}

export interface TriggerResult {
  type: CurseType;
  lines: string[];
  /** 즉사했는지. */
  fatal: boolean;
}

/**
 * 손패에서 겹친 저주를 발동시킨다. 한 번에 여러 종류가 겹칠 수 있으므로 반복한다.
 * 발동한 2장은 손패에서 빠지고, 종류에 따라 덱으로 돌아가거나 사라진다.
 */
export function resolvePairs(state: GameState, rng: Rng): TriggerResult[] {
  const results: TriggerResult[] = [];

  for (;;) {
    const counts = curseCounts(state.hand);
    const paired = (Object.keys(counts) as CurseType[]).find((t) => counts[t] >= 2);
    if (!paired) break;

    // 겹친 2장을 손패에서 뺀다.
    const taken: CardInstance[] = [];
    for (let i = state.hand.length - 1; i >= 0 && taken.length < 2; i--) {
      if (state.hand[i]!.curseType === paired) taken.push(...state.hand.splice(i, 1));
    }

    const rule = CURSE_RULES[paired];
    state.triggers[paired] += 1;
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
        const targets = state.hand.filter((c) => c.kind !== 'curse');
        const picked = rng.shuffle(targets).slice(0, ERODE_CONVERT);
        if (picked.length === 0) {
          lines.push('바꿀 멀쩡한 카드가 손에 없었다');
        } else {
          for (const card of picked) {
            const i = state.hand.findIndex((c) => c.uid === card.uid);
            const curse = makeCurse(state, rng);
            state.hand[i] = curse;
            lines.push(`${card.name} → ${curse.name}`);
          }
        }
        break;
      }
    }

    if (rule.afterTrigger === 'deck') state.deck.push(...taken);

    results.push({ type: paired, lines, fatal });
    if (fatal) break;
  }

  return results;
}

/**
 * 덱에서 손패로 한 장 가져온다. 덱이 비면 null.
 * 겹침 판정은 하지 않는다 — 호출하는 쪽이 뽑기를 끝낸 뒤 resolvePairs를 부른다.
 */
export function drawOne(state: GameState, rng: Rng): CardInstance | null {
  if (state.deck.length === 0) return null;
  const index = rng.int(0, state.deck.length - 1);
  const [card] = state.deck.splice(index, 1);
  if (!card) return null;
  state.hand.push(card);
  return card;
}

/** 여러 장 뽑고 겹침까지 처리한다. */
export function drawToHand(state: GameState, count: number, rng: Rng): string[] {
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

/** 손패의 부패가 매 선택마다 갉아먹는다. 겹치지 않아도 아픈 유일한 저주다. */
export function applyRotDrain(state: GameState): string[] {
  const rot = state.hand.filter((c) => c.curseType === 'rot').length;
  if (rot === 0) return [];
  const damage = rot * ROT_DRAIN;
  state.hp -= damage;
  return [`부패 ${rot}장이 갉아먹는다 — 체력 -${damage}`];
}

/** 손패에서 저주를 버린다. 종류를 지정하면 그 종류만. */
export function discardCurse(state: GameState, count: number, type?: CurseType): string[] {
  const targets = state.hand.filter((c) => c.kind === 'curse' && (!type || c.curseType === type));
  if (targets.length === 0) {
    return [type ? `손패에 ${CURSE_RULES[type].name}이(가) 없었다` : '손패에 저주가 없었다'];
  }

  const removed = targets.slice(0, count);
  for (const card of removed) {
    const i = state.hand.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.hand.splice(i, 1);
  }
  return [`손패에서 버림: ${removed.map((c) => c.name).join(', ')}`];
}

/** 손패를 전부 덱으로 돌리고 새로 뽑는다. */
export function mulligan(state: GameState, draw: number, rng: Rng): string[] {
  const size = state.hand.length;
  state.deck.push(...state.hand);
  state.hand = [];
  const lines = [`손패 ${size}장을 전부 덱으로 되돌렸다`];
  lines.push(...drawToHand(state, draw, rng));
  return lines;
}

/** 덱 맨 위 count장을 보고 keep장만 손패로. 나머지는 덱에 남는다. */
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
    if (i >= 0) state.hand.push(...state.deck.splice(i, 1));
  }

  const lines = [
    `확인: ${seen.map((c) => c.name).join(', ')}`,
    `가져옴: ${taken.map((c) => c.name).join(', ') || '없음'}`,
  ];
  for (const t of resolvePairs(state, rng)) lines.push(...t.lines);
  return lines;
}

/** 보상 풀에서 손패로 바로 넣는다. 침식이 카드를 바꿀 때도 쓴다. */
export function addToHand(state: GameState, kind: 'reward' | 'neutral', count: number, rng: Rng): string[] {
  const pool = poolOf(kind);
  const added: string[] = [];
  for (let i = 0; i < count; i++) {
    const def = rng.pick(pool);
    state.hand.push(instantiate(def.id));
    added.push(def.name);
  }
  return added.length ? [`손패에 추가: ${added.join(', ')}`] : [];
}
