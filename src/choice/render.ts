import { CURSE_DAMAGE, CURSE_RULES, FLEE_HP_COST, ROT_DRAIN } from './balance';
import { canPlay } from './battle';
import { deckCurseBreakdown, deckByKind, summarize } from './engine';
import { curseCounts, onEdge } from './hand';
import type {
  BattleState,
  CardInstance,
  CardKind,
  ChoiceOption,
  CurseType,
  GameState,
  OptionKind,
  Tone,
} from './types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다.
 *
 * 화면의 일은 두 가지다. 선택지 둘을 감정으로 읽히게 세우는 것, 그리고 그 선택이
 * 덱을 어떻게 바꿨는지 바로 보이게 하는 것.
 */

export interface Handlers {
  onChoose: (side: 'red' | 'blue') => void;
  onPlayCard: (uid: string) => void;
  onFlee: () => void;
  onCloseBattle: () => void;
  onPushDraw: () => void;
  onPushStop: () => void;
  onRestart: () => void;
}

const TONE_LABEL: Record<Tone, string> = {
  greed: '탐욕',
  safe: '안전',
  now: '지금',
  later: '나중',
  gamble: '도박',
  sure: '확실',
};

/** 어떤 종류의 선택인지 배지로 알려준다. 덱소비형은 특히 미리 보여야 한다. */
const OPTION_LABEL: Record<OptionKind, string> = {
  consume: '덱 사용',
  cleanse: '덱 정리',
  shard: '탈출',
  gain: '획득',
  draw: '뽑기',
  purge: '손패 정리',
};

const KIND_LABEL: Record<CardKind, string> = {
  reward: '보상',
  neutral: '중립',
  curse: '저주',
  shard: '파편',
};

function optionButton(side: 'red' | 'blue', option: ChoiceOption): string {
  return `
    <button class="pick pick--${side}" data-side="${side}">
      <span class="pick__tags">
        <span class="pick__tone">${TONE_LABEL[option.tone]}</span>
        <span class="pick__kind pick__kind--${option.kind}">${OPTION_LABEL[option.kind]}</span>
      </span>
      <span class="pick__text">${option.text}</span>
    </button>`;
}

/**
 * 상시 손패.
 *
 * 저주는 종류별로 색이 다르고, **같은 종류가 정확히 1장 있는 카드는 테두리가
 * 살아난다** — 한 장 더 뽑으면 겹친다는 뜻이다. 계산 없이 그 상태가 보이는 것이
 * 이 화면의 전부다.
 */
