import { beforeEach, describe, expect, it } from 'vitest';
import { Rng } from '../src/engine/rng';
import {
  canPlayCard,
  commitWave,
  createCombat,
  lanePlayerPower,
  playCard,
  playWave,
  playerPowerByLane,
  resetUidCounter,
  resolveWave,
} from '../src/engine/combat';
import type { CardDef, CombatConfig, CombatState } from '../src/engine/types';

const wall: CardDef = { id: 'wall', name: '벽', cost: 1, attack: 0, health: 5 };
const hitter: CardDef = { id: 'hitter', name: '타격병', cost: 2, attack: 4, health: 4 };

function config(over: Partial<CombatConfig> = {}): CombatConfig {
  return {
    laneCount: 3,
    waveCount: 3,
    playerMaxHp: 20,
    maxEnergy: 3,
    startingHandSize: 3,
    playerDeck: Array.from({ length: 12 }, () => hitter),
    reactivity: 0.5,
    totalPowerFor: () => 6,
    ...over,
  };
}

function handCard(state: CombatState, name: string): string {
  const card = state.hand.find((c) => c.name === name);
  if (!card) throw new Error(`손패에 ${name} 없음: ${state.hand.map((c) => c.name)}`);
  return card.uid;
}

beforeEach(() => {
  resetUidCounter();
});

describe('정보 공개', () => {
  it('배치 단계에서는 총 전력만 알 수 있고 분배는 숨겨진다', () => {
    const state = createCombat(config(), new Rng('hidden'));

    expect(state.phase).toBe('placing');
    expect(state.waveTotal).toBe(6);
    expect(state.revealedAllocation).toBeNull();
    expect(state.lanes.every((l) => l.incoming === null)).toBe(true);
  });

  it('확정하면 분배가 공개되지만 아직 싸우지는 않는다', () => {
    const cfg = config();
    const state = createCombat(cfg, new Rng('reveal'));
    const hpBefore = state.playerHp;

    commitWave(state, new Rng('reveal'), cfg.reactivity);

    expect(state.phase).toBe('revealed');
    expect(state.revealedAllocation).not.toBeNull();
    expect(state.revealedAllocation!.reduce((a, b) => a + b, 0)).toBe(6);
    expect(state.playerHp).toBe(hpBefore);
    // 공개된 분배가 그대로 레인에 보인다.
    state.revealedAllocation!.forEach((power, i) => {
      expect(state.lanes[i]!.incoming?.attack ?? 0).toBe(power);
    });
  });

  it('공개 전에는 분배가 존재하지 않는다 — 배치를 보고 나서 만들어진다', () => {
    const cfg = config({ reactivity: 1 });

    // 같은 시드라도 플레이어 배치가 다르면 분배가 달라진다.
    const a = createCombat(cfg, new Rng('same-seed'));
    playCard(a, handCard(a, '타격병'), 0);
    commitWave(a, new Rng('alloc'), 1);

    resetUidCounter();
    const b = createCombat(cfg, new Rng('same-seed'));
    playCard(b, handCard(b, '타격병'), 2);
    commitWave(b, new Rng('alloc'), 1);

    expect(a.revealedAllocation).not.toEqual(b.revealedAllocation);
  });

  it('반응 강도 1이면 비워둔 레인에 최대 몫이 간다', () => {
    const cfg = config({ reactivity: 1 });
    const state = createCombat(cfg, new Rng('bait'));

    playCard(state, handCard(state, '타격병'), 0); // 0번만 두껍게
    commitWave(state, new Rng('bait'), 1);

    // 균등형이 뽑히면 전부 같은 값이라 "더 적게"는 성립하지 않는다.
    // 반응 강도 1이 보장하는 것은 두꺼운 레인이 남들보다 많이 받지는 않는다는 것.
    const alloc = state.revealedAllocation!;
    expect(alloc[0]).toBe(Math.min(...alloc));
  });

  it('반응 강도 1에서 얇은 레인이 반복적으로 더 맞는다', () => {
    const cfg = config({ reactivity: 1 });
    let thick = 0;
    let thin = 0;

    for (let i = 0; i < 40; i++) {
      resetUidCounter();
      const state = createCombat(cfg, new Rng(`bait-${i}`));
      playCard(state, handCard(state, '타격병'), 0);
      commitWave(state, new Rng(`alloc-${i}`), 1);
      const alloc = state.revealedAllocation!;
      thick += alloc[0]!;
      thin += alloc[1]! + alloc[2]!;
    }

    expect(thick * 2).toBeLessThan(thin);
  });

  it('교전까지 끝나면 다음 웨이브 총 전력이 새로 공개된다', () => {
    const cfg = config({ totalPowerFor: (w) => w * 5 });
    const state = createCombat(cfg, new Rng('next'));
    expect(state.waveTotal).toBe(5);

    playWave(state, new Rng('next'), cfg);

    expect(state.wave).toBe(2);
    expect(state.phase).toBe('placing');
    expect(state.waveTotal).toBe(10);
    expect(state.revealedAllocation).toBeNull();
  });
});

