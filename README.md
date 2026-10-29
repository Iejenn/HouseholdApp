# Huishouden

Taken, boodschappen, chat en een digitale kat voor ons tweeën.
React + Vite (PWA) met Firebase (Auth, Firestore, Cloud Messaging, Cloud Functions).

- **Website**: elke merge naar `main` wordt automatisch gepubliceerd op GitHub Pages
  (`.github/workflows/deploy-pages.yml`).
- **Cloud Functions** (`functions/`): die publiceer je met de hand, alleen nodig als er in
  `functions/` iets veranderd is. Zie hieronder.

## Push-meldingen

De app vraagt Firebase om een "push-adres" per telefoon en bewaart dat in
`users/{uid}/pushTokens`. De Cloud Functions in `functions/index.js` sturen daar
meldingen naartoe bij:

- een nieuw chatbericht (`notifyChatMessage`)
- een nieuwe boodschap (`notifyGroceryAdded`)
- elke ochtend om 8:30 als er taken te laat zijn of de kat honger heeft (`dailyReminder`)
- elke maandag om 9:00 een weekoverzicht (`weeklySummary`)
- porren: je partner vragen een taak te doen (`nudgeTask`)
- de knop "Stuur testmelding" in Instellingen (`sendTestPush`)

### Cloud Functions publiceren (via Google Cloud Shell, niets installeren)

1. Open https://shell.cloud.google.com en log in met het Google-account van Firebase.
2. Plak deze regels:

   ```bash
   git clone https://github.com/Iejenn/HouseholdApp.git
   cd HouseholdApp/functions && npm install && cd ..
   npx firebase-tools@latest login --no-localhost
   npx firebase-tools@latest deploy --only functions --project household-14b3e
   ```

3. Bij een latere update: `cd ~/HouseholdApp && git pull` en daarna alleen de laatste
   `deploy`-regel opnieuw.
