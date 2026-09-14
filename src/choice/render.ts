import {
  CURSE_RULES,
  DECK_WARN_AT,
  ELEMENT_ORDER,
  ELEMENT_RULES,
  ELEMENT_SYNERGY_COUNT,
  DARK_HP_COST,
  LIGHT_HP_GAIN,
  MAX_HP,
  TAINT_LEVELS,
  WATER_MAX_HP_GAIN,
} from './balance';
import { HP_DANGER_RATIO } from './hp-fx';
import {
  deckCurseBreakdown,
  deckElementBreakdown,
  fieldCurseBreakdown,
  fieldElementBreakdown,
} from './engine';
import { canFireSingle, countShards, elementsOnEdge, onEdge } from './field';
import type {
  CardInstance,
  CurseType,
  ElementType,
  GameState,
  PairSide,
  Rarity,
} from './types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다.
 *
 * 화면의 일은 두 가지다. 선택지 둘을 감정으로 읽히게 세우는 것, 그리고 그 선택이
 * 덱을 어떻게 바꿨는지 바로 보이게 하는 것.
 */

export interface Handlers {
  onChoose: (side: 'red' | 'blue') => void;
  onPushDraw: () => void;
  onPushStop: () => void;
  onPickElement: (element: ElementType) => void;
  onUseSynergy: (target: ElementType) => void;
  onRestart: () => void;
  onHelp: () => void;
}

function fateView(): string {
  return `
    <div class="fate-wait" aria-live="polite">
      <p class="fate-wait__head">카드를 확인한다</p>
    </div>`;
}

/**
 * 희소도는 화면에 뜬다 — 자주 오지 않는 짝이라는 것을 알아야
 * "이번에 안 고르면 다음이 언제일지 모른다"가 성립한다.
 */
const RARITY_LABEL: Record<Rarity, string> = {
  common: '흔함',
  uncommon: '보통',
  rare: '희귀',
  ultra: '매우 희귀',
};

/**
 * 시너지를 쓰면 무슨 일이 일어나는지 한 줄로.
 *
 * 규칙 설명(ELEMENT_RULES.description)은 "5장 모이면 ~"이라 조건을 말한다.
 * 버튼 위에는 조건이 아니라 **결과**가 떠야 한다 — 이미 조건은 찼으니까.
 *
 */
const SYNERGY_EFFECT: Record<ElementType, string> = {
  fire: '덱의 저주 1장 소각',
  water: `최대 체력 +${WATER_MAX_HP_GAIN}`,
  dark: `체력 -${DARK_HP_COST}, 필드의 저주 1장 소각`,
  light: `체력 +${LIGHT_HP_GAIN}, 덱에 저주 1장`,
};

/**
 * 필드에 모인 것 하나를 "이름 N/문턱"으로 보여주는 태그.
 *
 * **저주와 속성이 같은 형식을 쓴다.** 규칙이 같으니 표시도 같아야 한다 —
 * 좋은 것과 나쁜 것을 색으로만 구분하면 플레이어가 배울 것이 하나로 준다.
 */
function kindTag(
  slug: string,
  name: string,
  count: number,
  threshold: number | null,
  near: boolean,
  title: string,
): string {
  const meter = threshold === null ? `${count}` : `${count}/${threshold}`;
  return `<span class="kindtag kindtag--${slug}${near ? ' is-near' : ''}" title="${title}"
    >${name} <b>${meter}</b></span>`;
}

/**
 * 봉인된 색이면 버튼에 경고를 붙인다.
 *
 * 남은 횟수가 화면에 떠 있어도, 누르는 순간에 그 버튼 위에서 보이지 않으면
 * 실수한다. 제약을 잊고 누르면 딜레마가 아니라 사고가 된다.
 */
function optionButton(side: 'red' | 'blue', option: PairSide, state: GameState): string {
  const sealed = state.lasting.filter((l) => l.side === undefined || l.side === side);
  const bite = sealed.reduce((sum, l) => sum + l.damage, 0);
  return `
    <button class="pick pick--${side}${bite > 0 ? ' pick--sealed' : ''}" data-side="${side}">
      ${bite > 0 ? `<span class="pick__seal">누르면 체력 -${bite}</span>` : ''}
      <span class="pick__text">${option.text}</span>
    </button>`;
}

/**
 * 지금 걸려 있는 지속 효과. 남은 횟수를 항상 띄운다.
 *
 * 여러 개가 동시에 걸릴 수 있으므로 줄로 쌓는다.
 */
