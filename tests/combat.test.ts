import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import { canPlayCard, createCombat, endTurn, playCard, resetUidCounter } from '../src/engine/combat';
import type { CardDef, CombatConfig, CombatState } from '../src/engine/types';

const wall: CardDef = { id: 'wall', name: '벽', cost: 1, attack: 0, health: 5 };
const hitter: CardDef = { id: 'hitter', name: '타격병', cost: 2, attack: 3, health: 3 };
const rat: CardDef = { id: 'rat', name: '쥐', cost: 0, attack: 1, health: 1 };
const brute: CardDef = { id: 'brute', name: '거구', cost: 0, attack: 4, health: 6 };

function config(over: Partial<CombatConfig> = {}): CombatConfig {
  return {
    laneCount: 2,
    playerMaxHp: 20,
    maxEnergy: 3,
    startingHandSize: 2,
    playerDeck: [wall, wall, hitter, hitter],
    monsterDeck: [rat, rat],
    ...over,
  };
}

/** 레인 배치가 무작위이므로, 적이 있는 레인을 찾아 그 앞에 배치한다. */
function laneWithEnemy(state: CombatState): number {
  const i = state.lanes.findIndex((l) => l.enemy !== null);
  if (i < 0) throw new Error('필드에 적이 없다');
  return i;
}

function laneWithTelegraph(state: CombatState): number {
  const i = state.lanes.findIndex((l) => l.telegraph !== null);
  if (i < 0) throw new Error('예고된 적이 없다');
  return i;
}

function handCard(state: CombatState, name: string): string {
  const card = state.hand.find((c) => c.name === name);
  if (!card) throw new Error(`손패에 ${name}이(가) 없다: ${state.hand.map((c) => c.name)}`);
  return card.uid;
}

beforeEach(() => {
  resetUidCounter();
});

describe('createCombat', () => {
  it('시작 손패를 뽑고 예고를 한 장 깔아둔다', () => {
    const state = createCombat(config(), new Rng('start'));

    expect(state.turn).toBe(1);
    expect(state.outcome).toBe('ongoing');
    expect(state.hand).toHaveLength(2);
    expect(state.drawPile).toHaveLength(2);
    expect(state.lanes.filter((l) => l.telegraph !== null)).toHaveLength(1);
    // 예고된 적은 아직 내려오지 않았다.
    expect(state.lanes.every((l) => l.enemy === null)).toBe(true);
    expect(state.monsterPile).toHaveLength(1);
  });

  it('에너지와 HP가 최대치로 시작한다', () => {
    const state = createCombat(config(), new Rng('start'));
    expect(state.energy).toBe(3);
    expect(state.playerHp).toBe(20);
  });

  it('같은 시드는 같은 초기 상태를 만든다', () => {
    resetUidCounter();
    const a = createCombat(config(), new Rng('same'));
    resetUidCounter();
    const b = createCombat(config(), new Rng('same'));
    expect(a).toEqual(b);
  });
});

