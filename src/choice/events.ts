import { CURSE_DAMAGE, REWARD_HEAL, SHARD_CURSE_COST } from './balance';
import type { ChoiceEvent, Effect } from './types';

/** 덱소비형의 기본 판정: 저주는 체력을 깎고, 보상은 조금 회복시킨다. */
const BITE: Effect[] = [{ type: 'damage', amount: CURSE_DAMAGE }];
const SALVE: Effect[] = [{ type: 'heal', amount: REWARD_HEAL }];
const LOOT: Effect[] = [{ type: 'addRandom', kind: 'reward', count: 1 }];

/** 덱에서 n장을 공개하는 효과. 뽑은 카드는 전부 덱으로 돌아간다. */
const reveal = (count: number, onReward: Effect[] = SALVE): Effect => ({
  type: 'draw',
  count,
  onCurse: BITE,
  onReward,
});

/** 문구와 수치가 어긋나지 않도록 본문도 상수에서 만든다. */
const revealText = (count: number, payoff: string): string =>
  `덱에서 ${count}장을 공개한다 — 저주마다 체력 -${CURSE_DAMAGE}, 보상마다 ${payoff}`;

/**
 * 하드코딩된 선택지 24개.
 *
 * 설계 규칙:
 * 1. 양쪽 모두 대가가 있다. 무상으로 좋기만 한 쪽은 없다.
 * 2. 계산 없이 감정으로 읽혀야 한다 — 탐욕/안전, 지금/나중, 도박/확실.
 * 3. 덱이 불어나지 않도록 절반 가까이는 제거·교체·변환이다.
 * 4. 일부는 덱 상태를 읽어, 같은 문구라도 상황에 따라 다른 판단이 되게 한다.
 */
