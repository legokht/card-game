import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  curseCounts,
  discardCurse,
  drawToHand,
  applyRotDrain,
  makeCurse,
  mulligan,
  onEdge,
  peek,
  resolvePairs,
} from '../src/choice/hand';
import { choose, createGame, pushDraw, pushStop } from '../src/choice/engine';
import { applyEffects, countKind, resetUidCounter } from '../src/choice/effects';
import { EVENTS } from '../src/choice/events';
import {
  CURSE_RULES,
  ERODE_CONVERT,
  HAND_START,
  ROT_BURST,
  ROT_DRAIN,
} from '../src/choice/balance';
import type { CardInstance, CurseType, Effect, GameState, OptionKind } from '../src/choice/types';

beforeEach(() => {
  resetUidCounter();
});

let uid = 0;
function curse(type: CurseType): CardInstance {
  uid += 1;
  return {
    uid: `c${uid}`,
    defId: type,
    name: CURSE_RULES[type].name,
    kind: 'curse',
    value: 1,
    attack: 0,
    block: 0,
    curseType: type,
  };
}

function plain(name = '은빛 검'): CardInstance {
  uid += 1;
  return {
    uid: `p${uid}`,
    defId: 'silver-blade',
    name,
    kind: 'reward',
    value: 4,
    attack: 4,
    block: 0,
  };
}

describe('시작 손패', () => {
  it('게임을 시작하면 덱에서 손패를 뽑아 온다', () => {
    const state = createGame(new Rng('start'));
    expect(state.hand).toHaveLength(HAND_START);
  });

  it('손패는 선택을 넘어가도 유지된다', () => {
    const rng = new Rng('persist');
    const state = createGame(rng);
    const before = state.hand.map((c) => c.uid);

    // 손패를 건드리지 않는 선택지를 골라 유지되는지 본다.
    state.current = EVENTS.find((e) => e.id === 'twins')!;
    choose(state, 'blue', rng);

    for (const id of before) expect(state.hand.some((c) => c.uid === id)).toBe(true);
  });
});

describe('저주 겹침', () => {
  it('같은 종류가 2장 모이면 발동하고 손패에서 빠진다', () => {
    const state = createGame(new Rng('pair'));
    state.hand = [plain(), curse('erode'), curse('erode')];

    const results = resolvePairs(state, new Rng('pair'));

    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('erode');
    expect(countKind(state.hand, 'curse')).toBeLessThan(2);
    expect(state.triggers.erode).toBe(1);
  });

  it('종류가 다르면 2장이어도 발동하지 않는다', () => {
    const state = createGame(new Rng('mixed'));
    state.hand = [curse('rot'), curse('erode')];

    const results = resolvePairs(state, new Rng('mixed'));

    expect(results).toHaveLength(0);
    expect(state.hand).toHaveLength(2);
  });

  it('파멸이 겹치면 즉사한다', () => {
    const state = createGame(new Rng('doom'));
    state.hand = [curse('doom'), curse('doom')];

    const results = resolvePairs(state, new Rng('doom'));

    expect(results[0]!.fatal).toBe(true);
    expect(state.hp).toBe(0);
    expect(state.triggers.doom).toBe(1);
  });

  it('부패가 겹치면 크게 터진다', () => {
    const state = createGame(new Rng('rot'));
    state.hand = [curse('rot'), curse('rot')];
    const hp = state.hp;

    resolvePairs(state, new Rng('rot'));

    expect(state.hp).toBe(hp - ROT_BURST);
  });

  it('침식이 겹치면 손패의 멀쩡한 카드가 저주로 바뀐다', () => {
    const state = createGame(new Rng('erode'));
    state.hand = [curse('erode'), curse('erode'), plain(), plain(), plain()];

    resolvePairs(state, new Rng('erode'));

    // 침식 2장은 빠지고, 남은 멀쩡한 카드 중 일부가 저주가 된다.
    expect(state.hand).toHaveLength(3);
    expect(countKind(state.hand, 'curse')).toBe(ERODE_CONVERT);
  });

  it('발동한 저주의 행선지는 종류마다 다르다', () => {
    // 침식은 덱으로 돌아가고
    const back = createGame(new Rng('back'));
    back.deck = [];
    back.hand = [curse('erode'), curse('erode'), plain()];
    resolvePairs(back, new Rng('back'));
    expect(back.deck.filter((c) => c.curseType === 'erode')).toHaveLength(2);

    // 부패는 사라진다
    resetUidCounter();
    const gone = createGame(new Rng('gone'));
    gone.deck = [];
    gone.hand = [curse('rot'), curse('rot')];
    resolvePairs(gone, new Rng('gone'));
    expect(gone.deck.filter((c) => c.curseType === 'rot')).toHaveLength(0);
  });

  it('여러 종류가 동시에 겹쳐도 전부 처리된다', () => {
    const state = createGame(new Rng('multi'));
    state.hand = [curse('rot'), curse('rot'), curse('erode'), curse('erode'), plain()];

    const results = resolvePairs(state, new Rng('multi'));

    expect(results.map((r) => r.type).sort()).toEqual(['erode', 'rot']);
  });
});

