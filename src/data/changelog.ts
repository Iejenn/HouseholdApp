// "What's new": shown once after an update that has new entries here.
// Newest first. `version` is the release date (same format as the app
// version, see vite.config.ts), so add an entry with the date of the day the
// change goes live. Keep it short and about what people notice.

export interface ChangelogEntry {
  version: string; // "2026.11.05"
  nl: string[];
  en: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026.11.05',
    nl: [
      '🌐 De app is nu ook in het Engels. Kies je taal bij Instellingen; meldingen komen ook in jouw taal.',
      '🐈 Kies jullie kat: zwart-wit, cyperse of rode kater. Tik op de naam van de kat.',
      '📌 Reageer op briefjes met een emoji of een kort berichtje, elk in je eigen handschrift.',
      '✨ Updates komen nu in één keer binnen, en dit scherm vertelt wat er nieuw is.',
    ],
    en: [
      '🌐 The app is now available in English. Choose your language in Settings; notifications follow it too.',
      '🐈 Choose your cat: black & white, tabby or ginger tom. Tap the cat\'s name.',
      '📌 React to notes with an emoji or a short reply, each in your own handwriting.',
      '✨ Updates now arrive in one go, and this screen tells you what\'s new.',
    ],
  },
];
