import { CURSE_RULES, MAX_HP } from './balance';
import { deckByKind, deckCurseBreakdown, fieldCurseBreakdown, summarize } from './engine';
import { countShards, onEdge } from './field';
import type {
  CardInstance,
  CardKind,
  CurseType,
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
  onRestart: () => void;
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

const KIND_LABEL: Record<CardKind, string> = {
  reward: '보상',
  neutral: '중립',
  curse: '저주',
  shard: '파편',
};

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
    .map(
      (l) => `
      <li class="lasting__row${l.side ? ` lasting__row--${l.side}` : ''}">
        <span class="lasting__label">${l.label}</span>
        <span class="lasting__left">남은 <b>${l.remaining}</b>회</span>
      </li>`,
    )
    .join('');
  return `
    <section class="lasting" aria-label="걸려 있는 제약">
      <p class="lasting__head">걸려 있는 제약</p>
      <ul class="lasting__list">${rows}</ul>
    </section>`;
}

/**
 * 필드.
 *
 * 뽑은 카드가 계속 쌓이는 곳이라 장수가 많아져도 볼 수 있어야 한다.
 * 저주는 종류별로 색이 다르고, **같은 종류가 정확히 1장 있는 카드는 테두리가
 * 살아난다** — 한 장 더 뽑으면 겹친다는 뜻이다. 계산 없이 그 상태가 보이는 것이
 * 이 화면에서 가장 중요한 일이다.
 */