describe('저주 1장 — 가장 긴장되는 상태', () => {
  it('정확히 1장 있는 종류를 알려준다', () => {
    const state = createGame(new Rng('edge'));
    state.hand = [curse('doom'), curse('rot'), curse('rot'), plain()];

    // 파멸은 1장(위험), 부패는 2장이라 이미 겹친 상태다.
    expect(onEdge(state.hand)).toEqual(['doom']);
  });

  it('저주가 없으면 빈 목록이다', () => {
    const state = createGame(new Rng('clean'));
    state.hand = [plain(), plain()];
    expect(onEdge(state.hand)).toEqual([]);
  });
});

describe('부패의 지속 피해', () => {
  it('손패에 있는 동안 매 선택마다 갉아먹는다', () => {
    const state = createGame(new Rng('drain'));
    state.hand = [curse('rot'), plain()];
    const hp = state.hp;

    applyRotDrain(state);

    expect(state.hp).toBe(hp - ROT_DRAIN);
  });

  it('장수에 비례한다', () => {
    const state = createGame(new Rng('drain2'));
    // 겹치지 않게 손패에 직접 세 장을 두고 지속 피해만 본다.
    state.hand = [curse('rot'), curse('rot'), curse('rot')];
    const hp = state.hp;

    applyRotDrain(state);

    expect(state.hp).toBe(hp - 3 * ROT_DRAIN);
  });

  it('선택할 때마다 실제로 적용된다', () => {
    const rng = new Rng('drain-loop');
    const state = createGame(rng);
    state.hand = [curse('rot')];
    state.current = EVENTS.find((e) => e.id === 'twins')!;
    const hp = state.hp;

    choose(state, 'blue', rng);

    expect(state.hp).toBeLessThan(hp);
  });
});

describe('손패 조작', () => {
  it('뽑으면 덱에서 손패로 옮겨진다', () => {
    const state = createGame(new Rng('draw'));
    const deckBefore = state.deck.length;
    const handBefore = state.hand.length;

    drawToHand(state, 2, new Rng('draw'));

    expect(state.deck).toHaveLength(deckBefore - 2);
    expect(state.hand.length).toBeGreaterThanOrEqual(handBefore);
  });

  it('덱이 비면 더 뽑지 않는다', () => {
    const state = createGame(new Rng('dry'));
    state.deck = [];
    const handBefore = state.hand.length;

    const lines = drawToHand(state, 3, new Rng('dry'));

    expect(state.hand).toHaveLength(handBefore);
    expect(lines.join()).toContain('덱이 비어');
  });

  it('저주를 버리면 손패에서 사라진다', () => {
    const state = createGame(new Rng('discard'));
    state.hand = [curse('rot'), curse('erode'), plain()];

    discardCurse(state, 1, 'rot');

    expect(state.hand.filter((c) => c.curseType === 'rot')).toHaveLength(0);
    expect(state.hand).toHaveLength(2);
  });

  it('버릴 저주가 없으면 그냥 넘어간다', () => {
    const state = createGame(new Rng('none'));
    state.hand = [plain()];

    const lines = discardCurse(state, 2);

    expect(lines.join()).toContain('없었다');
    expect(state.hand).toHaveLength(1);
  });

  it('멀리건은 손패를 덱으로 돌리고 새로 뽑는다', () => {
    const state = createGame(new Rng('mull'));
    state.hand = [curse('rot'), curse('erode')];
    const deckBefore = state.deck.length;

    mulligan(state, 3, new Rng('mull'));

    // 2장 돌려주고 3장 뽑았으므로 덱은 1장 줄어든다.
    expect(state.deck).toHaveLength(deckBefore + 2 - 3);
  });

  it('엿보기는 본 것 중 일부만 가져온다', () => {
    const state = createGame(new Rng('peek'));
    const handBefore = state.hand.length;

    peek(state, 3, 1, new Rng('peek'));

    expect(state.hand).toHaveLength(handBefore + 1);
  });
});

