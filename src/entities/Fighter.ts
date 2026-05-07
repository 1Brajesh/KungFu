import Phaser from "phaser";
import type { FighterInput } from "../input/FighterInput";

export type FighterStateName =
  | "idle"
  | "run"
  | "jump"
  | "fall"
  | "attack1"
  | "attack2"
  | "hit"
  | "death"
  | "victory"
  | "knockdown"
  | "crouch"
  | "lowkick"
  | "block"
  | "dodge"
  | "heavy"
  | "combo"
  | "downsmash";

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
  tint?: number;
}

const ATTACK_DAMAGE = 10;

export class Fighter {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly maxHp: number;
  hp: number;
  facing: "left" | "right";
  state: FighterStateName = "idle";

  private input?: FighterInput;
  private opponent?: Fighter;
  private readonly spriteKey: string;
  private readonly speed: number;
  private readonly jumpVelocity: number;
  private readonly attackReach: number;
  private readonly attackDamage: number;
  private isAttacking = false;
  private attackHasLanded = false;
  private currentAttackDamage = 0;
  private lastPunchEndedAt = 0;
  private lastDodgeAt = 0;
  private static readonly DODGE_COOLDOWN_MS = 800;
  private static readonly COMBO_WINDOW_MS = 400;

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

    if (config.tint !== undefined) {
      this.sprite.setTint(config.tint);
    }

    this.applyFacing();
    this.playAnim("idle");

