export type LngLat = { lng: number; lat: number };

/** The device's position; rejects when the browser has none or the visitor says no. */
export function currentPosition(): Promise<LngLat> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("no geolocation"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lng: coords.longitude, lat: coords.latitude }),
      reject,
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}

/** Whether the visitor already let this site read their position, so asking won't prompt. */
export async function positionAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "geolocation" });
    return status?.state === "granted";
  } catch {
    return false;
  }
}
