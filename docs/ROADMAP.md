# Roadmap Huishouden (stand 6 november 2026)

Doel: de app verkopen als abonnement van **€0,99 per maand per huishouden**
(eventueel ook **€8,99 per jaar**), via de Play Store (Android) en later PayPal
voor iPhone-huishoudens.

## Afspraken over hoe we werken

- Eerst de bestaande code verkennen en een plan voorstellen; pas bouwen na akkoord.
- Elke wijziging op een nieuwe feature branch, met een pull request. Nooit pushen
  naar `main` en nooit mergen: dat doet Ian zelf.
- Korte comments bij wijzigingen over *waarom* iets verandert.
- Bij elke wijziging die gebruikers merken: een item toevoegen bovenaan
  `src/data/changelog.ts` (Nederlands én Engels), zodat het in "Wat is er nieuw" komt.
- Teksten altijd via `t('…')` met Engelse vertaling in `src/i18n/en.ts`;
  `npm run check:i18n` moet slagen.
- Na elke PR vermelden wat er in Firebase gedeployed moet worden (regels en/of functions).

## Klaar

- ✅ Engels + taalkeuze per persoon, meldingen in de taal van de ontvanger (PR #34)
- ✅ Versienummer = builddatum, "Wat is er nieuw"-pop-up (PR #34)
- ✅ Kostenbesparing: samenvattingen in `stats/` door Cloud Functions,
  nachtelijke opschoning, cache op de telefoon (PR #28)
- ✅ Kat kiezen, reacties op briefjes, updates in één keer, laadscherm,
  deadlines, vakantiemodus (eerdere PR's)

**Nog te doen door Ian:** Cloud Functions deployen na PR #34 (meldingen in eigen taal).

## Volgende stappen (in deze volgorde)

### Stap 2 – Huishoudens tot 6 personen, premium, proefperiode
- Maximaal 6 leden per huishouden (regels + teksten "jullie twee"/"partner"/"allebei"
  in beide talen aanpassen, aansluit-logica).
- De server beslist over toegang (nooit de app zelf):
  - nieuw huishouden: 7 dagen gratis (trial-einddatum gezet door een Cloud Function);
  - daarna moet minstens één lid premium zijn (één betaalt, iedereen gebruikt het);
  - bestaande huishoudens (Ian, neef) blijven voor altijd gratis.
- Na de proef: huishouden wordt **alleen-lezen** + betaal-pop-up. Nooit data verwijderen.
- Database-regels dwingen dit af (schrijven alleen als premium of in proefperiode).
- Tijdelijke "maak premium"-knop alleen voor Ian, om te testen vóór echte betalingen.

### Stap 3 – Account en huishouden verwijderen (verplicht voor Google)
- In Instellingen, boven "Uitloggen":
  - account verwijderen: uit het huishouden en login verwijderen;
  - huishouden verwijderen: alle leden eruit, alle data weg.
  - Laatste lid verwijdert account → huishouden wordt ook opgeruimd.
- Via een Cloud Function (alleen de server kan logins en alle data verwijderen).
- Privacybeleid, gebruiksvoorwaarden en een webpagina om verwijdering aan te vragen.

### Stap 4 – Weer via MET Norway (vervangt Open-Meteo)
- Open-Meteo is gratis alleen voor niet-commercieel gebruik (betaald: ~€29/maand).
- MET Norway (api.met.no): gratis, ook commercieel, met bronvermelding.
- Via een Cloud Function met cache (MET wil een herkenbare User-Agent, dat kan een browser niet).

### Stap 5 – Eigen domein op Netlify + Android-app + Play Console
- Eigen domein nodig: Android controleert via `/.well-known/assetlinks.json` op de
  hoofdmap van het domein dat app en website bij elkaar horen (kan niet op GitHub Pages).
- Daarna in Firebase (Authorized domains) en Google Cloud (OAuth redirect) het nieuwe domein toevoegen.
- Android-app als Trusted Web Activity met Bubblewrap.
- Play Console: gesloten test met minstens 12 testers, 14 dagen aaneengesloten,
  vóór publieke publicatie (regel voor nieuwe persoonlijke accounts).

### Stap 6 – Google Play Billing
- In de Android-app verplicht Google Play Billing (geen Stripe/iDEAL voor abonnementen).
- Een Cloud Function controleert elke aankoop bij Google en verwerkt verlengingen
  en opzeggingen (Real-time Developer Notifications).

### Stap 7 – PayPal voor huishoudens met alleen iPhones
- Via de website (mag buiten de Play Store om). Eerst uitzoeken of een PayPal
  Business-account zonder KvK kan.

## Wat Ian intussen kan doen
1. 12 Android-testers zoeken (Reddit: r/AndroidClosedTesting, r/TestersCommunity; familie, vrienden).
2. Domeinnaam kiezen en kopen, en de app-naam vastleggen (nu "Huishouden" / Engels "Household").
3. Play Console-account aanmaken ($25) en identiteitsverificatie afronden.
4. Navragen bij KvK en PayPal: is inschrijving nodig voor abonnementen, kan PayPal Business zonder KvK.
   (Btw: via Google Play regelt Google het; bij PayPal is Ian zelf verkoper — KOR tot €20.000 omzet.)

## Deploy-commando's (Cloud Shell)
```
gcloud config set project household-14b3e
cd ~/HouseholdApp && git pull
npx firebase-tools@latest deploy --only firestore:rules --project household-14b3e
cd functions && npm install && cd ..
npx firebase-tools@latest deploy --only functions --project household-14b3e
```
Altijd eerst mergen, dan `git pull`, dan deployen. Laat elk commando helemaal uitlopen.
