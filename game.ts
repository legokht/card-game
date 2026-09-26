import {
  CURSE_BURN_ORDER,
  CURSE_RULES,
  DARK_HP_COST,
  DECK_THICK_AT,
  DECK_THIN_AT,
  DOOM_THRESHOLD,
  ELEMENT_ORDER,
  ELEMENT_RULES,
  ELEMENT_SYNERGY_COUNT,
  ERODE_DAMAGE,
  ESCAPE_TARGET,
  FIELD_START,
  LIGHT_HP_GAIN,
  MAX_HP,
  MIN_MAX_HP,
  PAIR_DRAW_WEIGHT_THICK,
  PAIR_DRAW_WEIGHT_THIN,
  PAIR_FLOW_WEIGHT_MID,
  PAIR_INSERT_WEIGHT_THICK,
  PAIR_INSERT_WEIGHT_THIN,
  PAIR_RARITY_WEIGHT,
  PAIR_TABLE,
  RECENT_PAIRS,
  ROT_MAX_HP_LOSS,
  ROT_THRESHOLD,
  STARTING_DECK,
  TAINT_LEVELS,
  WATER_MAX_HP_GAIN,
  cardById,
  curseWeights,
  elementDef,
  poolOf,
} from './data.js';

/**
 * 카드 종류. 파편은 탈출 카운트를 올리므로 따로 센다.
 *
 * 한때는 보상과 중립이 따로 있었지만 둘 다 폐기했다 — 좋은 카드와 아무것도
 * 아닌 카드로 나뉘면 중립은 뽑을 이유가 없는 쓰레기가 된다. 지금은 모든
 * 비저주 카드가 속성 카드이고, 전부 조합 재료라 쓸모없는 카드가 없다.
 */
export type CardKind = 'element' | 'curse' | 'shard';

/**
 * 속성 4종. **필드에 같은 속성이 모이면 발동한다 — 저주와 같은 문법이다.**
 *
 * 좋은 것도 나쁜 것도 "필드에 같은 것이 모이면 터진다"는 한 규칙으로 움직이므로
 * 플레이어가 배울 것이 하나뿐이다.
 *
 * - `fire` 불 → 덱의 저주를 태운다
 * - `water` 물 → 최대 체력을 늘린다
 * - `dark` 어둠 → 체력을 대가로 필드의 저주를 태운다
 * - `light` 빛 → 체력을 채우고 덱에 저주를 넣는다
 */
export type ElementType = 'fire' | 'water' | 'dark' | 'light';

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
  /** 속성 카드일 때만 있다. 같은 속성이 필드에 모이면 시너지가 터진다. */
  element?: ElementType;
}

/** 덱에 실제로 들어 있는 카드 한 장. */
export interface CardInstance {
  uid: string;
  defId: string;
  name: string;
  kind: CardKind;
  value: number;
  curseType?: CurseType;
  element?: ElementType;
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
   * 속성일 수도, 저주일 수도 있다 — 그래서 "불린다"가 도박이 된다.
   */
  | { type: 'addAny'; count: number }
  /**
   * 플레이어가 **원하는 속성을 지정해서** 덱에 넣는다.
   *
   * 무작위 속성과 달리 조합을 노리고 고를 수 있어 값이 훨씬 크다. 그래서
   * 이 효과를 쓰는 짝은 희소도를 높게 잡는다.
   *
   * 즉시 끝나지 않고 선택 모드를 연다 — 푸시 유어 럭과 같은 방식으로 UI가
   * 네 속성 버튼을 띄우고 플레이어가 고른다.
   */
  | { type: 'chooseElement'; count: number }
  /** 이후 N회의 선택에 걸쳐 유지되는 제약을 건다. */
  | {
      type: 'lasting';
      id: string;
      label: string;
      turns: number;
      damage: number;
      side?: 'red' | 'blue';
      /** 걸려 있는 동안 새로 들어오는 저주를 막는다. */
      blockCurses?: boolean;
      /** 횟수가 다하면 적용할 효과. 지연 보상·지연 대가. */
      onExpire?: Effect[];
    }
  /** 덱의 속성 카드를 지정한 속성으로 바꾼다. 저주와 파편은 건드리지 않는다. */
  | { type: 'paintElement'; element: ElementType; count: number }
  /** 50%로 then, 아니면 otherwise. */
  | { type: 'coinFlip'; then: Effect[]; otherwise: Effect[] }
  /** 체력을 이 값으로 맞춘다. */
  | { type: 'setHp'; value: number };

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
  /** 걸려 있는 동안 새로 들어오는 저주를 막는다. */
  blockCurses?: boolean;
  /** 횟수가 다하면 적용할 효과. */
  onExpire?: Effect[];
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

/**
 * 어느 속성을 넣을지 플레이어가 고르는 중인 상태.
 *
 * 푸시 유어 럭과 같은 방식이다 — 효과는 모드만 열고, 실제 진행은 UI가 한
 * 장씩 몰고 간다. 다 고르면 모드가 닫히고 선택 루프가 이어진다.
 */
export interface ElementPick {
  /** 아직 고를 장수. */
  remaining: number;
  /** 처음에 고를 수 있었던 장수. 화면에 "2장 중 1장째"로 뜬다. */
  count: number;
  log: string[];
}

/** 뽑기를 계속할지 멈출지 플레이어가 정하는 중인 상태. */
export interface PushState {
  /** 지금까지 이 판에서 뽑은 장수. */
  drawn: number;
  /** 저주가 발동해 강제로 끝났으면 true. */
  stopped: boolean;
  log: string[];
}

/**
 * 확인한 카드 중 일부를 고르는 중인 상태.
 *
 * 효과는 모드만 연다. 어떤 장을 가져올지는 연출이 끝난 뒤 UI가 정한다.
 */
export interface FateState {
  /** 가져갈 장수. */
  keep: number;
  /** 공개된 카드. 아직 덱에 있다. */
  cards: CardInstance[];
}

export interface GameState {
  /** 몇 번째 선택인지. 1부터. */
  step: number;
  deck: CardInstance[];
  /**
   * 필드. 뽑은 카드는 여기 펼쳐진 채로 계속 남는다.
   *
   * 카드는 덱 → 필드 한 방향으로만 흐른다. 벗어나는 길은 제거 선택지,
   * 발동한 부패, 그리고 터진 시너지 셋이다 — 같은 것이 모이면 터지고
   * 그만큼 소멸한다. 그래서 모으는 것 자체가 소모처가 된다.
   */
  field: CardInstance[];
  /** 푸시 유어 럭 진행 중이면 채워진다. */
  push: PushState | null;
  /** 속성 지정 중이면 채워진다. 푸시와 마찬가지로 그 동안 선택 루프가 멈춘다. */
  pick: ElementPick | null;
  /** 확인한 카드 중 고르는 중이면 채워진다. */
  fate: FateState | null;
  /**
   * 탈출에 필요한 **필드** 파편 장수.
   *
   * 진척은 따로 세지 않는다 — 필드에 나온 파편이 곧 진척이라
   * `countShards(state.field)`가 언제나 정답이다.
   */
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

/**
 * 시드 기반 결정론적 난수 생성기.
 *
 * 로그라이크는 같은 시드에서 항상 같은 런이 재현되어야 디버깅과 리플레이가
 * 가능하다. Math.random 대신 항상 이 RNG를 사용한다.
 */

/** 문자열 시드를 32비트 정수로 변환한다 (xmur3). */
function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private state: number;