function handPanel(state: GameState, interactive: boolean): string {
  const edged = onEdge(state.hand);
  const counts = curseCounts(state.hand);

  const cards = state.hand
    .map((card: CardInstance) => {
      const onTheEdge = card.curseType !== undefined && edged.includes(card.curseType);
      const locked = interactive ? !canPlay(state, card.uid).ok : true;
      const cls = [
        'hcard',
        `hcard--${card.kind}`,
        card.curseType ? `hcard--${card.curseType}` : '',
        onTheEdge ? 'is-edge' : '',
        interactive && locked ? 'is-locked' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cls}" data-uid="${card.uid}" ${card.kind === 'curse' ? 'aria-disabled="true"' : ''}>
          <span class="hcard__name">${card.name}</span>
          ${
            card.kind === 'curse'
              ? `<span class="hcard__note">${onTheEdge ? '한 장 더면 발동' : '사용 불가'}</span>`
              : `<span class="hcard__stats">${card.attack > 0 ? `<span class="atk">공 ${card.attack}</span>` : ''}${
                  card.block > 0 ? `<span class="blk">방 ${card.block}</span>` : ''
                }</span>`
          }
        </button>`;
    })
    .join('');

  const warnings = edged
    .map((t) => `<span class="edgewarn edgewarn--${t}">${CURSE_RULES[t].name} 1장 — 겹치면 ${CURSE_RULES[t].description}</span>`)
    .join('');

  const rot = counts.rot;

  return `
    <section class="hand" aria-label="손패">
      <div class="hand__head">
        <span class="hand__label">손패 <b>${state.hand.length}</b>장</span>
        ${rot > 0 ? `<span class="hand__rot">부패 ${rot}장 — 매 선택 체력 -${rot * ROT_DRAIN}</span>` : ''}
      </div>
      ${warnings ? `<div class="edgewarns">${warnings}</div>` : ''}
      <div class="hcards">${cards || '<p class="hcards__empty">손이 비었다</p>'}</div>
    </section>`;
}

/** 푸시 유어 럭 화면. 한 장씩 뽑으며 멈출지 정한다. */
function pushView(state: GameState): string {
  const push = state.push!;
  const edged = onEdge(state.hand);

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
  return `
    <div class="vitals">
      <span class="top__label">체력</span>
      <div class="vitals__row">
        <b class="${low ? 'is-low' : ''}">${state.hp}<span class="of">/${state.maxHp}</span></b>
        <div class="hpbar"><i class="${low ? 'is-low' : ''}" style="width:${pct}%"></i></div>
      </div>
    </div>`;
}

function shardTrack(state: GameState): string {
  const pips = Array.from(
    { length: state.escapeTarget },
    (_, i) => `<i class="${i < state.shards ? 'is-lit' : ''}"></i>`,
  ).join('');
  return `
    <div class="escape">
      <span class="escape__label">탈출구 파편</span>
      <span class="escape__pips">${pips}</span>
      <span class="escape__count">${state.shards}/${state.escapeTarget}</span>
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
      ${
        state.battle
          ? `<p class="deck__note">전투 중 — 손패 ${state.battle.hand.length}장 포함 (덱에 ${state.deck.length}장 남음)</p>`
          : ''
      }
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
      <p class="curseratio__note">덱 사용 선택지에서 저주 한 장당 체력 -${CURSE_DAMAGE}</p>
      <div class="bar">${bars || '<i class="seg seg--none"></i>'}</div>
      <div class="tallies">${counts}</div>
      <div class="piles">${lists || '<p class="pile__empty">덱이 비었다</p>'}</div>
    </aside>`;
}

/**
 * 전투 화면.
 *
 * 저주는 손패 자리를 차지하되 낼 수 없다는 것이 한눈에 보여야 한다 —
 * 이 게임에서 "덱 관리를 안 한 대가"를 체감하는 자리가 여기다.
 */
function battleView(state: GameState, battle: BattleState): string {
  // 카드 잠금과 같은 기준으로 센다. 전투가 끝나면 손에 남아 있어도 쓸 수 없다.
  const usable = battle.hand.filter((c) => canPlay(state, c.uid).ok).length;
  const enemyPct = Math.max(0, (battle.enemyHp / battle.enemy.hp) * 100);
  const over = battle.outcome !== 'ongoing';

  const result =
    battle.outcome === 'won'
      ? { word: '승리', cls: 'won' }
      : battle.outcome === 'fled'
        ? { word: '도망', cls: 'fled' }
        : { word: '패배', cls: 'lost' };

  return `
    <div class="battle">
      <div class="battle__enemy">
        <div class="battle__row">
          <span class="battle__name">${battle.enemy.name}</span>
          <span class="battle__hp">${battle.enemyHp}<span class="of">/${battle.enemy.hp}</span></span>
        </div>
        <div class="enemybar"><i style="width:${enemyPct}%"></i></div>
        <span class="battle__note">매 턴 ${battle.enemy.attack} 피해${
          battle.block > 0 ? ` · 이번 턴 방어 ${battle.block}` : ''
        }</span>
      </div>

      <div class="handline">
        손패 <b>${battle.hand.length}</b>장 중 쓸 수 있는 것 <b class="${
          usable === 0 ? 'is-none' : ''
        }">${usable}</b>장
        ${battle.cursesDrawn > 0 ? `<span class="handline__curse">저주 ${battle.cursesDrawn}장이 자리를 막고 있다</span>` : ''}
      </div>

      ${
        over
          ? `<div class="bresult bresult--${result.cls}">
               <span class="bresult__word">${result.word}</span>
               <span class="bresult__sub">${battle.turn}턴 · 카드 ${battle.spent}장 소모</span>
               <button id="close-battle" class="btn">계속</button>
             </div>`
          : `<div class="bcontrols">
               <button id="flee" class="btn btn--flee">도망친다 — 체력 -${FLEE_HP_COST}, 저주를 주울 수 있다</button>
             </div>`
      }

      <section class="blog">${battle.log.map((l) => `<p>${l}</p>`).join('')}</section>
    </div>`;
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
          : state.battle
            ? battleView(state, state.battle)
            : state.dead
          ? `<div class="dead" role="status">
               <span class="dead__word">사망</span>
               <span class="dead__cause">${state.causeOfDeath ?? '체력이 바닥났다'}</span>
               <span class="dead__sub">파편 ${state.shards}/${state.escapeTarget}에서 멈췄다 · 선택 ${
                 state.step
               }회 · 저주 ${summarize(state).curse}/${summarize(state).total}</span>
             </div>`
          : state.escaped
          ? `<div class="escaped" role="status">
               <span class="escaped__word">탈출 성공</span>
               <span class="escaped__sub">파편 ${state.shards}개를 모아 밖으로 나왔다 · 선택 ${
                 state.step
               }회</span>
             </div>`
          : `
            <p class="prompt">${event?.prompt ?? ''}</p>
            <div class="picks">
              ${optionButton('red', event!.red)}
              ${optionButton('blue', event!.blue)}
            </div>
            ${event?.readsDeck ? `<p class="tag">이 선택은 지금 덱 상태를 읽는다</p>` : ''}
          `
      }
      ${state.battle || state.push ? '' : recentChanges(state)}
    </main>

    ${handPanel(state, state.battle !== null && state.battle.outcome === 'ongoing')}

    ${deckPanel(state)}

    <section class="history" aria-label="선택 기록">${state.log
      .slice(-60)
      .map((line) => `<p class="${line.startsWith('   ') ? 'history__sub' : ''}">${line.trim()}</p>`)
      .join('')}</section>
  `;

  root.querySelectorAll<HTMLButtonElement>('.pick').forEach((el) => {
    el.addEventListener('click', () => handlers.onChoose(el.dataset.side as 'red' | 'blue'));
  });
  root.querySelectorAll<HTMLButtonElement>('.hcard:not(.is-locked)').forEach((el) => {
    el.addEventListener('click', () => handlers.onPlayCard(el.dataset.uid!));
  });
  root.querySelector('#flee')?.addEventListener('click', handlers.onFlee);
  root.querySelector('#push-draw')?.addEventListener('click', handlers.onPushDraw);
  root.querySelector('#push-stop')?.addEventListener('click', handlers.onPushStop);
  root.querySelector('#close-battle')?.addEventListener('click', handlers.onCloseBattle);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const blog = root.querySelector('.blog');
  if (blog) blog.scrollTop = blog.scrollHeight;

  const history = root.querySelector('.history');
  if (history) history.scrollTop = history.scrollHeight;
}
