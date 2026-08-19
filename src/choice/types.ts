/** 카드 종류. 파편은 탈출 카운트를 올리므로 따로 센다. */
export type CardKind = 'reward' | 'curse' | 'neutral' | 'shard';

/**
 * 저주 종류. 셋 다 **필드에 놓이는 순간** 판정하고, 공격 대상이 서로 다르다.
 *
 * - `doom` 파멸 → 목숨: 필드에 3장 모이면 즉사. 문턱이 높지만 결과가 최악이다.
 * - `rot` 부패 → 최대 체력: 2장이 모이면 최대 체력이 깎이고 그 2장은 소멸한다.
 * - `erode` 침식 → 체력: 문턱 없이 놓일 때마다 체력이 깎인다.
 */
export type CurseType = 'doom' | 'rot' | 'erode';

export interface CardDef {
  id: string;
  name: string;
  kind: CardKind;
  /**
   * 카드의 값어치. "가장 값나가는 카드를 버린다" 같은 덱 참조형 선택지가
   * 무엇을 집을지 정하는 데 쓰인다.
   */
  value: number;
  /** 저주일 때만 있다. 종류마다 발동 조건과 공격 대상이 다르다. */
  curseType?: CurseType;
}

/** 덱에 실제로 들어 있는 카드 한 장. */
export interface CardInstance {
  uid: string;
  defId: string;
  name: string;
  kind: CardKind;
  value: number;
  curseType?: CurseType;
}

export type FieldCondition =
  | { type: 'fieldCurseAtLeast'; n: number }
  | { type: 'fieldSizeAtLeast'; n: number }
  | { type: 'fieldSizeAtMost'; n: number };

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
 * - `draw`: 덱에서 필드로 가져온다. 저주가 겹칠 위험을 안는다
 * - `purge`: 필드에서 카드를 없앤다. 필드가 줄어드는 유일한 출구
 * - `deck`: 덱 구성을 바꾼다. 지금이 아니라 앞으로에 영향을 준다
 * - `field`: 지금 필드 상태를 조건으로 삼는다
 * - `shard`: 탈출 카운트 증가. 반드시 명확한 대가를 동반한다
 * - `gain`: 보상 획득. 대가 없이는 안 된다
 */
export type OptionKind = 'draw' | 'purge' | 'deck' | 'field' | 'shard' | 'gain';

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
  /** 덱에서 필드로 가져온다. 놓이는 순간 저주가 판정된다. */
  | { type: 'drawField'; count: number }
  /** 푸시 유어 럭. 플레이어가 멈출 때까지 한 장씩 뽑는다. */
  | { type: 'pushLuck' }
  /** 덱 맨 위 count장을 보고 그중 keep장만 필드로. 나머지는 덱에 그대로 남는다. */
  | { type: 'peek'; count: number; keep: number }
  /** 필드에서 저주를 없앤다. 종류를 지정하면 그 종류만. */
  | { type: 'purgeCurse'; count: number; curseType?: CurseType }
  /** 필드에서 무작위로 없앤다. 저주든 아니든 가리지 않는다. */
  | { type: 'purgeRandom'; count: number }
  /** 필드를 통째로 비운다. */
  | { type: 'purgeAll' }
  /** 필드 상태를 보는 조건부. */
  | { type: 'ifField'; when: FieldCondition; then: Effect[]; otherwise: Effect[] }
  /** 필드 장수에 비례해 회복한다. */
  | { type: 'healPerFieldCard'; amount: number }
  | { type: 'ifThen'; when: Condition; then: Effect[]; otherwise: Effect[] }
  /**
   * 종류를 가리지 않고 덱에 넣는다 (파편 제외).
   * 보상일 수도, 중립일 수도, 저주일 수도 있다 — 그래서 "불린다"가 도박이 된다.
   */
  | { type: 'addAny'; count: number }
  /** 이후 N회의 선택에 걸쳐 유지되는 제약을 건다. */
  | {
      type: 'lasting';
      id: string;
      label: string;
      turns: number;
      damage: number;
      side?: 'red' | 'blue';
    };

/** 감정 축. 계산 없이도 어느 쪽인지 읽히게 하는 라벨. */
export type Tone = 'greed' | 'safe' | 'now' | 'later' | 'gamble' | 'sure';

export interface ChoiceOption {
  /** 버튼에 그대로 뜨는 문구. */
  text: string;
  tone: Tone;
  kind: OptionKind;
  effects: Effect[];
}

/* ---------- 짝 테이블 ---------- */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'ultra';

/** 짝 한쪽. 문구와 효과가 전부다 — 태그는 짝에만 붙는다. */
export interface PairSide {
  text: string;
  effects: Effect[];
}

/**
 * 빨강/파랑 한 쌍. **이것이 선택지의 최소 단위다.**
 *
 * 예전에는 낱개 선택지를 태그로 자동 조합했는데, 그러면 양쪽의 무게가 맞지
 * 않는 짝이 나온다 — "저주 전부 제거" 맞은편에 "값싼 3장 버리기"가 놓이면
 * 딜레마가 아니라 무료 보상이다. 짝을 고정하면 양쪽 무게를 의도적으로
 * 설계할 수 있다.
 */
