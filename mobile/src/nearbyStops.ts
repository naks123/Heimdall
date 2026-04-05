/**
 * Places abstraction: mock fallback; optional Google Places later (API key in env).
 */

export interface NearbyStop {
  name: string;
  distanceM: number;
  type: "gas" | "rest" | "coffee";
}

export async function fetchNearbyStops(lat: number, lng: number): Promise<NearbyStop[]> {
  const key = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY;
  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=5000&type=gas_station&key=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      if (j.results?.length) {
        return j.results.slice(0, 3).map((p: { name: string; vicinity?: string }) => ({
          name: p.name,
          distanceM: 200 + Math.random() * 800,
          type: "gas" as const,
        }));
      }
    } catch {
      /* fall through */
    }
  }
  return [
    { name: "Demo Rest Stop (mock)", distanceM: 1200, type: "rest" },
    { name: "Mock Coffee Co.", distanceM: 2400, type: "coffee" },
    { name: "Sample Gas & Go", distanceM: 3100, type: "gas" },
  ];
}