function lastingPanel(state: GameState): string {
  if (state.lasting.length === 0) return '';
  const rows = state.lasting
    .map((l) => {
      const left = l.onExpire
        ? `<b>${l.remaining}</b>회`
        : `남은 <b>${l.remaining}</b>회`;
      return `
      <li class="lasting__row${l.side ? ` lasting__row--${l.side}` : ''}">
        <span class="lasting__label">${l.label}</span>
        <span class="lasting__left">${left}</span>
      </li>`;
    })
    .join('');
  return `
    <section class="lasting" aria-label="걸려 있는 효과">
      <p class="lasting__head">걸려 있는 효과</p>
      <ul class="lasting__list">${rows}</ul>
    </section>`;
}

/**
 * 필드의 스택 하나. 카드가 아니라 **종류가 단위다.**
 *
 * 낱장으로 흩어 놓으면 장수가 늘수록 무엇이 몇 장인지 세어야 한다. 종류별로
 * 묶어 쌓으면 세지 않아도 보인다 — 진행도가 곧 스택의 높이다.
 */
interface FieldStack {
  slug: string;
  name: string;
  threshold: number | null;
  /** 한 장만 더 모으면 쓸 수 있게 되는 상태. */
  near: boolean;
  /** 지금 눌러서 쓸 수 있는 상태. 속성에만 있다 — 저주는 저절로 터진다. */
  ready: boolean;
  /** 눌렀을 때 무슨 일이 일어나는지. 준비된 스택에만 보인다. */
  effect: string | null;
  title: string;
  cards: CardInstance[];
}

/** 필드 스택의 고정 순서. 속성 넷, 저주 셋, 파편. */
function fieldStacks(state: GameState): FieldStack[] {
  const edged = onEdge(state.field);
  const elemEdged = elementsOnEdge(state.field);

  const elementStacks: FieldStack[] = ELEMENT_ORDER.map((t) => {
    const rule = ELEMENT_RULES[t];
    const ready = canFireSingle(state.field, t);
    return {
      slug: t,
      name: rule.name,
      threshold: rule.threshold,
      near: elemEdged.includes(t),
      ready,
      effect: ready ? SYNERGY_EFFECT[t] : null,
      title: `${rule.name} — ${rule.target}에 작용한다. ${rule.description}`,
      cards: state.field.filter((c) => c.element === t),
    };
  });

  const curseStacks: FieldStack[] = (Object.keys(CURSE_RULES) as CurseType[]).map((t) => {
    const rule = CURSE_RULES[t];
    return {
      slug: t,
      name: rule.name,
      threshold: rule.threshold,
      near: edged.includes(t),
      // 저주는 손댈 수 없다. 조건이 차면 저절로 터진다.
      ready: false,
      effect: null,
      title: `${rule.name} — ${rule.target}을(를) 노린다. ${rule.description}`,
      cards: state.field.filter((c) => c.curseType === t),
    };
  });

  const shards = state.field.filter((c) => c.kind === 'shard');
  const shardStack: FieldStack = {
    slug: 'shard',
    name: '파편',
    // 파편의 문턱은 곧 승리 조건이다. 다른 스택과 같은 형식으로 읽힌다.
    threshold: state.escapeTarget,
    near: shards.length === state.escapeTarget - 1,
    ready: false,
    effect: null,
    title: `탈출구 파편 — 필드에 ${state.escapeTarget}장 모이면 탈출한다`,
    cards: shards,
  };

  return [...elementStacks, ...curseStacks, shardStack];
}

/**
 * 필드.
 *
 * 종류별로 묶어 스파이더 솔리테어처럼 세로로 겹쳐 쌓는다. 장수가 아무리
 * 늘어도 **무엇이 몇 장인지가 한눈에** 보여야 하기 때문이다. 스택 머리에
 * 붙는 배지는 저주와 속성이 같은 형식을 쓰고, 문턱에 닿기 직전인 스택은
 * 스택째로 살아난다 — 계산 없이 그 상태가 보이는 것이 이 화면의 일이다.
 *
 * 빈 종류도 자리를 지킨다. "파멸 0/3"이 사라지면 지금 안전한 것인지 아직
 * 안 본 것인지 구분할 수 없다.
 */
