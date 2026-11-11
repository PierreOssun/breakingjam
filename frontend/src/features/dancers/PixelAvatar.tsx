import { useId, useMemo } from "react";
import { type AvatarSpec, renderAvatar } from "./avatar";

type Run = { x: number; y: number; w: number; fill: string };

/** Same-colour pixels of a row merged into one rect: ~300 rects instead of 1024. */
function runs(sprite: (string | null)[][]): Run[] {
  return sprite.flatMap((row, y) => {
    const rects: Run[] = [];
    for (let x = 0; x < row.length;) {
      const fill = row[x];
      let w = 1;
      while (x + w < row.length && row[x + w] === fill) w++;
      if (fill) rects.push({ x, y, w, fill });
      x += w;
    }
    return rects;
  });
}

/**
 * The pixel 2D-HD bust (DESIGN.md §4.16): the stage, its effect, the crisp 32×32 sprite, then
 * the HD layer, a soft glow
 * from the top-left and a bottom vignette, the only gradients allowed in the product.
 */
export function PixelAvatar({
  spec,
  label,
  className = "",
}: {
  spec: AvatarSpec;
  /** Its name; left out where a label beside it already says what it shows. */
  label?: string;
  className?: string;
}) {
  // Gradient ids live in the page's id space; `useId` output is not a valid fragment.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { background, ring, rim, fx, sprite } = useMemo(
    () => renderAvatar(spec),
    [spec],
  );
  const rects = useMemo(() => runs(sprite), [sprite]);
  return (
    <svg
      viewBox="0 0 32 32"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      <defs>
        <radialGradient id={`${id}glow`} cx="0.2" cy="0.15" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}vignette`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <g shapeRendering="crispEdges">
        <rect width="32" height="32" fill={background} />
        {fx.map(([x, y, kind], i) => (
          <rect
            // An effect may paint a pixel twice, so the place alone is no key.
            key={i}
            x={x}
            y={y}
            width={1}
            height={1}
            fill={kind === "rim" ? rim : ring}
            opacity={kind === "rim" ? 0.55 : undefined}
          />
        ))}
        {rects.map((r) => (
          <rect
            key={`${r.x}-${r.y}`}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={r.fill}
          />
        ))}
      </g>
      <rect width="32" height="32" fill={`url(#${id}glow)`} />
      <rect width="32" height="32" fill={`url(#${id}vignette)`} />
    </svg>
  );
}
