import { useState, useEffect, useCallback } from "react";

export interface GeofenceStatus {
  distanceKm: number | null;
  isWithinGeofence: boolean;
  proximityMessage: string | null;
  userCoords: { latitude: number; longitude: number } | null;
  error: string | null;
  isLoading: boolean;
  requestGPS: () => void;
}

// Default target: Bhai Nagahia Singh Memorial Girls College, Ludhiana (30.8257, 75.8456)
const DEFAULT_TARGET_LAT = 30.8257;
const DEFAULT_TARGET_LNG = 75.8456;

/**
 * Haversine formula to calculate distance between two GPS coordinates in kilometers.
 * Applies a 1.28x road curvature factor for realistic highway/city driving distance matching Google Maps.
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  useRoadFactor = true
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
  const straightDist = R * c;

  // Apply 1.28x road distance factor for driving routes > 3 km
  const dist = useRoadFactor && straightDist > 3 ? straightDist * 1.28 : straightDist;
  return Math.round(dist * 10) / 10;
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
  const activeLat = targetLat && !isNaN(Number(targetLat)) ? Number(targetLat) : DEFAULT_TARGET_LAT;
  const activeLng = targetLng && !isNaN(Number(targetLng)) ? Number(targetLng) : DEFAULT_TARGET_LNG;

  const [status, setStatus] = useState<Omit<GeofenceStatus, "requestGPS">>({
    distanceKm: null,
    isWithinGeofence: false,
    proximityMessage: null,
    userCoords: null,
    error: null,
    isLoading: true,
  });

  const updatePosition = useCallback((uLat: number, uLng: number) => {
    const dist = haversineDistanceKm(uLat, uLng, activeLat, activeLng);
    const straightDist = haversineDistanceKm(uLat, uLng, activeLat, activeLng, false);
    const inside = straightDist <= targetGeofenceKm || dist <= targetGeofenceKm;

    let msg: string | null = null;
    if (inside) {
      msg = `📍 You are ${dist} km from your test centre (Within ${targetGeofenceKm} km zone). Have your admit card and ID ready!`;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
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
      isLoading: false,
    });
  }, [activeLat, activeLng, targetGeofenceKm]);

  // Read stored fallback origin if available
  const tryStoredOrigin = useCallback(() => {
    try {
      const stored = localStorage.getItem("examora_user_origin");
      if (stored) {
        const [sLat, sLng] = stored.split(",").map(Number);
        if (!isNaN(sLat) && !isNaN(sLng)) {
          updatePosition(sLat, sLng);
          return true;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return false;
  }, [updatePosition]);

  const fetchGPSLocation = useCallback(() => {
    setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    if (!("geolocation" in navigator)) {
      const fallbackWorked = tryStoredOrigin();
      if (!fallbackWorked) {
        updatePosition(30.7629, 76.6096);
      }
      return;
    }

    // Fast initial check with low accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updatePosition(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        const fallbackWorked = tryStoredOrigin();
        if (!fallbackWorked) {
          updatePosition(30.7629, 76.6096);
        }
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }, [tryStoredOrigin, updatePosition]);

  useEffect(() => {
    fetchGPSLocation();

    if (!("geolocation" in navigator)) return;

    // Continuous watch position
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        updatePosition(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        // Silently preserve position on watch error
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [fetchGPSLocation, updatePosition]);

  return {
    ...status,
    requestGPS: fetchGPSLocation,
  };
}
