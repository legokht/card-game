import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  applyRotDrain,
  curseCounts,
  drawToField,
  makeCurse,
  onEdge,
  peek,
  purgeAll,
  purgeCurse,
  purgeRandom,
  resolvePairs,
} from '../src/choice/field';
import { choose, createGame, pushDraw, pushStop } from '../src/choice/engine';
import { applyEffects, countKind, resetUidCounter } from '../src/choice/effects';
import { EVENTS } from '../src/choice/events';
import {
  CURSE_RULES,
  ERODE_CONVERT,
  FIELD_START,
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
  };
}

describe('시작 필드', () => {
  it('필드는 비어서 시작한다 — 오직 선택지로만 채워진다', () => {
    const state = createGame(new Rng('start'));
    expect(state.field).toHaveLength(FIELD_START);
    expect(state.field).toHaveLength(0);
  });

  it('필드는 선택을 넘어가도 유지된다', () => {
    const rng = new Rng('persist');
    const state = createGame(rng);
    drawToField(state, 3, rng);
    const before = state.field.map((c) => c.uid);
    expect(before.length).toBeGreaterThan(0);

    // 필드를 건드리지 않는 선택지를 골라 유지되는지 본다.
    state.current = EVENTS.find((e) => e.id === 'debt')!;
    choose(state, 'blue', rng);

    for (const id of before) expect(state.field.some((c) => c.uid === id)).toBe(true);
  });

  it('카드는 덱에서 필드로만 흐르고 되돌아가지 않는다', () => {
    const rng = new Rng('one-way');
    const state = createGame(rng);
    const deckBefore = state.deck.length;

    drawToField(state, 4, rng);

    expect(state.deck).toHaveLength(deckBefore - 4);
    expect(state.field).toHaveLength(4);
    // 총량은 보존된다 — 사라지지도 늘어나지도 않는다.
    expect(state.deck.length + state.field.length).toBe(deckBefore);
  });

  it('덱이 바닥나면 더 뽑지 못하고 로그에 남는다', () => {
    const rng = new Rng('empty-deck');
    const state = createGame(rng);
    const total = state.deck.length;

    drawToField(state, total + 5, rng);

    expect(state.deck).toHaveLength(0);
    expect(state.field.length).toBeLessThanOrEqual(total);
  });
});

describe('저주 겹침', () => {
  it('같은 종류가 2장 모이면 발동하고 필드에서 빠진다', () => {
    const state = createGame(new Rng('pair'));
    state.field = [plain(), curse('erode'), curse('erode')];

    const results = resolvePairs(state, new Rng('pair'));

    expect(results).toHaveLength(1);
    expect(results[0]!.type).toBe('erode');
    expect(countKind(state.field, 'curse')).toBeLessThan(2);
    expect(state.triggers.erode).toBe(1);
  });

  it('종류가 다르면 2장이어도 발동하지 않는다', () => {
    const state = createGame(new Rng('mixed'));
    state.field = [curse('rot'), curse('erode')];

    const results = resolvePairs(state, new Rng('mixed'));

    expect(results).toHaveLength(0);
    expect(state.field).toHaveLength(2);
  });

  it('파멸이 겹치면 즉사한다', () => {
    const state = createGame(new Rng('doom'));
    state.field = [curse('doom'), curse('doom')];

    const results = resolvePairs(state, new Rng('doom'));

    expect(results[0]!.fatal).toBe(true);
    expect(state.hp).toBe(0);
    expect(state.triggers.doom).toBe(1);
  });

  it('부패가 겹치면 크게 터진다', () => {
    const state = createGame(new Rng('rot'));
    state.field = [curse('rot'), curse('rot')];
    const hp = state.hp;

    resolvePairs(state, new Rng('rot'));

    expect(state.hp).toBe(hp - ROT_BURST);
  });

  it('침식이 겹치면 필드의 멀쩡한 카드가 저주로 바뀐다', () => {
    const state = createGame(new Rng('erode'));
    state.field = [curse('erode'), curse('erode'), plain(), plain(), plain()];

    resolvePairs(state, new Rng('erode'));

    // 침식 2장은 빠지고, 남은 멀쩡한 카드 중 일부가 저주가 된다.
    expect(state.field).toHaveLength(3);
    expect(countKind(state.field, 'curse')).toBe(ERODE_CONVERT);
  });

  it('발동한 저주는 덱으로 돌아가지 않고 소멸한다', () => {
    for (const type of ['erode', 'rot'] as const) {
      resetUidCounter();
      const state = createGame(new Rng(`gone-${type}`));
      state.deck = [];
      state.field = [curse(type), curse(type), plain()];

      const originals = state.field.filter((c) => c.curseType === type).map((c) => c.uid);
      resolvePairs(state, new Rng(`gone-${type}`));

      // 필드는 한 방향이다. 벗어난 카드는 어디로도 돌아가지 않는다.
      expect(state.deck).toHaveLength(0);
      // 겹친 그 2장은 사라진다. (침식은 그 자리에 새 저주를 만들 수 있으므로
      // 종류가 아니라 원래 카드의 uid로 확인한다.)
      for (const uid of originals) expect(state.field.some((c) => c.uid === uid)).toBe(false);
    }
  });

  it('여러 종류가 동시에 겹쳐도 전부 처리된다', () => {
    const state = createGame(new Rng('multi'));
    state.field = [curse('rot'), curse('rot'), curse('erode'), curse('erode'), plain()];

    const results = resolvePairs(state, new Rng('multi'));

    expect(results.map((r) => r.type).sort()).toEqual(['erode', 'rot']);
  });
});