describe('단계 강제', () => {
  it('공개 단계에서는 배치할 수 없다', () => {
    const cfg = config();
    const state = createCombat(cfg, new Rng('phase'));
    const uid = state.hand[0]!.uid;

    commitWave(state, new Rng('phase'), cfg.reactivity);

    expect(canPlayCard(state, uid, 0).ok).toBe(false);
    expect(() => playCard(state, uid, 0)).toThrow();
  });

  it('배치 단계에서 resolveWave를 부르면 아무 일도 없다', () => {
    const cfg = config();
    const state = createCombat(cfg, new Rng('guard'));
    const snapshot = structuredClone(state);

    resolveWave(state, cfg);

    expect(state).toEqual(snapshot);
  });

  it('확정을 두 번 불러도 분배가 다시 뽑히지 않는다', () => {
    const cfg = config();
    const state = createCombat(cfg, new Rng('double'));

    commitWave(state, new Rng('double'), cfg.reactivity);
    const first = [...state.revealedAllocation!];
    commitWave(state, new Rng('other'), cfg.reactivity);

    expect(state.revealedAllocation).toEqual(first);
  });
});

describe('교전', () => {
  it('적 유닛은 공격력과 체력이 모두 배분된 전력과 같다', () => {
    const cfg = config();
    const state = createCombat(cfg, new Rng('stats'));
    commitWave(state, new Rng('stats'), cfg.reactivity);

    for (const lane of state.lanes) {
      if (!lane.incoming) continue;
      expect(lane.incoming.attack).toBe(lane.incoming.health);
      expect(lane.incoming.maxHealth).toBe(lane.incoming.attack);
    }
  });

  it('막지 못한 레인만큼 HP가 깎인다', () => {
    const cfg = config({ totalPowerFor: () => 6 });
    const state = createCombat(cfg, new Rng('leak'));

    commitWave(state, new Rng('leak'), cfg.reactivity);
    const unblocked = state.lanes
      .filter((l) => !l.player && l.incoming)
      .reduce((sum, l) => sum + l.incoming!.attack, 0);
    // 유닛이 있는 레인은 전력으로 다 받아내므로 관통에 기여하지 않는다.
    const hpBefore = state.playerHp;

    resolveWave(state, cfg);

    expect(hpBefore - state.playerHp).toBe(unblocked);
  });

  it('웨이브는 한 번 부딪히고 소멸한다 — 적이 필드에 쌓이지 않는다', () => {
    const cfg = config({ waveCount: 5, laneCount: 1, totalPowerFor: () => 4 });
    const state = createCombat(cfg, new Rng('spend'));

    playWave(state, new Rng('r1'), cfg);
    expect(state.lanes[0]!.incoming).toBeNull();
    expect(state.playerHp).toBe(16);

    playWave(state, new Rng('r2'), cfg);
    expect(state.playerHp).toBe(12); // 증강 없이 매번 4씩만
  });

  it('레인 전력을 넘는 만큼만 관통한다', () => {
    const cfg = config({ laneCount: 1, totalPowerFor: () => 10, waveCount: 2, maxEnergy: 3 });
    const state = createCombat(cfg, new Rng('spill'));

    playCard(state, handCard(state, '타격병'), 0); // 공4 체4 = 전력 8
    playWave(state, new Rng('spill'), cfg);

    expect(state.playerHp).toBe(18); // 10 - 8 = 2만 관통
    expect(state.lanes[0]!.player).toBeNull();
  });

  it('전력이 충분하면 유닛이 피해만 입고 버틴다', () => {
    const cfg = config({ laneCount: 1, totalPowerFor: () => 6, waveCount: 2, maxEnergy: 3 });
    const state = createCombat(cfg, new Rng('hold'));

    playCard(state, handCard(state, '타격병'), 0); // 공4 체4 = 전력 8
    playWave(state, new Rng('hold'), cfg);

    expect(state.playerHp).toBe(20);
    // 공격력 4가 타격을 무디게 해 체력은 2만 깎인다.
    expect(state.lanes[0]!.player!.health).toBe(2);
  });
});

