import type { FighterInput } from "../input/FighterInput";
import type { Fighter } from "../entities/Fighter";

export type AIDifficulty = "easy" | "medium" | "hard";

interface DifficultyParams {
  reactionMs: number;
  attackRangePx: number;
  attackChanceWhenInRange: number;
  jumpChancePerDecision: number;
  retreatHpFraction: number;
  retreatChance: number;
}

const PARAMS: Record<AIDifficulty, DifficultyParams> = {
  easy: {
    reactionMs: 500,
    attackRangePx: 130,
    attackChanceWhenInRange: 0.45,
    jumpChancePerDecision: 0.05,
    retreatHpFraction: 0.4,
    retreatChance: 0.5,
  },
  medium: {
    reactionMs: 280,
    attackRangePx: 130,
    attackChanceWhenInRange: 0.7,
    jumpChancePerDecision: 0.1,
    retreatHpFraction: 0.3,
    retreatChance: 0.35,
  },
  hard: {
    reactionMs: 150,
    attackRangePx: 140,
    attackChanceWhenInRange: 0.85,
    jumpChancePerDecision: 0.15,
    retreatHpFraction: 0.2,
    retreatChance: 0.2,
  },
};

type Intent = "approach" | "retreat" | "attack" | "wait";

export class AIController implements FighterInput {
  leftDown = false;
  rightDown = false;
  jumpJustPressed = false;
  attack1JustPressed = false;
  attack2JustPressed = false;

  private intent: Intent = "approach";
  private nextDecisionAt = 0;
  private params: DifficultyParams;
  private difficulty: AIDifficulty;

  constructor(
    private readonly self: Fighter,
    private readonly target: Fighter,
    difficulty: AIDifficulty = "medium",
  ) {
    this.difficulty = difficulty;
    this.params = PARAMS[difficulty];
  }

  getDifficulty(): AIDifficulty {
    return this.difficulty;
  }

  setDifficulty(d: AIDifficulty) {
    this.difficulty = d;
    this.params = PARAMS[d];
  }

  update() {
    this.jumpJustPressed = false;
    this.attack1JustPressed = false;
    this.attack2JustPressed = false;
    this.leftDown = false;
    this.rightDown = false;

    if (!this.self.isAlive() || !this.target.isAlive()) return;

    const now = performance.now();
    if (now >= this.nextDecisionAt) {
      this.decide();
      this.nextDecisionAt = now + this.params.reactionMs;

      if (this.intent === "attack") {
        if (Math.random() < 0.5) this.attack1JustPressed = true;
        else this.attack2JustPressed = true;
      } else if (
        this.intent === "approach" &&
        Math.random() < this.params.jumpChancePerDecision
      ) {
        this.jumpJustPressed = true;
      }
    }

    const dx = this.target.sprite.x - this.self.sprite.x;
    if (this.intent === "approach") {
      if (dx < -8) this.leftDown = true;
      else if (dx > 8) this.rightDown = true;
    } else if (this.intent === "retreat") {
      if (dx > 0) this.leftDown = true;
      else this.rightDown = true;
    }
  }

  private decide() {
    const dx = this.target.sprite.x - this.self.sprite.x;
    const dist = Math.abs(dx);
    const hpFrac = this.self.hp / this.self.maxHp;

    if (
      hpFrac < this.params.retreatHpFraction &&
      Math.random() < this.params.retreatChance
    ) {
      this.intent = "retreat";
      return;
    }

    if (
      dist < this.params.attackRangePx &&
      Math.random() < this.params.attackChanceWhenInRange
    ) {
      this.intent = "attack";
      return;
    }

    this.intent = "approach";
  }
}
