import type { GameController } from '../shared/types';

/**
 * Wire keyboard and on-screen buttons to whatever controller is active.
 * `getController` returns the current target (local Game or RemoteGame), so the
 * same bindings work whether you're in Practice or Multiplayer.
 */
export function bindInput(getController: () => GameController): void {
  let left = false;
  let right = false;
  const applySteer = () => getController().setSteer((right ? 1 : 0) - (left ? 1 : 0));

  const btnLeft = document.getElementById('btn-left')!;
  const btnRight = document.getElementById('btn-right')!;
  const btnPower = document.getElementById('btn-power')!;

  const hold = (el: HTMLElement, set: (v: boolean) => void) => {
    const down = (e: Event) => { e.preventDefault(); set(true); applySteer(); };
    const up = () => { set(false); applySteer(); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  };
  hold(btnLeft, (v) => (left = v));
  hold(btnRight, (v) => (right = v));

  // Power 10 is now hold-to-sprint: active while the button/space is held.
  let powering = false;
  const setPower = (on: boolean) => {
    if (on === powering) return; // only send on change
    powering = on;
    getController().setPower(on);
  };
  const pdown = (e: Event) => { e.preventDefault(); setPower(true); };
  const pup = () => setPower(false);
  btnPower.addEventListener('pointerdown', pdown);
  btnPower.addEventListener('pointerup', pup);
  btnPower.addEventListener('pointerleave', pup);
  btnPower.addEventListener('pointercancel', pup);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key === 'a') { left = true; applySteer(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { right = true; applySteer(); }
    else if (e.key === ' ') { e.preventDefault(); setPower(true); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') { left = false; applySteer(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { right = false; applySteer(); }
    else if (e.key === ' ') { setPower(false); }
  });
  // Safety: if the window loses focus mid-hold, stop sprinting so it can't stick on.
  window.addEventListener('blur', () => { setPower(false); if (left || right) { left = right = false; applySteer(); } });
}
