import { useId, useMemo } from "react";
import { type AvatarParts, drawAvatar } from "./avatarParts";

/** Same-colour pixels of a row merged into one rect: ~300 rects instead of 1024. */
function runs(grid: string[][]) {
  const rects: { x: number; y: number; w: number; fill: string }[] = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = row[x]!;
      let w = 1;
      while (row[x + w] === fill) w++;
      rects.push({ x, y, w, fill });
      x += w;
    }
  });
  return rects;
}

/**
 * The pixel 2D-HD bust (DESIGN.md §4.16): crisp 32×32 pixels, then the HD layer, a soft glow
 * from the top-left and a bottom vignette, the only gradients allowed in the product.
 */
export function PixelAvatar({
  parts,
  label,
  className = "",
}: {
  parts: AvatarParts;
  label: string;
  className?: string;
}) {
  // Gradient ids live in the page's id space; `useId` output is not a valid fragment.
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rects = useMemo(() => runs(drawAvatar(parts)), [parts]);
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={label}
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
