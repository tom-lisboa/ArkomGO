/** Deterministic star field — seeded so SSR and client match (no hydration drift). */

interface Star {
  left: string;
  top: string;
  size: number;
  delay: string;
  duration: string;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS: Star[] = (() => {
  const rng = mulberry32(0x51a7);
  return Array.from({ length: 90 }, () => ({
    left: `${(rng() * 100).toFixed(2)}%`,
    top: `${(rng() * 100).toFixed(2)}%`,
    size: rng() < 0.85 ? 1 : 2,
    delay: `${(rng() * 6).toFixed(2)}s`,
    duration: `${(4 + rng() * 5).toFixed(2)}s`,
  }));
})();

export function StarField() {
  return (
    <div className="starfield" aria-hidden>
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
    </div>
  );
}
