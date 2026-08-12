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
    attack: def.attack,
    block: def.block,
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
 * 종류를 명시하지 않은 제거("값싼 카드부터 버린다")에서 빠지는 카드들.
 *
 * 파편은 값어치가 0이라 가장 먼저 걸린다. 그러면 덱의 파편 수와 탈출 카운트가
 * 어긋나고, 모은 진척이 모르는 사이에 깎인다.
 *
 * 저주도 값이 싸서 매번 먼저 잘려 나갔다. 그 결과 짐을 덜어낼 때마다 저주가
 * 공짜로 청소돼 오염도가 5%를 넘지 못했고, 저주 페널티 자체가 성립하지 않았다
 * (무지성 플레이 탈출률 99%). 저주는 정리형 선택지로만 지운다.
 */
function removable(deck: CardInstance[]): CardInstance[] {
  return deck.filter((c) => c.kind !== 'shard' && c.kind !== 'curse');
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

    case 'damage': {
      state.hp -= effect.amount;
      return [`체력 -${effect.amount} (${Math.max(0, state.hp)}/${state.maxHp})`];
    }

    case 'heal': {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + effect.amount);
      const gained = state.hp - before;
      return gained > 0 ? [`체력 +${gained} (${state.hp}/${state.maxHp})`] : [];
    }

    /**
     * 덱을 실제로 써야만 저주가 아프다. 덱 전체를 섞어 count장을 공개하고,
     * 종류별 결과를 뽑힌 장수만큼 적용한다. 카드는 전부 덱에 남는다 —
     * 저주는 지우기 전까지 계속 물어뜯는다.
     */
    case 'draw': {
      if (state.deck.length === 0) return ['덱이 비어 뽑을 것이 없었다'];

      const revealed = rng.shuffle(state.deck).slice(0, effect.count);
      const curses = revealed.filter((c) => c.kind === 'curse').length;
      const rewards = revealed.filter((c) => c.kind === 'reward').length;

      const lines = [`공개: ${revealed.map((c) => c.name).join(', ')}`];
      for (let i = 0; i < curses; i++) lines.push(...applyEffects(state, effect.onCurse, rng));
      for (let i = 0; i < rewards; i++) lines.push(...applyEffects(state, effect.onReward, rng));
      if (curses === 0 && rewards === 0) lines.push('아무 일도 없었다');
      return lines;
    }

    /**
     * 전투를 시작한다. 실제 진행은 battle.ts가 맡고, 여기서는 예약만 한다 —
     * 효과 적용 도중에 전투를 열면 남은 효과가 전투 뒤에 뒤늦게 터진다.
     */
    case 'battle': {
      state.pendingBattle = { enemyId: effect.enemyId, onWin: effect.onWin };
      return [];
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
