import Phaser from "phaser";
import { KeyboardInput, WASD_BINDINGS, ARROW_BINDINGS } from "../input/KeyboardInput";
import type { FighterInput } from "../input/FighterInput";
import { Fighter, FighterConfig } from "../entities/Fighter";
import { AIController } from "../ai/AIController";

const WORLD_W = 960;
const WORLD_H = 540;
const GROUND_Y = 500;
const FRAME_W = 256;
const FRAME_H = 256;

interface SheetSpec {
  anim: string;
  file: string;
  frames: number;
  frameRate: number;
  repeat: number;
}

const FIGHTER_SHEETS: SheetSpec[] = [
  { anim: "idle",    file: "Idle",      frames: 16, frameRate: 12, repeat: -1 },
  { anim: "run",     file: "Run",       frames: 16, frameRate: 18, repeat: -1 },
  { anim: "jump",    file: "JumpStart", frames: 16, frameRate: 22, repeat: 0 },
  { anim: "fall",    file: "JumpEnd",   frames: 8,  frameRate: 14, repeat: 0 },
  { anim: "attack1", file: "Punch",     frames: 16, frameRate: 24, repeat: 0 },
  { anim: "attack2", file: "Kick",      frames: 16, frameRate: 24, repeat: 0 },
  { anim: "hit",     file: "LightHit",  frames: 15, frameRate: 18, repeat: 0 },
  { anim: "death",   file: "Death",     frames: 15, frameRate: 12, repeat: 0 },
  { anim: "victory", file: "Victory",   frames: 16, frameRate: 10, repeat: 0 },
];

type P2Mode = "cpu" | "human";

export class GameScene extends Phaser.Scene {
  private p1!: Fighter;
  private p2!: Fighter;
  private p1Input!: FighterInput;
  private p2Input!: FighterInput;
  private p1HpBar!: Phaser.GameObjects.Rectangle;
  private p2HpBar!: Phaser.GameObjects.Rectangle;
  private p2ModeLabel!: Phaser.GameObjects.Text;
  private p2Mode: P2Mode = "cpu";
  private gameOver = false;

  constructor() {
    super("GameScene");
  }

  init() {
    this.gameOver = false;
    this.p2Mode = "cpu";
  }

  preload() {
    for (const s of FIGHTER_SHEETS) {
      const url = `/sprites/fighter-hd/${encodeURIComponent(s.file)}.png`;
      this.load.spritesheet(`fighter-${s.anim}`, url, {
        frameWidth: FRAME_W,
        frameHeight: FRAME_H,
      });
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#222533");

    this.physics.world.setBounds(0, 0, WORLD_W, GROUND_Y);

    const groundHeight = WORLD_H - GROUND_Y;
    this.add.rectangle(
      WORLD_W / 2,
      GROUND_Y + groundHeight / 2,
      WORLD_W,
      groundHeight,
      0x2b1d10,
    );
    this.add.rectangle(WORLD_W / 2, GROUND_Y, WORLD_W, 2, 0x6b4a2a);

    this.createAnims("fighter", FIGHTER_SHEETS);

    const sharedBody = {
      spriteKey: "fighter",
      scale: 1.2,
      bodySize: { w: 60, h: 150 },
      bodyOffset: { x: 100, y: 60 },
      speed: 260,
      jumpVelocity: -700,
      hp: 100,
      attackReach: 120,
      attackDamage: 10,
    };

    const p1Config: FighterConfig = {
      ...sharedBody,
      facing: "right",
    };
    const p2Config: FighterConfig = {
      ...sharedBody,
      facing: "left",
      tint: 0x6699ff,
    };

    this.p1 = new Fighter(this, 280, 200, p1Config);
    this.p2 = new Fighter(this, 680, 200, p2Config);

    this.p1.setOpponent(this.p2);
    this.p2.setOpponent(this.p1);

    this.p1Input = new KeyboardInput(this, WASD_BINDINGS);
    this.p1.setInput(this.p1Input);

    this.p2Input = new AIController(this.p2, this.p1, "medium");
    this.p2.setInput(this.p2Input);

    this.physics.add.collider(this.p1.sprite, this.p2.sprite);

    this.createHud();

    this.add.text(
      WORLD_W / 2,
      10,
      "P1: WASD + J/K     T: toggle CPU/human for P2",
      { fontSize: "14px", color: "#cccccc" },
    ).setOrigin(0.5, 0);

    this.input.keyboard?.on("keydown-T", () => this.toggleP2Mode());
  }

  private toggleP2Mode() {
    if (this.gameOver) return;
    if (this.p2Mode === "cpu") {
      this.p2Input = new KeyboardInput(this, ARROW_BINDINGS);
      this.p2Mode = "human";
    } else {
      this.p2Input = new AIController(this.p2, this.p1, "medium");
      this.p2Mode = "cpu";
    }
    this.p2.setInput(this.p2Input);
    this.refreshP2ModeLabel();
  }

  private createAnims(prefix: string, sheets: SheetSpec[]) {
    for (const s of sheets) {
      const key = `${prefix}-${s.anim}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, {
          start: 0,
          end: s.frames - 1,
        }),
        frameRate: s.frameRate,
        repeat: s.repeat,
      });
    }
  }

  private createHud() {
    const barW = 360;
    const barH = 22;
    this.add.rectangle(40, 36, barW, barH, 0x000000)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0xffffff);
    this.p1HpBar = this.add.rectangle(42, 36, barW - 4, barH - 4, 0xb22222)
      .setOrigin(0, 0.5);
    this.add.text(40, 56, "P1 [HUMAN]", { fontSize: "14px", color: "#ffffff" })
      .setOrigin(0, 0);

    this.add.rectangle(WORLD_W - 40, 36, barW, barH, 0x000000)
      .setOrigin(1, 0.5)
      .setStrokeStyle(2, 0xffffff);
    this.p2HpBar = this.add.rectangle(WORLD_W - 42, 36, barW - 4, barH - 4, 0xb22222)
      .setOrigin(1, 0.5);
    this.p2ModeLabel = this.add.text(WORLD_W - 40, 56, "", {
      fontSize: "14px",
      color: "#ffffff",
    }).setOrigin(1, 0);
    this.refreshP2ModeLabel();
  }

  private refreshP2ModeLabel() {
    this.p2ModeLabel.setText(this.p2Mode === "cpu" ? "P2 [CPU]" : "P2 [HUMAN]");
  }

  update() {
    if (this.gameOver) return;
    this.p1Input.update();
    this.p2Input.update();
    this.p1.update();
    this.p2.update();
    this.refreshHud();
    this.checkVictory();
  }

  private refreshHud() {
    const maxW = 356;
    this.p1HpBar.width = Math.max(0, maxW * (this.p1.hp / this.p1.maxHp));
    this.p2HpBar.width = Math.max(0, maxW * (this.p2.hp / this.p2.maxHp));
  }

  private checkVictory() {
    if (this.p1.isAlive() && this.p2.isAlive()) return;
    this.gameOver = true;

    const winner = !this.p1.isAlive() && !this.p2.isAlive()
      ? "Draw"
      : this.p1.isAlive()
        ? "Player 1 wins!"
        : "Player 2 wins!";

    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, winner, {
      fontSize: "48px",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);

    this.add.text(WORLD_W / 2, WORLD_H / 2 + 40, "Press R to restart", {
      fontSize: "20px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.input.keyboard?.once("keydown-R", () => this.scene.restart());
  }
}
