/**
 * Confetti celebration – fire from left and right when reel export is done.
 */

type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  startVelocity?: number;
  origin?: { x: number; y: number };
  zIndex?: number;
};

export function fireConfettiFromLeftAndRight(): void {
  if (typeof window === "undefined") return;

  import("canvas-confetti")
    .then((mod) => {
      // Handle both ESM (mod.default) and CJS (mod itself) exports
      const confettiFn =
        typeof (mod as { default?: unknown }).default === "function"
          ? (mod as { default: (opts: ConfettiOptions) => void }).default
          : typeof (mod as unknown) === "function"
            ? (mod as unknown as (opts?: ConfettiOptions) => void)
            : null;
      if (!confettiFn || typeof confettiFn !== "function") return;
      const opts: ConfettiOptions = {
        particleCount: 80,
        spread: 60,
        startVelocity: 45,
        zIndex: 99999,
      };
      confettiFn({ ...opts, origin: { x: 0, y: 0.5 } });
      setTimeout(() => {
        confettiFn({ ...opts, origin: { x: 1, y: 0.5 } });
      }, 150);
    })
    .catch((err) => console.warn("Confetti failed to load:", err));
}
