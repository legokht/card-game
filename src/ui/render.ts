import { canPlayCard } from '../engine/combat';
import type { CardInstance, CombatState, Lane } from '../engine/types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다. 규칙 판정은 전부 엔진에 있고,
 * 여기서는 canPlayCard로 배치 가능 여부만 물어본다.
 *
 * 보드는 레인을 세로 열로 그린다. 예고 → 적 → 내 유닛이 한 레인 안에서
 * 이어지는 것이 이 게임의 핵심이라, 가로줄이 아니라 세로 열로 읽혀야 한다.
 */

export interface RenderHandlers {
  onSelectCard: (uid: string) => void;
  onPlaceInLane: (laneIndex: number) => void;
  onEndTurn: () => void;
  onRestart: () => void;
}

export interface ViewModel {
  state: CombatState;
  selectedUid: string | null;
}

type SlotKind = 'telegraph' | 'enemy' | 'player';

function statLine(attack: number, health: string): string {
  return `<div class="stats"><span class="stat stat--atk">${attack}</span><span class="stat stat--hp">${health}</span></div>`;
}

function cardFace(card: CardInstance, kind: SlotKind): string {
  return `
    <div class="face face--${kind}">
      <span class="face__name">${card.name}</span>
      ${statLine(card.attack, `${card.health}/${card.maxHealth}`)}
    </div>`;
}

function slot(vm: ViewModel, lane: Lane, kind: SlotKind, laneIndex: number): string {
  const card = lane[kind];
  if (card) return `<div class="slot slot--${kind} is-filled">${cardFace(card, kind)}</div>`;

  if (kind === 'player') {
    const playable = vm.selectedUid !== null && canPlayCard(vm.state, vm.selectedUid, laneIndex).ok;
    if (playable) {
      return `<button class="slot slot--player is-target" data-lane="${laneIndex}">
        <span class="slot__cue">배치</span>
      </button>`;
    }
    return `<div class="slot slot--player is-empty"></div>`;
  }

  return `<div class="slot slot--${kind} is-empty"></div>`;
}

function laneColumn(vm: ViewModel, lane: Lane, i: number): string {
  const engaged = lane.enemy && lane.player ? ' is-engaged' : '';
  const leaking = lane.enemy && !lane.player ? ' is-leaking' : '';
  return `
    <div class="lane${engaged}${leaking}">
      <div class="lane__no">${i + 1}</div>
      ${slot(vm, lane, 'telegraph', i)}
      ${slot(vm, lane, 'enemy', i)}
      <div class="lane__line"></div>
      ${slot(vm, lane, 'player', i)}
    </div>`;
}

