import Phaser from "phaser";
import { Controls } from "../input/Controls";

export type FighterStateName =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "attack1"
  | "attack2"
  | "hit"
  | "death";

export interface FighterConfig {
  spriteKey: string;
  facing: "left" | "right";
  speed: number;
  jumpVelocity: number;
  hp: number;
  scale: number;
  bodySize: { w: number; h: number };
  bodyOffset: { x: number; y: number };
  attackReach: number;
  attackDamage: number;
}

const ATTACK_DAMAGE = 10;

export class Fighter {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly maxHp: number;
  hp: number;
  facing: "left" | "right";
  state: FighterStateName = "idle";

  private controls?: Controls;
  private opponent?: Fighter;
  private readonly spriteKey: string;
  private readonly speed: number;
  private readonly jumpVelocity: number;
  private readonly attackReach: number;
  private readonly attackDamage: number;
  private isAttacking = false;
  private attackHasLanded = false;

  constructor(scene: Phaser.Scene, x: number, y: number, config: FighterConfig) {
    this.sprite = scene.physics.add.sprite(x, y, `${config.spriteKey}-idle`);
    this.sprite.setScale(config.scale);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(config.bodySize.w, config.bodySize.h);
    body.setOffset(config.bodyOffset.x, config.bodyOffset.y);
    body.setCollideWorldBounds(true);

    this.facing = config.facing;
    this.spriteKey = config.spriteKey;
    this.speed = config.speed;
    this.jumpVelocity = config.jumpVelocity;
    this.attackReach = config.attackReach;
    this.attackDamage = config.attackDamage ?? ATTACK_DAMAGE;
    this.hp = config.hp;
    this.maxHp = config.hp;

    this.applyFacing();
    this.playAnim("idle");

    this.sprite.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (anim.key.endsWith("-attack1") || anim.key.endsWith("-attack2")) {
          this.isAttacking = false;
          this.attackHasLanded = false;
          if (this.state === "attack1" || this.state === "attack2") {
            this.state = "idle";
            this.playAnim("idle");
          }
        }
        if (anim.key.endsWith("-hit") && this.state === "hit") {
          this.state = "idle";
          this.playAnim("idle");
        }
        if (anim.key.endsWith("-death")) {
          this.sprite.anims.pause();
        }
      },
    );
  }

  setControls(c: Controls) {
    this.controls = c;
  }

  setOpponent(o: Fighter) {
    this.opponent = o;
  }

  isAlive(): boolean {
    return this.state !== "death";
  }

  update() {
    if (this.state === "death") return;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (this.opponent && body.onFloor() && !this.isAttacking && this.state !== "hit") {
      this.facing = this.opponent.sprite.x < this.sprite.x ? "left" : "right";
    }

    if (this.state === "hit") {
      body.setVelocityX(0);
      this.applyFacing();
      return;
    }

    if (this.isAttacking) {
      body.setVelocityX(0);
      this.checkAttackHit();
      this.applyFacing();
      return;
    }

    if (!this.controls) {
      body.setVelocityX(0);
      if (body.onFloor()) this.transitionTo("idle");
      this.applyFacing();
      return;
    }

    if (body.onFloor()) {
      if (Phaser.Input.Keyboard.JustDown(this.controls.attack1)) {
        this.startAttack(1);
        return;
      }
      if (Phaser.Input.Keyboard.JustDown(this.controls.attack2)) {
        this.startAttack(2);
        return;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.controls.jump) && body.onFloor()) {
      body.setVelocityY(this.jumpVelocity);
    }

    const left = this.controls.left.isDown;
    const right = this.controls.right.isDown;
    if (left && !right) {
      body.setVelocityX(-this.speed);
    } else if (right && !left) {
      body.setVelocityX(this.speed);
    } else {
      body.setVelocityX(0);
    }

    if (!body.onFloor()) {
      this.transitionTo(body.velocity.y < 0 ? "jump" : "fall");
    } else if (body.velocity.x !== 0) {
      this.transitionTo("run");
    } else {
      this.transitionTo("idle");
    }

    this.applyFacing();
  }

  takeHit(damage: number) {
    if (this.state === "death") return;
    this.hp -= damage;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "death";
      this.isAttacking = false;
      this.sprite.play(`${this.spriteKey}-death`);
    } else {
      this.state = "hit";
      this.isAttacking = false;
      this.sprite.play(`${this.spriteKey}-hit`);
    }
  }

  getHurtbox(): Phaser.Geom.Rectangle {
    const w = 70;
    const h = 140;
    return new Phaser.Geom.Rectangle(this.sprite.x - w / 2, this.sprite.y - 80, w, h);
  }

  private getAttackHitbox(): Phaser.Geom.Rectangle {
    const w = this.attackReach;
    const h = 90;
    const x = this.facing === "right" ? this.sprite.x : this.sprite.x - w;
    const y = this.sprite.y - 50;
    return new Phaser.Geom.Rectangle(x, y, w, h);
  }

  private checkAttackHit() {
    if (this.attackHasLanded || !this.opponent || !this.opponent.isAlive()) return;

    const frame = this.sprite.anims.currentFrame;
    const anim = this.sprite.anims.currentAnim;
    if (!frame || !anim) return;

    const total = anim.frames.length;
    const activeStart = Math.max(1, Math.floor(total * 0.4));
    const activeEnd = Math.max(activeStart, Math.floor(total * 0.75));
    if (frame.index < activeStart || frame.index > activeEnd) return;

    const myHit = this.getAttackHitbox();
    const oppHurt = this.opponent.getHurtbox();
    if (Phaser.Geom.Intersects.RectangleToRectangle(myHit, oppHurt)) {
      this.attackHasLanded = true;
      this.opponent.takeHit(this.attackDamage);
    }
  }

  private transitionTo(s: FighterStateName) {
    if (this.state === s) return;
    this.state = s;
    this.playAnim(s);
  }

  private playAnim(s: FighterStateName) {
    this.sprite.play(`${this.spriteKey}-${s}`, true);
  }

  private applyFacing() {
    this.sprite.setFlipX(this.facing === "left");
  }

  private startAttack(which: 1 | 2) {
    this.isAttacking = true;
    this.attackHasLanded = false;
    const key = which === 1 ? "attack1" : "attack2";
    this.state = key;
    this.sprite.play(`${this.spriteKey}-${key}`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
  }
}