describe('저주 1장 — 가장 긴장되는 상태', () => {
  it('정확히 1장 있는 종류를 알려준다', () => {
    const state = createGame(new Rng('edge'));
    state.field = [curse('doom'), curse('rot'), curse('rot'), plain()];

    // 파멸은 1장(위험), 부패는 2장이라 이미 겹친 상태다.
    expect(onEdge(state.field)).toEqual(['doom']);
  });

  it('저주가 없으면 빈 목록이다', () => {
    const state = createGame(new Rng('clean'));
    state.field = [plain(), plain()];
    expect(onEdge(state.field)).toEqual([]);
  });
});

describe('부패의 지속 피해', () => {
  it('필드에 있는 동안 매 선택마다 갉아먹는다', () => {
    const state = createGame(new Rng('drain'));
    state.field = [curse('rot'), plain()];
    const hp = state.hp;

    applyRotDrain(state);

    expect(state.hp).toBe(hp - ROT_DRAIN);
  });

  it('장수에 비례한다', () => {
    const state = createGame(new Rng('drain2'));
    // 겹치지 않게 필드에 직접 세 장을 두고 지속 피해만 본다.
    state.field = [curse('rot'), curse('rot'), curse('rot')];
    const hp = state.hp;

    applyRotDrain(state);

    expect(state.hp).toBe(hp - 3 * ROT_DRAIN);
  });

  it('선택할 때마다 실제로 적용된다', () => {
    const rng = new Rng('drain-loop');
    const state = createGame(rng);
    state.field = [curse('rot')];
    state.current = EVENTS.find((e) => e.id === 'debt')!;
    const hp = state.hp;

    choose(state, 'blue', rng);

    expect(state.hp).toBeLessThan(hp);
  });
});

describe('필드 조작', () => {
  it('뽑으면 덱에서 필드로 옮겨진다', () => {
    const state = createGame(new Rng('draw'));
    const deckBefore = state.deck.length;

    drawToField(state, 2, new Rng('draw'));

    expect(state.deck).toHaveLength(deckBefore - 2);
    expect(state.field).toHaveLength(2);
  });

  it('덱이 비면 더 뽑지 않는다', () => {
    const state = createGame(new Rng('dry'));
    state.deck = [];
    const fieldBefore = state.field.length;

    const lines = drawToField(state, 3, new Rng('dry'));

    expect(state.field).toHaveLength(fieldBefore);
    expect(lines.join()).toContain('덱이 비어');
  });

  it('저주를 버리면 필드에서 사라진다', () => {
    const state = createGame(new Rng('discard'));
    state.field = [curse('rot'), curse('erode'), plain()];

    purgeCurse(state, 1, 'rot');

    expect(state.field.filter((c) => c.curseType === 'rot')).toHaveLength(0);
    expect(state.field).toHaveLength(2);
  });

  it('없앨 저주가 없으면 그냥 넘어간다', () => {
    const state = createGame(new Rng('none'));
    state.field = [plain()];

    const lines = purgeCurse(state, 2);

    expect(lines.join()).toContain('없었다');
    expect(state.field).toHaveLength(1);
  });

  it('무작위 제거는 저주든 아니든 가리지 않는다', () => {
    const state = createGame(new Rng('rand'));
    state.field = [curse('rot'), plain(), plain(), plain()];

    purgeRandom(state, 2, new Rng('rand'));

    expect(state.field).toHaveLength(2);
  });

  it('전체 정리는 필드를 통째로 비운다 — 보상까지', () => {
    const state = createGame(new Rng('all'));
    state.field = [curse('rot'), plain(), plain()];
    const deckBefore = state.deck.length;

    const lines = purgeAll(state);

    expect(state.field).toHaveLength(0);
    // 덱으로 돌아가지 않는다.
    expect(state.deck).toHaveLength(deckBefore);
    expect(lines.join()).toContain('쓸어냈다');
  });

  it('엿보기는 본 것 중 일부만 가져온다', () => {
    const state = createGame(new Rng('peek'));
    const fieldBefore = state.field.length;

    peek(state, 3, 1, new Rng('peek'));

    expect(state.field).toHaveLength(fieldBefore + 1);
  });
});

