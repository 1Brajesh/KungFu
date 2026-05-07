export interface FighterInput {
  leftDown: boolean;
  rightDown: boolean;
  crouchDown: boolean;
  jumpJustPressed: boolean;
  attack1JustPressed: boolean;
  attack2JustPressed: boolean;
  update(): void;
}
