import { normalizeBounds, panToReveal, toMarkers } from "./view";

const point = (lng: number, lat: number) => ({
  type: "Point",
  coordinates: [lng, lat],
});

describe("toMarkers", () => {
  it("draws each cluster and each jam once, however many tiles repeat them", () => {
    const cluster = {
      properties: { cluster: true, cluster_id: 7, point_count: 12 },
      geometry: point(8.5, 47.4),
    };
    const jam = { properties: { id: "a" }, geometry: point(2.3, 48.9) };

    expect(toMarkers([cluster, jam, cluster, jam])).toEqual([
      {
        kind: "cluster",
        key: "cluster-7",
        clusterId: 7,
        count: 12,
        lng: 8.5,
        lat: 47.4,
      },
      { kind: "jam", key: "a", id: "a" },
    ]);
  });

  it("skips features it cannot place", () => {
    expect(
      toMarkers([
        { properties: null, geometry: point(0, 0) },
        {
          properties: { cluster: true, cluster_id: 1 },
          geometry: { type: "Point" },
        },
        { properties: { name: "no id" }, geometry: point(0, 0) },
      ]),
    ).toEqual([]);
  });
});

describe("normalizeBounds", () => {
  it("keeps an ordinary box", () => {
    expect(normalizeBounds([5, 45, 11, 48])).toEqual([5, 45, 11, 48]);
  });

  it("wraps edges past the antimeridian, so the box crosses it", () => {
    expect(normalizeBounds([170, -20, 190, 10])).toEqual([170, -20, -170, 10]);
  });

  it("is the whole world when more than the world shows", () => {
    expect(normalizeBounds([-300, -80, 300, 80])).toEqual([-180, -80, 180, 80]);
  });
});

describe("panToReveal", () => {
  const area = { top: 16, right: 984, bottom: 684, left: 16 };

  it("does not move when the target is in view", () => {
    expect(
      panToReveal({ top: 100, right: 500, bottom: 300, left: 200 }, area),
    ).toEqual([0, 0]);
  });

  it("pans up and left by the overflow at the top-left", () => {
    expect(
      panToReveal({ top: -40, right: 300, bottom: 200, left: 6 }, area),
    ).toEqual([-10, -56]);
  });

  it("pans by the overflow at the bottom-right", () => {
    expect(
      panToReveal({ top: 500, right: 1004, bottom: 700, left: 700 }, area),
    ).toEqual([20, 16]);
  });

  it("keeps the top in view when the target is taller than the area", () => {
    expect(
      panToReveal({ top: 100, right: 300, bottom: 900, left: 100 }, area),
    ).toEqual([0, 84]);
  });
});
