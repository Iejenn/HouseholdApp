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

## Google Agenda (alleen lezen)

"Agenda koppelen" in Instellingen. Google stuurt je na het inloggen terug naar
`https://iejenn.github.io/HouseholdApp/` met een eenmalige code; de functie
`calendarAuthFinish` wisselt die in. De koppelsleutel staat alleen in
`calendarLinks/{uid}` (geen regel geeft de app toegang). Code: `functions/calendar.js`.

Eenmalig nodig (Google Cloud, project household-14b3e):
- Google Calendar API aan, OAuth-toestemmingsscherm "In productie" met scope
  `calendar.readonly`, en een OAuth-client (Webapplicatie) met omleidings-URI
  `https://iejenn.github.io/HouseholdApp/`.
- Het clientgeheim als Firebase-secret (nooit in de repo):

  ```bash
  npx firebase-tools@latest functions:secrets:set GOOGLE_CLIENT_SECRET --project household-14b3e
  ```

## Talen (Nederlands / English)

- Teksten in de app staan in het Nederlands in de code, verpakt in `t('…')`.
  De Engelse vertaling staat in `src/i18n/en.ts` (sleutel = de Nederlandse tekst).
- Variabelen gaan tussen accolades: `t('{n} te halen', { n: 4 })`.
- `npm run check:i18n` laat zien welke `t()`-teksten nog geen Engelse vertaling hebben.
- Pushmeldingen worden vertaald in `functions/i18n.js`, in de taal van de ontvanger
  (`users/{uid}.language`, standaard Nederlands).

## Versie en "Wat is er nieuw"

- Het versienummer is de builddatum (bijv. `2026.11.05`), automatisch per deploy.
- Nieuwe dingen die gebruikers merken: voeg bovenaan `src/data/changelog.ts` een item toe
  (Nederlands én Engels) met de datum waarop het live gaat. Na de update zien gebruikers
  het één keer in een pop-up, en altijd via Instellingen → "Wat is er nieuw?".
