import { deckByKind, summarize } from './engine';
import type { CardKind, ChoiceOption, GameState, Tone } from './types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다.
 *
 * 화면의 일은 두 가지다. 선택지 둘을 감정으로 읽히게 세우는 것, 그리고 그 선택이
 * 덱을 어떻게 바꿨는지 바로 보이게 하는 것.
 */

export interface Handlers {
  onChoose: (side: 'red' | 'blue') => void;
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

const KIND_LABEL: Record<CardKind, string> = {
  reward: '보상',
  neutral: '중립',
  curse: '저주',
  shard: '파편',
};

function optionButton(side: 'red' | 'blue', option: ChoiceOption): string {
  return `
    <button class="pick pick--${side}" data-side="${side}">
      <span class="pick__tone">${TONE_LABEL[option.tone]}</span>
      <span class="pick__text">${option.text}</span>
    </button>`;
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
        <span class="taint taint--${s.taintTone}">오염 ${Math.round(s.taint * 100)}% · ${s.taintLabel}</span>
      </div>
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
      <div class="top__step"><span class="top__label">선택</span><b>${state.step - (state.escaped ? 1 : 0)}</b></div>
      ${shardTrack(state)}
      <button id="restart" class="ghost">처음부터</button>
    </header>

    <main class="stage">
      ${
        state.escaped
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
      ${recentChanges(state)}
    </main>

    ${deckPanel(state)}

    <section class="history" aria-label="선택 기록">${state.log
      .slice(-60)
      .map((line) => `<p class="${line.startsWith('   ') ? 'history__sub' : ''}">${line.trim()}</p>`)
      .join('')}</section>
  `;

  root.querySelectorAll<HTMLButtonElement>('.pick').forEach((el) => {
    el.addEventListener('click', () => handlers.onChoose(el.dataset.side as 'red' | 'blue'));
  });
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const history = root.querySelector('.history');
  if (history) history.scrollTop = history.scrollHeight;
}