describe('파멸은 덱에 아주 적게만 존재한다', () => {
  it('덱 상한을 넘겨 만들어지지 않는다', () => {
    const state = createGame(new Rng('cap'));
    const rng = new Rng('cap');

    for (let i = 0; i < 60; i++) state.deck.push(makeCurse(state, rng));

    const doom = curseCounts([...state.deck, ...state.field]).doom;
    expect(doom).toBeLessThanOrEqual(CURSE_RULES.doom.deckMax);
  });

  it('선택지로 저주를 받아도 상한이 지켜진다', () => {
    const state = createGame(new Rng('cap2'));
    const rng = new Rng('cap2');
    const add: Effect[] = [{ type: 'addRandom', kind: 'curse', count: 40 }];

    applyEffects(state, add, rng);

    expect(curseCounts([...state.deck, ...state.field]).doom).toBeLessThanOrEqual(
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

  it('한 장씩 뽑히고 필드가 늘어난다', () => {
    const { state, rng } = openPush('one');
    const before = state.field.length;

    pushDraw(state, rng);

    expect(state.push!.drawn).toBe(1);
    expect(state.field.length).toBeGreaterThanOrEqual(before);
  });

  it('저주가 겹치면 강제로 중단된다', () => {
    const { state, rng } = openPush('stop');
    state.field = [curse('erode')];
    // 덱에 침식만 두어 무엇을 뽑든 겹치게 한다.
    state.deck = [curse('erode')];

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
    state.field = [curse('erode')];
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
    state.field = [curse('doom'), curse('doom')];
    state.current = EVENTS.find((e) => e.id === 'debt')!;

    choose(state, 'blue', rng);

    expect(state.dead).toBe(true);
    expect(state.causeOfDeath).toContain('파멸');
  });

  it('필드 크기와 저주 발동 횟수가 쌓인다', () => {
    const rng = new Rng('stats');
    const state = createGame(rng);

    for (let i = 0; i < 12 && !state.dead && !state.escaped; i++) {
      if (state.push) {
        pushStop(state, rng);
        continue;
      }
      choose(state, i % 2 ? 'red' : 'blue', rng);
    }

    expect(state.fieldSizes.length).toBeGreaterThan(0);
    expect(Object.values(state.triggers).every((n) => n >= 0)).toBe(true);
  });
});

describe('선택지 배합', () => {
  it('뽑기형과 제거형이 각각 4개 이상 있다', () => {
    const counts: Partial<Record<OptionKind, number>> = {};
    for (const e of EVENTS) {
      counts[e.red.kind] = (counts[e.red.kind] ?? 0) + 1;
      counts[e.blue.kind] = (counts[e.blue.kind] ?? 0) + 1;
    }
    expect(counts.draw ?? 0).toBeGreaterThanOrEqual(4);
    expect(counts.purge ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('필드를 건드리는 선택지는 readsField로 표시돼 있다', () => {
    const touchesField = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          f.type === 'drawField' ||
          f.type === 'pushLuck' ||
          f.type === 'peek' ||
          f.type === 'purgeCurse' ||
          f.type === 'purgeRandom' ||
          f.type === 'purgeAll' ||
          f.type === 'healPerFieldCard' ||
          f.type === 'ifField' ||
          (f.type === 'ifThen' && (touchesField(f.then) || touchesField(f.otherwise))),
      );

    for (const e of EVENTS) {
      if (touchesField(e.red.effects) || touchesField(e.blue.effects)) {
        expect(e.readsField, e.id).toBe(true);
      }
    }
  });
});
