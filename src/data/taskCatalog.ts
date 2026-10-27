// Standard tasks to pick from when adding a task, grouped per room or topic.
// Add/rename items here freely — tasks store their own title, so changing
// this list never affects tasks that already exist.

export interface TaskGroup {
  id: string; // stored on the task as `category` — don't rename existing ids
  label: string;
  emoji: string;
  items: string[];
  // How a picked item becomes the task title
  title: (item: string, label: string) => string;
}

const FLOORS = ['Begane grond', 'Eerste verdieping', 'Zolder'];

const itemOnly = (item: string) => item;
const labelThenItem = (item: string, label: string) => `${label} – ${item}`;
const itemThenLabel = (item: string, label: string) => `${item} – ${label}`;

export const TASK_GROUPS: TaskGroup[] = [
  { id: 'stofzuigen', label: 'Stofzuigen', emoji: '🧹', items: FLOORS, title: labelThenItem },
  { id: 'dweilen', label: 'Dweilen', emoji: '🪣', items: FLOORS, title: labelThenItem },
  {
    id: 'badkamer',
    label: 'Badkamer',
    emoji: '🛁',
    items: [
      'Toilet schoonmaken',
      'Wastafel schoonmaken',
      'Douchecabine schoonmaken',
      'Spiegel poetsen',
      'Handdoeken verschonen',
    ],
    title: itemOnly,
  },
  {
    id: 'keuken',
    label: 'Keuken',
    emoji: '🍳',
    items: [
      'Afwassen',
      'Vaatwasser uitruimen',
      'Aanrecht schoonmaken',
      'Kookplaat schoonmaken',
      'Koelkast schoonmaken',
      'Magnetron schoonmaken',
      'Oven schoonmaken',
    ],
    title: itemOnly,
  },
  {
    id: 'woonkamer',
    label: 'Woonkamer',
    emoji: '🛋️',
    items: ['Afstoffen', 'Opruimen', 'Ramen lappen', 'Planten water geven'],
    title: itemThenLabel,
  },
  {
    id: 'slaapkamer',
    label: 'Slaapkamer',
    emoji: '🛏️',
    items: ['Bed verschonen', 'Bed opmaken', 'Afstoffen', 'Opruimen'],
    title: itemThenLabel,
  },
  {
    id: 'was',
    label: 'Was',
    emoji: '🧺',
    items: ['Was draaien', 'Was ophangen', 'Was opvouwen', 'Strijken'],
    title: itemOnly,
  },
  {
    id: 'afval',
    label: 'Afval',
    emoji: '🗑️',
    items: [
      'Restafval aan de straat',
      'GFT-bak aan de straat',
      'PMD aan de straat',
      'Oud papier wegbrengen',
      'Glas wegbrengen',
    ],
    title: itemOnly,
  },
  {
    id: 'tuin',
    label: 'Tuin & balkon',
    emoji: '🌿',
    items: ['Planten water geven', 'Gras maaien', 'Onkruid wieden', 'Terras vegen'],
    title: itemThenLabel,
  },
];

export function findTaskGroup(id: string | null | undefined): TaskGroup | undefined {
  return id ? TASK_GROUPS.find((g) => g.id === id) : undefined;
}