function handView(vm: ViewModel): string {
  if (vm.state.hand.length === 0) return `<p class="hand__empty">손패가 비었다</p>`;

  return vm.state.hand
    .map((card) => {
      const broke = card.cost > vm.state.energy;
      const cls = [
        'handcard',
        card.uid === vm.selectedUid ? 'is-selected' : '',
        broke ? 'is-broke' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cls}" data-uid="${card.uid}" ${broke ? 'aria-disabled="true"' : ''}>
          <span class="handcard__cost">${card.cost}</span>
          <span class="face__name">${card.name}</span>
          ${statLine(card.attack, String(card.health))}
        </button>`;
    })
    .join('');
}

function banner(state: CombatState): string {
  if (state.outcome === 'ongoing') return '';
  const win = state.outcome === 'victory';
  return `
    <div class="banner banner--${win ? 'win' : 'lose'}" role="status">
      <span class="banner__word">${win ? '승리' : '패배'}</span>
      <span class="banner__sub">${
        win ? '몬스터 덱이 소진되고 필드가 정리되었다' : '방어선이 무너졌다'
      }</span>
    </div>`;
}

/** 위험 신호를 한 줄로 요약한다. 숫자를 세지 않아도 상황이 읽혀야 한다. */
function threatLine(state: CombatState): string {
  const incoming = state.lanes
    .filter((l) => l.enemy && !l.player)
    .reduce((sum, l) => sum + l.enemy!.attack, 0);

  if (state.outcome !== 'ongoing') return '';
  if (incoming === 0) return `<span class="threat threat--safe">이번 턴 관통 피해 없음</span>`;

  const lethal = incoming >= state.playerHp;
  return `<span class="threat ${lethal ? 'threat--lethal' : 'threat--warn'}">
    이번 턴 관통 <b>${incoming}</b>${lethal ? ' — 치명적' : ''}
  </span>`;
}

export function render(root: HTMLElement, vm: ViewModel, handlers: RenderHandlers): void {
  const { state } = vm;
  root.style.setProperty('--lanes', String(state.lanes.length));

  const hpPct = Math.max(0, (state.playerHp / state.playerMaxHp) * 100);

  root.innerHTML = `
    <header class="bar">
      <div class="bar__turn"><span class="bar__label">턴</span><b>${state.turn}</b></div>

      <div class="vitals">
        <div class="vitals__row">
          <span class="bar__label">생명</span>
          <b>${state.playerHp}<span class="of">/${state.playerMaxHp}</span></b>
        </div>
        <div class="meter"><i style="width:${hpPct}%"></i></div>
      </div>

      <div class="pips" title="에너지">
        <span class="bar__label">에너지</span>
        <span class="pips__dots">${Array.from(
          { length: state.maxEnergy },
          (_, i) => `<i class="${i < state.energy ? 'is-lit' : ''}"></i>`,
        ).join('')}</span>
      </div>

      <div class="counts">
        <span>내 덱 <b>${state.drawPile.length}</b></span>
        <span>몬스터 덱 <b>${state.monsterPile.length}</b></span>
      </div>

      <button id="restart" class="btn btn--quiet">새 전투</button>
    </header>

    ${banner(state)}

    <section class="field" aria-label="전장">
      <div class="zone zone--enemy">
        <span class="zone__name">적 진영</span>
        <span class="zone__note">위 칸은 예고 — 다음 턴에 내려온다</span>
      </div>

      <div class="lanes">${state.lanes.map((l, i) => laneColumn(vm, l, i)).join('')}</div>

      <div class="zone zone--mine">
        <span class="zone__name">내 진영</span>
        <span class="zone__note">배치한 유닛은 죽을 때까지 남는다</span>
      </div>
    </section>

    <div class="controls">
      <button id="end-turn" class="btn" ${state.outcome === 'ongoing' ? '' : 'disabled'}>턴 종료</button>
      ${threatLine(state)}
      <span class="hint">${
        state.outcome !== 'ongoing'
          ? '새 전투를 눌러 다시 시작'
          : vm.selectedUid
            ? '배치할 레인을 고르세요'
            : '손패에서 카드를 고르세요'
      }</span>
    </div>

    <section class="hand" aria-label="손패">${handView(vm)}</section>

    <section class="ledger" aria-label="전투 기록">${state.log
      .slice(-40)
      .map((line) => {
        const head = line.startsWith('---');
        return `<p class="${head ? 'ledger__turn' : ''}">${line.replace(/^-+ | -+$/g, '')}</p>`;
      })
      .join('')}</section>
  `;

  root.querySelectorAll<HTMLButtonElement>('.handcard').forEach((el) => {
    el.addEventListener('click', () => handlers.onSelectCard(el.dataset.uid!));
  });

  root.querySelectorAll<HTMLButtonElement>('.is-target').forEach((el) => {
    el.addEventListener('click', () => handlers.onPlaceInLane(Number(el.dataset.lane)));
  });

  root.querySelector('#end-turn')?.addEventListener('click', handlers.onEndTurn);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  // 기록은 항상 최신 줄이 보이게 둔다.
  const ledger = root.querySelector('.ledger');
  if (ledger) ledger.scrollTop = ledger.scrollHeight;
}
