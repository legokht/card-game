/** 카드 종류. 파편은 탈출 카운트를 올리므로 따로 센다. */
export type CardKind = 'reward' | 'curse' | 'neutral' | 'shard';

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /**
   * 카드의 값어치. 전투가 없으므로 효과는 없고, "가장 값나가는 카드를 버린다"
   * 같은 덱 참조형 선택지가 무엇을 집을지 정하는 데만 쓰인다.
   */
  value: number;
}

/** 덱에 실제로 들어 있는 카드 한 장. */
export interface CardInstance {
  uid: string;
  defId: string;
  name: string;
  kind: CardKind;
  value: number;
}

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
 */
export type OptionKind = 'consume' | 'cleanse' | 'shard' | 'gain';

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

export interface GameState {
  /** 몇 번째 선택인지. 1부터. */
  step: number;
  deck: CardInstance[];
  shards: number;
  escapeTarget: number;
  escaped: boolean;
  /** 체력이 0이 되면 끝난다. */
  hp: number;
  maxHp: number;
  dead: boolean;

  /** 지금 제시된 선택지. 탈출하면 null. */
  current: ChoiceEvent | null;
  /** 최근에 나온 이벤트 id들. 바로 다시 뽑히지 않게 하는 용도. */
  recent: string[];

  log: string[];
  records: ChoiceRecord[];
}
