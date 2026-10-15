const shape = "size-24 rounded-[28px] lg:size-28 lg:rounded-[32px]";

/**
 * Rounded-square avatar (DESIGN.md §4.16): the uploaded photo, else a placeholder initial.
 * The generated pixel avatar replaces the initial in M12b.
 */
export function DancerAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${shape} border border-border object-cover`}
      />
    );
  }
  const initial = [...name.trim()][0]?.toUpperCase() ?? "";
  return (
    <div
      role="img"
      aria-label={name}
      className={`${shape} flex items-center justify-center border border-border bg-surface-raised font-display text-display-lg text-muted`}
    >
      {initial}
    </div>
  );
}
