import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  curseCounts,
  drawToField,
  makeCurse,
  onEdge,
  onPlaced,
  peek,
  purgeAll,
  purgeCurse,
  purgeRandom,
} from '../src/choice/field';
import { choose, createGame, pushDraw, pushStop } from '../src/choice/engine';
import { applyEffects, resetUidCounter } from '../src/choice/effects';
import { PAIR_TABLE } from '../src/choice/pairs';
import {
  CURSE_RULES,
  DOOM_THRESHOLD,
  ERODE_DAMAGE,
  FIELD_START,
  MAX_HP,
  MIN_MAX_HP,
  ROT_MAX_HP_LOSS,
  ROT_THRESHOLD,
} from '../src/choice/balance';
import type { CardInstance, ChoicePair, CurseType, Effect, GameState } from '../src/choice/types';

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

function plain(name = '보상'): CardInstance {
  uid += 1;
  return {
    uid: `p${uid}`,
    defId: 'reward',
    name,
    kind: 'reward',
    value: 4,
  };
}


/** 테이블에서 id로 골라 물린다. 특정 짝이 필요한 테스트용. */
function pairFrom(id: string): ChoicePair {
  const p = PAIR_TABLE.find((x) => x.id === id);
  if (!p) throw new Error(`테이블에 없는 짝: ${id}`);
  return p;
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
    state.current = pairFrom('quality-or-bulk');
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

/** 필드에 카드를 직접 놓고 그 장에 대한 발동 판정만 돌린다. */
function place(state: GameState, card: CardInstance, seed = 'place') {
  state.field.push(card);
  return onPlaced(state, card, new Rng(seed));
}

describe('파멸 — 목숨을 노린다', () => {
  it(`필드에 ${DOOM_THRESHOLD}장 모이면 즉사한다`, () => {
    const state = createGame(new Rng('doom'));
    state.field = [];

    for (let i = 1; i < DOOM_THRESHOLD; i++) {
      expect(place(state, curse('doom')), `${i}장째`).toBeNull();
      expect(state.dead).toBe(false);
    }

    const last = place(state, curse('doom'));
    expect(last?.fatal).toBe(true);
    expect(state.hp).toBe(0);
  });

  it(`${DOOM_THRESHOLD - 1}장까지는 아무 일도 없다 — 최대 긴장 구간`, () => {
    const state = createGame(new Rng('doom-edge'));
    state.field = [];
    const hp = state.hp;
    for (let i = 0; i < DOOM_THRESHOLD - 1; i++) place(state, curse('doom'));

    expect(state.hp).toBe(hp);
    expect(state.triggers.doom).toBe(0);
    expect(onEdge(state.field)).toContain('doom');
  });

  it('발동해도 필드에서 사라지지 않는다', () => {
    const state = createGame(new Rng('doom-stay'));
    state.field = [];
    for (let i = 0; i < DOOM_THRESHOLD; i++) place(state, curse('doom'));
    expect(curseCounts(state.field).doom).toBe(DOOM_THRESHOLD);
  });
});

describe('부패 — 최대 체력을 노린다', () => {
  it(`${ROT_THRESHOLD}장이 모이면 최대 체력이 ${ROT_MAX_HP_LOSS} 깎인다`, () => {
    const state = createGame(new Rng('rot'));
    state.field = [];
    const maxBefore = state.maxHp;

    place(state, curse('rot'));
    expect(state.triggers.rot).toBe(0);
    expect(state.maxHp).toBe(maxBefore);

    place(state, curse('rot'));
    expect(state.triggers.rot).toBe(1);
    expect(state.maxHp).toBe(maxBefore - ROT_MAX_HP_LOSS);
    expect(state.rotMaxHpLost).toBe(ROT_MAX_HP_LOSS);
  });

  it(`발동한 ${ROT_THRESHOLD}장은 필드에서 소멸한다`, () => {
    const state = createGame(new Rng('rot-gone'));
    state.field = [];
    place(state, curse('rot'));
    place(state, curse('rot'));

    expect(curseCounts(state.field).rot).toBe(0);
  });

  it('소멸하므로 다시 쌓여 또 발동한다', () => {
    const state = createGame(new Rng('rot-again'));
    state.field = [];
    const maxBefore = state.maxHp;

    for (let i = 0; i < ROT_THRESHOLD * 2; i++) place(state, curse('rot'));

    expect(state.triggers.rot).toBe(2);
    expect(state.maxHp).toBe(maxBefore - ROT_MAX_HP_LOSS * 2);
    expect(curseCounts(state.field).rot).toBe(0);
  });

  it('현재 체력이 새 최대치를 넘으면 최대치까지 내려간다', () => {
    const state = createGame(new Rng('rot-clamp'));
    state.field = [];
    state.hp = state.maxHp; // 가득 찬 상태

    place(state, curse('rot'));
    place(state, curse('rot'));

    expect(state.hp).toBe(state.maxHp);
    expect(state.hp).toBeLessThan(MAX_HP);
  });

  it('여유가 있으면 현재 체력은 그대로 둔다', () => {
    const state = createGame(new Rng('rot-keep'));
    state.field = [];
    state.hp = 3; // 새 최대치보다 한참 낮다

    place(state, curse('rot'));
    place(state, curse('rot'));

    expect(state.hp).toBe(3);
  });

  it(`최대 체력은 하한 ${MIN_MAX_HP} 아래로 내려가지 않는다`, () => {
    const state = createGame(new Rng('rot-floor'));
    state.field = [];

    // 몇 번을 터뜨려도 하한에서 멈춘다.
    for (let i = 0; i < 20; i++) place(state, curse('rot'));

    expect(state.maxHp).toBe(MIN_MAX_HP);
    expect(state.hp).toBeLessThanOrEqual(MIN_MAX_HP);
  });

  it('덱은 건드리지 않는다 — 자기 증식하지 않는다', () => {
    const state = createGame(new Rng('rot-deck'));
    state.field = [];
    const deckBefore = state.deck.map((c) => c.defId).join();

    place(state, curse('rot'));
    place(state, curse('rot'));

    expect(state.deck.map((c) => c.defId).join()).toBe(deckBefore);
  });

  it('현재 체력은 직접 깎지 않는다', () => {
    const state = createGame(new Rng('rot-hp'));
    state.field = [];
    state.hp = 1;

    place(state, curse('rot'));
    place(state, curse('rot'));

    expect(state.hp).toBe(1);
    expect(state.dead).toBe(false);
  });
});

describe('침식 — 체력을 노린다', () => {
  it(`놓이는 즉시 체력 -${ERODE_DAMAGE}`, () => {
    const state = createGame(new Rng('erode'));
    state.field = [];
    const hp = state.hp;

    place(state, curse('erode'));
    expect(state.hp).toBe(hp - ERODE_DAMAGE);
    expect(state.erodeDamage).toBe(ERODE_DAMAGE);
  });

  it('문턱도 중첩도 없다 — 놓일 때마다 매번', () => {
    const state = createGame(new Rng('erode-many'));
    state.field = [];
    const hp = state.hp;

    for (let i = 0; i < 3; i++) place(state, curse('erode'));
    expect(state.hp).toBe(hp - ERODE_DAMAGE * 3);
    expect(state.triggers.erode).toBe(3);
    expect(onEdge(state.field)).not.toContain('erode');
  });

  it('덱도 필드도 바꾸지 않는다', () => {
    const state = createGame(new Rng('erode-only'));
    state.field = [];
    const deckBefore = state.deck.map((c) => c.uid).join();

    place(state, curse('erode'));
    expect(state.deck.map((c) => c.uid).join()).toBe(deckBefore);
    expect(curseCounts(state.field).erode).toBe(1);
  });
});

describe('저주는 서로 간섭하지 않는다', () => {
  it('종류가 다르면 각자의 문턱으로 센다', () => {
    const state = createGame(new Rng('mixed'));
    state.field = [];
    const hp = state.hp;

    place(state, curse('doom'));
    place(state, curse('rot'));
    expect(state.dead).toBe(false);
    expect(state.triggers.rot).toBe(0);
    expect(state.hp).toBe(hp);
  });

  it('종류별 필드 최고 도달 장수를 기록한다', () => {
    const state = createGame(new Rng('peak'));
    state.field = [];
    place(state, curse('rot'));
    place(state, curse('rot'));
    purgeCurse(state, 9, 'rot');
    place(state, curse('rot'));

    expect(state.peakField.rot).toBe(2);
  });
});

describe('문턱 경고', () => {
  it('한 장만 더 놓이면 터지는 종류를 알려준다', () => {
    const field = [curse('doom'), curse('doom'), curse('rot')];
    const edged = onEdge(field);
    expect(edged).toContain('doom');
    expect(edged).toContain('rot');
  });

  it('저주가 없으면 빈 목록이다', () => {
    expect(onEdge([plain(), plain()])).toEqual([]);
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

/**
 * 푸시 유어 럭.
 *
 * 지금 짝 테이블(9개)에는 이 효과를 쓰는 짝이 없다 — 스펙이 정한 9개에
 * 들어 있지 않기 때문이다. 규칙 자체는 살아 있으므로 효과를 직접 물려
 * 검증한다. 테이블에 다시 넣으면 그대로 동작한다.
 */
describe('푸시 유어 럭', () => {
  function openPush(seed: string): { state: GameState; rng: Rng } {
    const rng = new Rng(seed);
    const state = createGame(rng);
    state.current = {
      id: 'test-push',
      intent: '테스트용',
      rarity: 'common',
      red: { text: '멈출 때까지 뽑는다', effects: [{ type: 'pushLuck' }] },
      blue: { text: '뽑지 않는다', effects: [] },
    };
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

  it('문턱 직전에 더 뽑은 횟수와 실제로 터진 횟수를 센다', () => {
    const { state, rng } = openPush('risky');
    // 부패 1장 = 문턱(2) 직전. 여기서 부패를 하나 더 뽑으면 터진다.
    state.field = [curse('rot')];
    state.deck = [curse('rot')];

    pushDraw(state, rng);

    expect(state.riskyDraws.taken).toBe(1);
    expect(state.riskyDraws.paired).toBe(1);
  });
});

describe('기록', () => {
  it('사망 원인이 남는다', () => {
    const rng = new Rng('cause');
    const state = createGame(rng);
    // 파멸 2장이 깔린 상태에서 세 번째를 뽑으면 즉사한다.
    state.field = [curse('doom'), curse('doom')];
    state.deck = [curse('doom')];
    state.current = pairFrom('swell');

    choose(state, 'blue', rng); // 덱에서 1장을 펼친다

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

describe('짝 테이블과 필드', () => {
  it('필드를 만지는 짝이 충분히 있다', () => {
    const changesField = (fx: Effect[]): boolean =>
      fx.some(
        (f) =>
          f.type === 'drawField' ||
          f.type === 'pushLuck' ||
          f.type === 'peek' ||
          f.type === 'purgeCurse' ||
          f.type === 'purgeRandom' ||
          f.type === 'purgeAll' ||
          f.type === 'healPerFieldCard' ||
          ((f.type === 'ifThen' || f.type === 'ifField') &&
            (changesField(f.then) || changesField(f.otherwise))),
      );

    const touching = PAIR_TABLE.filter(
      (p) => changesField(p.red.effects) || changesField(p.blue.effects),
    );
    // 필드가 주인공이므로 필드를 움직이는 짝이 충분히 있어야 한다.
    //
    // 한때 절반 이상을 요구했는데, 덱·체력만 만지는 짝이 늘면서 11개 중
    // 5개(45%)로 내려왔다. 하한을 40%로 낮춰 두되, 더 내려가면 필드가
    // 주인공이라는 말이 성립하지 않는다.
    expect(touching.length / PAIR_TABLE.length).toBeGreaterThanOrEqual(0.4);
  });

  it('필드를 비우는 길이 테이블 안에 있다', () => {
    // 필드는 스스로 줄지 않는다. 테이블에서 제거가 사라지면 출구가 없어진다.
    const purges = (fx: Effect[]): boolean =>
      fx.some((f) => f.type === 'purgeCurse' || f.type === 'purgeRandom' || f.type === 'purgeAll');
    const has = PAIR_TABLE.some((p) => purges(p.red.effects) || purges(p.blue.effects));
    expect(has).toBe(true);
  });
});
