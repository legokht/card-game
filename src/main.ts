import './style.css';
import { createCombat, endTurn, playCard, canPlayCard } from './engine/combat';
import { Rng } from './engine/rng';
import { DEFAULT_CONFIG } from './data/cards';
import { render } from './ui/render';
import type { CombatState } from './engine/types';

const root = document.querySelector<HTMLDivElement>('#app')!;

let rng: Rng;
let state: CombatState;
let selectedUid: string | null = null;

function start(seed = String(Date.now())): void {
  rng = new Rng(seed);
  state = createCombat(DEFAULT_CONFIG, rng);
  selectedUid = null;
  draw();
}

function draw(): void {
  render(
    root,
    { state, selectedUid },
    {
      onSelectCard: (uid) => {
        selectedUid = selectedUid === uid ? null : uid;
        draw();
      },
      onPlaceInLane: (lane) => {
        if (!selectedUid || !canPlayCard(state, selectedUid, lane).ok) return;
        playCard(state, selectedUid, lane);
        selectedUid = null;
        draw();
      },
      onEndTurn: () => {
        endTurn(state, rng);
        selectedUid = null;
        draw();
      },
      onRestart: () => start(),
    },
  );
}

start();
