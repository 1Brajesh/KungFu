import type { FighterInput } from "./FighterInput";

export type TouchKey =
  | "left"
  | "right"
  | "crouch"
  | "block"
  | "jump"
  | "attack1"
  | "attack2"
  | "heavy"
  | "dodge";

/**
 * FighterInput driven by on-screen touch buttons.
 *
 * Public setKey() flips a "currently held" boolean for one of the 9 keys.
 * Each frame, update() converts those held-states into the FighterInput
 * shape (held + JustPressed edges).
 *
 * For online play the host serializes guest input from raw held-state, so
 * we expose the held flags publicly (e.g. `jumpHeld`) too.
 */
export class TouchInput implements FighterInput {
  // FighterInput required (held + edges)
  leftDown = false;
  rightDown = false;
  crouchDown = false;
  blockDown = false;
  jumpJustPressed = false;
  attack1JustPressed = false;
  attack2JustPressed = false;
  heavyJustPressed = false;
  dodgeJustPressed = false;

  // Held state for edge-trigger keys (raw — useful for net serialization)
  jumpHeld = false;
  attack1Held = false;
  attack2Held = false;
  heavyHeld = false;
  dodgeHeld = false;

  private prev = {
    jump: false,
    attack1: false,
    attack2: false,
    heavy: false,
    dodge: false,
  };

  setKey(name: TouchKey, isDown: boolean) {
    switch (name) {
      case "left": this.leftDown = isDown; return;
      case "right": this.rightDown = isDown; return;
      case "crouch": this.crouchDown = isDown; return;
      case "block": this.blockDown = isDown; return;
      case "jump": this.jumpHeld = isDown; return;
      case "attack1": this.attack1Held = isDown; return;
      case "attack2": this.attack2Held = isDown; return;
      case "heavy": this.heavyHeld = isDown; return;
      case "dodge": this.dodgeHeld = isDown; return;
    }
  }

  update() {
    this.jumpJustPressed = this.jumpHeld && !this.prev.jump;
    this.attack1JustPressed = this.attack1Held && !this.prev.attack1;
    this.attack2JustPressed = this.attack2Held && !this.prev.attack2;
    this.heavyJustPressed = this.heavyHeld && !this.prev.heavy;
    this.dodgeJustPressed = this.dodgeHeld && !this.prev.dodge;

    this.prev.jump = this.jumpHeld;
    this.prev.attack1 = this.attack1Held;
    this.prev.attack2 = this.attack2Held;
    this.prev.heavy = this.heavyHeld;
    this.prev.dodge = this.dodgeHeld;
  }
}

export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}
