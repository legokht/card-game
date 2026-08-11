import { canPlayCard } from '../engine/combat';
import type { CardInstance, CombatState } from '../engine/types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다. 규칙 판정은 전부 엔진에 있고,
 * 여기서는 canPlayCard로 배치 가능 여부만 물어본다.
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

function cardBox(card: CardInstance, kind: 'enemy' | 'telegraph' | 'player'): string {
  const hp = `${card.health}/${card.maxHealth}`;
  return `
    <div class="card card--${kind}">
      <div class="card__name">${card.name}</div>
      <div class="card__stats"><span class="atk">공 ${card.attack}</span><span class="hp">♥ ${hp}</span></div>
    </div>`;
}

function laneCells(vm: ViewModel, row: 'telegraph' | 'enemy' | 'player'): string {
  return vm.state.lanes
    .map((lane, i) => {
      const card = lane[row];
      if (card) return `<div class="cell cell--filled">${cardBox(card, row)}</div>`;

      if (row === 'player') {
        const playable =
          vm.selectedUid !== null && canPlayCard(vm.state, vm.selectedUid, i).ok;
        const cls = playable ? 'cell cell--empty cell--target' : 'cell cell--empty';
        return `<div class="${cls}" data-lane="${i}">${playable ? '여기 배치' : ''}</div>`;
      }

      return `<div class="cell cell--empty"></div>`;
    })
    .join('');
}

function handView(vm: ViewModel): string {
  if (vm.state.hand.length === 0) return `<div class="hand__empty">손패 없음</div>`;

  return vm.state.hand
    .map((card) => {
      const affordable = card.cost <= vm.state.energy;
      const selected = card.uid === vm.selectedUid;
      const cls = [
        'hand-card',
        selected ? 'hand-card--selected' : '',
        affordable ? '' : 'hand-card--broke',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cls}" data-uid="${card.uid}">
          <div class="hand-card__cost">${card.cost}</div>
          <div class="card__name">${card.name}</div>
          <div class="card__stats"><span class="atk">공 ${card.attack}</span><span class="hp">♥ ${card.health}</span></div>
        </button>`;
    })
    .join('');
}

function banner(state: CombatState): string {
  if (state.outcome === 'victory') return `<div class="banner banner--win">승리</div>`;
  if (state.outcome === 'defeat') return `<div class="banner banner--lose">패배</div>`;
  return '';
}

export function render(root: HTMLElement, vm: ViewModel, handlers: RenderHandlers): void {
  const { state } = vm;

  // 레인 수는 설정에서 오므로 그리드 열 수를 CSS 변수로 넘긴다.
  root.style.setProperty('--lanes', String(state.lanes.length));

  root.innerHTML = `
    <div class="hud">
      <span class="hud__item">턴 <b>${state.turn}</b></span>
      <span class="hud__item">HP <b>${state.playerHp}/${state.playerMaxHp}</b></span>
      <span class="hud__item">에너지 <b>${state.energy}/${state.maxEnergy}</b></span>
      <span class="hud__item">내 덱 <b>${state.drawPile.length}</b></span>
      <span class="hud__item">몬스터 덱 <b>${state.monsterPile.length}</b></span>
      <button id="restart" class="btn btn--ghost">새 전투</button>
    </div>

    ${banner(state)}

    <div class="board">
      <div class="board__label">예고 — 다음 턴에 내려온다</div>
      <div class="row row--telegraph">${laneCells(vm, 'telegraph')}</div>

      <div class="board__label">적 — 이번 턴 종료 시 공격한다</div>
      <div class="row row--enemy">${laneCells(vm, 'enemy')}</div>

      <div class="board__label">내 유닛 — 배치하면 죽을 때까지 남는다</div>
      <div class="row row--player">${laneCells(vm, 'player')}</div>
    </div>

    <div class="controls">
      <button id="end-turn" class="btn" ${state.outcome === 'ongoing' ? '' : 'disabled'}>
        턴 종료
      </button>
      <span class="hint">${
        vm.selectedUid ? '배치할 칸을 고르세요' : '손패에서 카드를 고르세요'
      }</span>
    </div>

    <div class="hand">${handView(vm)}</div>

    <div class="log">${state.log
      .slice(-14)
      .map((line) => `<div class="log__line">${line}</div>`)
      .join('')}</div>
  `;

  root.querySelectorAll<HTMLButtonElement>('.hand-card').forEach((el) => {
    el.addEventListener('click', () => handlers.onSelectCard(el.dataset.uid!));
  });

  root.querySelectorAll<HTMLDivElement>('.cell--target').forEach((el) => {
    el.addEventListener('click', () => handlers.onPlaceInLane(Number(el.dataset.lane)));
  });

  root.querySelector('#end-turn')?.addEventListener('click', handlers.onEndTurn);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);
}
