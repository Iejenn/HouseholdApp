# Household app — Phase 1 (linking + tasks)

What's built: sign up/sign in, create-or-join a household with a 6-character
invite code (capped at 2 members), and a shared task list (once-off or
recurring, assign to either person, mark done, heart your partner's
completed tasks).

Not built yet: push notifications, real-time location, and the recurring-task
reset logic (a task currently just gets marked done — automatically reopening
it on schedule needs the small Cloud Function described below). Say the word
when you want to move to that phase.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project**.
2. Once created, click **Add app → Web** (yes, even though this is a mobile
   app — the JS SDK we're using reads a web-style config object). Skip
   hosting setup.
3. Copy the `firebaseConfig` object it gives you into
   `src/firebaseConfig.ts`, replacing the placeholder values.

## 2. Turn on the services we use

- **Authentication** → Sign-in method → enable **Email/Password**.
- **Firestore Database** → Create database → start in **production mode**
  (the rules file below locks it down properly, so production mode is fine
  from day one).

## 3. Deploy the security rules

The rules in `firestore.rules` are what actually enforce "only household
members can see each other's tasks" — without them, production mode blocks
everyone, and test mode allows anyone. Easiest way to deploy:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # point it at this project, keep firestore.rules when asked
firebase deploy --only firestore:rules
```

(Or paste the contents of `firestore.rules` directly into the Rules tab in
the Firebase console — works just as well for now.)

## 4. Run it

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your Android phone (install
from the Play Store) — no build step needed for this stage, since we're not
using any native modules yet.

## 5. Try it end to end

1. Sign up on your phone, create a household, note the invite code.
2. Sign up on your wife's phone, join with that code.
3. Add a task from either phone — it should appear on both, live.
4. Mark it done on one phone, tap the heart on the other.

## Getting a real, installable APK later

Once we add location + push (which need native modules, so Expo Go won't
cut it anymore), you'll build via Expo's free cloud build service — no
Android Studio required:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile preview
```

That produces a downloadable `.apk` you can install directly on your phones.
