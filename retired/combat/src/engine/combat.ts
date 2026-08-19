import type { Rng } from './rng';
import { allocateWave } from './wave';
import type {
  CardDef,
  CardInstance,
  CombatConfig,
  CombatState,
  Lane,
  LaneResult,
  WaveRecord,
} from './types';

/**
 * 전투 규칙. DOM에 의존하지 않는 순수 로직이며, 무작위는 전부 인자로 받은
 * Rng를 통해서만 발생한다.
 *
 * 웨이브 흐름:
 *   1. [placing] 이번 웨이브의 총 전력만 공개된다. 분배는 숨긴 채로 플레이어가
 *      에너지를 써서 손패를 배치한다.
 *   2. commitWave() — 분배를 계산해 공개한다. 이때 배분은 플레이어 배치를
 *      참조하므로, 배치를 끝내기 전에는 결정되지 않는다.
 *   3. [revealed] 어디로 몇이 오는지 보이지만 아직 싸우지 않았다.
 *   4. resolveWave() — 적이 내려와 교전하고, 다음 웨이브 총 전력이 공개된다.
 *
 * 적 유닛은 공격력 = 체력 = 배분된 전력이다. 숫자 하나가 곧 위협의 크기라,
 * "7을 막으려면 얼마가 필요한가"를 바로 계산할 수 있다.
 *
 * 웨이브는 한 번 부딪히고 지나간다. 적을 필드에 남겨 두고 매 웨이브 증강하면
 * 플레이어 공격력(0~5)으로는 전력 7 이상을 잡을 수 없어 그대로 죽음의 나선이
 * 된다 (자동 플레이 400판 승률 0%). 대신 레인 전력이 위협을 얼마나 받아내는지로
 * 결과가 갈리므로, 화면에 띄우는 "내 전력"이 곧 결과를 예측하는 숫자가 된다.
 */

let uidCounter = 0;

function nextUid(): string {
  uidCounter += 1;
  return `c${uidCounter}`;
}

function instantiate(def: CardDef): CardInstance {
  return {
    uid: nextUid(),
    defId: def.id,
    name: def.name,
    cost: def.cost,
    attack: def.attack,
    health: def.health,
    maxHealth: def.health,
  };
}

/** 배분된 전력으로 적 유닛을 만든다. 공격력 = 체력 = 전력. */
function spawnEnemy(power: number): CardInstance {
  return {
    uid: nextUid(),
    defId: 'wave',
    name: `적 ${power}`,
    cost: 0,
    attack: power,
    health: power,
    maxHealth: power,
  };
}

/** 테스트에서 uid를 예측 가능하게 만들기 위한 리셋. */
export function resetUidCounter(): void {
  uidCounter = 0;
}

function emptyLane(): Lane {
  return { incoming: null, player: null };
}

/**
 * 레인의 플레이어 전력 = 배치된 유닛의 공격력 + 체력.
 * 적 반응(얇은 레인 노리기)의 기준이자 UI에 표시되는 값이다.
 */
export function lanePlayerPower(lane: Lane): number {
  return lane.player ? lane.player.attack + lane.player.health : 0;
}

export function playerPowerByLane(state: CombatState): number[] {
  return state.lanes.map(lanePlayerPower);
}

export function totalPlayerPower(state: CombatState): number {
  return playerPowerByLane(state).reduce((a, b) => a + b, 0);
}

export function createCombat(config: CombatConfig, rng: Rng): CombatState {
  const state: CombatState = {
    wave: 1,
    waveCount: config.waveCount,
    phase: 'placing',
    outcome: 'ongoing',
    playerHp: config.playerMaxHp,
    playerMaxHp: config.playerMaxHp,
    energy: config.maxEnergy,
    maxEnergy: config.maxEnergy,
    lanes: Array.from({ length: config.laneCount }, emptyLane),
    waveTotal: config.totalPowerFor(1),
    revealedAllocation: null,
    revealedPatternName: null,
    hand: [],
    drawPile: rng.shuffle(config.playerDeck).map(instantiate),
    log: [],
    records: [],
  };

  for (let i = 0; i < config.startingHandSize; i++) draw(state);

  state.log.push(`전투 시작. ${config.waveCount}웨이브를 버티면 승리.`);
  state.log.push(`1웨이브 총 전력 ${state.waveTotal} — 분배는 배치 확정 후 공개.`);

  return state;
}

function draw(state: CombatState): CardInstance | null {
  const card = state.drawPile.shift();
  if (!card) return null;
  state.hand.push(card);
  return card;
}

export interface PlayCheck {
  ok: boolean;
  reason?: string;
}

/** 배치가 가능한지만 검사한다. UI에서 버튼 비활성화에 쓴다. */
export function canPlayCard(state: CombatState, uid: string, laneIndex: number): PlayCheck {
  if (state.phase !== 'placing') return { ok: false, reason: '지금은 배치 단계가 아니다' };

  const card = state.hand.find((c) => c.uid === uid);
  if (!card) return { ok: false, reason: '손패에 없는 카드다' };

  const lane = state.lanes[laneIndex];
  if (!lane) return { ok: false, reason: '없는 레인이다' };
  if (lane.player) return { ok: false, reason: '이미 유닛이 있는 칸이다' };

  if (card.cost > state.energy) {
    return { ok: false, reason: `에너지가 부족하다 (${card.cost} 필요, ${state.energy} 남음)` };
  }

  return { ok: true };
}

