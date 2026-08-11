import { canPlayCard, lanePlayerPower, playerPowerByLane, totalPlayerPower } from '../engine/combat';
import type { CardInstance, CombatState, Lane } from '../engine/types';

/**
 * 상태를 읽어 DOM을 다시 그리기만 한다. 규칙 판정은 전부 엔진에 있다.
 *
 * 이 화면의 핵심은 "총 전력은 보이지만 분배는 안 보인다"이다.
 * 배치 단계에서는 총량만 크게 띄우고 레인별 몫은 물음표로 가린다.
 */

export interface RenderHandlers {
  onSelectCard: (uid: string) => void;
  onPlaceInLane: (laneIndex: number) => void;
  onCommit: () => void;
  onResolve: () => void;
  onRestart: () => void;
}

export interface ViewModel {
  state: CombatState;
  selectedUid: string | null;
}

function statLine(attack: number, health: string): string {
  return `<div class="stats"><span class="stat stat--atk">${attack}</span><span class="stat stat--hp">${health}</span></div>`;
}

function enemyFace(card: CardInstance): string {
  return `
    <div class="face face--incoming">
      <span class="face__power">${card.attack}</span>
    </div>`;
}

function unitFace(card: CardInstance): string {
  return `
    <div class="face face--player">
      <span class="face__name">${card.name}</span>
      ${statLine(card.attack, `${card.health}/${card.maxHealth}`)}
    </div>`;
}

/** 이번 웨이브가 이 레인에 얼마를 보낼지 — 확정 전에는 가려 둔다. */
function incomingSlot(vm: ViewModel, lane: Lane): string {
  if (vm.state.phase === 'placing') {
    return `<div class="slot slot--incoming is-hidden"><span class="unknown">?</span></div>`;
  }
  if (!lane.incoming) {
    return `<div class="slot slot--incoming is-empty"><span class="zero">0</span></div>`;
  }
  return `<div class="slot slot--incoming is-filled">${enemyFace(lane.incoming)}</div>`;
}

function laneColumn(vm: ViewModel, lane: Lane, i: number): string {
  const power = lanePlayerPower(lane);
  const threat = lane.incoming?.attack ?? 0;
  // 공개된 뒤에 전력이 모자란 레인은 그만큼 관통한다.
  const shortfall = vm.state.phase === 'placing' ? 0 : Math.max(0, threat - power);

  const playerSlot = lane.player
    ? `<div class="slot slot--player is-filled">${unitFace(lane.player)}</div>`
    : vm.selectedUid !== null && canPlayCard(vm.state, vm.selectedUid, i).ok
      ? `<button class="slot slot--player is-target" data-lane="${i}"><span class="slot__cue">배치</span></button>`
      : `<div class="slot slot--player is-empty"></div>`;

  return `
    <div class="lane${shortfall > 0 ? ' is-exposed' : ''}">
      <div class="lane__no">${i + 1}</div>
      ${incomingSlot(vm, lane)}
      <div class="lane__line"></div>
      ${playerSlot}
      <div class="lane__power ${power > 0 ? 'is-set' : ''}">
        내 전력 <b>${power}</b>
        ${shortfall > 0 ? `<span class="lane__short">-${shortfall}</span>` : ''}
      </div>
    </div>`;
}

/**
 * 이 시스템의 핵심 판단 도구. 공개된 총량과 내가 깔아둔 총 전력을 나란히 놓고,
 * 그 차이(여유)를 같이 보여준다.
 */
function ledgerHead(state: CombatState): string {
  const mine = totalPlayerPower(state);
  const margin = mine - state.waveTotal;

  if (state.phase === 'placing') {
    return `
      <div class="wavehead">
        <div class="wavehead__main">
          <span class="wavehead__label">${state.wave}웨이브 총 전력</span>
          <span class="wavehead__total">${state.waveTotal}</span>
          <span class="wavehead__hint">어느 레인으로 올지는 확정 후 공개</span>
        </div>
        <div class="wavehead__mine">
          <span class="wavehead__label">내 배치 전력</span>
          <span class="wavehead__sum">${mine}</span>
          <span class="margin ${margin >= 0 ? 'is-up' : 'is-down'}">여유 ${
            margin >= 0 ? '+' : ''
          }${margin}</span>
        </div>
      </div>`;
  }

  const alloc = state.revealedAllocation ?? [];
  return `
    <div class="wavehead is-revealed">
      <div class="wavehead__main">
        <span class="wavehead__label">${state.wave}웨이브 분배 공개</span>
        <span class="wavehead__split">${alloc.join(' / ')}</span>
        <span class="wavehead__hint">${state.revealedPatternName ?? ''} · 총 ${state.waveTotal}</span>
      </div>
      <div class="wavehead__mine">
        <span class="wavehead__label">내 배치 전력</span>
        <span class="wavehead__sum">${mine}</span>
        <span class="margin ${margin >= 0 ? 'is-up' : 'is-down'}">여유 ${
          margin >= 0 ? '+' : ''
        }${margin}</span>
      </div>
    </div>`;
}