export interface ChoicePair {
  id: string;
  red: PairSide;
  blue: PairSide;
  /** 이 짝이 묻는 딜레마. 주석용이며 화면에 나오지 않는다. */
  intent: string;
  rarity: Rarity;
}

/* ---------- 지속 효과 ---------- */

/**
 * 선택의 결과가 즉시 끝나지 않고 이후 N회의 선택에 걸쳐 유지되는 것.
 *
 * 남은 횟수는 화면에 항상 떠 있어야 한다 — 플레이어가 제약을 잊으면
 * 딜레마가 아니라 사고가 된다.
 */
export interface LastingEffect {
  id: string;
  /** 화면에 뜨는 한 줄. */
  label: string;
  /** 남은 선택 횟수. 매 선택마다 1씩 줄고 0이 되면 사라진다. */
  remaining: number;
  /** 이 색을 누르면 피해를 받는다. 없으면 색과 무관하다. */
  side?: 'red' | 'blue';
  /** 발동 시 입는 피해. */
  damage: number;
}

/** 선택 한 번의 기록. */
export interface ChoiceRecord {
  step: number;
  /** 어떤 짝이었는지. */
  pairId: string;
  side: 'red' | 'blue';
  text: string;
  /** 사람이 읽을 수 있는 변화 요약. */
  changes: string[];
  /** 이 선택을 한 시점의 상태. 짝이 상황에 따라 다르게 읽히는지 보려면 필요하다. */
  deckSize: number;
  fieldSize: number;
  curseCount: number;
  hp: number;
}

/** 짝 하나의 등장·선택 집계. */
export interface PairStat {
  seen: number;
  red: number;
  blue: number;
}

/** 뽑기를 계속할지 멈출지 플레이어가 정하는 중인 상태. */
export interface PushState {
  /** 지금까지 이 판에서 뽑은 장수. */
  drawn: number;
  /** 저주가 발동해 강제로 끝났으면 true. */
  stopped: boolean;
  log: string[];
}

export interface GameState {
  /** 몇 번째 선택인지. 1부터. */
  step: number;
  deck: CardInstance[];
  /**
   * 필드. 뽑은 카드는 여기 펼쳐진 채로 계속 남는다.
   *
   * 카드는 덱 → 필드 한 방향으로만 흐르고, 벗어나는 길은 선택지를 통한
   * 제거뿐이다 — 발동한 저주도 필드에 남는다. 그래서 필드는 스스로 줄지
   * 않고, 뽑을수록 위험이 올라간다.
   */
  field: CardInstance[];
  /** 푸시 유어 럭 진행 중이면 채워진다. */
  push: PushState | null;
  shards: number;
  escapeTarget: number;
  escaped: boolean;
  /** 체력이 0이 되면 끝난다. */
  hp: number;
  maxHp: number;
  dead: boolean;

  /** 지금 제시된 짝. 탈출하면 null. */
  current: ChoicePair | null;
  /** 최근에 나온 짝 id들. 바로 다시 뽑히지 않게 하는 용도. */
  recent: string[];

  /** 지금 걸려 있는 지속 효과들. 여러 개가 동시에 걸릴 수 있다. */
  lasting: LastingEffect[];

  /**
   * 짝 id별 등장 횟수와 빨강/파랑 선택 횟수.
   *
   * **이번 단계의 핵심 지표다.** 짝이 9개뿐이라 반복 등장이 당연하고,
   * 목적은 같은 짝이 다시 나왔을 때 다른 쪽을 고르게 되는지 보는 것이다.
   * 한쪽으로 90% 이상 쏠린 짝은 딜레마가 아니라 죽은 짝이다.
   */
  pairStats: Record<string, PairStat>;
  /** 희소도별 등장 횟수. 짝 단위다. */
  rarityStats: Record<Rarity, number>;

  log: string[];
  records: ChoiceRecord[];
  /** 저주 종류별 발동 횟수. */
  triggers: Record<CurseType, number>;
  /**
   * 저주 종류별로 필드에 동시에 몇 장까지 쌓였는지.
   *
   * "한 종류만 계속 죽이거나 한 종류가 존재감이 없는지"를 보는 값이다.
   * 발동 횟수만으로는 문턱이 높은 파멸이 늘 적게 보인다.
   */
  peakField: Record<CurseType, number>;
  /** 침식이 지금까지 깎은 체력 총합. */
  erodeDamage: number;
  /** 부패가 지금까지 깎은 최대 체력 총합. 회복으로 되돌릴 수 없는 손실이다. */
  rotMaxHpLost: number;
  /** 사망 원인. 저주가 겹쳐 죽었으면 그 종류. */
  causeOfDeath: string | null;
  /** 매 선택 후의 필드 크기. 평균을 내기 위한 것. */
  fieldSizes: number[];
  /** 문턱 직전 상태에서 더 뽑은 횟수와, 그때 실제로 터진 횟수. */
  riskyDraws: { taken: number; paired: number };
  /** 덱이 바닥난 시점의 선택 번호. 아직이면 null. */
  deckEmptiedAt: number | null;
  /**
   * 저주가 처음 발동한 선택 번호. 아직이면 null.
   *
   * 시작 덱에 저주를 종류별로 한 장씩 넣은 목적이 "초반부터 긴장"이므로,
   * 그 긴장이 실제로 언제 터지는지를 잰다.
   */
  firstPairAt: number | null;
}
