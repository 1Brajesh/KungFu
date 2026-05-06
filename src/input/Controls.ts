import Phaser from "phaser";

export interface ControlBindings {
  left: number;
  right: number;
  jump: number;
  attack1: number;
  attack2: number;
}

const KC = Phaser.Input.Keyboard.KeyCodes;

export const WASD_BINDINGS: ControlBindings = {
  left: KC.A,
  right: KC.D,
  jump: KC.W,
  attack1: KC.J,
  attack2: KC.K,
};

export const ARROW_BINDINGS: ControlBindings = {
  left: KC.LEFT,
  right: KC.RIGHT,
  jump: KC.UP,
  attack1: KC.NUMPAD_ONE,
  attack2: KC.NUMPAD_TWO,
};

export class Controls {
  readonly left: Phaser.Input.Keyboard.Key;
  readonly right: Phaser.Input.Keyboard.Key;
  readonly jump: Phaser.Input.Keyboard.Key;
  readonly attack1: Phaser.Input.Keyboard.Key;
  readonly attack2: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, bindings: ControlBindings) {
    const kb = scene.input.keyboard!;
    this.left = kb.addKey(bindings.left);
    this.right = kb.addKey(bindings.right);
    this.jump = kb.addKey(bindings.jump);
    this.attack1 = kb.addKey(bindings.attack1);
    this.attack2 = kb.addKey(bindings.attack2);
  }
}
