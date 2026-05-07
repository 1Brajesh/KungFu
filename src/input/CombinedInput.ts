import type { FighterInput } from "./FighterInput";

/**
 * OR's together multiple FighterInput sources (e.g. keyboard + touch).
 * Each child is updated, then this object's flags are set true if any
 * child has them true.
 */
export class CombinedInput implements FighterInput {
  leftDown = false;
  rightDown = false;
  crouchDown = false;
  blockDown = false;
  jumpJustPressed = false;
  attack1JustPressed = false;
  attack2JustPressed = false;
  heavyJustPressed = false;
  dodgeJustPressed = false;

  constructor(private readonly inputs: FighterInput[]) {}

  update() {
    for (const i of this.inputs) i.update();

    this.leftDown = this.inputs.some((i) => i.leftDown);
    this.rightDown = this.inputs.some((i) => i.rightDown);
    this.crouchDown = this.inputs.some((i) => i.crouchDown);
    this.blockDown = this.inputs.some((i) => i.blockDown);
    this.jumpJustPressed = this.inputs.some((i) => i.jumpJustPressed);
    this.attack1JustPressed = this.inputs.some((i) => i.attack1JustPressed);
    this.attack2JustPressed = this.inputs.some((i) => i.attack2JustPressed);
    this.heavyJustPressed = this.inputs.some((i) => i.heavyJustPressed);
    this.dodgeJustPressed = this.inputs.some((i) => i.dodgeJustPressed);
  }
}
