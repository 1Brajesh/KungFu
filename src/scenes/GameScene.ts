import Phaser from "phaser";
import { KeyboardInput, WASD_BINDINGS, ARROW_BINDINGS } from "../input/KeyboardInput";
import type { FighterInput } from "../input/FighterInput";
import { Fighter, FighterConfig } from "../entities/Fighter";
import { AIController } from "../ai/AIController";
import { NetworkInput } from "../net/NetworkInput";
import { TouchInput, isTouchDevice } from "../input/TouchInput";
import { mountTouchOverlay } from "../input/TouchOverlay";
import { CombinedInput } from "../input/CombinedInput";
import type { NetClient } from "../net/NetClient";
import type { FighterSnap, InputMsg, StateMsg } from "../net/Protocol";

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
  { anim: "idle",      file: "Idle",      frames: 16, frameRate: 12, repeat: -1 },
  { anim: "run",       file: "Run",       frames: 16, frameRate: 18, repeat: -1 },
  { anim: "jump",      file: "JumpStart", frames: 16, frameRate: 22, repeat: 0 },
  { anim: "fall",      file: "JumpEnd",   frames: 8,  frameRate: 14, repeat: 0 },
  { anim: "attack1",   file: "Punch",     frames: 16, frameRate: 24, repeat: 0 },
  { anim: "attack2",   file: "Kick",      frames: 16, frameRate: 24, repeat: 0 },
  { anim: "hit",       file: "LightHit",  frames: 15, frameRate: 18, repeat: 0 },
  { anim: "death",     file: "Death",     frames: 15, frameRate: 12, repeat: 0 },
  { anim: "victory",   file: "Victory",   frames: 16, frameRate: 10, repeat: 0 },
  { anim: "knockdown", file: "Knockdown", frames: 16, frameRate: 14, repeat: 0 },
  { anim: "crouch",    file: "Crouch",    frames: 16, frameRate: 18, repeat: 0 },
  { anim: "lowkick",   file: "LowKick",   frames: 16, frameRate: 22, repeat: 0 },
  { anim: "block",     file: "Block",     frames: 16, frameRate: 18, repeat: 0 },
  { anim: "dodge",     file: "DodgeRoll", frames: 16, frameRate: 26, repeat: 0 },
  { anim: "heavy",     file: "HeavySmash",frames: 15, frameRate: 20, repeat: 0 },
  { anim: "combo",     file: "Combo1",    frames: 15, frameRate: 22, repeat: 0 },
  { anim: "downsmash", file: "DownSmash", frames: 15, frameRate: 22, repeat: 0 },
];

type P2Mode = "cpu" | "human";
export type GameMode = "local" | "online";
export type OnlineRole = "host" | "guest";

