/** 카드 종류. 파편은 탈출 카운트를 올리므로 따로 센다. */
export type CardKind = 'reward' | 'curse' | 'neutral' | 'shard';

/**
 * 저주 종류. 손패에 같은 종류가 2장 모이면 발동한다.
 *
 * - `doom` 파멸: 겹치면 즉사. 덱에 아주 적게만 존재한다.
 * - `rot` 부패: 손패에 있는 동안 매 선택마다 체력이 깎인다. 겹치면 크게 터진다.
 * - `erode` 침식: 겹치면 손패의 멀쩡한 카드가 저주로 바뀐다.
 */
export type CurseType = 'doom' | 'rot' | 'erode';

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /** 전투에서 적에게 주는 피해. 저주는 0이고 애초에 낼 수 없다. */
  attack: number;
  /** 전투에서 이번 턴 적의 공격을 막아내는 양. */
  block: number;
  /**
   * 카드의 값어치. "가장 값나가는 카드를 버린다" 같은 덱 참조형 선택지가
   * 무엇을 집을지 정하는 데 쓰인다.
   */
  value: number;
  /** 저주일 때만 있다. 손패에서 같은 종류가 2장 모이면 발동한다. */
  curseType?: CurseType;
}

/** 덱에 실제로 들어 있는 카드 한 장. */
export interface CardInstance {
  uid: string;
  defId: string;
  name: string;
  kind: CardKind;
  value: number;
  attack: number;
  block: number;
  curseType?: CurseType;
}

export type HandCondition =
  | { type: 'handCurseAtLeast'; n: number }
  | { type: 'handSizeAtLeast'; n: number }
  | { type: 'handSizeAtMost'; n: number };

export type Condition =
  | { type: 'countAtLeast'; kind: CardKind; n: number }
  | { type: 'countAtMost'; kind: CardKind; n: number }
  | { type: 'deckAtLeast'; n: number }
  | { type: 'deckAtMost'; n: number };

/**
 * 선택지가 덱에 가하는 조작.
 *
 * 전투가 없으므로 카드 "효과"는 없다. 여기서 말하는 효과는 전부 덱 구성을
 * 바꾸는 것이다.
 */
/**
 * 선택지 유형. 배합을 눈으로 확인하고 테스트로 강제하기 위해 명시한다.
 *
 * - `consume`: 덱에서 뽑아 판정. 저주가 실제로 아파지는 자리
 * - `cleanse`: 저주 제거·교체. 덱을 다듬는다
 * - `shard`: 탈출 카운트 증가. 반드시 명확한 대가를 동반한다
 * - `gain`: 보상 획득. 대가 없이는 안 된다
 * - `draw`: 덱에서 손패로 가져온다. 저주가 겹칠 위험을 안는다
 * - `purge`: 손패에서 저주를 버린다. 겹치기 전에 털어내는 자리
 */
export type OptionKind = 'consume' | 'cleanse' | 'shard' | 'gain' | 'draw' | 'purge';

export type Effect =
  | { type: 'addSpecific'; cardId: string; count: number }
  | { type: 'addRandom'; kind: CardKind; count: number }
  | { type: 'removeKind'; kind: CardKind; count: number }
  | { type: 'removeExtreme'; end: 'highest' | 'lowest'; count: number }
  /** from 종류를 to 종류로 바꾼다. 값어치는 유지하지 않고 새로 뽑는다. */
  | { type: 'transform'; from: CardKind; to: CardKind; count: number }
  | { type: 'shard'; count: number }
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  /**
   * 덱에서 count장을 공개해 종류별로 결과를 적용한다.
   *
   * 뽑은 카드는 전부 덱으로 돌아간다. 저주는 지우기 전까지 계속 아프고,
   * 덱의 저주 비율이 그대로 이 선택지의 위험도가 된다.
   */
  | { type: 'draw'; count: number; onCurse: Effect[]; onReward: Effect[] }
  /** 전투를 시작한다. 이기면 onWin이 적용된다. */
  | { type: 'battle'; enemyId: string; onWin: Effect[] }
  /** 덱에서 손패로 가져온다. 저주가 겹치면 그 자리에서 발동한다. */
  | { type: 'drawHand'; count: number }
  /** 푸시 유어 럭. 플레이어가 멈출 때까지 한 장씩 뽑는다. */
  | { type: 'pushLuck' }
  /** 덱 맨 위 count장을 보고 그중 keep장만 손패로. 나머지는 덱으로 돌아간다. */
  | { type: 'peek'; count: number; keep: number }
  /** 손패에서 저주를 버린다. 종류를 지정하면 그 종류만. */
  | { type: 'discardCurse'; count: number; curseType?: CurseType }
  /** 손패를 전부 버리고 덱에서 다시 뽑는다. */
  | { type: 'mulligan'; draw: number }
  /** 손패 상태를 보는 조건부. */
  | { type: 'ifHand'; when: HandCondition; then: Effect[]; otherwise: Effect[] }
  /** 손패 장수에 비례해 회복한다. */
  | { type: 'healPerHandCard'; amount: number }
  | { type: 'ifThen'; when: Condition; then: Effect[]; otherwise: Effect[] };