  constructor(seed: string | number) {
    const s = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    // 상태 0은 mulberry32를 고정점에 가두므로 피한다.
    this.state = s === 0 ? 0x9e3779b9 : s;
  }

  /** 현재 내부 상태. 저장/복원용. */
  getState(): number {
    return this.state;
  }

  /** getState로 얻은 값을 되돌려 런 중간부터 재현한다. */
  setState(state: number): void {
    this.state = state >>> 0;
  }

  /** [0, 1) 구간의 실수. */
  next(): number {
    // mulberry32
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 구간의 정수 (양끝 포함). */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`빈 범위: [${min}, ${max}]`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** 배열에서 하나를 균등하게 고른다. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('빈 배열에서 뽑을 수 없다');
    return items[this.int(0, items.length - 1)]!;
  }

  /** 원본을 건드리지 않고 섞은 새 배열을 반환한다 (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i]!;
      const b = out[j]!;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}


/**
 * 필드.
 *
 * 뽑은 카드는 쓰는 것이 아니라 필드에 펼쳐진 채로 남는다 — 잉카의 황금에서
 * 뒤집힌 카드가 계속 앞에 쌓이는 것과 같다. 소모라는 개념이 없다.
 *
 * 카드는 **덱 → 필드 한 방향으로만** 흐른다. 되돌아가는 길은 없다.
 *
 * 필드에서 벗어나는 길은 셋이다 — 제거 선택지, 발동한 부패, 그리고 **터진
 * 시너지**. 한때는 제거 선택지뿐이라 필드가 스스로 줄지 않고 무한정 쌓였다.
 * 지금은 모으는 것 자체가 소모처다.
 *
 * **저주도 속성도 전부 "필드에 놓이는 순간" 판정한다.** 매 선택마다 훑는
 * 지속 효과는 없다. 그래서 같은 것이 반복 발동하지 않고, 발동 시점이 항상
 * 플레이어가 뽑기를 누른 순간과 일치한다.
 *
 * 좋은 것과 나쁜 것이 **같은 문법**을 쓴다 — 필드에 같은 것이 모이면 터진다.
 * 그래서 플레이어가 배울 규칙이 하나뿐이다.
 */

let fieldUid = 0;

export function resetFieldUid(): void {
  fieldUid = 0;
}

function instantiateField(defId: string): CardInstance {
  const def = cardById(defId);
  fieldUid += 1;
  return {
    uid: `f${fieldUid}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
    ...(def.curseType ? { curseType: def.curseType } : {}),
    ...(def.element ? { element: def.element } : {}),
  };
}

/**
 * 파편 장수. 종류가 하나뿐이라 kind만 세면 된다.
 *
 * **필드에 나온 파편만 탈출 진척이다.** 덱에 넣는 것은 시작일 뿐이고,
 * 실제로 꺼내는 것이 과제다 — 덱이 두꺼우면 좀처럼 뽑히지 않는다.
 */
export function countShards(cards: CardInstance[]): number {
  return cards.filter((c) => c.kind === 'shard').length;
}

/** 유예가 걸려 있으면 새로 들어오는 저주를 받지 않는다. */
export function cursesBlocked(state: GameState): boolean {
  return state.lasting.some((l) => l.blockCurses);
}

/** 속성별 장수. 필드에 쓰면 시너지 진행도가 된다. */
export function elementCounts(cards: CardInstance[]): Record<ElementType, number> {
  const counts: Record<ElementType, number> = { fire: 0, water: 0, dark: 0, light: 0 };
  for (const c of cards) if (c.element) counts[c.element] += 1;
  return counts;
}

/** 덱 안의 저주 종류별 장수. 파멸 상한을 지키는 데 쓴다. */
export function curseCounts(cards: CardInstance[]): Record<CurseType, number> {
  const counts: Record<CurseType, number> = { doom: 0, rot: 0, erode: 0 };
  for (const c of cards) if (c.curseType) counts[c.curseType] += 1;
  return counts;
}

/** 덱 상한을 지키면서 저주 한 장을 만든다. */
export function makeCurse(state: GameState, rng: Rng): CardInstance {
  const counts = curseCounts([...state.deck, ...state.field]);
  const type = rng.pick(curseWeights(counts));
  return instantiateField(type);
}

/**
 * 한 장만 더 놓이면 발동하는 저주 종류. UI가 강하게 경고하는 대상이다.
 *
 * - 파멸: 문턱(3) 바로 아래, 즉 2장일 때. 이 구간이 최대 긴장이다.
 * - 부패: 문턱(2) 바로 아래부터. 1장이어도 하나 더 오면 터진다.
 * - 침식: 문턱이 없어 여기 들어오지 않는다 — 놓이면 무조건 발동한다.
 */
export function onEdge(field: CardInstance[]): CurseType[] {
  const counts = curseCounts(field);
  return (Object.keys(counts) as CurseType[]).filter((t) => {
    const threshold = CURSE_RULES[t].threshold;
    return threshold !== null && counts[t] >= threshold - 1;
  });
}

/** 한 장만 더 모으면 쓸 수 있게 되는 속성. 아직 발동은 아니다. */
export function elementsOnEdge(field: CardInstance[]): ElementType[] {
  const counts = elementCounts(field);
  const n = ELEMENT_SYNERGY_COUNT;
  return ELEMENT_ORDER.filter((t) => counts[t] === n - 1);
}

/** 속성 시너지를 **지금 쓸 수 있는지.** 네 속성 모두 같은 문턱이다. */
export function canFireSingle(field: CardInstance[], element: ElementType): boolean {
  return elementCounts(field)[element] >= ELEMENT_SYNERGY_COUNT;
}

export interface TriggerResult {
  type: CurseType;
  lines: string[];
  /** 즉사했는지. */
  fatal: boolean;
}

/** 필드 최고 도달 장수를 갱신한다. 종류별 존재감을 재는 값이다. */
function notePeak(state: GameState): void {
  const counts = curseCounts(state.field);
  for (const t of Object.keys(counts) as CurseType[]) {
    if (counts[t] > state.peakField[t]) state.peakField[t] = counts[t];
  }
}

/** 필드에서 해당 속성을 뒤에서부터 count장 걷어낸다. */
function removeElementFromField(state: GameState, element: ElementType, count: number): void {
  let left = count;
  for (let i = state.field.length - 1; i >= 0 && left > 0; i--) {
    if (state.field[i]!.element === element) {
      state.field.splice(i, 1);
      left -= 1;
    }
  }
}

/** 덱이나 필드에서 저주 한 장을 태운다. 위험한 종류부터 집는다. */
function burnCurse(pile: CardInstance[]): CardInstance | null {
  for (const type of CURSE_BURN_ORDER) {
    const i = pile.findIndex((c) => c.curseType === type);
    if (i >= 0) return pile.splice(i, 1)[0]!;
  }
  return null;
}

/**
 * 속성 시너지를 **플레이어가 쓴다.** 문턱을 넘겨 계속 쌓아 두는 것도 선택이다.
 *
 * 문턱을 넘겨도 **정확히 문턱만큼만** 소모한다. 7장을 들고 있다가 쓰면 5장이
 * 나가고 2장이 남는다 — 그래서 "지금 쓸까, 한 번 더 쓸 만큼 모을까"가 선다.
 * 나가는 것은 가장 나중에 놓인 쪽이다.
 *
 * 언제 쓰는지가 곧 판단이다. 물은 부패에 최대 체력을 깎인 뒤에 써야 이득이
 * 크고, 어둠은 체력이 버틸 때만 쓸 수 있다.
 */
export function fireSingle(state: GameState, element: ElementType, rng: Rng): string[] | null {
  if (!canFireSingle(state.field, element)) return null;

  const rule = ELEMENT_RULES[element];
  removeElementFromField(state, element, ELEMENT_SYNERGY_COUNT);
  const lines = [`${rule.name} 시너지 — ${ELEMENT_SYNERGY_COUNT}장을 썼다`];

  switch (element) {
    case 'fire': {
      const burned = burnCurse(state.deck);
      lines.push(burned ? `덱의 ${burned.name} 1장을 소각했다` : '덱에 태울 저주가 없었다');
      break;
    }

    case 'water': {
      state.maxHp += WATER_MAX_HP_GAIN;
      lines.push(`최대 체력 +${WATER_MAX_HP_GAIN} (${state.hp}/${state.maxHp})`);
      break;
    }

    case 'dark': {
      state.hp -= DARK_HP_COST;
      const burned = burnCurse(state.field);
      lines.push(`체력 -${DARK_HP_COST} (${Math.max(0, state.hp)}/${state.maxHp})`);
      lines.push(burned ? `필드의 ${burned.name} 1장을 소각했다` : '필드에 태울 저주가 없었다');
      break;
    }

    case 'light': {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + LIGHT_HP_GAIN);
      const gained = state.hp - before;
      lines.push(`체력 +${gained} (${state.hp}/${state.maxHp})`);
      if (cursesBlocked(state)) {
        lines.push('저주를 받지 않았다 (유예 중)');
        break;
      }
      const curse = makeCurse(state, rng);
      state.deck.push(curse);
      lines.push(`덱에 ${curse.name} 1장을 넣었다`);
      break;
    }
  }

  return lines;
}

/**
 * 저주 한 장이 필드에 놓인 직후의 발동 판정.
 *
 * **저주만 저절로 터진다.** 시너지는 조건이 차도 기다렸다가 플레이어가
 * 쓴다 — 저주는 닥치는 것이고 시너지는 쓰는 것이라, 여기서 갈린다.
 *
 * 세 저주는 공격 대상이 다르다 — 파멸은 목숨, 부패는 최대 체력, 침식은 체력.
 */
export function onPlaced(state: GameState, card: CardInstance, rng: Rng): TriggerResult | null {
  void rng; // 지금 세 저주 중 무작위를 쓰는 것은 없다. 시그니처는 유지한다.
  notePeak(state);

  const type = card.curseType;
  if (!type) return null;

  const counts = curseCounts(state.field);
  const rule = CURSE_RULES[type];
  const lines: string[] = [];
  let fatal = false;

  switch (type) {
    case 'doom': {
      if (counts.doom < DOOM_THRESHOLD) return null;
      state.hp = 0;
      fatal = true;
      lines.push(`파멸이 ${counts.doom}장 모였다 — 즉사.`);
      break;
    }

    case 'rot': {
      // 새로 놓인 이 장을 포함해 문턱에 닿아야 발동한다.
      if (counts.rot < ROT_THRESHOLD) return null;

      const before = state.maxHp;
      state.maxHp = Math.max(MIN_MAX_HP, state.maxHp - ROT_MAX_HP_LOSS);
      const lost = before - state.maxHp;
      state.rotMaxHpLost += lost;
      // 현재 체력이 새 최대치를 넘으면 최대치까지 끌어내린다.
      if (state.hp > state.maxHp) state.hp = state.maxHp;

      // 발동한 2장은 소멸한다 — 그래서 필드에 무한정 쌓이지 않고,
      // 부패는 반복해서 다시 쌓인다.
      removeFromField(state, 'rot', ROT_THRESHOLD);

      lines.push(
        lost > 0
          ? `부패 ${ROT_THRESHOLD}장이 모였다 — 최대 체력 ${before} → ${state.maxHp}`
          : `부패 ${ROT_THRESHOLD}장이 모였다 — 최대 체력은 하한(${MIN_MAX_HP})이라 그대로다`,
      );
      lines.push(`부패 ${ROT_THRESHOLD}장이 소멸했다 (${state.hp}/${state.maxHp})`);
      break;
    }

    case 'erode': {
      // 문턱도 중첩도 없다. 놓일 때마다 매번 문다.
      state.hp -= ERODE_DAMAGE;
      state.erodeDamage += ERODE_DAMAGE;
      lines.push(`침식이 놓였다 — 체력 -${ERODE_DAMAGE} (${Math.max(0, state.hp)}/${state.maxHp})`);
      break;
    }
  }

  state.triggers[type] += 1;
  if (state.firstPairAt === null) {
    state.firstPairAt = state.step;
    state.log.push(`   첫 저주 발동 — ${state.step}수째 (${rule.name})`);
  }

  return { type, lines, fatal };
}

/** 필드에서 해당 종류의 저주를 뒤에서부터 count장 걷어낸다. */
function removeFromField(state: GameState, type: CurseType, count: number): void {
  let left = count;
  for (let i = state.field.length - 1; i >= 0 && left > 0; i--) {
    if (state.field[i]!.curseType === type) {
      state.field.splice(i, 1);
      left -= 1;
    }
  }
}

/** 방금 놓인 카드들을 순서대로 판정한다. 부패는 놓인 순서가 결과를 바꾼다. */
export function resolvePlaced(
  state: GameState,
  placed: CardInstance[],
  rng: Rng,
): TriggerResult[] {
  const results: TriggerResult[] = [];
  for (const card of placed) {
    const result = onPlaced(state, card, rng);
    if (!result) continue;
    results.push(result);
    if (result.fatal) break;
  }
  return results;
}

/**
 * 덱에서 필드로 한 장 가져온다. 덱이 비면 null.
 * 발동 판정은 하지 않는다 — 호출하는 쪽이 onPlaced를 부른다.
 */
export function drawOne(state: GameState, rng: Rng): CardInstance | null {
  if (state.deck.length === 0) return null;
  const index = rng.int(0, state.deck.length - 1);
  const [card] = state.deck.splice(index, 1);
  if (!card) return null;
  state.field.push(card);
  return card;
}

/**
 * 여러 장 뽑는다. 한 장 놓을 때마다 바로 판정한다.
 *
 * 한꺼번에 놓고 나중에 훑지 않는 이유는 부패 때문이다 — 발동 장수가 "그
 * 시점의 필드 부패 수"라서, 두 장이 연달아 놓이면 2장·3장으로 두 번 터진다.
 */
export function drawToField(state: GameState, count: number, rng: Rng): string[] {
  const drawn: string[] = [];
  const lines: string[] = [];
  let stopped = false;

  for (let i = 0; i < count && !stopped; i++) {
    const card = drawOne(state, rng);
    if (!card) {
      drawn.push('덱이 비어 더 뽑을 수 없다');
      break;
    }
    drawn.push(card.name);

    const result = onPlaced(state, card, rng);
    if (result) {
      lines.push(...result.lines);
      if (result.fatal) stopped = true;
    }
  }

  return drawn.length ? [`뽑음: ${drawn.join(', ')}`, ...lines] : lines;
}

/** 필드에서 저주를 없앤다. 종류를 지정하면 그 종류만. 덱으로 돌아가지 않는다. */
export function purgeCurse(state: GameState, count: number, type?: CurseType): string[] {
  const targets = state.field.filter((c) => c.kind === 'curse' && (!type || c.curseType === type));
  if (targets.length === 0) {
    return [type ? `필드에 ${CURSE_RULES[type].name}이(가) 없었다` : '필드에 저주가 없었다'];
  }

  const removed = targets.slice(0, count);
  for (const card of removed) {
    const i = state.field.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.splice(i, 1);
  }
  return [`필드에서 없앰: ${removed.map((c) => c.name).join(', ')}`];
}

/** 필드에서 무작위로 없앤다. 저주가 걸릴지는 운이다. */
export function purgeRandom(state: GameState, count: number, rng: Rng): string[] {
  if (state.field.length === 0) return ['필드가 비어 없앨 것이 없다'];

  const picked = rng.shuffle(state.field).slice(0, count);
  for (const card of picked) {
    const i = state.field.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.splice(i, 1);
  }
  return [`필드에서 없앰: ${picked.map((c) => c.name).join(', ')}`];
}

/** 필드를 통째로 비운다. 저주도 보상도 전부 사라진다. */
export function purgeAll(state: GameState): string[] {
  if (state.field.length === 0) return ['필드가 이미 비어 있다'];
  const size = state.field.length;
  const curses = state.field.filter((c) => c.kind === 'curse').length;
  state.field = [];
  return [`필드 ${size}장을 전부 쓸어냈다 (저주 ${curses}장 포함)`];
}

/** 덱에서 count장을 고른다. 순서는 섞이지만 덱 자체는 건드리지 않는다. */
export function sampleDeck(state: GameState, count: number, rng: Rng): CardInstance[] {
  if (state.deck.length === 0) return [];
  return rng.shuffle(state.deck).slice(0, count);
}

/** 확인한 카드 중 taken만 필드로 옮긴다. 나머지는 덱에 남는다. */
export function applyPeekKeep(
  state: GameState,
  seen: CardInstance[],
  taken: CardInstance[],
  rng: Rng,
): string[] {
  for (const card of taken) {
    const i = state.deck.findIndex((c) => c.uid === card.uid);
    if (i >= 0) state.field.push(...state.deck.splice(i, 1));
  }

  const lines = [
    `확인: ${seen.map((c) => c.name).join(', ')}`,
    `가져옴: ${taken.map((c) => c.name).join(', ') || '없음'}`,
  ];
  for (const t of resolvePlaced(state, taken, rng)) lines.push(...t.lines);
  return lines;
}

/** 덱 맨 위 count장을 보고 keep장만 필드로. 나머지는 덱에 그대로 남는다. */
export function peek(state: GameState, count: number, keep: number, rng: Rng): string[] {
  if (state.deck.length === 0) return ['덱이 비어 볼 것이 없다'];

  const seen = sampleDeck(state, count, rng);
  // 멀쩡한 카드를 값어치 높은 순으로 고른다. 저주는 마지막에.
  const ranked = [...seen].sort((a, b) => {
    const ca = a.kind === 'curse' ? 1 : 0;
    const cb = b.kind === 'curse' ? 1 : 0;
    return ca - cb || b.value - a.value;
  });
  return applyPeekKeep(state, seen, ranked.slice(0, keep), rng);
}

/** 속성 풀에서 필드로 바로 넣는다. 저주는 이 경로로 들어오지 않는다. */
export function addToField(
  state: GameState,
  kind: 'element',
  count: number,
  rng: Rng,
): string[] {
  const pool = poolOf(kind);
  const added: string[] = [];
  for (let i = 0; i < count; i++) {
    const def = rng.pick(pool);
    state.field.push(instantiateField(def.id));
    added.push(def.name);
  }
  return added.length ? [`필드에 추가: ${added.join(', ')}`] : [];
}


/**
 * 선택지가 덱에 가하는 조작.
 *
 * 모든 조작은 "가능한 만큼만" 적용된다. 저주 2장을 지우라고 했는데 1장뿐이면
 * 1장만 지우고 넘어간다. 선택지가 덱 상태에 걸려 멈추면 루프가 끊기기 때문이다.
 */

let uidCounter = 0;

export function resetUidCounter(): void {
  uidCounter = 0;
}

/**
 * `curseType`을 반드시 같이 옮긴다.
 *
 * 이게 빠져 있던 동안 transform으로 만들어진 저주는 종류가 없는 껍데기였다 —
 * 필드에 깔려도 겹치지 않고, 부패라면 체력을 갉지도 않고, 파멸이라도 죽이지
 * 않았다. 오염도 숫자만 올라가고 저주로서는 아무 일도 하지 않았다.
 */
function instantiateDeck(defId: string): CardInstance {
  const def = cardById(defId);
  uidCounter += 1;
  return {
    uid: `k${uidCounter}`,
    defId: def.id,
    name: def.name,
    kind: def.kind,
    value: def.value,
    ...(def.curseType ? { curseType: def.curseType } : {}),
    ...(def.element ? { element: def.element } : {}),
  };
}

export function countKind(deck: CardInstance[], kind: CardKind): number {
  return deck.filter((c) => c.kind === kind).length;
}

export function evaluateField(state: GameState, cond: FieldCondition): boolean {
  switch (cond.type) {
    case 'fieldCurseAtLeast':
      return countKind(state.field, 'curse') >= cond.n;
    case 'fieldSizeAtLeast':
      return state.field.length >= cond.n;
    case 'fieldSizeAtMost':
      return state.field.length <= cond.n;
  }
}

export function evaluate(state: GameState, cond: Condition): boolean {
  switch (cond.type) {
    case 'countAtLeast':
      return countKind(state.deck, cond.kind) >= cond.n;
    case 'countAtMost':
      return countKind(state.deck, cond.kind) <= cond.n;
    case 'deckAtLeast':
      return state.deck.length >= cond.n;
    case 'deckAtMost':
      return state.deck.length <= cond.n;
  }
}

/** 종류별 카드를 값어치 낮은 순으로. 제거는 싼 것부터 집는다. */
function pickForRemoval(deck: CardInstance[], kind: CardKind, count: number): CardInstance[] {
  return deck
    .filter((c) => c.kind === kind)
    .sort((a, b) => a.value - b.value)
    .slice(0, count);
}

/**
 * 종류를 명시하지 않은 제거("값싼 카드부터 버린다")에서 빠지는 카드들.
 *
 * 파편은 값어치가 0이라 가장 먼저 걸린다. 그러면 아직 뽑지도 못한 탈출
 * 수단이 모르는 사이에 사라진다.
 *
 * 저주도 값이 싸서 매번 먼저 잘려 나갔다. 그 결과 짐을 덜어낼 때마다 저주가
 * 공짜로 청소돼 오염도가 5%를 넘지 못했고, 저주 페널티 자체가 성립하지 않았다
 * (무지성 플레이 탈출률 99%). 저주는 정리형 선택지로만 지운다.
 */
function removable(deck: CardInstance[]): CardInstance[] {
  return deck.filter((c) => c.kind !== 'shard' && c.kind !== 'curse');
}

function removeCards(state: GameState, targets: CardInstance[]): void {
  for (const t of targets) {
    const i = state.deck.findIndex((c) => c.uid === t.uid);
    if (i >= 0) state.deck.splice(i, 1);
  }
}

const KIND_NAME: Record<CardKind, string> = {
  element: '속성',
  curse: '저주',
  shard: '파편',
};

/**
 * 효과 하나를 적용하고 사람이 읽을 변화 요약을 돌려준다.
 * 요약은 로그와 테스트 양쪽에서 쓴다.
 */
export function applyEffect(state: GameState, effect: Effect, rng: Rng): string[] {
  switch (effect.type) {
    case 'addSpecific': {
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        if (cursesBlocked(state) && cardById(effect.cardId).kind === 'curse') {
          return [`저주를 받지 않았다 (유예 중)`];
        }
        const card = instantiateDeck(effect.cardId);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'addRandom': {
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        if (effect.kind === 'curse' && cursesBlocked(state)) {
          return [`저주를 받지 않았다 (유예 중)`];
        }
        // 저주는 종류별 덱 상한(특히 파멸)을 지켜야 하므로 makeCurse를 거친다.
        const card = effect.kind === 'curse' ? makeCurse(state, rng) : instantiateDeck(rng.pick(poolOf(effect.kind)).id);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'removeKind': {
      const targets = pickForRemoval(state.deck, effect.kind, effect.count);
      removeCards(state, targets);
      if (targets.length === 0) return [`${KIND_NAME[effect.kind]} 카드가 없어 지울 것이 없었다`];
      const short = targets.length < effect.count ? ` (${effect.count}장 중 ${targets.length}장뿐)` : '';
      return [`- ${targets.map((t) => t.name).join(', ')}${short}`];
    }

    case 'removeExtreme': {
      const sorted = removable(state.deck).sort((a, b) =>
        effect.end === 'highest' ? b.value - a.value : a.value - b.value,
      );
      const targets = sorted.slice(0, effect.count);
      removeCards(state, targets);
      if (targets.length === 0) return ['덱이 비어 지울 것이 없었다'];
      return [`- ${targets.map((t) => `${t.name}(${t.value})`).join(', ')}`];
    }

    case 'transform': {
      if (effect.to === 'curse' && cursesBlocked(state)) {
        return [`저주를 받지 않았다 (유예 중)`];
      }
      const targets = pickForRemoval(state.deck, effect.from, effect.count);
      removeCards(state, targets);
      const pool = poolOf(effect.to);
      const made: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        // addRandom과 같은 이유로 저주는 makeCurse를 거친다 — 안 그러면
        // "중립이 전부 저주가 된다" 한 방으로 파멸이 상한을 넘어 쏟아진다.
        const card = effect.to === 'curse' ? makeCurse(state, rng) : instantiateDeck(rng.pick(pool).id);
        state.deck.push(card);
        made.push(card.name);
      }
      if (targets.length === 0) return [`바꿀 ${KIND_NAME[effect.from]} 카드가 없었다`];
      return [`${targets.map((t) => t.name).join(', ')} → ${made.join(', ')}`];
    }

    case 'shard': {
      // 덱에 넣기만 한다. 탈출 진척은 **필드에 나왔을 때** 올라간다.
      for (let i = 0; i < effect.count; i++) state.deck.push(instantiateDeck('shard'));
      const inDeck = countShards(state.deck);
      return [`+ 탈출구 파편 ×${effect.count} — 덱에 ${inDeck}장 (뽑아야 진척이 된다)`];
    }

    case 'damage': {
      state.hp -= effect.amount;
      return [`체력 -${effect.amount} (${Math.max(0, state.hp)}/${state.maxHp})`];
    }

    case 'heal': {
      const before = state.hp;
      state.hp = Math.min(state.maxHp, state.hp + effect.amount);
      const gained = state.hp - before;
      return gained > 0 ? [`체력 +${gained} (${state.hp}/${state.maxHp})`] : [];
    }

    /* ---------- 필드 조작 ---------- */

    case 'drawField':
      return drawToField(state, effect.count, rng);

    case 'pushLuck':
      // 실제 진행은 UI가 한 장씩 몰고 간다. 여기서는 모드만 연다.
      state.push = { drawn: 0, stopped: false, log: [] };
      return ['한 장씩 뽑는다 — 멈출 때까지'];

    case 'peek': {
      // 실제 고르기는 연출이 끝난 뒤 UI가 한다. 여기서는 확인할 장만 고른다.
      const cards = sampleDeck(state, effect.count, rng);
      if (cards.length === 0) return ['덱이 비어 볼 것이 없다'];
      state.fate = { keep: Math.min(effect.keep, cards.length), cards };
      return [`덱에서 ${cards.length}장을 확인한다`];
    }

    case 'purgeCurse':
      return purgeCurse(state, effect.count, effect.curseType);

    case 'purgeRandom':
      return purgeRandom(state, effect.count, rng);

    case 'purgeAll':
      return purgeAll(state);

    case 'healPerFieldCard': {
      const gained = state.field.length * effect.amount;
      if (gained === 0) return ['필드가 비어 회복이 없다'];
      return applyEffect(state, { type: 'heal', amount: gained }, rng);
    }

    case 'ifField': {
      const branch = evaluateField(state, effect.when) ? effect.then : effect.otherwise;
      return branch.flatMap((e) => applyEffect(state, e, rng));
    }

    case 'ifThen': {
      const branch = evaluate(state, effect.when) ? effect.then : effect.otherwise;
      return branch.flatMap((e) => applyEffect(state, e, rng));
    }

    case 'addAny': {
      // 종류를 가리지 않는다 — 저주가 섞여 있어서 "불린다"가 도박이 된다.
      // 보상·중립을 속성 하나로 합치면서도 저주가 걸릴 확률은 3분의 1로
      // 그대로 둔다. 속성을 두 번 넣은 것은 그 비율을 지키기 위해서다.
      const kinds: CardKind[] = ['element', 'element', 'curse'];
      const added: string[] = [];
      for (let i = 0; i < effect.count; i++) {
        const kind = rng.pick(kinds);
        if (kind === 'curse' && cursesBlocked(state)) {
          added.push('저주 유예');
          continue;
        }
        // 저주는 종류별 덱 상한을 지켜야 하므로 makeCurse를 거친다.
        const card = kind === 'curse' ? makeCurse(state, rng) : instantiateDeck(rng.pick(poolOf(kind)).id);
        state.deck.push(card);
        added.push(card.name);
      }
      return added.length ? [`+ ${added.join(', ')}`] : [];
    }

    case 'chooseElement': {
      // 실제 진행은 UI가 한 장씩 몰고 간다. 여기서는 모드만 연다 —
      // 푸시 유어 럭과 같은 방식이다.
      state.pick = { remaining: effect.count, count: effect.count, log: [] };
      return [`속성 ${effect.count}장을 직접 고른다`];
    }

    case 'lasting': {
      // 같은 종류라도 새로 걸면 별도 항목이다. 덮어쓰면 먼저 건 지연 보상이
      // 사라지고 카운트만 리셋된다.
      state.lasting.push({
        id: effect.id,
        label: effect.label,
        remaining: effect.turns,
        damage: effect.damage,
        ...(effect.side ? { side: effect.side } : {}),
        ...(effect.blockCurses ? { blockCurses: true } : {}),
        ...(effect.onExpire ? { onExpire: effect.onExpire } : {}),
      });
      return [`${effect.label} (${effect.turns}회)`];
    }

    case 'paintElement': {
      const candidates = state.deck.filter((c) => c.kind === 'element');
      const picked = rng.shuffle(candidates).slice(0, effect.count);
      if (picked.length === 0) return ['바꿀 속성 카드가 없었다'];
      removeCards(state, picked);
      const made: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const card = instantiateDeck(effect.element);
        state.deck.push(card);
        made.push(card.name);
      }
      const short = picked.length < effect.count ? ` (${effect.count}장 중 ${picked.length}장뿐)` : '';
      return [`${picked.map((t) => t.name).join(', ')} → ${made.join(', ')}${short}`];
    }

    case 'coinFlip': {
      const branch = rng.next() < 0.5 ? effect.then : effect.otherwise;
      const outcome = branch === effect.then ? '성공' : '실패';
      return [`동전 ${outcome}`, ...branch.flatMap((e) => applyEffect(state, e, rng))];
    }

    case 'setHp': {
      state.hp = effect.value;
      return [`체력이 ${effect.value}이 되었다 (${state.hp}/${state.maxHp})`];
    }
  }
}

export function applyEffects(state: GameState, effects: Effect[], rng: Rng): string[] {
  return effects.flatMap((e) => applyEffect(state, e, rng));
}

/** 필드로 바로 놓는 속성 카드. 선택지에서 쓴다. */
export function grantToField(
  state: GameState,
  kind: 'element',
  count: number,
  rng: Rng,
): string[] {
  // 저주는 이 경로로 들어오지 않지만, 속성은 놓이는 순간 시너지가 터질 수
  // 있으므로 판정을 거쳐야 한다.
  const before = state.field.length;
  const lines = addToField(state, kind, count, rng);
  for (const t of resolvePlaced(state, state.field.slice(before), rng)) lines.push(...t.lines);
  return lines;
}

/** 초기 덱을 만든다. */
export function buildDeck(ids: string[]): CardInstance[] {
  return ids.map(instantiateDeck);
}


/**
 * 선택 루프. 버튼을 누르면 덱과 필드가 바뀐다.
 *
 * 끝나는 길은 둘, 탈출(파편을 목표만큼 모음)과 사망(체력 0)이다.
 */

export interface DeckSummary {
  total: number;
  element: number;
  curse: number;
  shard: number;
  /** 저주 비율 0~1. */
  taint: number;
  taintLabel: string;
  taintTone: string;
}

/** 덱과 필드를 합친 전체 보유 카드. */
export function ownedCards(state: GameState): CardInstance[] {
  return [...state.deck, ...state.field];
}

/** 필드에 깔린 저주를 종류별로. "다음에 뭐가 겹칠까"를 보는 값이다. */
export function fieldCurseBreakdown(state: GameState): Record<CurseType, number> {
  return curseCounts(state.field);
}

/** 필드에 깔린 속성을 종류별로. 그대로 시너지 진행도다. */
export function fieldElementBreakdown(state: GameState): Record<ElementType, number> {
  return elementCounts(state.field);
}

/** 덱에 남아 있는 속성을 종류별로. 앞으로 무엇을 뽑을 수 있는지 보는 값이다. */
export function deckElementBreakdown(state: GameState): Record<ElementType, number> {
  return elementCounts(state.deck);
}

/** 덱에 남아 있는 저주를 종류별로. UI에 "파멸 2 / 부패 5 / 침식 3"으로 뜬다. */
export function deckCurseBreakdown(state: GameState): Record<CurseType, number> {
  return curseCounts(state.deck);
}

export function summarize(state: GameState): DeckSummary {
  const owned = ownedCards(state);
  const total = owned.length;
  const curse = countKind(owned, 'curse');
  const taint = total === 0 ? 0 : curse / total;
  const level = TAINT_LEVELS.find((l) => taint < l.max) ?? TAINT_LEVELS[TAINT_LEVELS.length - 1]!;

  return {
    total,
    element: countKind(owned, 'element'),
    curse,
    shard: countKind(owned, 'shard'),
    taint,
    taintLabel: level.label,
    taintTone: level.tone,
  };
}

function effectsDrawFromDeck(effects: Effect[]): boolean {
  for (const e of effects) {
    if (e.type === 'drawField' || e.type === 'peek' || e.type === 'pushLuck') return true;
    if (e.type === 'ifField' || e.type === 'ifThen' || e.type === 'coinFlip') {
      if (effectsDrawFromDeck(e.then) || effectsDrawFromDeck(e.otherwise)) return true;
    }
    if (e.type === 'lasting' && e.onExpire && effectsDrawFromDeck(e.onExpire)) return true;
  }
  return false;
}

function effectsAddToDeck(effects: Effect[]): boolean {
  for (const e of effects) {
    if (
      e.type === 'addSpecific' ||
      e.type === 'addRandom' ||
      e.type === 'addAny' ||
      e.type === 'shard' ||
      e.type === 'chooseElement'
    ) {
      return true;
    }
    if (e.type === 'ifField' || e.type === 'ifThen' || e.type === 'coinFlip') {
      if (effectsAddToDeck(e.then) || effectsAddToDeck(e.otherwise)) return true;
    }
    if (e.type === 'lasting' && e.onExpire && effectsAddToDeck(e.onExpire)) return true;
  }
  return false;
}

function pairDraws(pair: ChoicePair): boolean {
  return effectsDrawFromDeck(pair.red.effects) || effectsDrawFromDeck(pair.blue.effects);
}

function pairInserts(pair: ChoicePair): boolean {
  return effectsAddToDeck(pair.red.effects) || effectsAddToDeck(pair.blue.effects);
}

function flowMultiplier(pair: ChoicePair, deckSize: number): number {
  const draw = pairDraws(pair);
  const insert = pairInserts(pair);
  if (draw === insert) return PAIR_FLOW_WEIGHT_MID;
  const thin = deckSize <= DECK_THIN_AT;
  const thick = deckSize >= DECK_THICK_AT;
  if (insert) {
    if (thin) return PAIR_INSERT_WEIGHT_THIN;
    if (thick) return PAIR_INSERT_WEIGHT_THICK;
    return PAIR_FLOW_WEIGHT_MID;
  }
  if (thin) return PAIR_DRAW_WEIGHT_THIN;
  if (thick) return PAIR_DRAW_WEIGHT_THICK;
  return PAIR_FLOW_WEIGHT_MID;
}

function pairPickWeight(pair: ChoicePair, deckSize: number): number {
  return PAIR_RARITY_WEIGHT[pair.rarity] * flowMultiplier(pair, deckSize);
}

/**
 * 다음 짝을 뽑는다.
 *
 * 짝은 고정된 테이블에서 통째로 나온다 — 조합하지 않는다. 희소도와
 * 지금 덱 장수가 "어떤 짝을 얼마나 자주 만나는가"를 정한다.
 *
 * 덱이 비면 꺼내는 짝은 후보에서 뺀다. 최근 몇 개만 걸러
 * "방금 그거 또?"를 막되, 그 이상 거르면 순번 돌리기가 된다.
 */
export function drawPair(state: GameState, rng: Rng): ChoicePair {
  const canShow = (p: ChoicePair) => state.deck.length > 0 || !pairDraws(p);
  const fresh = PAIR_TABLE.filter((p) => !state.recent.includes(p.id) && canShow(p));
  const rest = PAIR_TABLE.filter(canShow);
  const pool = fresh.length > 0 ? fresh : rest.length > 0 ? rest : PAIR_TABLE;

  let total = 0;
  const weights = pool.map((p) => {
    const w = pairPickWeight(p, state.deck.length);
    total += w;
    return w;
  });
  let roll = rng.next() * (total || 1);
  let picked = pool[pool.length - 1]!;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) {
      picked = pool[i]!;
      break;
    }
  }

  const stat = (state.pairStats[picked.id] ??= { seen: 0, red: 0, blue: 0 });
  stat.seen += 1;
  state.rarityStats[picked.rarity] += 1;
  return picked;
}

function remember(state: GameState, pair: ChoicePair): void {
  state.recent.push(pair.id);
  while (state.recent.length > RECENT_PAIRS) state.recent.shift();
}

export function createGame(rng: Rng): GameState {
  const state: GameState = {
    step: 1,
    deck: buildDeck(STARTING_DECK),
    escapeTarget: ESCAPE_TARGET,
    escaped: false,
    hp: MAX_HP,
    maxHp: MAX_HP,
    dead: false,
    field: [],
    push: null,
    pick: null,
    fate: null,
    current: null,
    recent: [],
    log: [],
    records: [],
    lasting: [],
    triggers: { doom: 0, rot: 0, erode: 0 },
    peakField: { doom: 0, rot: 0, erode: 0 },
    erodeDamage: 0,
    rotMaxHpLost: 0,
    causeOfDeath: null,
    fieldSizes: [],
    riskyDraws: { taken: 0, paired: 0 },
    deckEmptiedAt: null,
    firstPairAt: null,
    pairStats: {},
    rarityStats: { common: 0, uncommon: 0, rare: 0, ultra: 0 },
  };

  // 필드는 비어서 시작한다. 오직 선택지를 통해서만 채워진다.
  void FIELD_START;

  state.current = drawPair(state, rng);
  remember(state, state.current);
  state.log.push(
    `시작. 덱 ${state.deck.length}장, 필드 ${state.field.length}장, 체력 ${MAX_HP}. ` +
      `필드 파편 0/${ESCAPE_TARGET} (덱에서 뽑아야 진척이 된다).`,
  );

  return state;
}

/** 한쪽을 고르고 덱에 즉시 반영한 뒤 다음 선택지를 제시한다. */
export function choose(state: GameState, side: 'red' | 'blue', rng: Rng): void {
  if (state.escaped || state.dead || state.push || state.pick || state.fate || !state.current) return;

  const pair = state.current;
  const option = pair[side];

  // 어느 쪽을 골랐는지는 이번 단계의 핵심 지표다. 짝이 9개뿐이라 반복은
  // 당연하고, 같은 짝에서 매번 같은 쪽만 고른다면 그 짝은 죽은 것이다.
  const stat = (state.pairStats[pair.id] ??= { seen: 0, red: 0, blue: 0 });
  stat[side] += 1;

  // 선택 직전의 상태를 찍어 둔다 — 같은 짝이 상황에 따라 다르게 읽히는지
  // 보려면 "그때 덱과 필드가 어땠는가"가 있어야 한다.
  const before = summarize(state);
  const snapshot = {
    deckSize: state.deck.length,
    fieldSize: state.field.length,
    curseCount: before.curse,
    hp: Math.max(0, state.hp),
  };

  // 지속 효과는 선택의 결과가 적용되기 전에 문다.
  const changes = tickLasting(state, side);
  changes.push(...applyEffects(state, option.effects, rng));
  // 횟수가 다한 효과의 지연 대가는 이번 선택 효과가 끝난 뒤에 온다.
  changes.push(...expireLasting(state, rng));

  // 푸시 유어 럭은 모드만 열리고, 첫 장은 여기서 뽑는다 — 저주면 즉시 멈춘다.
  const opened = state.push as PushState | null;
  if (opened && opened.drawn === 0 && !opened.stopped) {
    pushDraw(state, rng);
  }

  // 저주는 필드에 놓이는 순간 뽑기 쪽에서 이미 판정됐다. 매 선택 끝에
  // 필드를 다시 훑지 않는다 — 그러면 같은 저주가 반복 발동한다.
  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);

  state.records.push({
    step: state.step,
    pairId: pair.id,
    side,
    text: option.text,
    changes,
    ...snapshot,
  });

  state.log.push(`${state.step}. [${side === 'red' ? '빨강' : '파랑'}] ${option.text}`);
  for (const c of changes) state.log.push(`   ${c}`);

  // 푸시 유어 럭이나 속성 지정이 열렸으면 플레이어가 끝낼 때까지 기다린다.
  if (state.push || state.pick || state.fate) return;

  advance(state, rng);
}

/**
 * 속성 지정에서 한 장을 고른다. 다 고르면 모드가 닫히고 선택 루프가 이어진다.
 *
 * 덱에 넣는다 — 필드로 바로 가지 않는다. 고른 속성이 언제 나올지는 여전히
 * 덱 사정이라, 지정은 조합을 확정하는 것이 아니라 확률을 기울이는 것이다.
 */
export function pickElement(state: GameState, element: ElementType, rng: Rng): void {
  const pick = state.pick;
  if (!pick || pick.remaining <= 0) return;

  const def = elementDef(element);
  state.deck.push(...buildDeck([def.id]));
  pick.remaining -= 1;
  pick.log.push(`${def.name} 1장을 덱에 넣었다`);

  if (pick.remaining > 0) return;

  state.log.push(`   속성 ${pick.count}장 지정 — ${pick.log.join(', ')}`);
  state.pick = null;
  advance(state, rng);
}

/**
 * 지속 효과를 한 번 진행시킨다.
 *
 * 봉인된 색을 눌렀으면 피해를 물고, 무슨 선택을 하든 남은 횟수는 1 줄어든다.
 * 0이 되면 사라진다 — 그래서 봉인된 색을 피해 다니면 피해 없이 흘려보낼 수
 * 있고, "5회 동안 한쪽을 못 쓴다"가 제약이 된다.
 */
function tickLasting(state: GameState, side: 'red' | 'blue'): string[] {
  const lines: string[] = [];

  for (const l of state.lasting) {
    if ((l.side === undefined || l.side === side) && l.damage > 0) {
      state.hp -= l.damage;
      lines.push(`${l.label} — 체력 -${l.damage} (${Math.max(0, state.hp)}/${state.maxHp})`);
    }
    l.remaining -= 1;
  }

  return lines;
}

/** 횟수가 다한 지속 효과를 거두고, 지연된 대가를 적용한다. */
function expireLasting(state: GameState, rng: Rng): string[] {
  const expired = state.lasting.filter((l) => l.remaining <= 0);
  state.lasting = state.lasting.filter((l) => l.remaining > 0);
  const lines: string[] = [];
  for (const l of expired) {
    lines.push(`${l.label} — 풀렸다`);
    if (l.onExpire) lines.push(...applyEffects(state, l.onExpire, rng));
  }
  return lines;
}

/** 사망 처리. 무엇에 죽었는지 남긴다. */
function die(state: GameState): void {
  state.hp = 0;
  state.dead = true;
  state.current = null;
  state.push = null;
  state.fate = null;

  // 마지막 몇 줄에서 사인을 읽는다. 저주마다 노리는 것이 달라서, 무엇에
  // 죽었는지가 곧 "이번 판은 어느 저주가 위험했는가"의 답이 된다.
  const last = state.log.slice(-8).reverse();
  const cause = last.find((l) => l.includes('즉사'))
    ? '파멸이 쌓였다'
    : last.find((l) => l.includes('침식이 놓였다'))
      ? '침식에 체력이 깎였다'
      : last.find((l) => l.includes('필드의') && l.includes('소각'))
        ? '어둠 시너지가 체력을 가져갔다'
        : '체력이 바닥났다';
  state.causeOfDeath = cause;
  state.log.push(
    `사망 — ${cause}. 필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음, ` +
      `필드 파편 ${countShards(state.field)}/${state.escapeTarget}.`,
  );
}

/**
 * 푸시 유어 럭에서 한 장 더 뽑는다.
 *
 * 저주가 겹치면 그 자리에서 발동하고 뽑기가 강제로 끝난다. 손패에 저주 1장을
 * 들고 한 장 더 가는 순간이 이 시스템의 핵심이라, 그 시도와 결과를 따로 센다.
 */
export function pushDraw(state: GameState, rng: Rng): void {
  const push = state.push;
  if (!push || push.stopped) return;

  const edged = onEdge(state.field).length > 0;
  if (edged) state.riskyDraws.taken += 1;

  const card = drawOne(state, rng);
  if (!card) {
    push.stopped = true;
    push.log.push('덱이 비었다');
    return;
  }

  push.drawn += 1;
  push.log.push(`${push.drawn}장째 — ${card.name}`);

  // 뽑기를 끊는 것은 저주뿐이다. 시너지는 조건이 차도 저절로 터지지 않으므로
  // 뽑던 흐름을 건드리지 않는다 — 오히려 "한 장 더"가 시너지를 완성시킨다.
  const triggered = onPlaced(state, card, rng);
  if (card.kind === 'curse') {
    if (edged) state.riskyDraws.paired += 1;
    if (triggered) push.log.push(...triggered.lines);
    push.stopped = true;
    push.log.push('저주가 나왔다 — 뽑기가 여기서 끝난다');
    return;
  }
  if (triggered) {
    if (edged) state.riskyDraws.paired += 1;
    push.log.push(...triggered.lines);
    push.stopped = true;
    push.log.push('저주가 발동했다 — 뽑기가 여기서 끝난다');
  }
}

/**
 * 확인한 카드 중 고른 장을 필드로 옮기고 선택 루프를 이어간다.
 *
 * 어떤 장을 가져올지만 바뀐다. 필드로 옮긴 뒤의 판정은 엿보기와 같다.
 */
export function resolveFate(state: GameState, takenUids: string[], rng: Rng): void {
  const fate = state.fate;
  if (!fate) return;

  const taken: CardInstance[] = [];
  for (const uid of takenUids) {
    if (taken.length >= fate.keep) break;
    const card = fate.cards.find((c) => c.uid === uid);
    if (card && !taken.some((t) => t.uid === card.uid)) taken.push(card);
  }

  const lines = applyPeekKeep(state, fate.cards, taken, rng);
  state.fate = null;

  const rec = state.records[state.records.length - 1];
  if (rec) rec.changes.push(...lines);
  for (const line of lines) state.log.push(`   ${line}`);

  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);
  advance(state, rng);
}

/** 추적을 포기하고 확인한 장 중에서 무작위로 가져온다. 게임 난수는 쓰지 않는다. */
export function abandonFate(state: GameState, rng: Rng): void {
  const fate = state.fate;
  if (!fate) return;
  const pool = fate.cards.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = a;
  }
  resolveFate(
    state,
    pool.slice(0, fate.keep).map((c) => c.uid),
    rng,
  );
}

/** 푸시 유어 럭을 접고 선택 루프로 돌아간다. */
export function pushStop(state: GameState, rng: Rng): void {
  const push = state.push;
  if (!push) return;

  state.log.push(`   ${push.drawn}장 뽑고 ${push.stopped ? '중단됨' : '멈췄다'}`);
  for (const line of push.log) state.log.push(`   ${line}`);
  state.push = null;

  state.fieldSizes.push(state.field.length);
  noteDeckEmpty(state);
  advance(state, rng);
}

/** 덱이 바닥난 시점을 한 번만 기록한다. 이후 처리는 아직 설계 전이다. */
function noteDeckEmpty(state: GameState): void {
  if (state.deck.length === 0 && state.deckEmptiedAt === null) {
    state.deckEmptiedAt = state.step;
    state.log.push(`   덱이 바닥났다 (${state.step}수째) — 더 뽑을 수 없다`);
  }
}

/**
 * 다음 선택지를 세운다. 탈출·사망 판정도 여기서 한다.
 * 죽음이 탈출보다 먼저다 — 마지막 파편을 쥐고 죽으면 죽은 것이다.
 */
function advance(state: GameState, rng: Rng): void {
  if (settle(state)) return;

  state.step += 1;
  state.current = drawPair(state, rng);
  remember(state, state.current);
}

/**
 * 판이 끝났는지만 본다. 다음 선택지는 세우지 않는다.
 *
 * 시너지 사용은 선택 한 번을 쓰지 않지만 판을 끝낼 수는 있다 — 어둠은 체력을
 * 가져간다. 그래서 판정만 따로 떼어 둔다.
 */
function settle(state: GameState): boolean {
  if (state.hp <= 0) {
    die(state);
    return true;
  }

  // 탈출은 **필드에 나온** 파편으로만 센다. 덱에 아무리 많아도 뽑지 못하면
  // 진척이 아니다 — 덱 관리가 곧 탈출이다.
  if (countShards(state.field) >= state.escapeTarget) {
    state.escaped = true;
    state.current = null;
    state.log.push(
      `탈출 성공 — 필드 파편 ${countShards(state.field)}/${state.escapeTarget}. ` +
        `필드 ${state.field.length}장, 덱 ${state.deck.length}장 남음.`,
    );
    return true;
  }

  return false;
}

/**
 * 시너지를 쓴다. **선택 한 번을 소모하지 않는다.**
 *
 * 조건이 찬 채로 기다렸다가 원할 때 쓰는 것이 이 시스템의 전부라, 쓰는 데
 * 턴이 들면 "언제 쓸까"가 다시 "쓸 수 있을 때 쓴다"로 돌아간다.
 */
export function useSynergy(state: GameState, target: ElementType, rng: Rng): void {
  if (state.escaped || state.dead || state.push || state.pick || state.fate) return;

  const lines = fireSingle(state, target, rng);
  if (!lines) return;

  state.log.push(`${state.step}. [시너지]`);
  for (const l of lines) state.log.push(`   ${l}`);

  // 기록에 남겨야 직전 결과 줄에 뜬다 — 무엇이 사라지고 무엇을 얻었는지가
  // 화면에서 바로 읽혀야 한다.
  state.records.push({
    step: state.step,
    pairId: `synergy:${target}`,
    side: 'red',
    text: '시너지 사용',
    changes: lines,
    deckSize: state.deck.length,
    fieldSize: state.field.length,
    curseCount: summarize(state).curse,
    hp: Math.max(0, state.hp),
  });

  settle(state);
}

/** 종류별 장수를 세어 정렬된 목록으로. UI에서 덱 확인용. */
export function deckByKind(state: GameState): { kind: CardKind; cards: { name: string; value: number; count: number }[] }[] {
  const kinds: CardKind[] = ['element', 'curse', 'shard'];

  const owned = ownedCards(state);
  return kinds.map((kind) => {
    const grouped = new Map<string, { name: string; value: number; count: number }>();
    for (const card of owned) {
      if (card.kind !== kind) continue;
      const entry = grouped.get(card.defId);
      if (entry) entry.count += 1;
      else grouped.set(card.defId, { name: card.name, value: card.value, count: 1 });
    }
    return {
      kind,
      cards: [...grouped.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)),
    };
  });
}

