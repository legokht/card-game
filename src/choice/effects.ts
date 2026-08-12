import type { Rng } from '../engine/rng';
import { cardById, poolOf } from './balance';
import type { CardInstance, CardKind, Condition, Effect, GameState } from './types';

/**
 * 선택지가 덱에 가하는 조작.
 *
 * 모든 조작은 "가능한 만큼만" 적용된다. 저주 2장을 지우라고 했는데 1장뿐이면
 * 1장만 지우고 넘어간다. 선택지가 덱 상태에 걸려 멈추면 루프가 끊기기 때문이다.
 */

let uidCounter = 0;

export function resetUidCounter(): void {
  uidCounter = 0;
}

function instantiate(defId: string): CardInstance {
  const def = cardById(defId);
  uidCounter += 1;
  return {
    uid: `k${uidCounter}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
  };
}

export function countKind(deck: CardInstance[], kind: CardKind): number {
  return deck.filter((c) => c.kind === kind).length;
}

export function evaluate(state: GameState, cond: Condition): boolean {
  switch (cond.type) {
    case 'countAtLeast':
      return countKind(state.deck, cond.kind) >= cond.n;
    case 'countAtMost':
      return countKind(state.deck, cond.kind) <= cond.n;
    case 'deckAtLeast':
      return state.deck.length >= cond.n;
    case 'deckAtMost':
      return state.deck.length <= cond.n;
  }
}

/** 종류별 카드를 값어치 낮은 순으로. 제거는 싼 것부터 집는다. */
function pickForRemoval(deck: CardInstance[], kind: CardKind, count: number): CardInstance[] {
  return deck
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.value - b.value)
    .slice(0, count);
}

/**
 * 파편은 값어치가 0이라 "값싼 카드부터 버린다"에 가장 먼저 걸린다. 그러면 덱의
 * 파편 수와 탈출 카운트가 어긋나므로, 종류를 명시하지 않은 제거에서는 제외한다.
 * 모은 진척을 모르는 사이에 깎는 것은 어차피 규칙으로도 나쁘다.
 */
function removable(deck: CardInstance[]): CardInstance[] {
  return deck.filter((c) => c.kind !== 'shard');
}

function removeCards(state: GameState, targets: CardInstance[]): void {
  for (const t of targets) {
    const i = state.deck.findIndex((c) => c.uid === t.uid);
    if (i >= 0) state.deck.splice(i, 1);
  }
}

const KIND_NAME: Record<CardKind, string> = {
  reward: '보상',
  curse: '저주',
  neutral: '중립',
  shard: '파편',
};

/**
 * 효과 하나를 적용하고 사람이 읽을 변화 요약을 돌려준다.
 * 요약은 로그와 테스트 양쪽에서 쓴다.
 */
export function applyEffect(state: GameState, effect: Effect, rng: Rng): string[] {
  switch (effect.type) {
    case 'addSpecific': {
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        const card = instantiate(effect.cardId);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'addRandom': {
      const pool = poolOf(effect.kind);
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        const def = rng.pick(pool);
        const card = instantiate(def.id);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'removeKind': {
      const targets = pickForRemoval(state.deck, effect.kind, effect.count);
      removeCards(state, targets);
      if (targets.length === 0) return [`${KIND_NAME[effect.kind]} 카드가 없어 지울 것이 없었다`];
      const short = targets.length < effect.count ? ` (${effect.count}장 중 ${targets.length}장뿐)` : '';
      return [`- ${targets.map((t) => t.name).join(', ')}${short}`];
    }

    case 'removeExtreme': {
      const sorted = removable(state.deck).sort((a, b) =>
        effect.end === 'highest' ? b.value - a.value : a.value - b.value,
      );
      const targets = sorted.slice(0, effect.count);
      removeCards(state, targets);
      if (targets.length === 0) return ['덱이 비어 지울 것이 없었다'];
      return [`- ${targets.map((t) => `${t.name}(${t.value})`).join(', ')}`];
    }

    case 'transform': {
      const targets = pickForRemoval(state.deck, effect.from, effect.count);
      removeCards(state, targets);
      const pool = poolOf(effect.to);
      const made: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const card = instantiate(rng.pick(pool).id);
        state.deck.push(card);
        made.push(card.name);
      }
      if (targets.length === 0) return [`바꿀 ${KIND_NAME[effect.from]} 카드가 없었다`];
      return [`${targets.map((t) => t.name).join(', ')} → ${made.join(', ')}`];
    }

    case 'shard': {
      const lines: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        state.deck.push(instantiate('shard'));
        state.shards += 1;
      }
      lines.push(`+ 탈출구 파편 ×${effect.count} (${state.shards}/${state.escapeTarget})`);
      return lines;
    }

    case 'ifThen': {
      const branch = evaluate(state, effect.when) ? effect.then : effect.otherwise;
      return branch.flatMap((e) => applyEffect(state, e, rng));
    }
  }
}

export function applyEffects(state: GameState, effects: Effect[], rng: Rng): string[] {
  return effects.flatMap((e) => applyEffect(state, e, rng));
}

/** 초기 덱을 만든다. */
export function buildDeck(ids: string[]): CardInstance[] {
  return ids.map(instantiate);
}
