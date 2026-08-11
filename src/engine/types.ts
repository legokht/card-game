/** 카드 원본 정의. 덱 구성은 이 정의의 id 목록으로 표현한다. */
export interface CardDef {
  id: string;
  name: string;
  attack: number;
  /** 최대 체력. 0 이하가 되면 필드에서 제거된다. */
  health: number;
  /**
   * 배치에 드는 에너지. 몬스터 카드는 플레이어가 배치하지 않으므로 무시된다.
   */
  cost: number;
}

/**
 * 실제 게임에 존재하는 카드 한 장.
 *
 * 손패에 있을 때는 "카드", 필드에 배치되면 "유닛"이라 부르지만 같은 객체다.
 * 프로토타입 단계에서 둘을 나눌 만큼 차이가 없어 하나로 둔다.
 */
export interface CardInstance {
  /** 인스턴스 고유 id. 같은 카드가 덱에 여러 장 있어도 구분된다. */
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
 * 레인 하나. 보드는 레인의 배열이다.
 *
 * 화면상 2열 구조에 대응한다:
 * - 위쪽 열 = `telegraph`(다음에 내려올 예고) + `enemy`(이미 내려온 적)
 * - 아래쪽 열 = `player`(플레이어 유닛)
 *
 * 교전은 같은 레인 안에서만 일어난다.
 */
export interface Lane {
  /** 아래로 내려와 교전 중인 적. 죽을 때까지 남는다. */
  enemy: CardInstance | null;
  /** 다음 턴에 내려올 적 예고. */
  telegraph: CardInstance | null;
  /** 배치된 플레이어 유닛. 소모형이 아니라 죽을 때까지 남는다. */
  player: CardInstance | null;
}

export type Outcome = 'ongoing' | 'victory' | 'defeat';

export interface CombatState {
  /** 1부터 시작. */
  turn: number;
  outcome: Outcome;

  playerHp: number;
  playerMaxHp: number;

  /** 이번 턴에 남은 에너지. 매 턴 maxEnergy로 리셋된다. */
  energy: number;
  maxEnergy: number;

  lanes: Lane[];

  hand: CardInstance[];
  /** 플레이어 덱의 남은 카드. 매 턴 위에서 1장 뽑는다. */
  drawPile: CardInstance[];
  /** 몬스터 덱의 남은 카드. 이게 비고 필드가 정리되면 승리. */
  monsterPile: CardInstance[];

  /** 턴별로 무슨 일이 있었는지. UI 표시와 테스트 검증에 쓴다. */
  log: string[];
}

export interface CombatConfig {
  laneCount: number;
  playerMaxHp: number;
  maxEnergy: number;
  /** 전투 시작 시 뽑는 카드 수. */
  startingHandSize: number;
  playerDeck: CardDef[];
  monsterDeck: CardDef[];
}
