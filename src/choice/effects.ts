import type { Rng } from '../engine/rng';
import { cardById, poolOf } from './balance';
import {
  addToField,
  countShards,
  drawToField,
  makeCurse,
  sampleDeck,
  purgeAll,
  purgeCurse,
  purgeRandom,
  resolvePlaced,
  cursesBlocked,
} from './field';
import type {
  CardInstance,
  CardKind,
  Condition,
  Effect,
  GameState,
  FieldCondition,
} from './types';

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

/**
 * `curseType`을 반드시 같이 옮긴다.
 *
 * 이게 빠져 있던 동안 transform으로 만들어진 저주는 종류가 없는 껍데기였다 —
 * 필드에 깔려도 겹치지 않고, 부패라면 체력을 갉지도 않고, 파멸이라도 죽이지
 * 않았다. 오염도 숫자만 올라가고 저주로서는 아무 일도 하지 않았다.
 */
function instantiate(defId: string): CardInstance {
  const def = cardById(defId);
  uidCounter += 1;
  return {
    uid: `k${uidCounter}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
    ...(def.curseType ? { curseType: def.curseType } : {}),
    ...(def.element ? { element: def.element } : {}),
  };
}

export function countKind(deck: CardInstance[], kind: CardKind): number {
  return deck.filter((c) => c.kind === kind).length;
}

export function evaluateField(state: GameState, cond: FieldCondition): boolean {
  switch (cond.type) {
    case 'fieldCurseAtLeast':
      return countKind(state.field, 'curse') >= cond.n;
    case 'fieldSizeAtLeast':
      return state.field.length >= cond.n;
    case 'fieldSizeAtMost':
      return state.field.length <= cond.n;
  }
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
 * 파편은 값어치가 0이라 가장 먼저 걸린다. 그러면 아직 뽑지도 못한 탈출
 * 수단이 모르는 사이에 사라진다.
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
  element: '속성',
  curse: '저주',
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
        if (cursesBlocked(state) && cardById(effect.cardId).kind === 'curse') {
          return [`저주를 받지 않았다 (유예 중)`];
        }
        const card = instantiate(effect.cardId);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'addRandom': {
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        if (effect.kind === 'curse' && cursesBlocked(state)) {
          return [`저주를 받지 않았다 (유예 중)`];
        }
        // 저주는 종류별 덱 상한(특히 파멸)을 지켜야 하므로 makeCurse를 거친다.
        const card = effect.kind === 'curse' ? makeCurse(state, rng) : instantiate(rng.pick(poolOf(effect.kind)).id);
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
      if (effect.to === 'curse' && cursesBlocked(state)) {
        return [`저주를 받지 않았다 (유예 중)`];
      }
      const targets = pickForRemoval(state.deck, effect.from, effect.count);
      removeCards(state, targets);
      const pool = poolOf(effect.to);
      const made: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        // addRandom과 같은 이유로 저주는 makeCurse를 거친다 — 안 그러면
        // "중립이 전부 저주가 된다" 한 방으로 파멸이 상한을 넘어 쏟아진다.
        const card = effect.to === 'curse' ? makeCurse(state, rng) : instantiate(rng.pick(pool).id);
        state.deck.push(card);
        made.push(card.name);
      }
      if (targets.length === 0) return [`바꿀 ${KIND_NAME[effect.from]} 카드가 없었다`];
      return [`${targets.map((t) => t.name).join(', ')} → ${made.join(', ')}`];
    }

    case 'shard': {
      // 덱에 넣기만 한다. 탈출 진척은 **필드에 나왔을 때** 올라간다.
      for (let i = 0; i < effect.count; i++) state.deck.push(instantiate('shard'));
      const inDeck = countShards(state.deck);
      return [`+ 탈출구 파편 ×${effect.count} — 덱에 ${inDeck}장 (뽑아야 진척이 된다)`];
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

    /* ---------- 필드 조작 ---------- */

    case 'drawField':
      return drawToField(state, effect.count, rng);

    case 'pushLuck':
      // 실제 진행은 UI가 한 장씩 몰고 간다. 여기서는 모드만 연다.
      state.push = { drawn: 0, stopped: false, log: [] };
      return ['한 장씩 뽑는다 — 멈출 때까지'];

    case 'peek': {
      // 실제 고르기는 연출이 끝난 뒤 UI가 한다. 여기서는 확인할 장만 고른다.
      const cards = sampleDeck(state, effect.count, rng);
      if (cards.length === 0) return ['덱이 비어 볼 것이 없다'];
      state.fate = { keep: Math.min(effect.keep, cards.length), cards };
      return [`덱에서 ${cards.length}장을 확인한다`];
    }

    case 'purgeCurse':
      return purgeCurse(state, effect.count, effect.curseType);

    case 'purgeRandom':
      return purgeRandom(state, effect.count, rng);

    case 'purgeAll':
      return purgeAll(state);

    case 'healPerFieldCard': {
      const gained = state.field.length * effect.amount;
      if (gained === 0) return ['필드가 비어 회복이 없다'];
      return applyEffect(state, { type: 'heal', amount: gained }, rng);
    }

    case 'ifField': {
      const branch = evaluateField(state, effect.when) ? effect.then : effect.otherwise;
      return branch.flatMap((e) => applyEffect(state, e, rng));
    }

    case 'ifThen': {
      const branch = evaluate(state, effect.when) ? effect.then : effect.otherwise;
      return branch.flatMap((e) => applyEffect(state, e, rng));
    }

    case 'addAny': {
      // 종류를 가리지 않는다 — 저주가 섞여 있어서 "불린다"가 도박이 된다.
      // 보상·중립을 속성 하나로 합치면서도 저주가 걸릴 확률은 3분의 1로
      // 그대로 둔다. 속성을 두 번 넣은 것은 그 비율을 지키기 위해서다.
      const kinds: CardKind[] = ['element', 'element', 'curse'];
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        const kind = rng.pick(kinds);
        if (kind === 'curse' && cursesBlocked(state)) {
          added.push('저주 유예');
          continue;
        }
        // 저주는 종류별 덱 상한을 지켜야 하므로 makeCurse를 거친다.
        const card = kind === 'curse' ? makeCurse(state, rng) : instantiate(rng.pick(poolOf(kind)).id);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'chooseElement': {
      // 실제 진행은 UI가 한 장씩 몰고 간다. 여기서는 모드만 연다 —
      // 푸시 유어 럭과 같은 방식이다.
      state.pick = { remaining: effect.count, count: effect.count, log: [] };
      return [`속성 ${effect.count}장을 직접 고른다`];
    }

    case 'lasting': {
      // 같은 종류라도 새로 걸면 별도 항목이다. 덮어쓰면 먼저 건 지연 보상이
      // 사라지고 카운트만 리셋된다.
      state.lasting.push({
        id: effect.id,
        label: effect.label,
        remaining: effect.turns,
        damage: effect.damage,
        ...(effect.side ? { side: effect.side } : {}),
        ...(effect.blockCurses ? { blockCurses: true } : {}),
        ...(effect.onExpire ? { onExpire: effect.onExpire } : {}),
      });
      return [`${effect.label} (${effect.turns}회)`];
    }

    case 'paintElement': {
      const candidates = state.deck.filter((c) => c.kind === 'element');
      const picked = rng.shuffle(candidates).slice(0, effect.count);
      if (picked.length === 0) return ['바꿀 속성 카드가 없었다'];
      removeCards(state, picked);
      const made: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const card = instantiate(effect.element);
        state.deck.push(card);
        made.push(card.name);
      }
      const short = picked.length < effect.count ? ` (${effect.count}장 중 ${picked.length}장뿐)` : '';
      return [`${picked.map((t) => t.name).join(', ')} → ${made.join(', ')}${short}`];
    }

    case 'coinFlip': {
      const branch = rng.next() < 0.5 ? effect.then : effect.otherwise;
      const outcome = branch === effect.then ? '성공' : '실패';
      return [`동전 ${outcome}`, ...branch.flatMap((e) => applyEffect(state, e, rng))];
    }

    case 'setHp': {
      state.hp = effect.value;
      return [`체력이 ${effect.value}이 되었다 (${state.hp}/${state.maxHp})`];
    }
  }
}

export function applyEffects(state: GameState, effects: Effect[], rng: Rng): string[] {
  return effects.flatMap((e) => applyEffect(state, e, rng));
}

/** 필드로 바로 놓는 속성 카드. 선택지에서 쓴다. */
export function grantToField(
  state: GameState,
  kind: 'element',
  count: number,
  rng: Rng,
): string[] {
  // 저주는 이 경로로 들어오지 않지만, 속성은 놓이는 순간 시너지가 터질 수
  // 있으므로 판정을 거쳐야 한다.
  const before = state.field.length;
  const lines = addToField(state, kind, count, rng);
  for (const t of resolvePlaced(state, state.field.slice(before), rng)) lines.push(...t.lines);
  return lines;
}

/** 초기 덱을 만든다. */
export function buildDeck(ids: string[]): CardInstance[] {
  return ids.map(instantiate);
}
