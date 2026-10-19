import { useMemo } from "react";
import { partsOf } from "./avatarParts";
import { PixelAvatar } from "./PixelAvatar";

const SHAPES = {
  page: "size-24 rounded-[28px] lg:size-28 lg:rounded-[32px]",
  form: "size-[72px] rounded-[22px]",
  row: "size-[52px] rounded-[16px]",
  chip: "size-7 rounded-[8px]",
};

type DancerAvatarProps = {
  dancer: {
    id: string;
    dancer_name: string;
    avatar_url?: string | null;
    avatar_parts?: string | null;
  };
  /** `page`: the identity card · `form`: the edit sheet's preview · `row`: a person row · `chip`: a dancer chip (DESIGN.md §4.16). */
  size?: keyof typeof SHAPES;
};

/** Rounded-square avatar: the uploaded photo, else the generated pixel bust. */
export function DancerAvatar({ dancer, size = "page" }: DancerAvatarProps) {
  const shape = `${SHAPES[size]} shrink-0 overflow-hidden border border-border`;
  const { id, avatar_parts } = dancer;
  const parts = useMemo(
    () => partsOf({ id, avatar_parts }),
    [id, avatar_parts],
  );
  if (dancer.avatar_url) {
    return (
      <img
        src={dancer.avatar_url}
        alt={dancer.dancer_name}
        className={`${shape} object-cover`}
      />
    );
  }
  return (
    <PixelAvatar
      parts={parts}
      label={dancer.dancer_name}
      className={`${shape} block`}
    />
  );
}