export const EVENTS: ChoiceEvent[] = [
  {
    id: 'altar',
    prompt: '무너진 제단 위에 봉헌물이 쌓여 있다.',
    red: {
      text: '두 손 가득 챙긴다 — 보상 2장, 저주 1장, 값싼 2장을 흘린다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
    blue: {
      text: '하나만 집고 물러난다 — 보상 1장, 중립 1장을 두고 간다',
      tone: 'safe',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'removeKind', kind: 'neutral', count: 1 },
      ],
    },
  },
  {
    id: 'forge',
    prompt: '대장장이가 화덕에 불을 지핀다.',
    red: {
      text: '중립 2장을 녹여 보상 1장으로 벼린다',
      tone: 'sure',
      kind: 'cleanse',
      effects: [{ type: 'transform', from: 'neutral', to: 'reward', count: 2 }],
    },
    blue: {
      text: '완성품을 산다 — 보상 1장, 저주 1장, 값싼 2장을 값으로',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'well',
    prompt: '정화의 우물. 물이 탁하게 흐려 있다.',
    red: {
      text: '저주 2장을 씻어낸다 — 보상 1장도 함께 녹는다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
    blue: {
      text: '바닥에 가라앉은 것을 건진다 — 보상 2장, 저주 1장, 값싼 3장이 잠긴다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 3 },
      ],
    },
  },
  {
    id: 'crack-1',
    prompt: '벽 틈으로 바깥 바람이 새어든다.',
    hasShard: true,
    red: {
      text: `파편을 뜯어낸다 — 파편 1, 저주 ${SHARD_CURSE_COST}장, 값싼 2장이 부서진다`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
    blue: {
      text: '틈을 지나친다 — 보상 1장을 찾는다, 중립 1장을 잃는다',
      tone: 'later',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'removeKind', kind: 'neutral', count: 1 },
      ],
    },
  },
  {
    id: 'collector',
    prompt: '수집가가 당신의 짐을 훑어본다.',
    readsDeck: true,
    red: {
      text: '가장 값나가는 것을 판다 — 그 자리에 보상 2장',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        { type: 'removeExtreme', end: 'highest', count: 1 },
        { type: 'addRandom', kind: 'reward', count: 2 },
      ],
    },
    blue: {
      text: '잡동사니를 턴다 — 값싼 2장을 버리고 보상 1장',
      tone: 'sure',
      kind: 'gain',
      effects: [
        { type: 'removeExtreme', end: 'lowest', count: 2 },
        { type: 'addRandom', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'debt',
    prompt: '저주받은 자가 손을 내민다. "값을 치른 만큼 돌려주지."',
    readsDeck: true,
    red: {
      text: '저주가 3장 이상이면 보상 2장, 아니면 저주 1장',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        {
          type: 'ifThen',
          when: { type: 'countAtLeast', kind: 'curse', n: 3 },
          then: [{ type: 'addRandom', kind: 'reward', count: 2 }],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
    blue: {
      text: '등을 돌린다 — 보상 1장을 두고 온다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [{ type: 'removeKind', kind: 'reward', count: 1 }],
    },
  },
  {
    id: 'bonfire',
    prompt: '모닥불이 사그라들고 있다.',
    red: {
      text: '짐을 태운다 — 값싼 3장을 버리고 쓸 만한 중립 1장을 건진다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeExtreme', end: 'lowest', count: 3 },
        { type: 'addRandom', kind: 'neutral', count: 1 },
      ],
    },
    blue: {
      text: '불씨를 나눠 받는다 — 보상 1장, 저주 1장, 값싼 1장이 타버린다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'crack-2',
    prompt: '무너진 계단 아래, 빛이 새는 구멍이 있다.',
    hasShard: true,
    red: {
      text: `기어들어 파편을 캔다 — 파편 1, 저주 ${SHARD_CURSE_COST}장, 보상 1장을 흘린다`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
    blue: {
      text: '입구를 메운다 — 저주 2장을 묻고 잔해에서 중립 1장을 줍는다',
      tone: 'later',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'addRandom', kind: 'neutral', count: 1 },
      ],
    },
  },
  {
    id: 'alchemist',
    prompt: '연금술사가 저주를 재료로 본다.',
    red: {
      text: '저주 2장을 보상으로 바꾼다 — 중립 1장을 촉매로 태운다',
      tone: 'sure',
      kind: 'cleanse',
      effects: [
        { type: 'transform', from: 'curse', to: 'reward', count: 2 },
        { type: 'removeKind', kind: 'neutral', count: 1 },
      ],
    },
    blue: {
      text: '중립 3장을 저주로 바꾸고 보상 2장을 받는다 — 값싼 1장이 삭는다',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        { type: 'transform', from: 'neutral', to: 'curse', count: 3 },
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'hoard',
    prompt: '짐이 무거워졌다. 어깨가 눌린다.',
    readsDeck: true,
    red: {
      text: '덱이 14장 이상이면 값싼 4장을 버린다, 아니면 중립 1장을 받는다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        {
          type: 'ifThen',
          when: { type: 'deckAtLeast', n: 14 },
          then: [{ type: 'removeExtreme', end: 'lowest', count: 4 }],
          otherwise: [{ type: 'addRandom', kind: 'neutral', count: 1 }],
        },
      ],
    },
    blue: {
      text: '더 짊어진다 — 보상 2장, 저주 1장, 값싼 2장을 떨군다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'twins',
    prompt: '쌍둥이 상인이 각자 다른 거래를 내민다.',
    red: {
      text: '보상 3장 — 대신 저주 2장, 짐에서 4장을 덜어낸다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 3 },
        { type: 'addRandom', kind: 'curse', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 4 },
      ],
    },
    blue: {
      text: '보상 1장 — 대신 저주 1장을 가져간다',
      tone: 'safe',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'removeKind', kind: 'curse', count: 1 },
      ],
    },
  },
  {
    id: 'crack-3',
    prompt: '천장이 갈라져 있다. 손을 뻗으면 닿는다.',
    hasShard: true,
    red: {
      text: '파편 2개를 한 번에 뜯는다 — 저주 3장, 값싼 3장이 무너진다',
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 3 },
        { type: 'removeExtreme', end: 'lowest', count: 3 },
      ],
    },
    blue: {
      text: '천장을 받친다 — 저주 1장을 걷어내고 보상 1장',
      tone: 'later',
      kind: 'gain',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'addRandom', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'gambler',
    prompt: '노름꾼이 패를 뒤집는다.',
    readsDeck: true,
    red: {
      text: '보상이 4장 이상이면 보상 1장 더, 아니면 값싼 2장을 잃는다',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        {
          type: 'ifThen',
          when: { type: 'countAtLeast', kind: 'reward', n: 4 },
          then: [{ type: 'addRandom', kind: 'reward', count: 1 }],
          otherwise: [{ type: 'removeExtreme', end: 'lowest', count: 2 }],
        },
      ],
    },
    blue: {
      text: '판을 접는다 — 중립 2장을 쥐고, 값나가는 1장을 판돈으로',
      tone: 'sure',
      kind: 'cleanse',
      effects: [
        { type: 'addRandom', kind: 'neutral', count: 2 },
        { type: 'removeExtreme', end: 'highest', count: 1 },
      ],
    },
  },
  {
    id: 'shrine',
    prompt: '작은 사당. 봉헌하면 답이 온다.',
    red: {
      text: '보상 2장을 바친다 — 저주가 모두 씻긴다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'reward', count: 2 },
        { type: 'removeKind', kind: 'curse', count: 99 },
      ],
    },
    blue: {
      text: '사당을 턴다 — 보상 2장, 저주 1장, 값싼 3장이 재가 된다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 3 },
      ],
    },
  },
  {
    id: 'mimic',
    prompt: '상자가 스스로 열린다. 이빨이 보인다.',
    red: {
      text: revealText(3, '보상 1장'),
      tone: 'gamble',
      kind: 'consume',
      effects: [reveal(3, LOOT)],
    },
    blue: {
      text: '뚜껑을 닫는다 — 중립 2장, 값싼 1장을 미끼로 남긴다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'addRandom', kind: 'neutral', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'crack-4',
    prompt: '바닥 아래에서 바람 소리가 난다.',
    hasShard: true,
    red: {
      text: `바닥을 뜯는다 — 파편 1, 저주 ${SHARD_CURSE_COST}장, 중립 2장이 떨어져 나간다`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        { type: 'removeKind', kind: 'neutral', count: 2 },
      ],
    },
    blue: {
      text: '귀를 막는다 — 보상 1장, 저주 1장, 값싼 1장을 흘린다',
      tone: 'later',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'purge',
    prompt: '고행자가 채찍을 건넨다.',
    red: {
      text: '스스로를 친다 — 값싼 2장을 버리고 보상 1장',
      tone: 'sure',
      kind: 'gain',
      effects: [
        { type: 'removeExtreme', end: 'lowest', count: 2 },
        { type: 'addRandom', kind: 'reward', count: 1 },
      ],
    },
    blue: {
      text: '채찍을 거절한다 — 저주 2장을 떠안고 보상 2장, 값싼 3장을 잃는다',
      tone: 'greed',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'curse', count: 2 },
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 3 },
      ],
    },
  },
  {
    id: 'mirror',
    prompt: '거울 속의 당신이 먼저 손을 내민다.',
    readsDeck: true,
    red: {
      text: '중립이 2장 이하면 보상 1장, 아니면 중립이 전부 저주가 된다',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        {
          type: 'ifThen',
          when: { type: 'countAtMost', kind: 'neutral', n: 2 },
          then: [{ type: 'addRandom', kind: 'reward', count: 1 }],
          otherwise: [{ type: 'transform', from: 'neutral', to: 'curse', count: 99 }],
        },
      ],
    },
    blue: {
      text: '거울을 깬다 — 저주 1장, 값싼 1장을 버린다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'merchant',
    prompt: '행상인이 저울을 꺼낸다.',
    red: {
      text: '저주 3장을 넘긴다 — 보상 1장도 값으로 가져간다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 3 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
    blue: {
      text: '외상으로 산다 — 보상 2장, 저주 2장, 값나가는 1장과 값싼 2장을 담보로',
      tone: 'now',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 2 },
        { type: 'removeExtreme', end: 'highest', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'crack-5',
    prompt: '문틈으로 별빛이 보인다. 손이 떨린다.',
    hasShard: true,
    readsDeck: true,
    red: {
      text: '파편을 뽑는다 — 파편 1, 저주가 4장 미만이면 저주 3장, 아니면 보상 1장',
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
        {
          type: 'ifThen',
          when: { type: 'countAtMost', kind: 'curse', n: 3 },
          then: [{ type: 'addRandom', kind: 'curse', count: 3 }],
          otherwise: [{ type: 'addRandom', kind: 'reward', count: 1 }],
        },
      ],
    },
    blue: {
      text: '문을 등진다 — 저주 2장을 지우고 보상 1장을 잃는다',
      tone: 'later',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'library',
    prompt: '먼지 쌓인 서가. 펼치면 무언가 빠져나온다.',
    red: {
      text: revealText(4, '보상 1장'),
      tone: 'greed',
      kind: 'consume',
      effects: [reveal(4, LOOT)],
    },
    blue: {
      text: '한 권만 태운다 — 저주 2장을 지운다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [{ type: 'removeKind', kind: 'curse', count: 2 }],
    },
  },
  {
    id: 'toll',
    prompt: '다리지기가 통행료를 요구한다.',
    readsDeck: true,
    red: {
      text: '덱이 10장 이하면 그냥 보내준다, 아니면 값싼 3장을 뺏긴다',
      tone: 'gamble',
      kind: 'gain',
      effects: [
        {
          type: 'ifThen',
          when: { type: 'deckAtMost', n: 10 },
          then: [{ type: 'addRandom', kind: 'reward', count: 1 }],
          otherwise: [{ type: 'removeExtreme', end: 'lowest', count: 3 }],
        },
      ],
    },
    blue: {
      text: '강을 헤엄쳐 건넌다 — 저주 1장, 중립 1장을 잃는다',
      tone: 'sure',
      kind: 'cleanse',
      effects: [
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeKind', kind: 'neutral', count: 1 },
      ],
    },
  },
  {
    id: 'crack-6',
    prompt: '벽에 박힌 파편이 손짓하듯 빛난다.',
    hasShard: true,
    red: {
      text: `망설임 없이 뽑는다 — 파편 1, 저주 ${SHARD_CURSE_COST}장, 보상 2장을 대가로`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        { type: 'removeKind', kind: 'reward', count: 2 },
      ],
    },
    blue: {
      text: '주변을 뒤진다 — 보상 2장, 저주 1장, 값싼 2장을 흘린다',
      tone: 'later',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'starve',
    prompt: '오래 굶었다. 무엇이든 삼켜야 한다.',
    red: {
      text: '중립을 전부 삼킨다 — 그만큼 보상으로 바뀐다, 저주 2장',
      tone: 'gamble',
      kind: 'cleanse',
      effects: [
        { type: 'transform', from: 'neutral', to: 'reward', count: 99 },
        { type: 'addRandom', kind: 'curse', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
    blue: {
      text: '허리띠를 조인다 — 값싼 2장을 버리고 중립 1장',
      tone: 'sure',
      kind: 'cleanse',
      effects: [
        { type: 'removeExtreme', end: 'lowest', count: 2 },
        { type: 'addRandom', kind: 'neutral', count: 1 },
      ],
    },
  },

  {
    id: 'gate',
    prompt: '문지기가 길을 막는다. 짐을 보여야 지나간다.',
    readsDeck: true,
    red: {
      text: revealText(3, `체력 +${REWARD_HEAL}`),
      tone: 'gamble',
      kind: 'consume',
      effects: [reveal(3)],
    },
    blue: {
      text: '짐을 버리고 지나간다 — 값싼 3장을 버린다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [{ type: 'removeExtreme', end: 'lowest', count: 3 }],
    },
  },
  {
    id: 'miasma',
    prompt: '독기가 자욱하다. 숨을 참고 지날 수 있을까.',
    readsDeck: true,
    red: {
      text: revealText(4, `체력 +${REWARD_HEAL}`),
      tone: 'now',
      kind: 'consume',
      effects: [reveal(4)],
    },
    blue: {
      text: '길게 돌아간다 — 보상 1장, 저주 1장, 값싼 2장을 흘린다',
      tone: 'later',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'trial',
    prompt: '시험대에 손을 얹는다. 얼마나 깊이 넣을지는 당신이 정한다.',
    readsDeck: true,
    red: {
      text: revealText(2, '보상 1장'),
      tone: 'sure',
      kind: 'consume',
      effects: [reveal(2, LOOT)],
    },
    blue: {
      text: revealText(5, '보상 1장'),
      tone: 'gamble',
      kind: 'consume',
      effects: [reveal(5, LOOT)],
    },
  },
  {
    id: 'beast-den',
    prompt: '짐승의 굴. 안쪽에서 숨소리가 난다.',
    readsDeck: true,
    red: {
      text: revealText(4, '보상 1장'),
      tone: 'greed',
      kind: 'consume',
      effects: [reveal(4, LOOT)],
    },
    blue: {
      text: '입구를 막는다 — 저주 2장을 지운다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [{ type: 'removeKind', kind: 'curse', count: 2 }],
    },
  },
  {
    id: 'ferry',
    prompt: '뱃사공이 뱃삯 대신 짐을 뒤진다.',
    readsDeck: true,
    red: {
      text: revealText(1, '보상 1장'),
      tone: 'sure',
      kind: 'consume',
      effects: [reveal(1, LOOT)],
    },
    blue: {
      text: '뱃삯을 낸다 — 보상 2장을 내주고 저주 2장을 떠넘긴다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'reward', count: 2 },
        { type: 'removeKind', kind: 'curse', count: 2 },
      ],
    },
  },
  {
    id: 'crucible',
    prompt: '용광로가 짐을 통째로 시험한다.',
    readsDeck: true,
    red: {
      text: revealText(6, `체력 +${REWARD_HEAL}`),
      tone: 'gamble',
      kind: 'consume',
      effects: [reveal(6)],
    },
    blue: {
      text: '불에서 물러난다 — 저주 1장을 지우고 값싼 2장을 버린다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'oracle',
    prompt: '점쟁이가 짐에서 운을 읽는다.',
    readsDeck: true,
    red: {
      text: revealText(3, '보상 1장'),
      tone: 'gamble',
      kind: 'consume',
      effects: [reveal(3, LOOT)],
    },
    blue: {
      text: '점을 거절한다 — 보상 1장, 저주 1장, 값싼 2장을 흘린다',
      tone: 'safe',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'depths',
    prompt: '더 깊이 들어갈수록 값진 것이 있다. 그리고 더 많은 것이 있다.',
    readsDeck: true,
    red: {
      text: revealText(5, `체력 +${REWARD_HEAL}`),
      tone: 'greed',
      kind: 'consume',
      effects: [reveal(5)],
    },
    blue: {
      text: revealText(2, `체력 +${REWARD_HEAL}`),
      tone: 'safe',
      kind: 'consume',
      effects: [reveal(2)],
    },
  },
  {
    id: 'vigil',
    prompt: '밤을 새운다. 짐 속에서 무언가 뒤척인다.',
    readsDeck: true,
    red: {
      text: revealText(3, '체력 +2'),
      tone: 'sure',
      kind: 'consume',
      effects: [{ type: 'draw', count: 3, onCurse: BITE, onReward: [{ type: 'heal', amount: 2 }] }],
    },
    blue: {
      text: '뜬눈으로 지킨다 — 저주 1장을 지우고 보상 1장을 잃는다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'gauntlet',
    prompt: '탈출구가 보인다. 통로가 좁고, 안에서 소리가 난다.',
    hasShard: true,
    readsDeck: true,
    red: {
      text: `파편 1을 캔다 — 저주 ${SHARD_CURSE_COST}장, 덱에서 3장을 공개해 저주마다 체력 -${CURSE_DAMAGE}`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        reveal(3, []),
      ],
    },
    blue: {
      text: '통로를 넓힌다 — 저주 2장을 지우고 값싼 1장을 버린다',
      tone: 'later',
      kind: 'cleanse',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },

  {
    id: 'warden',
    prompt: '파수꾼이 길 한가운데 서 있다. 비켜줄 생각은 없어 보인다.',
    readsDeck: true,
    red: {
      text: '맞선다 — 이기면 저주 2장을 털어낸다',
      tone: 'gamble',
      kind: 'consume',
      effects: [
        { type: 'battle', enemyId: 'warden', onWin: [{ type: 'removeKind', kind: 'curse', count: 2 }] },
      ],
    },
    blue: {
      text: '길을 내준다 — 보상 2장을 두고 돌아간다',
      tone: 'safe',
      kind: 'cleanse',
      effects: [{ type: 'removeKind', kind: 'reward', count: 2 }],
    },
  },
  {
    id: 'gnawer',
    prompt: '굶주린 것이 짐 냄새를 맡았다.',
    readsDeck: true,
    red: {
      text: '쫓아낸다 — 이기면 보상 2장',
      tone: 'greed',
      kind: 'consume',
      effects: [
        { type: 'battle', enemyId: 'gnawer', onWin: [{ type: 'addRandom', kind: 'reward', count: 2 }] },
      ],
    },
    blue: {
      text: '먹이를 던져준다 — 값싼 3장을 내주고 저주 1장',
      tone: 'safe',
      kind: 'gain',
      effects: [
        { type: 'removeExtreme', end: 'lowest', count: 3 },
        { type: 'addRandom', kind: 'curse', count: 1 },
      ],
    },
  },
  {
    id: 'stray',
    prompt: '떠도는 것이 비틀거리며 다가온다. 약해 보인다.',
    readsDeck: true,
    red: {
      text: '베어버린다 — 이기면 저주 1장을 털고 보상 1장',
      tone: 'sure',
      kind: 'consume',
      effects: [
        {
          type: 'battle',
          enemyId: 'stray',
          onWin: [
            { type: 'removeKind', kind: 'curse', count: 1 },
            { type: 'addRandom', kind: 'reward', count: 1 },
          ],
        },
      ],
    },
    blue: {
      text: '숨어서 보낸다 — 저주 1장, 값싼 1장을 흘린다',
      tone: 'safe',
      kind: 'gain',
      effects: [
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },
  {
    id: 'keeper',
    prompt: '탈출구 수호자. 뒤로 문이 보인다.',
    hasShard: true,
    readsDeck: true,
    red: {
      text: `쓰러뜨리고 지나간다 — 이기면 파편 1, 저주 ${SHARD_CURSE_COST}장`,
      tone: 'now',
      kind: 'shard',
      effects: [
        {
          type: 'battle',
          enemyId: 'keeper',
          onWin: [
            { type: 'shard', count: 1 },
            { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
          ],
        },
      ],
    },
    blue: {
      text: '문을 포기한다 — 저주 2장을 지운다',
      tone: 'later',
      kind: 'cleanse',
      effects: [{ type: 'removeKind', kind: 'curse', count: 2 }],
    },
  },
];
