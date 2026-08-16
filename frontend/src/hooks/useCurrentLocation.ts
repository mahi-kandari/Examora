import { useEffect, useState } from "react";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Returns the user's current GPS coordinates once the browser grants
 * permission, or null otherwise. Uses the free browser Geolocation API — no
 * external/paid service is called.
 */
export function useCurrentLocation(): Coordinates | null {
  const [coords, setCoords] = useState<Coordinates | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let active = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (active) {
          setCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        }
      },
      () => {
        if (active) setCoords(null);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );

    return () => {
      active = false;
    };
  }, []);

  return coords;
}
