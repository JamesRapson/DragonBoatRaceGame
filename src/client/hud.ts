import { CONFIG } from '../shared/config';
import type { GameView } from '../shared/types';

function ordinalSuffix(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th'; }
}

const INSTRUCTIONS =
  'Reach the finish line first. Steer with ← → (or the buttons), and hold Power 10 (or Space) to sprint — but it drains your fatigue.';

/** Reflects game state into the DOM HUD overlay each frame. */
export class Hud {
  private el(id: string): HTMLElement { return document.getElementById(id)!; }

  private speed = this.el('hud-speed');
  private speedBar = this.el('hud-speed-bar');
  private fatigue = this.el('hud-fatigue');
  private fatigueBar = this.el('hud-fatigue-bar');
  private pos = this.el('hud-pos');
  private posSfx = this.el('hud-pos-sfx');
  private total = this.el('hud-total');
  private dist = this.el('hud-dist');
  private power = this.el('power-banner');
  private toast = this.el('toast');
  private btnPower = this.el('btn-power') as HTMLButtonElement;
  private overlay = this.el('overlay');
  private overlayTitle = this.el('overlay-title');
  private overlayText = this.el('overlay-text');
  private menu = this.el('menu');

  private overlayKey = '';

  constructor() {
    this.total.textContent = String(CONFIG.NUM_BOATS);
  }

  update(game: GameView, isMultiplayer = false): void {
    const p = game.player;
    if (p) {
      this.speed.textContent = p.speed.toFixed(1);
      this.speedBar.style.width = `${Math.min(100, (p.speed / (CONFIG.BASE_SPEED_MS * 2)) * 100)}%`;
      this.fatigue.textContent = String(Math.round(p.fatigue));
      this.fatigueBar.style.width = `${p.fatigue}%`;
      this.pos.textContent = String(p.rank);
      this.posSfx.textContent = ordinalSuffix(p.rank);
      this.dist.textContent = String(Math.max(0, Math.round(CONFIG.RACE_LENGTH_M - p.dist)));

      const boosting = p.powering && p.fatigue < CONFIG.MAX_FATIGUE;
      this.power.classList.toggle('hidden', !boosting);
    }

    this.btnPower.disabled = !game.canPower();

    if (game.toast) {
      this.toast.textContent = game.toast.text;
      this.toast.classList.remove('hidden');
    } else {
      this.toast.classList.add('hidden');
    }

    this.updateOverlay(game, isMultiplayer);
  }

  /** Show/hide and fill the central overlay based on the current phase. */
  private updateOverlay(game: GameView, isMultiplayer: boolean): void {
    const phase = game.phase;
    if (phase === 'racing') {
      this.overlay.classList.add('hidden');
      this.overlayKey = 'racing';
      return;
    }
    this.overlay.classList.remove('hidden');

    // A key so we only touch the DOM when the displayed content changes.
    const cd = game.countdown ?? 0;
    const key = phase === 'countdown' ? `cd:${cd}`
      : phase === 'finished' ? `fin:${game.player?.rank ?? 0}:${isMultiplayer}`
      : phase;
    if (key === this.overlayKey) return;
    this.overlayKey = key;

    // The join menu belongs on the opening screen and single-player results.
    // In multiplayer the next race starts automatically, so hide it there —
    // otherwise players re-click "Multiplayer" and open a duplicate connection.
    const showMenu = phase === 'ready' || (phase === 'finished' && !isMultiplayer);
    this.menu.classList.toggle('hidden', !showMenu);

    if (phase === 'countdown') {
      this.overlayTitle.textContent = 'Get ready';
      this.overlayText.textContent = `Race starts in ${cd}s…`;
    } else if (phase === 'lobby') {
      this.overlayTitle.textContent = 'Waiting for players…';
      this.overlayText.textContent = 'The next race will begin shortly.';
    } else if (phase === 'finished') {
      const rank = game.player?.rank ?? 0;
      const won = rank === 1;
      this.overlayTitle.textContent = won ? 'You won! 🏆' : `Finished ${rank}${ordinalSuffix(rank)}`;
      this.overlayText.innerHTML = this.resultsHtml(game)
        + (isMultiplayer ? '<p style="margin-top:10px">Next race starting…</p>' : '');
    } else { // ready
      this.overlayTitle.textContent = 'Dragon Boat Race';
      this.overlayText.textContent = INSTRUCTIONS;
    }
  }

  private resultsHtml(game: GameView): string {
    const rows = game.results().map((b) => {
      const time = b.finished ? `${b.finishTime.toFixed(1)}s` : 'DNF';
      const cls = b.isPlayer ? ' class="you"' : '';
      return `<li${cls}><span>${b.rank}. ${b.name}</span><span>${time}</span></li>`;
    }).join('');
    return `<ul class="results">${rows}</ul>`;
  }
}
