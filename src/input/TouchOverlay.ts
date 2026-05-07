import type { TouchInput, TouchKey } from "./TouchInput";

interface ButtonSpec {
  id: string;
  label: string;
  key: TouchKey;
}

const BUTTONS: ButtonSpec[] = [
  { id: "t-left",  label: "←", key: "left" },
  { id: "t-right", label: "→", key: "right" },
  { id: "t-up",    label: "↑", key: "jump" },
  { id: "t-down",  label: "↓", key: "crouch" },
  { id: "t-punch", label: "P",      key: "attack1" },
  { id: "t-kick",  label: "K",      key: "attack2" },
  { id: "t-heavy", label: "H",      key: "heavy" },
  { id: "t-block", label: "B",      key: "block" },
  { id: "t-dodge", label: "D",      key: "dodge" },
];

/**
 * Mounts a fixed-position DOM overlay of touch buttons. Returns a callback
 * that tears it back down (use this on scene shutdown).
 */
export function mountTouchOverlay(touchInput: TouchInput): () => void {
  const existing = document.getElementById("touch-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "touch-overlay";

  const cleanups: Array<() => void> = [];

  for (const spec of BUTTONS) {
    const btn = document.createElement("div");
    btn.id = spec.id;
    btn.className = "btn";
    btn.textContent = spec.label;
    overlay.appendChild(btn);

    const press = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add("pressed");
      touchInput.setKey(spec.key, true);
    };
    const release = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove("pressed");
      touchInput.setKey(spec.key, false);
    };

    btn.addEventListener("pointerdown", press);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("pointerleave", release);

    cleanups.push(() => {
      btn.removeEventListener("pointerdown", press);
      btn.removeEventListener("pointerup", release);
      btn.removeEventListener("pointercancel", release);
      btn.removeEventListener("pointerleave", release);
    });
  }

  document.body.appendChild(overlay);

  return () => {
    for (const fn of cleanups) fn();
    overlay.remove();
  };
}