describe('playCard', () => {
  it('배치하면 에너지가 줄고 손패에서 빠져 레인에 선다', () => {
    const state = createCombat(config(), new Rng('play'));
    const uid = state.hand[0]!.uid;
    const cost = state.hand[0]!.cost;

    playCard(state, uid, 0);

    expect(state.energy).toBe(3 - cost);
    expect(state.hand.find((c) => c.uid === uid)).toBeUndefined();
    expect(state.lanes[0]!.player?.uid).toBe(uid);
  });

  it('이미 유닛이 있는 칸에는 배치할 수 없다', () => {
    const state = createCombat(config({ startingHandSize: 2 }), new Rng('occupied'));
    playCard(state, state.hand[0]!.uid, 0);

    const check = canPlayCard(state, state.hand[0]!.uid, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('이미 유닛이 있는');
    expect(() => playCard(state, state.hand[0]!.uid, 0)).toThrow();
  });

  it('에너지가 부족하면 배치할 수 없다', () => {
    const state = createCombat(
      config({ maxEnergy: 1, startingHandSize: 4, playerDeck: [hitter, hitter, hitter, hitter] }),
      new Rng('energy'),
    );

    const check = canPlayCard(state, state.hand[0]!.uid, 0);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('에너지가 부족');
  });

  it('없는 레인이나 손패에 없는 카드는 거부한다', () => {
    const state = createCombat(config(), new Rng('invalid'));
    expect(canPlayCard(state, state.hand[0]!.uid, 99).ok).toBe(false);
    expect(canPlayCard(state, 'no-such-uid', 0).ok).toBe(false);
  });

  it('에너지 한도 안에서는 한 턴에 여러 장 배치할 수 있다', () => {
    const state = createCombat(
      config({ startingHandSize: 3, playerDeck: [wall, wall, wall, wall] }),
      new Rng('multi'),
    );

    playCard(state, state.hand[0]!.uid, 0);
    playCard(state, state.hand[0]!.uid, 1);

    expect(state.energy).toBe(1);
    expect(state.lanes[0]!.player).not.toBeNull();
    expect(state.lanes[1]!.player).not.toBeNull();
  });
});

describe('턴 흐름', () => {
  it('예고된 적은 교전 후에 내려온다', () => {
    const state = createCombat(config(), new Rng('descend'));
    const lane = laneWithTelegraph(state);

    endTurn(state, new Rng('descend'));

    expect(state.lanes[lane]!.telegraph).toBeNull();
    expect(state.lanes[lane]!.enemy?.name).toBe('쥐');
    expect(state.turn).toBe(2);
  });

  it('내려온 적은 다음 턴 종료 시에 공격한다', () => {
    const state = createCombat(config(), new Rng('attack'));
    const rng = new Rng('attack');

    // 1턴 종료: 적이 내려오기만 하고 아직 때리지 않는다.
    endTurn(state, rng);
    expect(state.playerHp).toBe(20);

    // 2턴 종료: 막지 않았으므로 관통 피해.
    endTurn(state, rng);
    expect(state.playerHp).toBe(19);
  });

  it('다음 턴이 시작되면 에너지가 리셋되고 한 장 드로우한다', () => {
    const state = createCombat(config(), new Rng('upkeep'));
    playCard(state, state.hand[0]!.uid, 0);
    const handBefore = state.hand.length;

    endTurn(state, new Rng('upkeep'));

    expect(state.energy).toBe(3);
    expect(state.hand).toHaveLength(handBefore + 1);
  });

  it('안 낸 카드는 손패에 누적된다', () => {
    const state = createCombat(config(), new Rng('accumulate'));
    const kept = state.hand.map((c) => c.uid);

    endTurn(state, new Rng('accumulate'));

    for (const uid of kept) {
      expect(state.hand.some((c) => c.uid === uid)).toBe(true);
    }
  });

  it('덱이 비면 드로우 없이 턴이 진행된다', () => {
    const state = createCombat(
      config({ playerDeck: [wall], startingHandSize: 1, monsterDeck: [rat, rat, rat, rat] }),
      new Rng('empty-deck'),
    );
    expect(state.drawPile).toHaveLength(0);

    endTurn(state, new Rng('empty-deck'));

    expect(state.hand).toHaveLength(1);
    expect(state.log.some((l) => l.includes('덱이 비었다'))).toBe(true);
  });
});

describe('교전', () => {
  it('막은 레인은 서로 피해를 주고받는다', () => {
    const state = createCombat(
      config({ playerDeck: [wall, wall, wall, wall], monsterDeck: [rat] }),
      new Rng('block'),
    );
    const rng = new Rng('block');

    endTurn(state, rng); // 쥐가 내려온다
    const lane = laneWithEnemy(state);
    playCard(state, handCard(state, '벽'), lane);

    endTurn(state, rng);

    // 벽(0/5)이 쥐(1/1)를 막았다: 쥐는 0딜을 받아 살고, 벽은 1딜을 받는다.
    expect(state.lanes[lane]!.player!.health).toBe(4);
    expect(state.lanes[lane]!.enemy!.health).toBe(1);
    expect(state.playerHp).toBe(20);
  });

  it('공격력이 충분하면 적을 격파한다', () => {
    const state = createCombat(
      config({ playerDeck: [hitter, hitter, hitter, hitter], monsterDeck: [rat] }),
      new Rng('kill'),
    );
    const rng = new Rng('kill');

    endTurn(state, rng);
    const lane = laneWithEnemy(state);
    playCard(state, handCard(state, '타격병'), lane);

    endTurn(state, rng);

    expect(state.lanes[lane]!.enemy).toBeNull();
    expect(state.lanes[lane]!.player!.health).toBe(2); // 쥐에게 1 맞음
  });

  it('동시 공격이므로 죽는 유닛도 반격은 한다', () => {
    const state = createCombat(
      config({
        playerDeck: [hitter, hitter, hitter, hitter],
        monsterDeck: [brute],
        maxEnergy: 3,
      }),
      new Rng('trade'),
    );
    const rng = new Rng('trade');

    endTurn(state, rng);
    const lane = laneWithEnemy(state);
    playCard(state, handCard(state, '타격병'), lane);

    endTurn(state, rng);

    // 거구(4/6)와 타격병(3/3)이 맞교환: 타격병은 죽지만 3딜은 들어간다.
    expect(state.lanes[lane]!.player).toBeNull();
    expect(state.lanes[lane]!.enemy!.health).toBe(3);
    expect(state.playerHp).toBe(20); // 막았으므로 관통 없음
  });

  it('막지 못한 레인만 플레이어 HP를 깎는다', () => {
    const state = createCombat(
      config({
        laneCount: 2,
        playerDeck: [wall, wall, wall, wall],
        monsterDeck: [brute, brute],
        startingHandSize: 2,
      }),
      new Rng('leak'),
    );
    const rng = new Rng('leak');

    endTurn(state, rng); // 한 마리 내려옴, 다른 레인에 예고
    endTurn(state, rng); // 첫 마리 공격(막지 않음), 두 번째 내려옴

    expect(state.playerHp).toBe(16); // 거구 1마리분 4딜만
  });
});

describe('승패 판정', () => {
  it('몬스터 덱이 소진되고 필드가 정리되면 승리한다', () => {
    const state = createCombat(
      config({ playerDeck: [hitter, hitter, hitter, hitter], monsterDeck: [rat] }),
      new Rng('win'),
    );
    const rng = new Rng('win');

    endTurn(state, rng);
    playCard(state, handCard(state, '타격병'), laneWithEnemy(state));
    endTurn(state, rng);

    expect(state.outcome).toBe('victory');
    expect(state.log.some((l) => l.includes('승리'))).toBe(true);
  });

  it('적이 남아 있으면 덱이 비어도 승리가 아니다', () => {
    const state = createCombat(
      config({ playerDeck: [wall, wall, wall, wall], monsterDeck: [rat] }),
      new Rng('not-yet'),
    );
    const rng = new Rng('not-yet');

    endTurn(state, rng);
    playCard(state, handCard(state, '벽'), laneWithEnemy(state));
    endTurn(state, rng);

    // 벽은 공격력 0이라 쥐를 못 죽인다.
    expect(state.monsterPile).toHaveLength(0);
    expect(state.outcome).toBe('ongoing');
  });

  it('HP가 0이 되면 패배한다', () => {
    const state = createCombat(
      config({
        playerMaxHp: 4,
        playerDeck: [wall, wall, wall, wall],
        monsterDeck: [brute, brute, brute],
        laneCount: 3,
      }),
      new Rng('lose'),
    );
    const rng = new Rng('lose');

    endTurn(state, rng);
    endTurn(state, rng); // 거구 한 마리가 4딜

    expect(state.playerHp).toBe(0);
    expect(state.outcome).toBe('defeat');
  });

  it('전투가 끝나면 더 이상 진행되지 않는다', () => {
    const state = createCombat(
      config({ playerDeck: [hitter, hitter, hitter, hitter], monsterDeck: [rat] }),
      new Rng('frozen'),
    );
    const rng = new Rng('frozen');

    endTurn(state, rng);
    playCard(state, handCard(state, '타격병'), laneWithEnemy(state));
    endTurn(state, rng);
    expect(state.outcome).toBe('victory');

    const snapshot = structuredClone(state);
    endTurn(state, rng);
    expect(state).toEqual(snapshot);
    expect(canPlayCard(state, 'anything', 0).ok).toBe(false);
  });
});

describe('예고 배치 규칙', () => {
  it('적이 서 있는 레인이 막히면 예고가 대기한다', () => {
    const state = createCombat(
      config({ laneCount: 1, playerDeck: [wall, wall], monsterDeck: [brute, brute] }),
      new Rng('blocked'),
    );
    const rng = new Rng('blocked');

    endTurn(state, rng); // 거구 1이 내려옴. 레인이 하나뿐이라 새 예고는 못 올라온다.
    expect(state.lanes[0]!.enemy).not.toBeNull();
    expect(state.lanes[0]!.telegraph).toBeNull();
    expect(state.monsterPile).toHaveLength(1);
  });

  it('레인 수보다 몬스터가 많아도 상태가 깨지지 않는다', () => {
    const state = createCombat(
      config({
        laneCount: 2,
        playerDeck: [wall, wall, wall, wall],
        monsterDeck: [rat, rat, rat, rat, rat, rat],
        playerMaxHp: 100,
      }),
      new Rng('overflow'),
    );
    const rng = new Rng('overflow');

    for (let i = 0; i < 20 && state.outcome === 'ongoing'; i++) endTurn(state, rng);

    for (const lane of state.lanes) {
      expect(lane.enemy === null || lane.enemy.health > 0).toBe(true);
    }
    expect(state.playerHp).toBeLessThan(100);
  });
});
