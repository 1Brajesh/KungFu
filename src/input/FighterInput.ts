export interface FighterInput {
  leftDown: boolean;
  rightDown: boolean;
  crouchDown: boolean;
  blockDown: boolean;
  jumpJustPressed: boolean;
  attack1JustPressed: boolean;
  attack2JustPressed: boolean;
  heavyJustPressed: boolean;
  dodgeJustPressed: boolean;
  update(): void;
}
