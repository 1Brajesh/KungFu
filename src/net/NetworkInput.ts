import type { FighterInput } from "../input/FighterInput";
import type { InputMsg } from "./Protocol";

/**
 * FighterInput driven by remote input messages.
 *
 * The wire format only carries "is this key currently down" booleans (see
 * `InputMsg`). The host derives edge-triggered events (JustPressed) by
 * comparing the latest message to the previous frame's state.
 */
export class NetworkInput implements FighterInput {
  leftDown = false;
  rightDown = false;
  crouchDown = false;
  blockDown = false;
  jumpJustPressed = false;
  attack1JustPressed = false;
  attack2JustPressed = false;
  heavyJustPressed = false;
  dodgeJustPressed = false;

  private latest: InputMsg | null = null;
  private prev = {
    jump: false,
    attack1: false,
    attack2: false,
    heavy: false,
    dodge: false,
  };

  applyMessage(msg: InputMsg) {
    this.latest = msg;
  }

  update() {
    // Reset edges (default false until update sees a fresh down-edge)
    this.jumpJustPressed = false;
    this.attack1JustPressed = false;
    this.attack2JustPressed = false;
    this.heavyJustPressed = false;
    this.dodgeJustPressed = false;

    const m = this.latest;
    if (!m) {
      this.leftDown = false;
      this.rightDown = false;
      this.crouchDown = false;
      this.blockDown = false;
      return;
    }

    this.leftDown = m.leftDown;
    this.rightDown = m.rightDown;
    this.crouchDown = m.crouchDown;
    this.blockDown = m.blockDown;

    this.jumpJustPressed = m.jumpDown && !this.prev.jump;
    this.attack1JustPressed = m.attack1Down && !this.prev.attack1;
    this.attack2JustPressed = m.attack2Down && !this.prev.attack2;
    this.heavyJustPressed = m.heavyDown && !this.prev.heavy;
    this.dodgeJustPressed = m.dodgeDown && !this.prev.dodge;

    this.prev.jump = m.jumpDown;
    this.prev.attack1 = m.attack1Down;
    this.prev.attack2 = m.attack2Down;
    this.prev.heavy = m.heavyDown;
    this.prev.dodge = m.dodgeDown;
  }
}