function handView(vm: ViewModel): string {
  if (vm.state.hand.length === 0) return `<p class="hand__empty">손패가 비었다</p>`;

  return vm.state.hand
    .map((card) => {
      const locked = vm.state.phase !== 'placing' || card.cost > vm.state.energy;
      const cls = [
        'handcard',
        card.uid === vm.selectedUid ? 'is-selected' : '',
        locked ? 'is-broke' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `
        <button class="${cls}" data-uid="${card.uid}">
          <span class="handcard__cost">${card.cost}</span>
          <span class="face__name">${card.name}</span>
          ${statLine(card.attack, String(card.health))}
          <span class="handcard__power">전력 ${card.attack + card.health}</span>
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
        win ? `${state.waveCount}웨이브를 모두 버텼다` : `${state.wave}웨이브에서 방어선이 무너졌다`
      }</span>
    </div>`;
}

function controls(state: CombatState): string {
  if (state.outcome !== 'ongoing') {
    return `<span class="hint">새 전투를 눌러 다시 시작</span>`;
  }

  if (state.phase === 'placing') {
    return `
      <button id="commit" class="btn">배치 확정 — 분배 공개</button>
      <span class="hint">확정하면 분배가 정해진다. 얇은 레인일수록 더 맞는다.</span>`;
  }

  // 레인 전력을 넘는 만큼만 관통한다.
  const incoming = state.lanes.reduce(
    (sum, l) => sum + Math.max(0, (l.incoming?.attack ?? 0) - lanePlayerPower(l)),
    0,
  );
  const lethal = incoming >= state.playerHp;
  return `
    <button id="resolve" class="btn">교전 진행</button>
    <span class="threat ${lethal ? 'threat--lethal' : incoming > 0 ? 'threat--warn' : 'threat--safe'}">
      ${incoming > 0 ? `관통 예상 ${incoming}${lethal ? ' — 치명적' : ''}` : '관통 없음'}
    </span>`;
}

export function render(root: HTMLElement, vm: ViewModel, handlers: RenderHandlers): void {
  const { state } = vm;
  root.style.setProperty('--lanes', String(state.lanes.length));

  const hpPct = Math.max(0, (state.playerHp / state.playerMaxHp) * 100);

  root.innerHTML = `
    <header class="bar">
      <div class="bar__turn">
        <span class="bar__label">웨이브</span>
        <b>${state.wave}<span class="of">/${state.waveCount}</span></b>
      </div>

      <div class="vitals">
        <div class="vitals__row">
          <span class="bar__label">생명</span>
          <b>${state.playerHp}<span class="of">/${state.playerMaxHp}</span></b>
        </div>
        <div class="meter"><i style="width:${hpPct}%"></i></div>
      </div>

      <div class="pips">
        <span class="bar__label">에너지</span>
        <span class="pips__dots">${Array.from(
          { length: state.maxEnergy },
          (_, i) => `<i class="${i < state.energy ? 'is-lit' : ''}"></i>`,
        ).join('')}</span>
      </div>

      <div class="counts"><span>내 덱 <b>${state.drawPile.length}</b></span></div>

      <button id="restart" class="btn btn--quiet">새 전투</button>
    </header>

    ${banner(state)}
    ${ledgerHead(state)}

    <section class="field" aria-label="전장">
      <div class="zone zone--enemy">
        <span class="zone__name">적 진영</span>
        <span class="zone__note">${
          state.phase === 'placing' ? '위 칸의 분배는 아직 숨겨져 있다' : '분배 공개됨 — 교전 대기'
        }</span>
      </div>

      <div class="lanes">${state.lanes.map((l, i) => laneColumn(vm, l, i)).join('')}</div>

      <div class="zone zone--mine">
        <span class="zone__name">내 진영</span>
        <span class="zone__note">레인별 전력 = 배치한 유닛의 공격력 + 체력</span>
      </div>
    </section>

    <div class="controls">${controls(state)}</div>

    <section class="hand" aria-label="손패">${handView(vm)}</section>

    <section class="ledger" aria-label="전투 기록">${state.log
      .slice(-40)
      .map((line) => {
        const head = line.startsWith('---');
        return `<p class="${head ? 'ledger__turn' : ''}">${line.replace(/^-+ ?| ?-+$/g, '')}</p>`;
      })
      .join('')}</section>
  `;

  root.querySelectorAll<HTMLButtonElement>('.handcard').forEach((el) => {
    el.addEventListener('click', () => handlers.onSelectCard(el.dataset.uid!));
  });

  root.querySelectorAll<HTMLButtonElement>('.is-target').forEach((el) => {
    el.addEventListener('click', () => handlers.onPlaceInLane(Number(el.dataset.lane)));
  });

  root.querySelector('#commit')?.addEventListener('click', handlers.onCommit);
  root.querySelector('#resolve')?.addEventListener('click', handlers.onResolve);
  root.querySelector('#restart')?.addEventListener('click', handlers.onRestart);

  const ledger = root.querySelector('.ledger');
  if (ledger) ledger.scrollTop = ledger.scrollHeight;

  // 레인별 전력은 적 반응의 기준이라 배치 중에도 최신값이어야 한다.
  void playerPowerByLane(state);
}
