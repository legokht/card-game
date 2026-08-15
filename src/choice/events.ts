import { ROT_BURST, SHARD_CURSE_COST } from './balance';
import type { ChoiceEvent } from './types';


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
    id: 'forge',
    prompt: '대장장이가 화덕에 불을 지핀다.',
    red: {
      text: '중립 2장을 녹여 보상 1장으로 벼린다',
      tone: 'sure',
      kind: 'deck',
      effects: [{ type: 'transform', from: 'neutral', to: 'reward', count: 2 }],
    },
    blue: {
      text: '완성품을 산다 — 보상 1장, 저주 1장, 값싼 2장을 값으로',
      tone: 'greed',
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'crack-1',
    prompt: '벽 틈으로 바깥 바람이 새어든다.',
    readsField: true,
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
      text: '틈을 지나치며 덱에서 2장을 펼친다 — 덱의 중립 1장을 잃는다',
      tone: 'later',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 2 },
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
      kind: 'deck',
      effects: [
        { type: 'removeExtreme', end: 'highest', count: 1 },
        { type: 'addRandom', kind: 'reward', count: 2 },
      ],
    },
    blue: {
      text: '잡동사니를 턴다 — 값싼 2장을 버리고 보상 1장',
      tone: 'sure',
      kind: 'deck',
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [{ type: 'removeKind', kind: 'reward', count: 1 }],
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [
        { type: 'transform', from: 'curse', to: 'reward', count: 2 },
        { type: 'removeKind', kind: 'neutral', count: 1 },
      ],
    },
    blue: {
      text: '중립 3장을 저주로 바꾸고 보상 2장을 받는다 — 값싼 1장이 삭는다',
      tone: 'gamble',
      kind: 'deck',
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
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
      kind: 'deck',
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'neutral', count: 2 },
        { type: 'removeExtreme', end: 'highest', count: 1 },
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
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 1 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
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
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'toll',
    prompt: '다리지기가 통행료를 요구한다.',
    readsDeck: true,
    red: {
      text: '덱이 10장 이하면 그냥 보내준다, 아니면 값싼 3장을 뺏긴다',
      tone: 'gamble',
      kind: 'deck',
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
      kind: 'deck',
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
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'addRandom', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },

  {
    id: 'gate',
    prompt: '문지기가 길을 막는다. 짐을 보여야 지나간다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '문지기 앞에서 짐을 펼친다 — 덱에서 3장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '짐을 버리고 지나간다 — 값싼 3장을 버린다',
      tone: 'safe',
      kind: 'deck',
      effects: [{ type: 'removeExtreme', end: 'lowest', count: 3 }],
    },
  },
  {
    id: 'miasma',
    prompt: '독기가 자욱하다. 숨을 참고 지날 수 있을까.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '숨을 참고 안쪽까지 — 덱에서 4장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'now',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 4 }],
    },
    blue: {
      text: '길게 돌아가며 덱에서 2장을 펼친다 — 덱의 값싼 2장을 흘린다',
      tone: 'later',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'trial',
    prompt: '시험대에 손을 얹는다. 얼마나 깊이 넣을지는 당신이 정한다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '손끝만 얹는다 — 덱에서 2장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'sure',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
    blue: {
      text: '팔뚝까지 밀어넣는다 — 덱에서 5장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 5 }],
    },
  },
  {
    id: 'beast-den',
    prompt: '짐승의 굴. 안쪽에서 숨소리가 난다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '굴 안으로 들어간다 — 덱에서 4장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 4 }],
    },
    blue: {
      text: '입구를 막는다 — 저주 2장을 지운다',
      tone: 'safe',
      kind: 'deck',
      effects: [{ type: 'removeKind', kind: 'curse', count: 2 }],
    },
  },
  {
    id: 'ferry',
    prompt: '뱃사공이 뱃삯 대신 짐을 뒤진다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '한 장만 내민다 — 덱에서 1장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'sure',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 1 }],
    },
    blue: {
      text: '뱃삯을 낸다 — 보상 2장을 내주고 저주 2장을 떠넘긴다',
      tone: 'safe',
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'reward', count: 2 },
        { type: 'removeKind', kind: 'curse', count: 2 },
      ],
    },
  },
  {
    id: 'crucible',
    prompt: '용광로가 짐을 통째로 시험한다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '통째로 쏟아붓는다 — 덱에서 6장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 6 }],
    },
    blue: {
      text: '불에서 물러난다 — 저주 1장을 지우고 값싼 2장을 버린다',
      tone: 'safe',
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },
  {
    id: 'oracle',
    prompt: '점쟁이가 짐에서 운을 읽는다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '점괘를 펼친다 — 덱에서 3장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '점을 거절한다 — 보상 1장, 저주 1장, 값싼 2장을 흘린다',
      tone: 'safe',
      kind: 'deck',
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
    readsField: true,
    readsDeck: true,
    red: {
      text: '더 깊이 — 덱에서 5장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 5 }],
    },
    blue: {
      text: '얕게 — 덱에서 2장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'safe',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },
  {
    id: 'vigil',
    prompt: '밤을 새운다. 짐 속에서 무언가 뒤척인다.',
    readsField: true,
    readsDeck: true,
    red: {
      text: '밤새 뒤적인다 — 덱에서 3장을 필드에 펼치고 체력 +2',
      tone: 'sure',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 3 },
        { type: 'heal', amount: 2 },
      ],
    },
    blue: {
      text: '뜬눈으로 지킨다 — 저주 1장을 지우고 보상 1장을 잃는다',
      tone: 'safe',
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'gauntlet',
    prompt: '탈출구가 보인다. 통로가 좁고, 안에서 소리가 난다.',
    readsField: true,
    hasShard: true,
    readsDeck: true,
    red: {
      text: `파편 1을 캔다 — 저주 ${SHARD_CURSE_COST}장, 덱에서 3장이 필드에 쏟아진다`,
      tone: 'now',
      kind: 'shard',
      effects: [
        { type: 'shard', count: 1 },
        { type: 'addRandom', kind: 'curse', count: SHARD_CURSE_COST },
        { type: 'drawField', count: 3 },
      ],
    },
    blue: {
      text: '통로를 넓힌다 — 저주 2장을 지우고 값싼 1장을 버린다',
      tone: 'later',
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 2 },
        { type: 'removeExtreme', end: 'lowest', count: 1 },
      ],
    },
  },

  {
    id: 'draw-well',
    prompt: '샘물에 손을 담근다. 무언가 만져진다.',
    readsField: true,
    red: {
      text: '밤새 뒤적인다 — 덱에서 3장을 필드에 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '손만 씻는다 — 필드의 저주 1장을 없앤다',
      tone: 'safe',
      kind: 'purge',
      effects: [{ type: 'purgeCurse', count: 1 }],
    },
  },
  {
    id: 'gamble-draw',
    prompt: '어둠 속으로 손을 뻗는다. 멈추는 건 당신 마음이다.',
    readsField: true,
    red: {
      text: '멈출 때까지 한 장씩 뽑는다 — 저주가 겹치면 즉시 중단',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'pushLuck' }],
    },
    blue: {
      text: '한 장만 집고 손을 거둔다 — 덱에서 1장, 체력 +2',
      tone: 'safe',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 1 },
        { type: 'heal', amount: 2 },
      ],
    },
  },
  {
    id: 'scout',
    prompt: '앞이 조금 보인다. 고를 수 있다.',
    readsField: true,
    red: {
      text: '덱 위 3장을 확인하고 1장만 가져온다',
      tone: 'sure',
      kind: 'draw',
      effects: [{ type: 'peek', count: 3, keep: 1 }],
    },
    blue: {
      text: '눈을 감고 2장을 집는다 — 뭐가 올지 모른다',
      tone: 'gamble',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },
  {
    id: 'greedy-grab',
    prompt: '한 움큼 쥘 수 있다. 얼마나 쥘지가 문제다.',
    readsField: true,
    red: {
      text: '덱에서 3장을 손에 넣는다 — 겹치면 그 자리에서 터진다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '1장만 집고 체력을 추스른다 — 체력 +2',
      tone: 'safe',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 1 },
        { type: 'heal', amount: 2 },
      ],
    },
  },

  /* ---------- 버리기 / 정화형 ---------- */
  {
    id: 'shed',
    prompt: '짐을 내려놓을 수 있는 자리다.',
    readsField: true,
    red: {
      text: '필드의 저주 1장을 버린다',
      tone: 'safe',
      kind: 'purge',
      effects: [{ type: 'purgeCurse', count: 1 }],
    },
    blue: {
      text: '필드에서 무작위로 3장을 쓸어낸다 — 무엇이 걸릴지는 모른다',
      tone: 'gamble',
      kind: 'purge',
      effects: [{ type: 'purgeRandom', count: 3 }],
    },
  },
  {
    id: 'bloodletting',
    prompt: '피를 흘려 저주를 씻어내는 의식이 있다.',
    readsField: true,
    red: {
      text: '필드의 저주 2장을 태운다 — 체력 -3',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 2 },
        { type: 'damage', amount: 3 },
      ],
    },
    blue: {
      text: '의식을 거절한다 — 덱의 저주 1장을 지우고 보상 1장을 잃는다',
      tone: 'later',
      kind: 'deck',
      effects: [
        { type: 'removeKind', kind: 'curse', count: 1 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'exorcism',
    prompt: '퇴마사가 손을 내민다. "가장 무서운 것부터."',
    readsField: true,
    red: {
      text: '필드의 파멸을 전부 버린다 — 체력 -2',
      tone: 'safe',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 9, curseType: 'doom' },
        { type: 'damage', amount: 2 },
      ],
    },
    blue: {
      text: '필드의 부패를 전부 버린다 — 저주 1장을 덱에 받는다',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 9, curseType: 'rot' },
        { type: 'addRandom', kind: 'curse', count: 1 },
      ],
    },
  },
  {
    id: 'clean-slate',
    prompt: '전부 내려놓고 다시 시작할 수 있다.',
    readsField: true,
    red: {
      text: '필드를 통째로 쓸어낸다 — 보상까지 전부 사라진다',
      tone: 'gamble',
      kind: 'purge',
      effects: [{ type: 'purgeAll' }],
    },
    blue: {
      text: '필드의 저주 1장을 버리고 값싼 2장을 덱에서 정리한다',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'removeExtreme', end: 'lowest', count: 2 },
      ],
    },
  },

  /* ---------- 필드 참조형 ---------- */
  {
    id: 'hoarder',
    prompt: '수집가가 당신의 손을 들여다본다.',
    readsField: true,
    red: {
      text: '필드에 저주가 3장 이상이면 보상 3장, 아니면 저주 1장',
      tone: 'gamble',
      kind: 'field',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldCurseAtLeast', n: 3 },
          then: [{ type: 'addRandom', kind: 'reward', count: 3 }],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
    blue: {
      text: '손을 감춘다 — 필드의 저주 1장을 버리고 보상 1장을 잃는다',
      tone: 'safe',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'removeKind', kind: 'reward', count: 1 },
      ],
    },
  },
  {
    id: 'rest',
    prompt: '잠시 쉰다. 들고 있는 것이 많을수록 든든하다.',
    readsField: true,
    red: {
      text: '필드 1장당 체력 +1',
      tone: 'safe',
      kind: 'field',
      effects: [{ type: 'healPerFieldCard', amount: 1 }],
    },
    blue: {
      text: '쉬지 않고 나아간다 — 덱에서 2장을 손에 넣는다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },
  {
    id: 'overload',
    prompt: '손이 무겁다. 놓아야 할지도 모른다.',
    readsField: true,
    red: {
      text: '필드가 7장 이상이면 저주 2장을 버린다, 아니면 2장을 더 뽑는다',
      tone: 'sure',
      kind: 'draw',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldSizeAtLeast', n: 7 },
          then: [{ type: 'purgeCurse', count: 2 }],
          otherwise: [{ type: 'drawField', count: 2 }],
        },
      ],
    },
    blue: {
      text: `버티고 본다 — 보상 2장을 덱에 넣고 체력 -${ROT_BURST}`,
      tone: 'greed',
      kind: 'deck',
      effects: [
        { type: 'addRandom', kind: 'reward', count: 2 },
        { type: 'damage', amount: ROT_BURST },
      ],
    },
  },
  {
    id: 'empty-hands',
    prompt: '빈손일수록 가볍게 지나갈 수 있는 길이다.',
    readsField: true,
    red: {
      text: '필드가 3장 이하면 파편 1, 아니면 저주 1장',
      tone: 'now',
      kind: 'shard',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldSizeAtMost', n: 3 },
          then: [
            { type: 'shard', count: 1 },
            { type: 'addRandom', kind: 'curse', count: 1 },
          ],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
    blue: {
      text: '짐을 지고 돌아간다 — 필드의 저주 1장을 버리고 체력 -1',
      tone: 'later',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'damage', amount: 1 },
      ],
    },
  },

  /* ---------- 필드를 채운다 ---------- */
  {
    id: 'first-step',
    prompt: '아직 아무것도 펼치지 않았다. 뭐라도 꺼내야 한다.',
    readsField: true,
    red: {
      text: '덱에서 3장을 한 번에 펼친다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 3 }],
    },
    blue: {
      text: '1장만 조심스럽게 펼친다 — 체력 +2',
      tone: 'safe',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 1 },
        { type: 'heal', amount: 2 },
      ],
    },
  },
  {
    id: 'lantern',
    prompt: '등불을 들면 앞이 보인다. 대신 뒤가 어두워진다.',
    readsField: true,
    red: {
      text: '덱 위 4장을 보고 2장을 골라 펼친다',
      tone: 'sure',
      kind: 'draw',
      effects: [{ type: 'peek', count: 4, keep: 2 }],
    },
    blue: {
      text: '등불을 끄고 2장을 눈감고 펼친다 — 체력 +3',
      tone: 'gamble',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 2 },
        { type: 'heal', amount: 3 },
      ],
    },
  },
  {
    id: 'floodgate',
    prompt: '한꺼번에 쏟아낼 수 있다.',
    readsField: true,
    red: {
      text: '덱에서 4장을 펼친다 — 겹치면 그 자리에서 터진다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 4 }],
    },
    blue: {
      text: '문을 잠근다 — 덱의 저주 2장을 없앤다',
      tone: 'later',
      kind: 'deck',
      effects: [{ type: 'removeKind', kind: 'curse', count: 2 }],
    },
  },

  /* ---------- 필드를 비운다 ---------- */
  {
    id: 'sweep',
    prompt: '펼쳐진 것들을 쓸어낼 수 있다.',
    readsField: true,
    red: {
      text: '필드의 저주 2장을 없앤다',
      tone: 'safe',
      kind: 'purge',
      effects: [{ type: 'purgeCurse', count: 2 }],
    },
    blue: {
      text: '필드에서 무작위 2장을 없앤다 — 보상이 걸릴 수도 있다',
      tone: 'gamble',
      kind: 'purge',
      effects: [{ type: 'purgeRandom', count: 2 }],
    },
  },
  {
    id: 'salt-circle',
    prompt: '소금을 두르면 무언가는 물러난다.',
    readsField: true,
    red: {
      text: '필드의 파멸을 전부 없앤다 — 체력 -3',
      tone: 'safe',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 9, curseType: 'doom' },
        { type: 'damage', amount: 3 },
      ],
    },
    blue: {
      text: '필드의 부패를 전부 없앤다 — 덱에 저주 1장',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 9, curseType: 'rot' },
        { type: 'addRandom', kind: 'curse', count: 1 },
      ],
    },
  },
  {
    id: 'burn-it',
    prompt: '전부 태워버릴 수 있다. 좋은 것까지.',
    readsField: true,
    red: {
      text: '필드를 통째로 태운다 — 보상까지 전부 사라진다',
      tone: 'gamble',
      kind: 'purge',
      effects: [{ type: 'purgeAll' }],
    },
    blue: {
      text: '저주 1장만 골라 태운다 — 체력 -2',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'damage', amount: 2 },
      ],
    },
  },
  {
    id: 'tithe',
    prompt: '값을 치르면 정리해 준다.',
    readsField: true,
    red: {
      text: '필드의 저주 3장을 없앤다 — 덱의 보상 2장을 잃는다',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 3 },
        { type: 'removeKind', kind: 'reward', count: 2 },
      ],
    },
    blue: {
      text: '값을 아낀다 — 덱에서 2장을 펼친다',
      tone: 'greed',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },

  /* ---------- 필드를 읽는다 ---------- */
  {
    id: 'weigher',
    prompt: '저울잡이가 펼쳐진 것을 센다.',
    readsField: true,
    red: {
      text: '필드에 저주가 3장 이상이면 파편 1, 아니면 저주 2장',
      tone: 'gamble',
      kind: 'field',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldCurseAtLeast', n: 3 },
          then: [
            { type: 'shard', count: 1 },
            { type: 'addRandom', kind: 'curse', count: 1 },
          ],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 2 }],
        },
      ],
    },
    blue: {
      text: '저울을 엎는다 — 필드의 저주 1장을 없애고 체력 -2',
      tone: 'safe',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'damage', amount: 2 },
      ],
    },
  },
  {
    id: 'tally',
    prompt: '펼친 것이 많을수록 든든하다. 더러운 것만 아니라면.',
    readsField: true,
    red: {
      text: '필드 1장당 체력 +1',
      tone: 'safe',
      kind: 'field',
      effects: [{ type: 'healPerFieldCard', amount: 1 }],
    },
    blue: {
      text: '필드가 5장 이하면 덱에서 3장을 펼친다, 아니면 저주 1장',
      tone: 'gamble',
      kind: 'field',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldSizeAtMost', n: 5 },
          then: [{ type: 'drawField', count: 3 }],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
  },
  {
    id: 'clutter',
    prompt: '발 디딜 틈이 없다.',
    readsField: true,
    red: {
      text: '필드가 8장 이상이면 무작위 4장을 쓸어낸다, 아니면 2장을 펼친다',
      tone: 'sure',
      kind: 'field',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldSizeAtLeast', n: 8 },
          then: [{ type: 'purgeRandom', count: 4 }],
          otherwise: [{ type: 'drawField', count: 2 }],
        },
      ],
    },
    blue: {
      text: '그냥 밟고 지나간다 — 체력 -3, 덱의 저주 1장을 없앤다',
      tone: 'later',
      kind: 'deck',
      effects: [
        { type: 'damage', amount: 3 },
        { type: 'removeKind', kind: 'curse', count: 1 },
      ],
    },
  },

  {
    id: 'sifter',
    prompt: '체로 거를 수 있다. 무엇이 남을지는 체가 정한다.',
    readsField: true,
    red: {
      text: '필드의 저주 1장을 없애고 덱에서 1장을 펼친다',
      tone: 'sure',
      kind: 'purge',
      effects: [
        { type: 'purgeCurse', count: 1 },
        { type: 'drawField', count: 1 },
      ],
    },
    blue: {
      text: '체를 통째로 턴다 — 필드에서 무작위 3장을 없앤다',
      tone: 'gamble',
      kind: 'purge',
      effects: [{ type: 'purgeRandom', count: 3 }],
    },
  },
  {
    id: 'quiet-room',
    prompt: '아무것도 하지 않아도 되는 방이다.',
    readsField: true,
    red: {
      text: '숨을 고른다 — 필드의 저주 2장을 없앤다',
      tone: 'safe',
      kind: 'purge',
      effects: [{ type: 'purgeCurse', count: 2 }],
    },
    blue: {
      text: '가만있지 못한다 — 덱에서 2장을 펼치고 체력 +2',
      tone: 'greed',
      kind: 'draw',
      effects: [
        { type: 'drawField', count: 2 },
        { type: 'heal', amount: 2 },
      ],
    },
  },
  {
    id: 'reckoning',
    prompt: '펼쳐놓은 것들이 당신을 마주 본다.',
    readsField: true,
    red: {
      text: '필드에 저주가 4장 이상이면 전부 없앤다, 아니면 저주 1장을 받는다',
      tone: 'gamble',
      kind: 'field',
      effects: [
        {
          type: 'ifField',
          when: { type: 'fieldCurseAtLeast', n: 4 },
          then: [{ type: 'purgeCurse', count: 9 }],
          otherwise: [{ type: 'addRandom', kind: 'curse', count: 1 }],
        },
      ],
    },
    blue: {
      text: '눈을 피한다 — 덱에서 2장을 펼친다',
      tone: 'safe',
      kind: 'draw',
      effects: [{ type: 'drawField', count: 2 }],
    },
  },
];
