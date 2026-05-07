import Phaser from "phaser";
import type { FighterInput } from "./FighterInput";

export interface ControlBindings {
  left: number;
  right: number;
  crouch: number;
  block: number;
  jump: number;
  attack1: number;
  attack2: number;
}

const KC = Phaser.Input.Keyboard.KeyCodes;

export const WASD_BINDINGS: ControlBindings = {
  left: KC.A,
  right: KC.D,
  crouch: KC.S,
  block: KC.I,
  jump: KC.W,
  attack1: KC.J,
  attack2: KC.K,
};

export const ARROW_BINDINGS: ControlBindings = {
  left: KC.LEFT,
  right: KC.RIGHT,
  crouch: KC.DOWN,
  block: KC.NUMPAD_THREE,
  jump: KC.UP,
  attack1: KC.NUMPAD_ONE,
  attack2: KC.NUMPAD_TWO,
};

export class KeyboardInput implements FighterInput {
  leftDown = false;
  rightDown = false;
  crouchDown = false;
  blockDown = false;
  jumpJustPressed = false;
  attack1JustPressed = false;
  attack2JustPressed = false;

  private readonly left: Phaser.Input.Keyboard.Key;
  private readonly right: Phaser.Input.Keyboard.Key;
  private readonly crouch: Phaser.Input.Keyboard.Key;
  private readonly block: Phaser.Input.Keyboard.Key;
  private readonly jump: Phaser.Input.Keyboard.Key;
  private readonly attack1: Phaser.Input.Keyboard.Key;
  private readonly attack2: Phaser.Input.Keyboard.Key;

  constructor(scene: Phaser.Scene, bindings: ControlBindings) {
    const kb = scene.input.keyboard!;
    this.left = kb.addKey(bindings.left);
    this.right = kb.addKey(bindings.right);
    this.crouch = kb.addKey(bindings.crouch);
    this.block = kb.addKey(bindings.block);
    this.jump = kb.addKey(bindings.jump);
    this.attack1 = kb.addKey(bindings.attack1);
    this.attack2 = kb.addKey(bindings.attack2);
  }

  update() {
    const JD = Phaser.Input.Keyboard.JustDown;
    this.leftDown = this.left.isDown;
    this.rightDown = this.right.isDown;
    this.crouchDown = this.crouch.isDown;
    this.blockDown = this.block.isDown;
    this.jumpJustPressed = JD(this.jump);
    this.attack1JustPressed = JD(this.attack1);
    this.attack2JustPressed = JD(this.attack2);
  }
}
