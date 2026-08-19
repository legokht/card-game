/** 카드 원본 정의. 덱 구성은 이 정의의 목록으로 표현한다. */
export interface CardDef {
  id: string;
  name: string;
  attack: number;
  /** 최대 체력. 0 이하가 되면 필드에서 제거된다. */
  health: number;
  /** 배치에 드는 에너지. */
  cost: number;
}

/**
 * 실제 게임에 존재하는 카드 한 장.
 *
 * 손패에 있을 때는 "카드", 필드에 배치되면 "유닛"이라 부르지만 같은 객체다.
 */
export interface CardInstance {
  uid: string;
  defId: string;
  name: string;
  cost: number;
  attack: number;
  /** 현재 체력. */
  health: number;
  maxHealth: number;
}

/**
 * 레인 하나.
 *
 * - `incoming`: 이번 웨이브가 이 레인에 배분한 적. 배치 확정 전에는 null이고,
 *   확정 시점에 공개된다. 교전하면 소멸한다 (웨이브는 한 번 부딪히고 지나간다).
 * - `player`: 배치된 플레이어 유닛. 소모형이 아니라 죽을 때까지 남는다.
 */
export interface Lane {
  incoming: CardInstance | null;
  player: CardInstance | null;
}

export type Outcome = 'ongoing' | 'victory' | 'defeat';

/**
 * 전투 단계.
 *
 * - `placing`: 총 전력만 공개된 상태. 플레이어가 배치한다.
 * - `revealed`: 분배가 공개됐고 아직 교전 전. 플레이어는 결과를 보기만 한다.
 * - `over`: 승패가 갈렸다.
 */
export type Phase = 'placing' | 'revealed' | 'over';

/** 웨이브 한 번의 기록. 밸런스 검증용. */
export interface WaveRecord {
  wave: number;
  /** 공개된 총 전력. */
  total: number;
  patternId: string;
  patternName: string;
  /** 실제 분배값 (레인 순). */
  allocation: number[];
  /** 배치 확정 시점의 레인별 플레이어 전력 (공격력+체력 합). */
  playerPower: number[];
  /** 플레이어 총 전력 - 웨이브 총 전력. 음수면 전력에서 밀린 채로 받았다. */
  margin: number;
  /** 레인별 결과. */
  lanes: LaneResult[];
  /** 이 웨이브에서 입은 관통 피해. */
  damageTaken: number;
}

export interface LaneResult {
  lane: number;
  /** 이 레인이 받은 적 전력 (기존 잔존 적 포함). */
  threat: number;
  /** 배치 확정 시점의 이 레인 플레이어 전력. */
  defense: number;
  /**
   * - `held`: 전력으로 다 받아냈고 유닛도 살았다
   * - `traded`: 다 받아냈지만 유닛이 부서졌다
   * - `broken`: 전력이 모자라 유닛이 부서지고 나머지가 관통했다
   * - `leaked`: 막는 유닛이 없어 통째로 관통당했다
   * - `clear`: 이 레인에 배분이 없었다
   */
  result: 'held' | 'traded' | 'broken' | 'leaked' | 'clear';
  /** 관통 피해량. */
  leaked: number;
}

export interface CombatState {
  /** 웨이브 번호. 1부터 시작. */
  wave: number;
  /** 이 수만큼 버티면 승리. */
  waveCount: number;
  phase: Phase;
  outcome: Outcome;

  playerHp: number;
  playerMaxHp: number;

  energy: number;
  maxEnergy: number;

  lanes: Lane[];

  /** 이번 웨이브에 공개된 총 전력. 분배는 확정 전까지 숨긴다. */
  waveTotal: number;
  /** 확정 후에만 채워진다. */
  revealedAllocation: number[] | null;
  revealedPatternName: string | null;

  hand: CardInstance[];
  drawPile: CardInstance[];

  log: string[];
  /** 구조화된 웨이브 기록. 테스트와 밸런싱에 쓴다. */
  records: WaveRecord[];
}

export interface CombatConfig {
  laneCount: number;
  waveCount: number;
  playerMaxHp: number;
  maxEnergy: number;
  startingHandSize: number;
  playerDeck: CardDef[];
  /** 0 = 완전 무작위 분배, 1 = 항상 가장 얇은 레인. */
  reactivity: number;
  /** 웨이브 n의 총 전력을 돌려준다. */
  totalPowerFor: (wave: number) => number;
}
