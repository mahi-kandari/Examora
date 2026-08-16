import { useState, useEffect } from "react";

export interface GeofenceStatus {
  distanceKm: number | null;
  isWithinGeofence: boolean;
  proximityMessage: string | null;
  userCoords: { latitude: number; longitude: number } | null;
  error: string | null;
}

/**
 * Haversine formula to calculate distance between two GPS coordinates in kilometers.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Custom hook to monitor user GPS location relative to a target location (e.g. Test Centre).
 * Triggers notification when student is within targetGeofenceKm (default 2 km).
 */
export function useGeofence(
  targetLat?: number | null,
  targetLng?: number | null,
  targetGeofenceKm = 2.0
): GeofenceStatus {
  const [status, setStatus] = useState<GeofenceStatus>({
    distanceKm: null,
    isWithinGeofence: false,
    proximityMessage: null,
    userCoords: null,
    error: null,
  });

  useEffect(() => {
    if (!targetLat || !targetLng) {
      return;
    }

    if (!("geolocation" in navigator)) {
      setStatus((prev) => ({ ...prev, error: "Geolocation is not supported by this browser." }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const uLat = position.coords.latitude;
        const uLng = position.coords.longitude;
        const dist = haversineDistanceKm(uLat, uLng, targetLat, targetLng);
        const inside = dist <= targetGeofenceKm;

        let msg: string | null = null;
        if (inside) {
          msg = `📍 You are ${dist} km from your test centre (Within ${targetGeofenceKm} km zone). Have your admit card and ID ready!`;
          if (Notification.permission === "granted") {
            try {
              new Notification("Examora Test Centre Proximity Alert", {
                body: msg,
                icon: "/favicon.svg",
              });
            } catch {
              // Ignore notification popup errors
            }
          }
        } else {
          msg = `🚗 You are ${dist} km away from your test centre.`;
        }

        setStatus({
          distanceKm: dist,
          isWithinGeofence: inside,
          proximityMessage: msg,
          userCoords: { latitude: uLat, longitude: uLng },
          error: null,
        });
      },
      (err) => {
        setStatus((prev) => ({ ...prev, error: err.message }));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [targetLat, targetLng, targetGeofenceKm]);

  return status;
}