describe('파멸은 덱에 아주 적게만 존재한다', () => {
  it('덱 상한을 넘겨 만들어지지 않는다', () => {
    const state = createGame(new Rng('cap'));
    const rng = new Rng('cap');

    for (let i = 0; i < 60; i++) state.deck.push(makeCurse(state, rng));

    const doom = curseCounts([...state.deck, ...state.hand]).doom;
    expect(doom).toBeLessThanOrEqual(CURSE_RULES.doom.deckMax);
  });

  it('선택지로 저주를 받아도 상한이 지켜진다', () => {
    const state = createGame(new Rng('cap2'));
    const rng = new Rng('cap2');
    const add: Effect[] = [{ type: 'addRandom', kind: 'curse', count: 40 }];

    applyEffects(state, add, rng);

    expect(curseCounts([...state.deck, ...state.hand]).doom).toBeLessThanOrEqual(
      CURSE_RULES.doom.deckMax,
    );
  });
});

describe('푸시 유어 럭', () => {
  function openPush(seed: string): { state: GameState; rng: Rng } {
    const rng = new Rng(seed);
    const state = createGame(rng);
    state.current = EVENTS.find((e) => e.id === 'gamble-draw')!;
    choose(state, 'red', rng);
    return { state, rng };
  }

  it('선택하면 뽑기 모드가 열리고 루프가 멈춘다', () => {
    const { state } = openPush('push');
    expect(state.push).not.toBeNull();
    expect(state.push!.drawn).toBe(0);
  });

  it('뽑기 모드에서는 선택지를 고를 수 없다', () => {
    const { state, rng } = openPush('locked');
    const snapshot = structuredClone(state);
    choose(state, 'red', rng);
    expect(state).toEqual(snapshot);
  });

  it('한 장씩 뽑히고 손패가 늘어난다', () => {
    const { state, rng } = openPush('one');
    const before = state.hand.length;

    pushDraw(state, rng);

    expect(state.push!.drawn).toBe(1);
    expect(state.hand.length).toBeGreaterThanOrEqual(before);
  });

  it('저주가 겹치면 강제로 중단된다', () => {
    const { state, rng } = openPush('stop');
    state.hand = [curse('erode')];
    state.deck = [curse('erode'), plain(), plain()];

    pushDraw(state, rng);

    expect(state.push!.stopped).toBe(true);
    expect(state.triggers.erode).toBe(1);
  });

  it('멈추면 선택 루프로 돌아간다', () => {
    const { state, rng } = openPush('resume');
    pushDraw(state, rng);
    const step = state.step;

    pushStop(state, rng);

    expect(state.push).toBeNull();
    expect(state.current).not.toBeNull();
    expect(state.step).toBe(step + 1);
  });

  it('저주 1장을 들고 더 뽑은 횟수와 겹친 횟수를 센다', () => {
    const { state, rng } = openPush('risky');
    state.hand = [curse('erode')];
    state.deck = [curse('erode')];

    pushDraw(state, rng);

    expect(state.riskyDraws.taken).toBe(1);
    expect(state.riskyDraws.paired).toBe(1);
  });
});

describe('기록', () => {
  it('사망 원인이 남는다', () => {
    const rng = new Rng('cause');
    const state = createGame(rng);
    state.hand = [curse('doom'), curse('doom')];
    state.current = EVENTS.find((e) => e.id === 'twins')!;

    choose(state, 'blue', rng);

    expect(state.dead).toBe(true);
    expect(state.causeOfDeath).toContain('파멸');
  });

  it('손패 크기와 저주 발동 횟수가 쌓인다', () => {
    const rng = new Rng('stats');
    const state = createGame(rng);

    for (let i = 0; i < 12 && !state.dead && !state.escaped; i++) {
      if (state.push) {
        pushStop(state, rng);
        continue;
      }
      choose(state, i % 2 ? 'red' : 'blue', rng);
    }

    expect(state.handSizes.length).toBeGreaterThan(0);
    expect(Object.values(state.triggers).every((n) => n >= 0)).toBe(true);
  });
});

describe('선택지 배합', () => {
  it('뽑기형과 손패 정리형이 각각 3개 이상 있다', () => {
    const counts: Partial<Record<OptionKind, number>> = {};
    for (const e of EVENTS) {
      counts[e.red.kind] = (counts[e.red.kind] ?? 0) + 1;
      counts[e.blue.kind] = (counts[e.blue.kind] ?? 0) + 1;
    }
    expect(counts.draw ?? 0).toBeGreaterThanOrEqual(3);
    expect(counts.purge ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('손패를 건드리는 선택지는 readsHand로 표시돼 있다', () => {
    const touchesHand = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          f.type === 'drawHand' ||
          f.type === 'pushLuck' ||
          f.type === 'peek' ||
          f.type === 'discardCurse' ||
          f.type === 'mulligan' ||
          f.type === 'healPerHandCard' ||
          f.type === 'ifHand' ||
          (f.type === 'ifThen' && (touchesHand(f.then) || touchesHand(f.otherwise))),
      );

    for (const e of EVENTS) {
      if (touchesHand(e.red.effects) || touchesHand(e.blue.effects)) {
        expect(e.readsHand, e.id).toBe(true);
      }
    }
  });
});
