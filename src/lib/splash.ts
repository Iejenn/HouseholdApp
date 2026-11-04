// The loading screen lives in index.html (so it shows before any code has
// downloaded). The app calls releaseSplash() once the first screen has its
// data, so Thuis appears complete instead of cards popping in one by one.

// Never keep someone waiting longer than this; slower parts fill in after
const MAX_WAIT_MS = 2500;

let released = false;

export function releaseSplash() {
  if (released) return;
  released = true;
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('splash-hide'); // fades out (see index.html)
  window.setTimeout(() => el.remove(), 350);
}

// Started once when the app boots
export function startSplashTimer() {
  window.setTimeout(releaseSplash, MAX_WAIT_MS);
}
