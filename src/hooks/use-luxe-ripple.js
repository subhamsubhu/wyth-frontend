import { useCallback } from "react";

/**
 * Emits a smooth radial ripple at the click point of any `.btn-luxe` element.
 * Pair with the `.btn-luxe` CSS class for the full luxurious press effect.
 *
 *   const onRipple = useLuxeRipple();
 *   <button className="btn-luxe ..." onClick={(e) => { onRipple(e); doStuff(); }} />
 *
 * Or wrap an existing click handler:
 *   <button className="btn-luxe" onClick={withRipple(doStuff)} />
 */
export function useLuxeRipple() {
  return useCallback((e) => {
    const host = e.currentTarget;
    if (!host) return;
    // Disabled buttons: skip ripple entirely
    if (host.disabled || host.getAttribute("aria-disabled") === "true") return;

    const rect = host.getBoundingClientRect();
    const point = e.touches?.[0] || e.changedTouches?.[0] || e;
    const x = (point.clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (point.clientY ?? rect.top + rect.height / 2) - rect.top;
    const size = Math.max(rect.width, rect.height) * 1.2;

    const ripple = document.createElement("span");
    ripple.className = "luxe-ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    host.appendChild(ripple);

    // Clean up after animation completes (matches keyframe duration)
    window.setTimeout(() => {
      ripple.remove();
    }, 700);
  }, []);
}

/** Convenience HOF: returns a click handler that emits the ripple then runs `fn`. */
export function withLuxeRipple(emitRipple, fn) {
  return (e) => {
    emitRipple(e);
    fn?.(e);
  };
}