/** 감정 축. 계산 없이도 어느 쪽인지 읽히게 하는 라벨. */
export type Tone = 'greed' | 'safe' | 'now' | 'later' | 'gamble' | 'sure';

export interface ChoiceOption {
  /** 버튼에 그대로 뜨는 문구. */
  text: string;
  tone: Tone;
  kind: OptionKind;
  effects: Effect[];
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  /** 매 턴 플레이어에게 넣는 피해. */
  attack: number;
}

export type BattleOutcome = 'ongoing' | 'won' | 'lost' | 'fled';

/**
 * 전투 한 판.
 *
 * 시작할 때 덱에서 손패를 뽑아 가고, 낸 카드는 덱에서 영영 사라진다.
 * 저주는 손패 자리만 차지하고 낼 수 없으며, 끝나면 덱으로 돌아간다.
 */
export interface BattleState {
  enemy: EnemyDef;
  enemyHp: number;
  hand: CardInstance[];
  /** 이번 턴에 적의 공격을 깎아낼 양. 턴이 끝나면 사라진다. */
  block: number;
  turn: number;
  outcome: BattleOutcome;
  /** 이겼을 때 적용할 보상. */
  onWin: Effect[];
  /** 낸 카드 수 (= 덱에서 사라진 수). */
  spent: number;
  /** 시작 손패에 잡힌 저주 수. 덱 관리의 성적표다. */
  cursesDrawn: number;
  handSize: number;
  /** 전투 시작 시점의 덱 저주 비율. */
  taintAtStart: number;
  log: string[];
}

export interface ChoiceEvent {
  id: string;
  /** 상황 한 줄. 없으면 선택지 두 개만 보여준다. */
  prompt: string;
  red: ChoiceOption;
  blue: ChoiceOption;
  /** 파편을 넣을 수 있는 선택지. 출현 빈도를 따로 관리한다. */
  hasShard?: boolean;
  /** 덱 상태에 따라 결과가 달라지는 선택지. */
  readsDeck?: boolean;
  /** 손패 상태를 보거나 손패를 건드리는 선택지. */
  readsHand?: boolean;
}

/** 선택 한 번의 기록. */
export interface ChoiceRecord {
  step: number;
  eventId: string;
  side: 'red' | 'blue';
  text: string;
  /** 사람이 읽을 수 있는 변화 요약. */
  changes: string[];
  deckSizeAfter: number;
  curseCountAfter: number;
  hpAfter: number;
}

/** 전투 한 판의 기록. 밸런스 검증용. */
export interface BattleRecord {
  step: number;
  enemyId: string;
  outcome: BattleOutcome;
  /** 시작 손패에 잡힌 저주 수 / 손패 크기. */
  cursesDrawn: number;
  handSize: number;
  /** 전투 시작 시점의 덱 저주 비율. */
  taintAtStart: number;
  /** 덱에서 영영 사라진 카드 수. */
  spent: number;
  turns: number;
  hpLost: number;
}

/** 뽑기를 계속할지 멈출지 플레이어가 정하는 중인 상태. */
export interface PushState {
  /** 지금까지 이 판에서 뽑은 장수. */
  drawn: number;
  /** 저주가 겹쳐 강제로 끝났으면 true. */
  stopped: boolean;
  log: string[];
}

export interface GameState {
  /** 몇 번째 선택인지. 1부터. */
  step: number;
  deck: CardInstance[];
  /**
   * 상시 손패. 전투도 이걸 쓴다.
   * 저주가 여기서 겹치면 발동하므로, 손패 관리가 곧 생존이다.
   */
  hand: CardInstance[];
  /** 푸시 유어 럭 진행 중이면 채워진다. */
  push: PushState | null;
  shards: number;
  escapeTarget: number;
  escaped: boolean;
  /** 체력이 0이 되면 끝난다. */
  hp: number;
  maxHp: number;
  dead: boolean;

  /** 진행 중인 전투. 있으면 선택 화면 대신 전투 화면이 뜬다. */
  battle: BattleState | null;
  /** 이번 선택이 예약한 전투. 효과가 전부 적용된 뒤에 열린다. */
  pendingBattle: { enemyId: string; onWin: Effect[] } | null;

  /** 지금 제시된 선택지. 탈출하면 null. */
  current: ChoiceEvent | null;
  /** 최근에 나온 이벤트 id들. 바로 다시 뽑히지 않게 하는 용도. */
  recent: string[];

  log: string[];
  records: ChoiceRecord[];
  battles: BattleRecord[];
  /** 저주 종류별 발동 횟수. */
  triggers: Record<CurseType, number>;
  /** 사망 원인. 저주가 겹쳐 죽었으면 그 종류. */
  causeOfDeath: string | null;
  /** 매 선택 후의 손패 크기. 평균을 내기 위한 것. */
  handSizes: number[];
  /** 손패에 저주 1장을 들고 추가로 뽑은 횟수와, 그때 겹쳐버린 횟수. */
  riskyDraws: { taken: number; paired: number };
}
