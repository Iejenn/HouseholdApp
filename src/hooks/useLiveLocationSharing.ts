import { useEffect, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import type { MemberLocation } from '../types';

// Skip a write unless the user has moved at least this far...
const MIN_DISTANCE_METERS = 25;
// ...or this much time has passed since the last write (keeps "Updated Xs
// ago" fresh-looking even while stationary), whichever comes first.
const MAX_INTERVAL_MS = 60 * 1000;

function distanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const R = 6371000;
  const dLat = ((toLat - fromLat) * Math.PI) / 180;
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((fromLat * Math.PI) / 180) * Math.cos((toLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Mount this ONCE near the top of the app (not inside a single screen) so
 * tracking keeps running as the user navigates between tabs. Only runs while
 * this component tree is mounted and the browser tab is in the foreground —
 * see the background-tracking limitations discussed for why that's the
 * ceiling for a web app.
 */
export function useLiveLocationSharing(enabled: boolean) {
  const { user, profile } = useAuth();
  const householdId = profile?.householdId;
  const watchId = useRef<number | null>(null);
  const lastWrite = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !user || !householdId) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      lastWrite.current = null;
      setError(null);
      return;
    }

    if (!navigator.geolocation) {
      setError('Location is not supported in this browser.');
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();
        const last = lastWrite.current;
        const movedEnough = !last || distanceMeters(last.lat, last.lng, latitude, longitude) >= MIN_DISTANCE_METERS;
        const timeUp = !last || now - last.at >= MAX_INTERVAL_MS;

        if (!movedEnough && !timeUp) return; // throttled — skip this update

        const loc: MemberLocation = { uid: user.uid, lat: latitude, lng: longitude, updatedAt: now };
        lastWrite.current = { lat: latitude, lng: longitude, at: now };
        setDoc(doc(db, 'households', householdId, 'locations', user.uid), loc).catch(() => {
          setError('Could not update your live location.');
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied — live sharing paused.');
        } else {
          setError('Lost your location signal — live sharing paused.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [enabled, user, householdId]);

  return { error };
}