export interface GameSceneData {
  mode: GameMode;
  role?: OnlineRole;
  client?: NetClient;
}

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

  // Mode + online state
  private mode: GameMode = "local";
  private role: OnlineRole | null = null;
  private client: NetClient | null = null;
  private guestKeyboard: KeyboardInput | null = null;

  // Touch input (only set on touch devices)
  private touchInput: TouchInput | null = null;
  private unmountTouch: (() => void) | null = null;

  constructor() {
    super("GameScene");
  }

  init(data: GameSceneData) {
    this.gameOver = false;
    this.p2Mode = "cpu";
    this.mode = data?.mode ?? "local";
    this.role = data?.role ?? null;
    this.client = data?.client ?? null;
    this.guestKeyboard = null;
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
    this.add.rectangle(WORLD_W / 2, GROUND_Y + groundHeight / 2, WORLD_W, groundHeight, 0x2b1d10);
    this.add.rectangle(WORLD_W / 2, GROUND_Y, WORLD_W, 2, 0x6b4a2a);

    this.createAnims("fighter", FIGHTER_SHEETS);

    // Mount touch button overlay on touch devices; tear it down when this
    // scene exits (e.g. R-restart back to lobby).
    if (isTouchDevice()) {
      this.touchInput = new TouchInput();
      this.unmountTouch = mountTouchOverlay(this.touchInput);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.unmountTouch?.();
        this.unmountTouch = null;
        this.touchInput = null;
      });
    }

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

    const p1Config: FighterConfig = { ...sharedBody, facing: "right" };
    const p2Config: FighterConfig = { ...sharedBody, facing: "left", tint: 0x6699ff };

    this.p1 = new Fighter(this, 280, 200, p1Config);
    this.p2 = new Fighter(this, 680, 200, p2Config);
    this.p1.setOpponent(this.p2);
    this.p2.setOpponent(this.p1);

    this.setupInputsForMode();
    this.createHud();
    this.createHints();

    if (this.mode === "local") {
      this.input.keyboard?.on("keydown-T", () => this.toggleP2Mode());
    }

    if (this.mode === "online" && this.client) {
      this.client.onPeerDisconnected = () => this.handlePeerDisconnect();
      this.client.onClose = () => this.handlePeerDisconnect();
    }
  }

  private setupInputsForMode() {
    const localPlayerInput = (): FighterInput => {
      const keyboard = new KeyboardInput(this, WASD_BINDINGS);
      return this.touchInput
        ? new CombinedInput([keyboard, this.touchInput])
        : keyboard;
    };

    if (this.mode === "local") {
      this.p1Input = localPlayerInput();
      this.p1.setInput(this.p1Input);
      this.p2Input = new AIController(this.p2, this.p1, "medium");
      this.p2.setInput(this.p2Input);
      return;
    }

    // Online
    if (!this.client || !this.role) {
      // Fallback to local if we got here without proper setup
      this.mode = "local";
      this.setupInputsForMode();
      return;
    }

    if (this.role === "host") {
      // Host runs the simulation. P1 = local keyboard (+ touch), P2 = remote.
      this.p1Input = localPlayerInput();
      this.p1.setInput(this.p1Input);
      const netIn = new NetworkInput();
      this.p2Input = netIn;
      this.p2.setInput(netIn);
      this.client.onInput = (msg: InputMsg) => netIn.applyMessage(msg);
    } else {
      // Guest doesn't simulate. Local input (keyboard + touch) is captured
      // and forwarded to the host every frame. Both fighters' visible
      // state is dictated by incoming snapshots.
      this.guestKeyboard = new KeyboardInput(this, WASD_BINDINGS);
      this.p1.disablePhysics();
      this.p2.disablePhysics();
      this.client.onState = (msg: StateMsg) => this.applyRemoteState(msg);
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
    const p1Label = this.mode === "online"
      ? (this.role === "host" ? "P1 [YOU - HOST]" : "P1 [HOST]")
      : "P1 [HUMAN]";
    this.add.text(40, 56, p1Label, { fontSize: "14px", color: "#ffffff" }).setOrigin(0, 0);

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

  private createHints() {
    let hint = "";
    if (this.mode === "local") {
      hint = "WASD  J=punch K=kick L=heavy  S=crouch I=block U=dodge   T: toggle CPU";
    } else if (this.role === "host") {
      hint = "ONLINE • You are P1 (left)  •  WASD  J=punch K=kick L=heavy  S=crouch I=block U=dodge";
    } else {
      hint = "ONLINE • You are P2 (right)  •  WASD  J=punch K=kick L=heavy  S=crouch I=block U=dodge";
    }
    this.add.text(WORLD_W / 2, 10, hint, {
      fontSize: "13px",
      color: "#cccccc",
    }).setOrigin(0.5, 0);
  }

  private toggleP2Mode() {
    if (this.gameOver || this.mode !== "local") return;
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

  private refreshP2ModeLabel() {
    if (this.mode === "online") {
      this.p2ModeLabel.setText(this.role === "guest" ? "P2 [YOU - GUEST]" : "P2 [GUEST]");
    } else {
      this.p2ModeLabel.setText(this.p2Mode === "cpu" ? "P2 [CPU]" : "P2 [HUMAN]");
    }
  }

  private createAnims(prefix: string, sheets: SheetSpec[]) {
    for (const s of sheets) {
      const key = `${prefix}-${s.anim}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frames - 1 }),
        frameRate: s.frameRate,
        repeat: s.repeat,
      });
    }
  }

  update() {
    if (this.gameOver) return;

    if (this.mode === "online" && this.role === "guest") {
      // Guest: capture local input (keyboard + touch), forward to host,
      // render incoming state.
      if (this.client) {
        const kb = this.guestKeyboard;
        const ti = this.touchInput;
        // Tick TouchInput so its edge fields stay coherent even though
        // we only send raw held-state over the wire.
        ti?.update();
        const msg: InputMsg = {
          type: "input",
          leftDown: !!(kb?.left.isDown || ti?.leftDown),
          rightDown: !!(kb?.right.isDown || ti?.rightDown),
          crouchDown: !!(kb?.crouch.isDown || ti?.crouchDown),
          blockDown: !!(kb?.block.isDown || ti?.blockDown),
          jumpDown: !!(kb?.jump.isDown || ti?.jumpHeld),
          attack1Down: !!(kb?.attack1.isDown || ti?.attack1Held),
          attack2Down: !!(kb?.attack2.isDown || ti?.attack2Held),
          heavyDown: !!(kb?.heavy.isDown || ti?.heavyHeld),
          dodgeDown: !!(kb?.dodge.isDown || ti?.dodgeHeld),
        };
        this.client.send(msg);
      }
      this.refreshHud();
      return;
    }

    // local + online host: simulate
    this.p1Input.update();
    this.p2Input.update();
    this.p1.update();
    this.p2.update();
    this.refreshHud();
    this.checkVictory();

    if (this.mode === "online" && this.role === "host" && this.client) {
      this.client.send({
        type: "state",
        p1: this.snapshotFighter(this.p1),
        p2: this.snapshotFighter(this.p2),
        gameOver: this.gameOver,
      });
    }
  }

  private snapshotFighter(f: Fighter): FighterSnap {
    const anim = f.sprite.anims.currentAnim;
    const frame = f.sprite.anims.currentFrame;
    return {
      x: f.sprite.x,
      y: f.sprite.y,
      facing: f.facing === "left" ? 1 : 0,
      state: f.state,
      anim: anim?.key ?? "",
      frame: frame?.index ?? 1,
      hp: f.hp,
    };
  }

  private applyRemoteState(msg: StateMsg) {
    this.p1.applyRemoteState(msg.p1);
    this.p2.applyRemoteState(msg.p2);
    if (msg.gameOver && !this.gameOver) {
      this.gameOver = true;
      const p1Alive = msg.p1.state !== "death";
      const p2Alive = msg.p2.state !== "death";
      this.showResult(p1Alive, p2Alive);
    }
  }

  private refreshHud() {
    const maxW = 356;
    this.p1HpBar.width = Math.max(0, maxW * (this.p1.hp / this.p1.maxHp));
    this.p2HpBar.width = Math.max(0, maxW * (this.p2.hp / this.p2.maxHp));
  }

  private checkVictory() {
    if (this.p1.isAlive() && this.p2.isAlive()) return;
    if (this.gameOver) return;
    this.gameOver = true;
    this.showResult(this.p1.isAlive(), this.p2.isAlive());
  }

  private showResult(p1Alive: boolean, p2Alive: boolean) {
    const winner = !p1Alive && !p2Alive
      ? "Draw"
      : p1Alive
        ? "Player 1 wins!"
        : "Player 2 wins!";

    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, winner, {
      fontSize: "48px",
      color: "#ffd700",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);

    const restartHint = this.mode === "online"
      ? "Press R to return to lobby"
      : "Press R to restart";
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 40, restartHint, {
      fontSize: "20px",
      color: "#ffffff",
    }).setOrigin(0.5);

    this.input.keyboard?.once("keydown-R", () => this.handleRestart());
  }

  private handleRestart() {
    if (this.mode === "online") {
      this.client?.close();
      this.scene.start("LobbyScene");
    } else {
      this.scene.restart({ mode: "local" });
    }
  }

  private handlePeerDisconnect() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, "Opponent disconnected", {
      fontSize: "32px",
      color: "#ff6666",
      stroke: "#000000",
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(WORLD_W / 2, WORLD_H / 2 + 40, "Press R to return to lobby", {
      fontSize: "20px",
      color: "#ffffff",
    }).setOrigin(0.5);
    this.input.keyboard?.once("keydown-R", () => {
      this.client?.close();
      this.scene.start("LobbyScene");
    });
  }
}