    this.sprite.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (
          anim.key.endsWith("-attack1") ||
          anim.key.endsWith("-attack2") ||
          anim.key.endsWith("-lowkick") ||
          anim.key.endsWith("-heavy") ||
          anim.key.endsWith("-combo") ||
          anim.key.endsWith("-downsmash")
        ) {
          if (anim.key.endsWith("-attack1")) {
            this.lastPunchEndedAt = performance.now();
          }
          this.isAttacking = false;
          this.attackHasLanded = false;
          if (
            this.state === "attack1" ||
            this.state === "attack2" ||
            this.state === "lowkick" ||
            this.state === "heavy" ||
            this.state === "combo" ||
            this.state === "downsmash"
          ) {
            this.state = "idle";
            this.playAnim("idle");
          }
        }
        if (anim.key.endsWith("-hit") && this.state === "hit") {
          this.state = "idle";
          this.playAnim("idle");
        }
        if (anim.key.endsWith("-knockdown") && this.state === "knockdown") {
          this.state = "idle";
          this.playAnim("idle");
        }
        if (anim.key.endsWith("-dodge") && this.state === "dodge") {
          this.state = "idle";
          this.playAnim("idle");
        }
        if (anim.key.endsWith("-death") || anim.key.endsWith("-victory")) {
          this.sprite.anims.pause();
        }
      },
    );
  }

  setInput(i: FighterInput) {
    this.input = i;
  }

  getInput(): FighterInput | undefined {
    return this.input;
  }

  setOpponent(o: Fighter) {
    this.opponent = o;
  }

  isAlive(): boolean {
    return this.state !== "death";
  }

  enterVictory() {
    if (this.state === "death" || this.state === "victory") return;
    this.state = "victory";
    this.isAttacking = false;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    this.sprite.play(`${this.spriteKey}-victory`);
  }

  update() {
    if (this.state === "death" || this.state === "victory") return;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    if (this.opponent && !this.opponent.isAlive()) {
      body.setVelocityX(0);
      this.state = "victory";
      this.sprite.play(`${this.spriteKey}-victory`);
      this.applyFacing();
      return;
    }

    if (this.opponent && body.onFloor() && !this.isAttacking && this.state !== "hit") {
      this.facing = this.opponent.sprite.x < this.sprite.x ? "left" : "right";
    }

    if (
      this.state === "hit" ||
      this.state === "knockdown" ||
      this.state === "dodge"
    ) {
      // Knockback / dodge velocity decays naturally rather than being zeroed
      const decayed = body.velocity.x * 0.9;
      body.setVelocityX(Math.abs(decayed) < 5 ? 0 : decayed);
      this.applyFacing();
      return;
    }

    if (this.isAttacking) {
      body.setVelocityX(0);
      this.checkAttackHit();
      this.applyFacing();
      return;
    }

    if (!this.input) {
      body.setVelocityX(0);
      if (body.onFloor()) this.transitionTo("idle");
      this.applyFacing();
      return;
    }

    // Dodge — edge-triggered, top priority among inputs (cancels into roll)
    if (
      this.input.dodgeJustPressed &&
      body.onFloor() &&
      performance.now() - this.lastDodgeAt >= Fighter.DODGE_COOLDOWN_MS
    ) {
      this.startDodge();
      return;
    }

    // Block — held key, fully locks the fighter; takeHit applies reduced damage
    if (this.input.blockDown && body.onFloor()) {
      body.setVelocityX(0);
      this.transitionTo("block");
      this.applyFacing();
      return;
    }

    // Crouch — held key, locks horizontal movement, enables LowKick variant
    if (this.input.crouchDown && body.onFloor()) {
      body.setVelocityX(0);
      if (this.input.attack1JustPressed) {
        this.startLowKick();
        return;
      }
      this.transitionTo("crouch");
      this.applyFacing();
      return;
    }

    if (body.onFloor()) {
      if (this.input.heavyJustPressed) {
        this.startHeavy();
        return;
      }
      if (this.input.attack1JustPressed) {
        const sinceLastPunch = performance.now() - this.lastPunchEndedAt;
        if (sinceLastPunch <= Fighter.COMBO_WINDOW_MS) {
          this.startCombo();
        } else {
          this.startAttack(1);
        }
        return;
      }
      if (this.input.attack2JustPressed) {
        this.startAttack(2);
        return;
      }
    } else if (this.input.attack1JustPressed) {
      // Airborne + Punch = DownSmash (slams downward)
      this.startDownSmash();
      return;
    }

    if (this.input.jumpJustPressed && body.onFloor()) {
      body.setVelocityY(this.jumpVelocity);
    }

    const left = this.input.leftDown;
    const right = this.input.rightDown;
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

    // Dodging is fully invulnerable
    if (this.state === "dodge") return;

    // Blocking absorbs almost all damage and the fighter stays locked
    // in block state — no anim interrupt, no knockback.
    if (this.state === "block") {
      this.hp = Math.max(0, this.hp - 1);
      return;
    }

    this.hp -= damage;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    // Push away from attacker (or if no opponent context, away from facing)
    const knockbackDir =
      this.opponent && this.opponent.sprite.x < this.sprite.x ? 1 : -1;

    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "death";
      this.isAttacking = false;
      body.setVelocityX(0); // corpse does not slide
      this.sprite.play(`${this.spriteKey}-death`);
      // The killing blow happens on the attacker's frame; gameOver will
      // halt fighter.update() next frame, so trigger victory on the
      // survivor right now while we still have the chance.
      if (this.opponent && this.opponent.isAlive()) {
        this.opponent.enterVictory();
      }
    } else if (damage >= 20) {
      this.state = "knockdown";
      this.isAttacking = false;
      body.setVelocityX(knockbackDir * 350);
      this.sprite.play(`${this.spriteKey}-knockdown`);
    } else {
      this.state = "hit";
      this.isAttacking = false;
      body.setVelocityX(knockbackDir * 200);
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
      this.opponent.takeHit(this.currentAttackDamage);
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
    this.currentAttackDamage = this.attackDamage;
    const key = which === 1 ? "attack1" : "attack2";
    this.state = key;
    this.sprite.play(`${this.spriteKey}-${key}`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
  }

  private startLowKick() {
    this.isAttacking = true;
    this.attackHasLanded = false;
    this.currentAttackDamage = this.attackDamage;
    this.state = "lowkick";
    this.sprite.play(`${this.spriteKey}-lowkick`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
  }

  private startHeavy() {
    this.isAttacking = true;
    this.attackHasLanded = false;
    this.currentAttackDamage = 25;
    this.state = "heavy";
    this.sprite.play(`${this.spriteKey}-heavy`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
  }

  private startDownSmash() {
    this.isAttacking = true;
    this.attackHasLanded = false;
    this.currentAttackDamage = 20;
    this.state = "downsmash";
    this.sprite.play(`${this.spriteKey}-downsmash`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(450); // slam-down impulse on top of gravity
  }

  private startCombo() {
    this.isAttacking = true;
    this.attackHasLanded = false;
    this.currentAttackDamage = 20;
    this.lastPunchEndedAt = 0; // can't combo from a combo
    this.state = "combo";
    this.sprite.play(`${this.spriteKey}-combo`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
  }

  private startDodge() {
    this.lastDodgeAt = performance.now();
    this.state = "dodge";
    this.isAttacking = false;
    this.sprite.play(`${this.spriteKey}-dodge`);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const dir = this.facing === "right" ? 1 : -1;
    body.setVelocityX(dir * 800);
  }
}