function fieldPanel(state: GameState): string {
  const edged = onEdge(state.field);
  const elemEdged = elementsOnEdge(state.field);
  const onField = fieldCurseBreakdown(state);

  const all = fieldStacks(state);
  const curseN = (Object.keys(CURSE_RULES) as CurseType[]).length;
  const elementStacks = all.slice(0, ELEMENT_ORDER.length);
  const curseStacks = all.slice(ELEMENT_ORDER.length, ELEMENT_ORDER.length + curseN);
  const rest = all.slice(ELEMENT_ORDER.length + curseN);

  const renderStack = (stack: FieldStack): string => {
    const pile = stack.cards
      .map((card: CardInstance) => {
        const cls = [
          'fcard',
          `fcard--${card.kind}`,
          card.curseType ? `fcard--${card.curseType}` : '',
          card.element ? `fcard--${card.element}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<div class="${cls}"><span class="fcard__name">${card.name}</span></div>`;
      })
      .join('');

    const badge = kindTag(
      stack.slug,
      stack.name,
      stack.cards.length,
      stack.threshold,
      stack.near || stack.ready,
      stack.title,
    );
    const body = `
        ${badge}
        <div class="stack__cards">${pile || '<span class="stack__empty">·</span>'}</div>
        ${stack.effect ? `<span class="stack__use">${stack.effect}</span>` : ''}`;

    return stack.ready
      ? `<button class="stack stack--${stack.slug} is-ready" data-synergy="${stack.slug}"
             title="${stack.title}\n누르면 ${ELEMENT_SYNERGY_COUNT}장을 써서 발동한다">${body}</button>`
      : `<div class="stack stack--${stack.slug}${stack.near ? ' is-near' : ''}">${body}</div>`;
  };

  const warnings = [
    // 속성은 닥치는 것이 아니라 쓰는 것이라 경고가 아니라 예고다.
    // 쓸 수 있게 된 뒤에는 스택 자체가 버튼이 되므로 여기서는 빠진다.
    ...elemEdged.map(
      (t) =>
        `<span class="edgewarn edgewarn--${t}">${ELEMENT_RULES[t].name} 한 장만 더면 쓸 수 있다 — ${
          SYNERGY_EFFECT[t]
        }</span>`,
    ),
    ...edged.map((t) => {
      const rule = CURSE_RULES[t];
      const left = (rule.threshold ?? 0) - onField[t];
      const head = left <= 1 ? `${rule.name} 한 장만 더면` : `${rule.name} ${left}장 더면`;
      return `<span class="edgewarn edgewarn--${t}">${head} — ${rule.description}</span>`;
    }),
  ].join('');

  return `
    <section class="field" aria-label="필드">
      <div class="field__head">
        <span class="field__label">필드 <b>${state.field.length}</b>장</span>
      </div>
      ${warnings ? `<div class="edgewarns">${warnings}</div>` : ''}
      <div class="stacks">
        <div class="field__elements">${elementStacks.map(renderStack).join('')}</div>
        <div class="field__curses">${curseStacks.map(renderStack).join('')}</div>
        ${rest.map(renderStack).join('')}
      </div>
      ${
        state.field.length === 0
          ? '<p class="fcards__empty">아직 아무것도 펼치지 않았다</p>'
          : ''
      }
    </section>`;
}

/** 속성 지정 화면. 네 속성 중 하나를 골라 덱에 넣는다. */
function pickView(state: GameState): string {
  const pick = state.pick!;
  const elems = fieldElementBreakdown(state);
  const inDeck = deckElementBreakdown(state);

  const buttons = ELEMENT_ORDER.map((t) => {
    const rule = ELEMENT_RULES[t];
    return `
      <button class="ebtn ebtn--${t}" data-element="${t}">
        <span class="ebtn__name">${rule.name}</span>
        <span class="ebtn__state">필드 ${elems[t]}/${ELEMENT_SYNERGY_COUNT} · 덱 ${inDeck[t]}</span>
        <span class="ebtn__desc">${rule.description}</span>
      </button>`;
  }).join('');

  return `
    <div class="epick">
      <p class="epick__head">
        어느 속성을 덱에 넣을까 — <b>${pick.count - pick.remaining + 1}</b>/${pick.count}장째
      </p>
      <div class="ebtns">${buttons}</div>
      <section class="blog">${
        pick.log.map((l) => `<p>${l}</p>`).join('') || '<p>고르면 덱으로 들어간다.</p>'
      }</section>
    </div>`;
}

/** 푸시 유어 럭 화면. 한 장씩 뽑으며 멈출지 정한다. */
function pushView(state: GameState): string {
  const push = state.push!;
  const edged = onEdge(state.field);

  return `
    <div class="push">
      <p class="push__head">
        ${push.drawn}장 뽑았다.
        ${
          push.stopped
            ? '<b class="push__stop">겹쳐서 끝났다</b>'
            : edged.length > 0
              ? `<b class="push__risk">${edged.map((t) => CURSE_RULES[t].name).join(', ')} 1장 — 한 장 더면 발동</b>`
              : '아직 겹친 것은 없다.'
        }
      </p>
      <div class="push__controls">
        ${
          push.stopped
            ? `<button id="push-stop" class="btn">계속</button>`
            : `<button id="push-draw" class="btn">한 장 더</button>
               <button id="push-stop" class="btn btn--flee">여기서 멈춘다</button>`
        }
      </div>
      <section class="blog">${push.log.map((l) => `<p>${l}</p>`).join('') || '<p>덱에 손을 넣는다…</p>'}</section>
    </div>`;
}

/** 체력. 저주 피해를 받는 대상이라 항상 보여야 한다. */
function vitals(state: GameState): string {
  const scale = Math.max(MAX_HP, state.maxHp);
  const fillPct = (Math.max(0, state.hp) / scale) * 100;
  const lockPct = Math.max(0, (scale - state.maxHp) / scale) * 100;
  const low = state.maxHp > 0 && state.hp <= state.maxHp * HP_DANGER_RATIO;
  const barW = Math.round(148 * (scale / MAX_HP));
  // 부패로 깎인 최대 체력은 회복으로 돌아오지 않는다. 검은 잠금 구간이
  // 그 자리를 대신 차지한다.
  const lost = Math.max(0, MAX_HP - state.maxHp);
  return `
    <div class="vitals">
      <span class="top__label">체력</span>
      <div class="vitals__row">
        <b class="${low ? 'is-low' : ''}">${state.hp}<span class="of">/${state.maxHp}</span></b>
        <div class="hpbar${low ? ' is-danger' : ''}" style="width:${barW}px">
          <i class="hpbar__fill${low ? ' is-low' : ''}" style="width:${fillPct}%"></i>
          <i class="hpbar__lock" style="width:${lockPct}%" title="부패로 깎여 되돌릴 수 없다"></i>
        </div>
        ${lost > 0 ? `<span class="vitals__lost" title="부패로 깎여 되돌릴 수 없다">최대 ${MAX_HP} → ${state.maxHp}</span>` : ''}
      </div>
    </div>`;
}

/**
 * 탈출 진척.
 *
 * **필드에 나온 파편만 센다.** 덱에 넣는 것은 시작일 뿐이고 꺼내는 것이
 * 과제이므로, 두 수를 나란히 보여주되 승리 조건인 필드 쪽을 크게 둔다.
 */
function shardTrack(state: GameState): string {
  const onField = countShards(state.field);
  const inDeck = countShards(state.deck);
  const pips = Array.from(
    { length: state.escapeTarget },
    (_, i) => `<i class="${i < onField ? 'is-lit' : ''}"></i>`,
  ).join('');
  return `
    <div class="escape">
      <span class="escape__label">탈출구 파편</span>
      <span class="escape__pips">${pips}</span>
      <span class="escape__count">필드 <b>${onField}</b>/${state.escapeTarget}</span>
      <span class="escape__deck">덱에 ${inDeck}</span>
    </div>`;
}

function deckStack(count: number): string {
  if (count <= 0) {
    return `<div class="deckstack is-empty" aria-hidden="true"><i class="deckstack__ghost"></i></div>`;
  }
  const layers = Math.max(1, Math.min(12, Math.ceil(count / 2)));
  const cards = Array.from(
    { length: layers },
    (_, i) => `<i class="deckstack__card" style="--i:${i}"></i>`,
  ).join('');
  return `<div class="deckstack" style="--n:${layers}" aria-hidden="true">${cards}</div>`;
}

function deckPanel(state: GameState): string {
  const total = state.deck.length;
  const curse = state.deck.filter((c) => c.kind === 'curse').length;
  const shard = countShards(state.deck);
  const taint = total === 0 ? 0 : curse / total;
  const level = TAINT_LEVELS.find((l) => taint < l.max) ?? TAINT_LEVELS[TAINT_LEVELS.length - 1]!;
  const elems = deckElementBreakdown(state);
  const curses = deckCurseBreakdown(state);

  return `
    <aside class="deck" aria-label="현재 덱">
      ${deckStack(total)}
      <div class="deck__top">
        <span class="deck__size${total <= DECK_WARN_AT ? ' is-warn' : ''}"><b>${total}</b>장</span>
        <span class="taint taint--${level.tone}">${level.label}</span>
      </div>
      ${
        total <= DECK_WARN_AT
          ? `<p class="deck__warn" role="status">덱이 마른다 — ${total}장</p>`
          : ''
      }
      <div class="curseratio">
        저주 <b>${curse}</b> / 전체 <b>${total}</b>
        <span class="curseratio__pct">${Math.round(taint * 100)}%</span>
      </div>
      <p class="cursekinds__label">덱 구성</p>
      <div class="cursekinds">${ELEMENT_ORDER.map(
        (t) =>
          `<span class="kindtag kindtag--${t}">${ELEMENT_RULES[t].name} <b>${elems[t]}</b></span>`,
      ).join('')}</div>
      <div class="cursekinds">${(Object.keys(CURSE_RULES) as CurseType[])
        .map(
          (t) =>
            `<span class="kindtag kindtag--${t}">${CURSE_RULES[t].name} <b>${curses[t]}</b></span>`,
        )
        .join('')}<span class="kindtag kindtag--shard">파편 <b>${shard}</b></span></div>
    </aside>`;
}

function recentChanges(state: GameState): string {
  const last = state.records[state.records.length - 1];
  if (!last) return `<p class="delta delta--idle">첫 선택을 기다린다</p>`;

  return `
    <div class="delta">
      <span class="delta__side delta__side--${last.side}">${last.side === 'red' ? '빨강' : '파랑'}</span>
      <span class="delta__lines">${last.changes
        .map((c) => `<span class="delta__line">${c}</span>`)
        .join('')}</span>
    </div>`;
}

export function render(root: HTMLElement, state: GameState, handlers: Handlers): void {
  const event = state.current;

  root.innerHTML = `
    <header class="top">
      <div class="top__step"><span class="top__label">선택</span><b>${
        state.step - (state.escaped || state.dead ? 1 : 0)
      }</b></div>
      ${vitals(state)}
      ${shardTrack(state)}
      <div class="top__actions">
        <button id="help" class="ghost" type="button">도움말</button>
        <button id="restart" class="ghost" type="button">처음부터</button>
      </div>
    </header>

    <main class="stage">
      ${
        state.push
          ? pushView(state)
          : state.pick
          ? pickView(state)
          : state.fate
          ? fateView()
          : state.dead
          ? `<div class="dead" role="status">
               <span class="dead__word">사망</span>
               <span class="dead__cause">${state.causeOfDeath ?? '체력이 바닥났다'}</span>
               <span class="dead__sub">선택 ${state.step}회 · 필드 파편 ${countShards(
                 state.field,
               )}/${state.escapeTarget} · 필드 ${state.field.length}장 · 덱 ${
                 state.deck.length
               }장 남음</span>
             </div>`
          : state.escaped
          ? `<div class="escaped" role="status">
               <span class="escaped__word">탈출 성공</span>
               <span class="escaped__sub">필드에 파편 ${countShards(
                 state.field,
               )}개를 모아 밖으로 나왔다 · 선택 ${
                 state.step
               }회 · 필드 ${state.field.length}장 · 덱 ${state.deck.length}장 남음</span>
             </div>`
          : `
            <p class="prompt">
              <span class="prompt__rarity prompt__rarity--${event!.rarity}">${
                RARITY_LABEL[event!.rarity]
              }</span>
            </p>
            <div class="picks">
              ${optionButton('red', event!.red, state)}
              ${optionButton('blue', event!.blue, state)}
            </div>
          `
      }
      ${state.push || state.pick || state.fate ? '' : recentChanges(state)}
    </main>

    ${lastingPanel(state)}

    ${fieldPanel(state)}

    ${deckPanel(state)}
  `;

  root.querySelectorAll<HTMLButtonElement>('.pick').forEach((el) => {
    el.addEventListener('click', () => handlers.onChoose(el.dataset.side as 'red' | 'blue'));
  });
  root.querySelectorAll<HTMLButtonElement>('[data-synergy]').forEach((el) => {
    el.addEventListener('click', () =>
      handlers.onUseSynergy(el.dataset.synergy as ElementType),
    );
  });
  root.querySelectorAll<HTMLButtonElement>('.ebtn').forEach((el) => {
    el.addEventListener('click', () =>
      handlers.onPickElement(el.dataset.element as ElementType),
    );
  });
  root.querySelector('#push-draw')?.addEventListener('click', handlers.onPushDraw);
  root.querySelector('#push-stop')?.addEventListener('click', handlers.onPushStop);
  root.querySelector('#help')?.addEventListener('click', handlers.onHelp);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const blog = root.querySelector('.blog');
  if (blog) blog.scrollTop = blog.scrollHeight;
}
