import golden from "../../../../milestones/avatar-rework/avatar-fixtures.json";
import {
  type AvatarRender,
  type AvatarSpec,
  avatarSpec,
  type FxPixel,
  renderAvatar,
} from "../../../src/features/dancers/avatar";

type Fixture = AvatarRender & { name: string; spec: Partial<AvatarSpec> };

const fixtures = golden.fixtures as Fixture[];

/** Each pixel's effect layers in drawing order: the order between pixels changes nothing. */
function byPixel(fx: FxPixel[]) {
  const layers: Record<string, string[]> = {};
  for (const [x, y, kind] of fx) (layers[`${x},${y}`] ??= []).push(kind);
  return layers;
}

describe("pixel avatar renderer", () => {
  it("has the reference generator's 44 golden avatars to match", () => {
    expect(fixtures).toHaveLength(44);
  });

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    "draws %s pixel for pixel",
    (_, { spec, sprite, fx, background, ring, rim }) => {
      const drawn = renderAvatar(avatarSpec(spec));
      expect(drawn.sprite).toEqual(sprite);
      expect(byPixel(drawn.fx)).toEqual(byPixel(fx));
      expect([drawn.background, drawn.ring, drawn.rim]).toEqual([
        background,
        ring,
        rim,
      ]);
    },
  );
});