function fieldPanel(state: GameState): string {
  const edged = onEdge(state.field);
  const onField = fieldCurseBreakdown(state);

  const cards = state.field
    .map((card: CardInstance) => {
      const onTheEdge = card.curseType !== undefined && edged.includes(card.curseType);
      const cls = [
        'fcard',
        `fcard--${card.kind}`,
        card.curseType ? `fcard--${card.curseType}` : '',
        onTheEdge ? 'is-edge' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <div class="${cls}">
          <span class="fcard__name">${card.name}</span>
          ${onTheEdge ? '<span class="fcard__note">한 장 더면 발동</span>' : ''}
        </div>`;
    })
    .join('');

  /**
   * 종류별 현재 장수와 발동 문턱을 함께 보여준다 — "파멸 2/3".
   * 문턱에 닿기 직전이면 강하게 경고한다. 침식은 문턱이 없어 장수만 센다.
   */
  const tally = (Object.keys(CURSE_RULES) as CurseType[])
    .map((t) => {
      const rule = CURSE_RULES[t];
      const n = onField[t];
      const near = edged.includes(t);
      const meter = rule.threshold === null ? `${n}` : `${n}/${rule.threshold}`;
      return `<span class="cursekind cursekind--${t}${near ? ' is-near' : ''}"
        title="${rule.name} — ${rule.target}을(를) 노린다. ${rule.description}"
        >${rule.name} <b>${meter}</b></span>`;
    })
    .join('');

  const warnings = edged
    .map((t) => {
      const rule = CURSE_RULES[t];
      const left = (rule.threshold ?? 0) - onField[t];
      const head = left <= 1 ? `${rule.name} 한 장만 더면` : `${rule.name} ${left}장 더면`;
      return `<span class="edgewarn edgewarn--${t}">${head} — ${rule.description}</span>`;
    })
    .join('');

  return `
    <section class="field" aria-label="필드">
      <div class="field__head">
        <span class="field__label">필드 <b>${state.field.length}</b>장</span>
        <span class="field__tally">${tally}</span>
      </div>
      ${warnings ? `<div class="edgewarns">${warnings}</div>` : ''}
      <div class="fcards">${cards || '<p class="fcards__empty">아직 아무것도 펼치지 않았다</p>'}</div>
    </section>`;
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
  const pct = Math.max(0, (state.hp / state.maxHp) * 100);
  const low = state.hp <= state.maxHp * 0.34;
  // 부패로 깎인 최대 체력은 회복으로 돌아오지 않는다. 얼마나 잃었는지가
  // 보이지 않으면 "왜 회복해도 예전만 못한가"를 알 수 없다.
  const lost = MAX_HP - state.maxHp;
  return `
    <div class="vitals">
      <span class="top__label">체력</span>
      <div class="vitals__row">
        <b class="${low ? 'is-low' : ''}">${state.hp}<span class="of">/${state.maxHp}</span></b>
        <div class="hpbar"><i class="${low ? 'is-low' : ''}" style="width:${pct}%"></i></div>
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

function deckPanel(state: GameState): string {
  const s = summarize(state);
  const groups = deckByKind(state);

  const bars = (['reward', 'neutral', 'curse', 'shard'] as CardKind[])
    .map((kind) => {
      const n = s[kind];
      if (n === 0) return '';
      const pct = (n / Math.max(1, s.total)) * 100;
      return `<i class="seg seg--${kind}" style="width:${pct}%" title="${KIND_LABEL[kind]} ${n}"></i>`;
    })
    .join('');

  const counts = (['reward', 'neutral', 'curse', 'shard'] as CardKind[])
    .map(
      (kind) =>
        `<span class="tally tally--${kind}"><b>${s[kind]}</b>${KIND_LABEL[kind]}</span>`,
    )
    .join('');

  const lists = groups
    .filter((g) => g.cards.length > 0)
    .map(
      (g) => `
        <div class="pile">
          <div class="pile__head pile__head--${g.kind}">${KIND_LABEL[g.kind]}</div>
          <ul class="pile__list">
            ${g.cards
              .map(
                (c) =>
                  `<li><span class="pile__name">${c.name}</span>${
                    c.count > 1 ? `<span class="pile__x">×${c.count}</span>` : ''
                  }<span class="pile__val">${c.value}</span></li>`,
              )
              .join('')}
          </ul>
        </div>`,
    )
    .join('');

  return `
    <aside class="deck" aria-label="현재 덱">
      <div class="deck__top">
        <span class="deck__size"><b>${s.total}</b>장</span>
        <span class="taint taint--${s.taintTone}">${s.taintLabel}</span>
      </div>
      <div class="curseratio">
        저주 <b>${s.curse}</b> / 전체 <b>${s.total}</b>
        <span class="curseratio__pct">${Math.round(s.taint * 100)}%</span>
      </div>
      <p class="cursekinds__label">덱에 남아 아직 뽑힐 수 있는 저주</p>
      <div class="cursekinds">${(Object.keys(CURSE_RULES) as CurseType[])
        .map(
          (t) =>
            `<span class="cursekind cursekind--${t}">${CURSE_RULES[t].name} <b>${
              deckCurseBreakdown(state)[t]
            }</b></span>`,
        )
        .join('')}</div>
      <div class="bar">${bars || '<i class="seg seg--none"></i>'}</div>
      <div class="tallies">${counts}</div>
      <div class="piles">${lists || '<p class="pile__empty">덱이 비었다</p>'}</div>
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
      <button id="restart" class="ghost">처음부터</button>
    </header>

    <main class="stage">
      ${
        state.push
          ? pushView(state)
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
      ${state.push ? '' : recentChanges(state)}
    </main>

    ${lastingPanel(state)}

    ${fieldPanel(state)}

    ${deckPanel(state)}

    <section class="history" aria-label="선택 기록">${state.log
      .slice(-60)
      .map((line) => `<p class="${line.startsWith('   ') ? 'history__sub' : ''}">${line.trim()}</p>`)
      .join('')}</section>
  `;

  root.querySelectorAll<HTMLButtonElement>('.pick').forEach((el) => {
    el.addEventListener('click', () => handlers.onChoose(el.dataset.side as 'red' | 'blue'));
  });
  root.querySelector('#push-draw')?.addEventListener('click', handlers.onPushDraw);
  root.querySelector('#push-stop')?.addEventListener('click', handlers.onPushStop);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const blog = root.querySelector('.blog');
  if (blog) blog.scrollTop = blog.scrollHeight;

  const history = root.querySelector('.history');
  if (history) history.scrollTop = history.scrollHeight;
}