/** 손패의 카드를 레인에 배치한다. 불가능하면 Error를 던진다. */
export function playCard(state: CombatState, uid: string, laneIndex: number): void {
  const check = canPlayCard(state, uid, laneIndex);
  if (!check.ok) throw new Error(check.reason);

  const handIndex = state.hand.findIndex((c) => c.uid === uid);
  const card = state.hand[handIndex]!;
  const lane = state.lanes[laneIndex]!;

  state.hand.splice(handIndex, 1);
  lane.player = card;
  state.energy -= card.cost;

  state.log.push(`${card.name}을(를) ${laneIndex + 1}번 레인에 배치 (에너지 -${card.cost})`);
}

/**
 * 배치를 확정하고 분배를 공개한다.
 *
 * 분배는 이 시점의 플레이어 배치를 참조하므로, 배치를 끝내기 전에는 결정되지
 * 않는다. 즉 미리 계산해두고 숨기는 것이 아니라 확정 순간에 만들어진다.
 */
export function commitWave(state: CombatState, rng: Rng, reactivity: number): void {
  if (state.phase !== 'placing') return;

  const defense = playerPowerByLane(state);
  const { pattern, perLane } = allocateWave(state.waveTotal, state.wave, defense, rng, reactivity);

  perLane.forEach((power, i) => {
    state.lanes[i]!.incoming = power > 0 ? spawnEnemy(power) : null;
  });

  state.revealedAllocation = perLane;
  state.revealedPatternName = pattern.name;
  state.phase = 'revealed';

  const margin = defense.reduce((a, b) => a + b, 0) - state.waveTotal;
  state.log.push(
    `--- ${state.wave}웨이브 공개: ${pattern.name} ${perLane.join(' / ')} ` +
      `(내 배치 ${defense.join(' / ')}, 여유 ${margin >= 0 ? '+' : ''}${margin}) ---`,
  );
}

/**
 * 교전 처리.
 *
 * 레인 전력(공격력 + 체력)이 그 레인이 받아낼 수 있는 양이다. 위협이 그보다
 * 크면 넘치는 만큼만 관통한다 — 화면의 "내 전력 7 vs 오는 전력 9"가 곧
 * "2 관통"으로 읽힌다.
 *
 * 유닛이 받는 피해는 공격력만큼 깎인다. 공격력은 날아오는 타격을 무디게 하고,
 * 체력은 그 나머지를 버틴다.
 */
function resolveCombat(state: CombatState): LaneResult[] {
  const results: LaneResult[] = [];

  state.lanes.forEach((lane, i) => {
    const { incoming, player } = lane;
    const defense = lanePlayerPower(lane);

    if (!incoming) {
      results.push({ lane: i, threat: 0, defense, result: 'clear', leaked: 0 });
      return;
    }

    const threat = incoming.attack;
    lane.incoming = null;

    if (!player) {
      state.playerHp -= threat;
      state.log.push(`${i + 1}번 레인 관통 — ${threat} 피해 (막는 유닛 없음)`);
      results.push({ lane: i, threat, defense, result: 'leaked', leaked: threat });
      return;
    }

    const leaked = Math.max(0, threat - defense);
    player.health -= Math.max(0, threat - player.attack);
    const broken = player.health <= 0;

    if (leaked > 0) state.playerHp -= leaked;

    const result: LaneResult['result'] = leaked > 0 ? 'broken' : broken ? 'traded' : 'held';
    state.log.push(
      `${i + 1}번 레인 ${threat} 대 전력 ${defense} — ` +
        (leaked > 0
          ? `${player.name} 파괴, ${leaked} 관통`
          : broken
            ? `막아냈으나 ${player.name} 파괴`
            : `${player.name} 버팀 (체력 ${player.health}/${player.maxHealth})`),
    );

    if (broken) lane.player = null;
    results.push({ lane: i, threat, defense, result, leaked });
  });

  return results;
}

function finish(state: CombatState, outcome: 'victory' | 'defeat', message: string): void {
  state.outcome = outcome;
  state.phase = 'over';
  state.log.push(message);
}

/** 공개된 분배대로 교전을 진행하고 다음 웨이브를 준비한다. */
export function resolveWave(state: CombatState, config: CombatConfig): void {
  if (state.phase !== 'revealed') return;

  const hpBefore = state.playerHp;
  const defense = playerPowerByLane(state);
  const allocation = state.revealedAllocation ?? state.lanes.map(() => 0);

  const laneResults = resolveCombat(state);

  const record: WaveRecord = {
    wave: state.wave,
    total: state.waveTotal,
    patternId: state.revealedPatternName ?? '',
    patternName: state.revealedPatternName ?? '',
    allocation,
    playerPower: defense,
    margin: defense.reduce((a, b) => a + b, 0) - state.waveTotal,
    lanes: laneResults,
    damageTaken: hpBefore - state.playerHp,
  };
  state.records.push(record);

  if (state.playerHp <= 0) {
    state.playerHp = 0;
    finish(state, 'defeat', '패배: 방어선이 무너졌다.');
    return;
  }

  if (state.wave >= state.waveCount) {
    finish(state, 'victory', `승리: ${state.waveCount}웨이브를 모두 버텼다.`);
    return;
  }

  // 다음 웨이브 준비.
  state.wave += 1;
  state.phase = 'placing';
  state.revealedAllocation = null;
  state.revealedPatternName = null;
  state.energy = state.maxEnergy;
  state.waveTotal = config.totalPowerFor(state.wave);

  const drawn = draw(state);
  state.log.push(
    `${state.wave}웨이브 총 전력 ${state.waveTotal}` +
      (drawn ? ` — ${drawn.name} 드로우` : ' — 덱이 비었다'),
  );
}

/** 배치 확정과 교전을 한 번에. 시뮬레이션과 테스트용. */
export function playWave(state: CombatState, rng: Rng, config: CombatConfig): void {
  commitWave(state, rng, config.reactivity);
  resolveWave(state, config);
}