describe('플레이어 전력 계산', () => {
  it('레인 전력은 공격력 + 체력이다', () => {
    const state = createCombat(config(), new Rng('power'));
    playCard(state, handCard(state, '타격병'), 1); // 공4 체4

    expect(lanePlayerPower(state.lanes[1]!)).toBe(8);
    expect(playerPowerByLane(state)).toEqual([0, 8, 0]);
  });

  it('빈 레인의 전력은 0이다', () => {
    const state = createCombat(config(), new Rng('empty'));
    expect(playerPowerByLane(state)).toEqual([0, 0, 0]);
  });
});

describe('승패', () => {
  it('정해진 웨이브를 모두 버티면 승리한다', () => {
    const cfg = config({ waveCount: 3, totalPowerFor: () => 1, playerMaxHp: 50 });
    const state = createCombat(cfg, new Rng('win'));

    for (let i = 0; i < 3; i++) playWave(state, new Rng(`w${i}`), cfg);

    expect(state.outcome).toBe('victory');
    expect(state.phase).toBe('over');
    expect(state.records).toHaveLength(3);
  });

  it('HP가 0이 되면 마지막 웨이브 전이라도 패배한다', () => {
    const cfg = config({ waveCount: 9, totalPowerFor: () => 30, playerMaxHp: 10 });
    const state = createCombat(cfg, new Rng('lose'));

    playWave(state, new Rng('lose'), cfg);

    expect(state.playerHp).toBe(0);
    expect(state.outcome).toBe('defeat');
  });

  it('전투가 끝나면 더 진행되지 않는다', () => {
    const cfg = config({ waveCount: 1, totalPowerFor: () => 1, playerMaxHp: 50 });
    const state = createCombat(cfg, new Rng('frozen'));

    playWave(state, new Rng('frozen'), cfg);
    expect(state.outcome).toBe('victory');

    const snapshot = structuredClone(state);
    playWave(state, new Rng('frozen'), cfg);
    expect(state).toEqual(snapshot);
  });
});

describe('웨이브 기록', () => {
  it('총 전력·분배·배치·여유·레인 결과를 남긴다', () => {
    const cfg = config({ waveCount: 2, totalPowerFor: () => 6, maxEnergy: 3 });
    const state = createCombat(cfg, new Rng('record'));
    playCard(state, handCard(state, '타격병'), 0);

    playWave(state, new Rng('record'), cfg);

    const rec = state.records[0]!;
    expect(rec.wave).toBe(1);
    expect(rec.total).toBe(6);
    expect(rec.patternName).not.toBe('');
    expect(rec.allocation.reduce((a, b) => a + b, 0)).toBe(6);
    expect(rec.playerPower).toEqual([8, 0, 0]);
    expect(rec.margin).toBe(8 - 6);
    expect(rec.lanes).toHaveLength(3);
    expect(rec.damageTaken).toBeGreaterThanOrEqual(0);
  });

  it('레인 결과가 실제 상황과 맞는다', () => {
    const cfg = config({ laneCount: 1, waveCount: 2, totalPowerFor: () => 4, maxEnergy: 3 });

    // 막지 않으면 leaked
    const bare = createCombat(cfg, new Rng('bare'));
    playWave(bare, new Rng('bare'), cfg);
    expect(bare.records[0]!.lanes[0]!.result).toBe('leaked');
    expect(bare.records[0]!.lanes[0]!.leaked).toBe(4);

    // 전력 8이 위협 12를 받으면 유닛이 부서지고 4가 관통한다
    resetUidCounter();
    const brokenCfg = { ...cfg, totalPowerFor: () => 12 };
    const broken = createCombat(brokenCfg, new Rng('broken'));
    playCard(broken, handCard(broken, '타격병'), 0);
    playWave(broken, new Rng('broken'), brokenCfg);
    expect(broken.records[0]!.lanes[0]!.result).toBe('broken');
    expect(broken.records[0]!.lanes[0]!.leaked).toBe(4);

    // 공0/체5 벽(전력 5)은 4를 받아내고 버틴다
    resetUidCounter();
    const wallCfg = { ...cfg, playerDeck: [wall, wall, wall] };
    const holding = createCombat(wallCfg, new Rng('holding'));
    playCard(holding, handCard(holding, '벽'), 0);
    playWave(holding, new Rng('holding'), wallCfg);
    expect(holding.records[0]!.lanes[0]!.result).toBe('held');
    expect(holding.records[0]!.lanes[0]!.leaked).toBe(0);
  });

  it('여유(margin)는 총 배치 전력에서 웨이브 총량을 뺀 값이다', () => {
    const cfg = config({ waveCount: 2, totalPowerFor: () => 10, maxEnergy: 3 });
    const state = createCombat(cfg, new Rng('margin'));
    playCard(state, handCard(state, '타격병'), 0); // 8

    playWave(state, new Rng('margin'), cfg);

    expect(state.records[0]!.margin).toBe(-2);
  });
});
