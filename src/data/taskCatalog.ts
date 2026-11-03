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
  // Header colour of this room's card in the task list (pastel, like the week menu)
  color: string;
}

const FLOORS = ['Begane grond', 'Eerste verdieping', 'Zolder'];

const itemOnly = (item: string) => item;
const labelThenItem = (item: string, label: string) => `${label} – ${item}`;
const itemThenLabel = (item: string, label: string) => `${item} – ${label}`;

export const TASK_GROUPS: TaskGroup[] = [
  { id: 'stofzuigen', label: 'Stofzuigen', emoji: '🧹', items: FLOORS, title: labelThenItem, color: '#dbe8f5' },
  { id: 'dweilen', label: 'Dweilen', emoji: '🪣', items: FLOORS, title: labelThenItem, color: '#d4ece4' },
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
    color: '#e6ddf3',
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
    color: '#f8dfd2',
  },
  {
    id: 'woonkamer',
    label: 'Woonkamer',
    emoji: '🛋️',
    items: ['Afstoffen', 'Opruimen', 'Ramen lappen', 'Planten water geven'],
    title: itemThenLabel,
    color: '#f8ecc4',
  },
  {
    id: 'slaapkamer',
    label: 'Slaapkamer',
    emoji: '🛏️',
    items: ['Bed verschonen', 'Bed opmaken', 'Afstoffen', 'Opruimen'],
    title: itemThenLabel,
    color: '#f6dbe4',
  },
  {
    id: 'was',
    label: 'Was',
    emoji: '🧺',
    items: ['Was draaien', 'Was ophangen', 'Was opvouwen', 'Strijken'],
    title: itemOnly,
    color: '#dcefd9',
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
    color: '#e4e2dd',
  },
  {
    id: 'tuin',
    label: 'Tuin & balkon',
    emoji: '🌿',
    items: ['Planten water geven', 'Gras maaien', 'Onkruid wieden', 'Terras vegen'],
    title: itemThenLabel,
    color: '#e2efcf',
  },
];

// Card colour for tasks without a room
export const OTHER_GROUP_COLOR = '#efe6da';

export function findTaskGroup(id: string | null | undefined): TaskGroup | undefined {
  return id ? TASK_GROUPS.find((g) => g.id === id) : undefined;
}
