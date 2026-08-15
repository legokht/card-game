import './choice.css';
import { Rng } from './engine/rng';
import { canPlay, flee, isOver, playCard } from './choice/battle';
import { choose, createGame, finishBattle, pushDraw, pushStop } from './choice/engine';
import { render } from './choice/render';
import type { GameState } from './choice/types';

const root = document.querySelector<HTMLDivElement>('#app')!;

let rng: Rng;
let state: GameState;
/** 전투 시작 시점의 체력. 끝날 때 얼마나 잃었는지 기록하는 데 쓴다. */
let hpAtBattleStart = 0;

function start(seed = String(Date.now())): void {
  rng = new Rng(seed);
  state = createGame(rng);
  draw();
}

function draw(): void {
  render(root, state, {
    onChoose: (side) => {
      hpAtBattleStart = state.hp;
      choose(state, side, rng);
      draw();
    },
    onPlayCard: (uid) => {
      if (!canPlay(state, uid).ok) return;
      playCard(state, uid, rng);
      draw();
    },
    onFlee: () => {
      flee(state, rng);
      draw();
    },
    onPushDraw: () => {
      pushDraw(state, rng);
      draw();
    },
    onPushStop: () => {
      pushStop(state, rng);
      draw();
    },
    onCloseBattle: () => {
      if (state.battle && isOver(state.battle)) finishBattle(state, rng, hpAtBattleStart);
      draw();
    },
    onRestart: () => start(),
  });
}

start();
