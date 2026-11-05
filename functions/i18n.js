// Push notifications in the receiver's language (users/{uid}.language,
// missing = Dutch). Same idea as the app (src/i18n): the Dutch text is the
// key, {name}-style placeholders are filled in.

const EN = {
  'Nieuw bericht': 'New message',
  'reageerde op je briefje: "{note}"': 'reacted to your note: "{note}"',
  '{name} op "{note}"': '{name} on "{note}"',
  '🛒 Boodschappen': '🛒 Groceries',
  'Je partner': 'Your partner',
  '{name} zette {items} op de lijst': '{name} put {items} on the list',
  '{name} zette {n} dingen op de lijst: {items}': '{name} put {n} items on the list: {items}',
  '{first} en {last}': '{first} and {last}',
  '{first} en nog {n} meer': '{first} and {n} more',
  '☀️ Goedemorgen!': '☀️ Good morning!',
  '"{title}" moet vandaag': '"{title}" is due today',
  '{n} taken moeten vandaag': '{n} tasks are due today',
  '1 taak is te laat': '1 task is overdue',
  '{n} taken zijn te laat': '{n} tasks are overdue',
  '{name} heeft honger 🥣': '{name} is hungry 🥣',
  Poes: 'Kitty',
  '📊 Jullie week': '📊 Your week',
  'Een rustige week: geen taken afgevinkt. {name} rekent deze week op jullie! 🐾':
    'A quiet week: no tasks ticked off. {name} is counting on you this week! 🐾',
  '{scores} taak.': '{scores} task.',
  '{scores} taken.': '{scores} tasks.',
  'Meeste aandacht: {room}.': 'Most attention: {room}.',
  'Samen {n} 🐾 verdiend!': '{n} 🐾 earned together!',
  Stofzuigen: 'Vacuuming',
  Dweilen: 'Mopping',
  Badkamer: 'Bathroom',
  Keuken: 'Kitchen',
  Woonkamer: 'Living room',
  Slaapkamer: 'Bedroom',
  Was: 'Laundry',
  Afval: 'Waste',
  'Tuin & balkon': 'Garden & balcony',
  '👉 {name} port je': '👉 {name} is nudging you',
  'Kun je "{title}" doen? 🙏': 'Could you do "{title}"? 🙏',
  '🔔 Testmelding': '🔔 Test notification',
  'Het werkt! Zo zien jullie meldingen eruit.': 'It works! This is what your notifications look like.',
};

export function tr(lang, nl, vars) {
  const text = lang === 'en' ? EN[nl] ?? nl : nl;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}
