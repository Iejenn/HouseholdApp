import { useEffect, useState } from 'react';

// Current time that refreshes on an interval, so time-based things (hiding
// old items, the cat getting hungry) update without a reload
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
