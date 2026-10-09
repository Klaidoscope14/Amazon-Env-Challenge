"use client";

import { useState, useEffect } from "react";

interface LocationState {
  city: string;
  campus: string;
  displayName: string;
  isDetecting: boolean;
  error: string | null;
}

const CITY_MAPPING: Record<string, { campus: string; displayName: string }> = {
  Delhi: { campus: "delhi", displayName: "Delhi" },
  "New Delhi": { campus: "delhi", displayName: "New Delhi" },
  Mumbai: { campus: "mumbai", displayName: "Mumbai" },
  Bangalore: { campus: "bangalore", displayName: "Bangalore" },
  Bengaluru: { campus: "bangalore", displayName: "Bengaluru" },
  Chennai: { campus: "chennai", displayName: "Chennai" },
  Kolkata: { campus: "kolkata", displayName: "Kolkata" },
  Hyderabad: { campus: "hyderabad", displayName: "Hyderabad" },
  Pune: { campus: "pune", displayName: "Pune" },
  Ahmedabad: { campus: "ahmedabad", displayName: "Ahmedabad" },
  Lucknow: { campus: "lucknow", displayName: "Lucknow" },
  Jaipur: { campus: "jaipur", displayName: "Jaipur" },
};

const DEFAULT: LocationState = {
  city: "Delhi",
  campus: "delhi",
  displayName: "Delhi (default)",
  isDetecting: true,
  error: null,
};

export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>(DEFAULT);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        isDetecting: false,
        error: "Geolocation not supported",
      }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=en`,
            { headers: { "User-Agent": "BreatheSafeCampus/1.0" } }
          );
          const data = await res.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.state_district ||
            data.address?.state ||
            "Delhi";

          const mapped = CITY_MAPPING[city];
          setState({
            city,
            campus: mapped?.campus || city.toLowerCase().replace(/\s+/g, "-"),
            displayName: mapped?.displayName || city,
            isDetecting: false,
            error: null,
          });
        } catch {
          setState((s) => ({
            ...s,
            isDetecting: false,
            error: "Could not determine city",
          }));
        }
      },
      () => {
        setState((s) => ({
          ...s,
          isDetecting: false,
          error: "Location access denied",
        }));
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  return state;
}
