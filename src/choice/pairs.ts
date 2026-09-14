import { SEAL_DAMAGE, SEAL_TURNS } from './balance';
import type { ChoicePair } from './types';

/**
 * 짝 테이블.
 *
 * **빨강/파랑 한 쌍이 하나의 데이터 단위이고, 짝은 고정되어 있다.**
 * 자동 조합은 하지 않는다.
 *
 * 자동 조합은 양쪽의 무게가 맞지 않는 짝을 만든다 — "저주 전부 제거" 맞은편에
 * "값싼 3장 버리기"가 놓이면 딜레마가 아니라 무료 보상이다. 짝을 고정하면
 * 양쪽 무게를 의도적으로 설계할 수 있다.
 *
 * 지금 9개뿐이고, **반복 등장은 의도된 것이다.** 목적은 각 짝이 상황에 따라
 * 다르게 읽히는지 검증하는 것이다. 같은 짝이 다시 나왔을 때 다른 쪽을 고르게
 * 된다면 그 짝은 살아 있고, 항상 같은 쪽을 고른다면 죽은 짝이다. 그래서
 * 짝별 빨강/파랑 선택 비율이 이번 단계의 핵심 지표다.
 */
export const PAIR_TABLE: ChoicePair[] = [
  {
    id: 'swell',
    rarity: 'uncommon',
    intent: '필드와 덱을 동시에 불릴 것인가, 최소한만 건드릴 것인가',
    red: {
      text: '덱에서 필드로 3장을 펼친다 — 덱에 무작위 카드 2장이 들어온다',
      effects: [
        { type: 'drawField', count: 3 },
        { type: 'addAny', count: 2 },
      ],
    },
    blue: {
      text: '덱에서 필드로 1장을 펼친다',
      effects: [{ type: 'drawField', count: 1 }],
    },
  },

  {
    id: 'seal',
    rarity: 'rare',
    intent: '이후 5번의 선택을 제약한다. 어느 쪽을 봉인할지의 판단',
    red: {
      text: `앞으로 ${SEAL_TURNS}회 동안 빨강을 누르면 피해 ${SEAL_DAMAGE}`,
      effects: [
        {
          type: 'lasting',
          id: 'seal-red',
          label: `빨강을 누르면 피해 ${SEAL_DAMAGE}`,
          turns: SEAL_TURNS,
          damage: SEAL_DAMAGE,
          side: 'red',
        },
      ],
    },
    blue: {
      text: `앞으로 ${SEAL_TURNS}회 동안 파랑을 누르면 피해 ${SEAL_DAMAGE}`,
      effects: [
        {
          type: 'lasting',
          id: 'seal-blue',
          label: `파랑을 누르면 피해 ${SEAL_DAMAGE}`,
          turns: SEAL_TURNS,
          damage: SEAL_DAMAGE,
          side: 'blue',
        },
      ],
    },
  },

  {
    id: 'shard-or-cleanse',
    rarity: 'ultra',
    intent: '탈출에 다가갈 것인가, 위협에서 벗어날 것인가',
    red: {
      text: '탈출구 파편 1을 얻는다 — 덱에 저주 1장이 들어온다',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
      ],
    },
    blue: {
      text: '덱의 모든 저주를 제거한다',
      // 덱에 남을 수 있는 저주 수보다 넉넉히 크게 잡아 "전부"를 표현한다.
      effects: [{ type: 'removeKind', kind: 'curse', count: 99 }],
    },
  },

  {
    id: 'purge-or-heal',
    rarity: 'ultra',
    intent: '가까운 미래를 살 것인가, 지금을 살 것인가',
    red: {
      text: '필드의 모든 저주를 제거한다',
      effects: [{ type: 'purgeCurse', count: 99 }],
    },
    blue: {
      text: '체력을 전부 회복한다',
      // heal은 최대 체력에서 잘리므로 큰 값이면 전회복이 된다.
      effects: [{ type: 'heal', amount: 999 }],
    },
  },

  {
    // 원하는 속성을 지정할 수 있는 짝이라 희소도가 높다 — 조합을 노리는
    // 플레이어에게는 무작위 세 장보다 지정 한 장이 훨씬 크다.
    id: 'quality-or-bulk',
    rarity: 'rare',
    intent: '고를 수 있는 한 장이냐, 고를 수 없는 세 장이냐',
    red: {
      text: '원하는 속성 1장을 골라 덱에 넣는다',
      effects: [{ type: 'chooseElement', count: 1 }],
    },
    blue: {
      text: '덱에 무작위 속성 3장을 넣는다',
      effects: [{ type: 'addRandom', kind: 'element', count: 3 }],
    },
  },

  {
    id: 'heal-for-taint',
    rarity: 'uncommon',
    intent: '지금 살기 위해 미래를 오염시킬 것인가',
    red: {
      text: '체력을 4 회복한다 — 덱에 저주 1장이 들어온다',
      effects: [
        { type: 'heal', amount: 4 },
        { type: 'addRandom', kind: 'curse', count: 1 },
      ],
    },
    blue: {
      text: '체력을 2 잃는다',
      effects: [{ type: 'damage', amount: 2 }],
    },
  },

  {
    id: 'look-or-grab',
    rarity: 'uncommon',
    intent: '정보를 살 것인가, 물량을 택할 것인가',
    red: {
      text: '덱 맨 위 3장을 확인하고 그중 1장만 필드에 펼친다',
      effects: [{ type: 'peek', count: 3, keep: 1 }],
    },
    blue: {
      text: '덱에서 무작위 2장을 필드에 펼친다',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },

  {
    id: 'blood-for-deck',
    rarity: 'common',
    intent: '체력을 팔아 덱을 살 것인가',
    red: {
      text: '덱에 무작위 속성 3장을 넣는다 — 체력을 4 잃는다',
      effects: [
        { type: 'addRandom', kind: 'element', count: 3 },
        { type: 'damage', amount: 4 },
      ],
    },
    blue: {
      text: '덱에 무작위 속성 2장을 넣는다',
      effects: [{ type: 'addRandom', kind: 'element', count: 2 }],
    },
  },

  {
    // 여기도 지정형이라 희소도가 높다. 다만 값을 필드에서 치른다 — 쌓아 둔
    // 조합이 한 장 무너질 수 있으므로 "고를 수 있다"가 공짜가 아니다.
    id: 'future-costs-now',
    rarity: 'rare',
    intent: '미래를 사는 값을 현재의 필드에서 치른다',
    red: {
      // 필드가 먼저 깎이고 그 다음에 고른다 — 무엇이 사라졌는지 보고
      // 어느 속성을 채울지 정할 수 있어야 판단이 성립한다.
      text: '필드의 무작위 1장이 사라진다 — 원하는 속성 1장을 골라 덱에 넣는다',
      effects: [
        { type: 'purgeRandom', count: 1 },
        { type: 'chooseElement', count: 1 },
      ],
    },
    blue: {
      text: '덱에 무작위 속성 3장을 넣는다',
      effects: [{ type: 'addRandom', kind: 'element', count: 3 }],
    },
  },

  {
    id: 'field-bet',
    rarity: 'uncommon',
    intent: '필드 크기를 조건으로 삼는 베팅',
    red: {
      text: '필드가 5장 이하면 4장을 펼친다 — 아니면 저주 1장을 받는다',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldSizeAtMost', n: 5 },
          then: [{ type: 'drawField', count: 4 }],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
    blue: {
      text: '덱에서 필드로 1장을 펼친다',
      effects: [{ type: 'drawField', count: 1 }],
    },
  },

  {
    id: 'taint-tempo',
    rarity: 'common',
    intent:
      '저주 유입 템포. 빨강은 분산(확정적이지만 겹침이 느리다), ' +
      '파랑은 집중(같은 종류가 나올 수 있다). 지금 필드·덱의 저주 구성에 따라 갈린다',
    red: {
      // 종류별로 한 장씩이라 파멸이 반드시 1장 섞인다. addRandom과 달리
      // 덱 상한(파멸 3장)을 거치지 않는다 — "확정적"이 이 쪽의 성질이라서다.
      text: '저주를 종류별로 각각 1장씩 덱에 섞어넣는다',
      effects: [
        { type: 'addSpecific', cardId: 'doom', count: 1 },
        { type: 'addSpecific', cardId: 'rot', count: 1 },
        { type: 'addSpecific', cardId: 'erode', count: 1 },
      ],
    },
    blue: {
      text: '무작위 저주 2장을 덱에 섞어넣는다',
      effects: [{ type: 'addRandom', kind: 'curse', count: 2 }],
    },
  },

  {
    id: '12',
    rarity: 'rare',
    intent: '유예할 것인가, 나눠 낼 것인가',
    red: {
      text: '앞으로 5회 동안 저주를 받지 않는다. 5회 뒤 저주 3장을 한 번에 받는다',
      effects: [
        {
          type: 'lasting',
          id: 'curse-grace',
          label: '저주를 받지 않는다',
          turns: 5,
          damage: 0,
          blockCurses: true,
          onExpire: [{ type: 'addRandom', kind: 'curse', count: 3 }],
        },
      ],
    },
    blue: {
      text: '앞으로 5회 동안 매 선택마다 체력 -1',
      effects: [
        {
          type: 'lasting',
          id: 'hp-drip',
          label: '매 선택 체력 -1',
          turns: 5,
          damage: 1,
        },
      ],
    },
  },

  {
    id: '13',
    rarity: 'uncommon',
    intent: '20회를 버틸 수 있다고 믿는가',
    red: {
      text: '체력을 5 잃는다. 20회 뒤 파편 1장을 덱에 얻는다',
      effects: [
        { type: 'damage', amount: 5 },
        {
          type: 'lasting',
          id: 'delayed-shard',
          label: '파편 도착까지',
          turns: 20,
          damage: 0,
          onExpire: [{ type: 'shard', count: 1 }],
        },
      ],
    },
    blue: {
      text: '체력을 2 회복한다',
      effects: [{ type: 'heal', amount: 2 }],
    },
  },

  {
    id: '14',
    rarity: 'common',
    intent: '어느 시너지로 갈지 방향 결정',
    red: {
      text: '덱의 무작위 3장을 모두 불로 바꾼다',
      effects: [{ type: 'paintElement', element: 'fire', count: 3 }],
    },
    blue: {
      text: '덱의 무작위 3장을 모두 물로 바꾼다',
      effects: [{ type: 'paintElement', element: 'water', count: 3 }],
    },
  },

  {
    id: '15',
    rarity: 'uncommon',
    intent: '푸시 유어 럭 — 덱이 깨끗할수록 빨강이 강해진다',
    red: {
      text: '멈출 때까지 계속 뽑는다. 저주가 나오면 즉시 중단된다',
      effects: [{ type: 'pushLuck' }],
    },
    blue: {
      text: '덱에서 3장을 꺼낸다',
      effects: [{ type: 'drawField', count: 3 }],
    },
  },

  {
    id: '16',
    rarity: 'rare',
    intent: '올인 — 체력이 가득할 때만 걸 만하다',
    red: {
      text: '체력 전부를 걸고 50% 확률로 파편 1장을 얻는다. 실패하면 체력이 1이 된다',
      effects: [
        {
          type: 'coinFlip',
          then: [{ type: 'shard', count: 1 }],
          otherwise: [{ type: 'setHp', value: 1 }],
        },
      ],
    },
    blue: {
      text: '체력을 5 회복한다',
      effects: [{ type: 'heal', amount: 5 }],
    },
  },

  {
    id: '17',
    rarity: 'common',
    intent: '지금을 치울 것인가 — 필드가 위험하면 파랑',
    red: {
      text: '덱에서 3장을 꺼낸다',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '덱에서 3장을 꺼내고 덱에 저주 1장을 넣는다. 필드의 저주 1장을 제거한다',
      effects: [
        { type: 'drawField', count: 3 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'purgeCurse', count: 1 },
      ],
    },
  },

  {
    id: '18',
    rarity: 'common',
    intent: '나아갈 것인가 정비할 것인가',
    red: {
      text: '덱에서 3장을 꺼낸다',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '아무것도 꺼내지 않고 덱의 저주 1장을 제거한다',
      effects: [{ type: 'removeKind', kind: 'curse', count: 1 }],
    },
  },

  {
    id: '19',
    rarity: 'uncommon',
    intent: '완전한 공백. 양쪽이 동일하며 아무 효과도 없다. 지속 제약이 걸려 있을 경우 카운트만 소모된다',
    red: {
      text: '아무 일도 일어나지 않는다',
      effects: [],
    },
    blue: {
      text: '아무 일도 일어나지 않는다',
      effects: [],
    },
  },

  {
    id: '20',
    rarity: 'uncommon',
    intent: '순수한 리스크 테이킹. 덱의 저주 비율이 답을 정한다',
    red: {
      text: '덱에서 10장을 꺼낸다',
      effects: [{ type: 'drawField', count: 10 }],
    },
    blue: {
      text: '아무 일도 일어나지 않는다',
      effects: [],
    },
  },
];
