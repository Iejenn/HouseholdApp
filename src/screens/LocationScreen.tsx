import { useEffect, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import type { Household, MemberLocation, UserProfile } from '../types';

// Leaflet's default marker icons reference image files that Vite doesn't
// resolve automatically — swap in CDN-hosted ones instead.
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

const STALE_AFTER_MS = 3 * 60 * 60 * 1000; // 3 hours

export default function LocationScreen() {
  const { user, profile } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<Record<string, MemberLocation>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  const householdId = profile?.householdId;

  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(doc(db, 'households', householdId), (snap) => {
      if (snap.exists()) setHousehold(snap.data() as Household);
    });
    return unsub;
  }, [householdId]);

  useEffect(() => {
    if (!household) return;
    const unsubs = household.memberIds.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setMemberNames((prev) => ({ ...prev, [uid]: data.displayName }));
        }
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [household]);

  useEffect(() => {
    if (!householdId) return;
    const unsub = onSnapshot(collection(db, 'households', householdId, 'locations'), (snap) => {
      const next: Record<string, MemberLocation> = {};
      snap.docs.forEach((d) => {
        next[d.id] = d.data() as MemberLocation;
      });
      setLocations(next);
    });
    return unsub;
  }, [householdId]);

  // Init map once. This now runs correctly because the map-wrap div below is
  // always rendered on first mount — previously an early "if (!household)
  // return null" meant this div didn't exist yet the one time this effect
  // (empty dep array) fired, so the map was never created.
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([52.0, 5.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    mapInstance.current = map;
    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update markers when locations change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    const points: L.LatLngExpression[] = [];
    Object.entries(locations).forEach(([uid, loc]) => {
      points.push([loc.lat, loc.lng]);
      const label = memberNames[uid] ?? 'Member';
      if (markersRef.current[uid]) {
        markersRef.current[uid].setLatLng([loc.lat, loc.lng]).setPopupContent(label);
      } else {
        markersRef.current[uid] = L.marker([loc.lat, loc.lng], { icon: markerIcon })
          .addTo(map)
          .bindPopup(label);
      }
    });

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    }
  }, [locations, memberNames]);

  // Pans the map to a member's last known marker. No-ops if they haven't
  // shared a location yet, since there's nowhere to fly to.
  function handleFocusMember(uid: string) {
    const map = mapInstance.current;
    const loc = locations[uid];
    if (!map || !loc) return;
    map.flyTo([loc.lat, loc.lng], 15, { duration: 0.75 });
    markersRef.current[uid]?.openPopup();
  }

  // Persists the toggle to the profile (so tracking auto-resumes on reload,
  // and so the top-level tracking hook — mounted outside this screen — can
  // see the flag). On disable, also clears the stale marker rather than
  // leaving a last-known pin visible after the user opted out.
  async function handleToggleLiveSharing() {
    if (!user) return;
    const next = !profile?.liveLocationEnabled;
    try {
      await setDoc(doc(db, 'users', user.uid), { liveLocationEnabled: next }, { merge: true });
      if (!next && householdId) {
        await deleteDoc(doc(db, 'households', householdId, 'locations', user.uid)).catch(() => {});
      }
    } catch {
      setError('Could not update live sharing.');
    }
  }

  function handleRefresh() {
    if (!user || !householdId) return;
    if (!navigator.geolocation) {
      setError('Location is not supported in this browser.');
      return;
    }
    setError(null);
    setRefreshing(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc: MemberLocation = {
          uid: user.uid,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          updatedAt: Date.now(),
        };
        try {
          await setDoc(doc(db, 'households', householdId, 'locations', user.uid), loc);
        } catch {
          setError('Could not save your location — try again.');
        } finally {
          setRefreshing(false);
        }
      },
      (err) => {
        setRefreshing(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied — allow it in your browser settings to share.');
        } else {
          setError('Could not get your location — try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <>
      <div className="app-header">
        <div>
          <h2 className="household-name">Location</h2>
        </div>
      </div>

      <div className="app-content">
        <div className="map-wrap" ref={mapRef} />

        {household &&
          household.memberIds.map((uid) => {
            const loc = locations[uid];
            const isMe = uid === user?.uid;
            const stale = loc && Date.now() - loc.updatedAt > STALE_AFTER_MS;
            const hasLocation = Boolean(loc);
            return (
              <div
                className="card location-card"
                key={uid}
                onClick={hasLocation ? () => handleFocusMember(uid) : undefined}
                style={{ cursor: hasLocation ? 'pointer' : 'default' }}
                role={hasLocation ? 'button' : undefined}
                aria-label={hasLocation ? `Show ${memberNames[uid] ?? 'member'} on map` : undefined}
              >
                <div className="location-avatar">
                  {(memberNames[uid] ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <p className="location-name">
                    {memberNames[uid] ?? '…'} {isMe && '(you)'}
                  </p>
                  <p className={`location-updated${stale ? ' location-stale' : ''}`}>
                    {loc ? `Updated ${timeAgo(loc.updatedAt)}` : 'No location shared yet'}
                  </p>
                </div>
              </div>
            );
          })}

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 4, marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button
          className={`btn btn-block ${profile?.liveLocationEnabled ? 'btn-primary' : 'btn-secondary'}`}
          onClick={handleToggleLiveSharing}
          style={{ marginBottom: 10 }}
        >
          {profile?.liveLocationEnabled ? '🟢 Live sharing is on — tap to stop' : '📡 Turn on live sharing'}
        </button>

        <button className="btn btn-secondary btn-block" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Getting your location…' : '📍 Refresh my location once'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--color-ink-soft)', textAlign: 'center', marginTop: 10 }}>
          {profile?.liveLocationEnabled
            ? 'Updates automatically while the app is open. Pauses if you close the app or your phone locks — it can\u2019t track in the true background.'
            : 'Only updates when you tap the button — nothing tracks in the background.'}
        </p>
      </div>
    </>
  );
}