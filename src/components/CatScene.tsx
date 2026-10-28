import type { CatLook, CatMood, DayPart, Season } from '../data/catShop';

const WALL_FILLS: Record<string, string> = {
  wall_mint: '#d9eadf',
  wall_stripes: 'url(#wall-stripes)',
  wall_flowers: 'url(#wall-flowers)',
  wall_stars: 'url(#wall-stars)',
};
const FLOOR_FILLS: Record<string, string> = {
  floor_wood: 'url(#floor-wood)',
  floor_tiles: 'url(#floor-tiles)',
  floor_carpet: 'url(#floor-carpet)',
};
const COLLAR_COLORS: Record<string, string> = {
  collar_red: '#c0392b',
  collar_bell: '#3b6fb6',
  collar_bow: '#e8a3ad',
};

// Height of the attic that appears on top at house level 3
const ATTIC_H = 110;

// Hand-drawn black-and-white (tuxedo) cat in its home. Bought furniture and
// toys appear in the room, the room grows with the house level, and the
// window/lighting follow the time of day.
export default function CatScene({
  mood,
  sleeping,
  fullness,
  owned,
  look,
  level,
  dayPart,
  season,
  petting,
  onPet,
}: {
  mood: CatMood;
  sleeping: boolean;
  fullness: number;
  owned: Set<string>;
  look: CatLook;
  level: number;
  dayPart: DayPart;
  season: Season;
  petting: boolean;
  onPet: () => void;
}) {
  const fill = fullness / 100;
  const hasBed = owned.has('bed');
  // Cat sits a little higher when it's in its bed
  const catY = hasBed ? 6 : 18;
  const W = level >= 2 ? 560 : 360;
  const top = level >= 3 ? ATTIC_H : 0;
  const H = 250 + top;

  const wallFill = (look.wall && WALL_FILLS[look.wall]) || 'var(--color-surface-alt)';
  const floorFill = (look.floor && FLOOR_FILLS[look.floor]) || '#e2d5c3';
  // In December he gets a Santa hat, unless he's already wearing one
  const hat = look.hat ?? (season === 'christmas' ? 'santa' : null);
  const lampOn = dayPart !== 'day';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cat-scene" role="img" aria-label="Jullie kat in zijn huisje">
      <SceneDefs />

      {level >= 3 && <Attic width={W} dayPart={dayPart} />}

      <g transform={`translate(0 ${top})`}>
        {/* Room(s) */}
        <rect x="0" y="0" width={W} height="200" fill={wallFill} />
        <rect x="0" y="200" width={W} height="50" fill={floorFill} />
        <line x1="0" y1="200" x2={W} y2="200" stroke="#d3c4b0" strokeWidth="2" />

        <Window dayPart={dayPart} season={season} />

        {level >= 1 && <CozyExtras />}
        {level >= 2 && <SecondRoom ladder={level >= 3} />}

        {/* Scratching post */}
        {owned.has('scratcher') && (
          <g>
            <rect x="18" y="200" width="74" height="12" rx="4" fill="#9c6b43" />
            <rect x="44" y="96" width="22" height="106" fill="#d9bf94" />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="44" y1={102 + i * 8.5} x2="66" y2={98 + i * 8.5} stroke="#b89a6c" strokeWidth="2" />
            ))}
            <rect x="26" y="84" width="58" height="14" rx="6" fill="var(--color-primary)" />
            <circle cx="78" cy="104" r="6" fill="var(--color-primary-tint)" />
            <line x1="78" y1="98" x2="78" y2="91" stroke="#b89a6c" strokeWidth="1.5" />
          </g>
        )}

        {/* Bed */}
        {hasBed && (
          <g>
            <ellipse cx="180" cy="206" rx="86" ry="22" fill="#b5653f" />
            <ellipse cx="180" cy="202" rx="72" ry="14" fill="var(--color-primary-tint)" />
          </g>
        )}

        {/* Food bowl — the kibble shrinks as the cat gets hungrier */}
        <g>
          {fill > 0 && <ellipse cx="300" cy="206" rx={6 + 18 * fill} ry={2 + 7 * fill} fill="#8a5a33" />}
          {fill > 0.4 && (
            <>
              <circle cx="292" cy={203 - 4 * fill} r="2.5" fill="#6f4426" />
              <circle cx="304" cy={201 - 4 * fill} r="2.5" fill="#6f4426" />
              <circle cx="298" cy={206 - 4 * fill} r="2.5" fill="#a26d42" />
            </>
          )}
          <path d="M272 206 h56 l-7 18 h-42 z" fill="var(--color-sage)" />
          <rect x="270" y="203" width="60" height="6" rx="3" fill="#84987a" />
        </g>

        {/* Toys */}
        {owned.has('toy_yarn') && (
          <g>
            <circle cx="250" cy="226" r="10" fill="#c96a7a" />
            <path d="M242 222 q8 -6 16 2 M241 228 q9 -4 18 2 M246 218 q4 8 10 16" stroke="#a8505f" strokeWidth="1.5" fill="none" />
            <path d="M240 228 q-12 6 -24 0" stroke="#c96a7a" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {owned.has('toy_mouse') && (
          <g>
            <ellipse cx="110" cy="228" rx="12" ry="7" fill="#9aa0a6" />
            <circle cx="100" cy="222" r="4" fill="#b7bcc1" />
            <circle cx="99" cy="226" r="1.3" fill="#333" />
            <path d="M122 229 q10 2 14 -6" stroke="#9aa0a6" strokeWidth="1.5" fill="none" />
          </g>
        )}
        {owned.has('toy_rod') && (
          <g>
            <line x1="330" y1="236" x2="350" y2="130" stroke="#7a5233" strokeWidth="3" strokeLinecap="round" />
            <path d="M350 130 q-10 30 -4 56" stroke="#bbb" strokeWidth="1" fill="none" />
            <path d="M346 186 q-10 6 -6 16 q8 -4 6 -16" fill="#6fa6b8" />
            <path d="M346 186 q8 4 6 14 q-8 -2 -6 -14" fill="#e3b04b" />
          </g>
        )}

        {season === 'christmas' && <ChristmasTree />}
        {season === 'halloween' && <Pumpkin />}

        {/* The cat */}
        <g
          transform={`translate(95 ${catY}) scale(0.85)`}
          className={`cat${petting ? ' cat-petting' : ''}`}
          onClick={onPet}
          style={{ cursor: 'pointer' }}
        >
          <Cat mood={mood} sleeping={sleeping} collar={look.collar ?? null} hat={hat} />
        </g>

        {/* Thought bubble when hungry (and awake) */}
        {mood === 'hungry' && !sleeping && (
          <g className="cat-thought">
            <circle cx="226" cy="64" r="4" fill="#fff" />
            <circle cx="236" cy="50" r="6" fill="#fff" />
            <ellipse cx="258" cy="30" rx="22" ry="16" fill="#fff" />
            <text x="258" y="37" textAnchor="middle" fontSize="18">🥣</text>
          </g>
        )}
        {sleeping && (
          <g className="cat-zzz" fill="#fff" stroke="#2c3352" strokeWidth="0.6" fontWeight="700">
            <text x="236" y="58" fontSize="14">z</text>
            <text x="248" y="42" fontSize="18">z</text>
            <text x="262" y="24" fontSize="22">Z</text>
          </g>
        )}
      </g>

      {/* Evening glow / night darkness over the whole house */}
      {dayPart === 'evening' && <rect width={W} height={H} fill="#ff8a3d" opacity="0.07" pointerEvents="none" />}
      {dayPart === 'night' && <rect width={W} height={H} fill="#141a33" opacity="0.32" pointerEvents="none" />}
      {lampOn && level >= 2 && (
        <circle cx="548" cy={top + 80} r="70" fill="url(#lamp-glow)" pointerEvents="none" />
      )}
    </svg>
  );
}

function SceneDefs() {
  return (
    <defs>
      <pattern id="wall-stripes" width="24" height="10" patternUnits="userSpaceOnUse">
        <rect width="24" height="10" fill="#f4e4d4" />
        <rect width="8" height="10" fill="#ead0bb" />
      </pattern>
      <pattern id="wall-flowers" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#f7eee8" />
        {[
          [10, 10, '#e8a3ad'],
          [30, 30, '#b7c9e2'],
        ].map(([x, y, c]) => (
          <g key={`${x}`}>
            <circle cx={Number(x) - 3} cy={y} r="2.6" fill={String(c)} />
            <circle cx={Number(x) + 3} cy={y} r="2.6" fill={String(c)} />
            <circle cx={x} cy={Number(y) - 3} r="2.6" fill={String(c)} />
            <circle cx={x} cy={Number(y) + 3} r="2.6" fill={String(c)} />
            <circle cx={x} cy={y} r="1.8" fill="#f3c969" />
          </g>
        ))}
      </pattern>
      <pattern id="wall-stars" width="46" height="46" patternUnits="userSpaceOnUse">
        <rect width="46" height="46" fill="#2c3352" />
        <circle cx="8" cy="10" r="1.6" fill="#f3d36b" />
        <circle cx="31" cy="24" r="1.1" fill="#f3d36b" />
        <path d="M20 33 l1.5 3.5 l3.5 1.5 l-3.5 1.5 l-1.5 3.5 l-1.5 -3.5 l-3.5 -1.5 l3.5 -1.5 z" fill="#f3d36b" />
      </pattern>
      <pattern id="floor-wood" width="60" height="50" patternUnits="userSpaceOnUse">
        <rect width="60" height="50" fill="#c89566" />
        {[12.5, 25, 37.5].map((y) => (
          <line key={y} x1="0" y1={y} x2="60" y2={y} stroke="#b07f53" strokeWidth="1.5" />
        ))}
        <line x1="20" y1="0" x2="20" y2="12.5" stroke="#b07f53" strokeWidth="1.5" />
        <line x1="45" y1="12.5" x2="45" y2="25" stroke="#b07f53" strokeWidth="1.5" />
        <line x1="10" y1="25" x2="10" y2="37.5" stroke="#b07f53" strokeWidth="1.5" />
        <line x1="38" y1="37.5" x2="38" y2="50" stroke="#b07f53" strokeWidth="1.5" />
      </pattern>
      <pattern id="floor-tiles" width="25" height="25" patternUnits="userSpaceOnUse">
        <rect width="25" height="25" fill="#f1ede6" />
        <rect width="12.5" height="12.5" fill="#3a3735" />
        <rect x="12.5" y="12.5" width="12.5" height="12.5" fill="#3a3735" />
      </pattern>
      <pattern id="floor-carpet" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="#c9a9bd" />
        <circle cx="6" cy="6" r="1.4" fill="#b994ab" />
      </pattern>
      <linearGradient id="sky-evening" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7c59f" />
        <stop offset="1" stopColor="#e8899a" />
      </linearGradient>
      <radialGradient id="lamp-glow">
        <stop offset="0" stopColor="#ffd98a" stopOpacity="0.55" />
        <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function skyFill(dayPart: DayPart) {
  return dayPart === 'day' ? '#dfeef2' : dayPart === 'evening' ? 'url(#sky-evening)' : '#25304f';
}

function Window({ dayPart, season }: { dayPart: DayPart; season: Season }) {
  return (
    <g>
      <rect x="236" y="26" width="84" height="70" rx="6" fill={skyFill(dayPart)} />
      {dayPart === 'night' && (
        <>
          <circle cx="300" cy="44" r="9" fill="#f6efc8" />
          <circle cx="304" cy="41" r="8" fill="#25304f" />
          <circle cx="252" cy="40" r="1.3" fill="#fff" />
          <circle cx="266" cy="74" r="1.1" fill="#fff" />
          <circle cx="292" cy="80" r="1.3" fill="#fff" />
        </>
      )}
      {dayPart === 'day' && <circle cx="300" cy="44" r="9" fill="#f6d36b" opacity="0.9" />}
      {season === 'spring' && (
        <g>
          {[
            [248, '#e05a6b'],
            [262, '#f3c969'],
            [306, '#e8a3ad'],
          ].map(([x, c]) => (
            <g key={x}>
              <line x1={x} y1="94" x2={x} y2="78" stroke="#6f8462" strokeWidth="2" />
              <path d={`M${Number(x) - 5} 78 q5 -10 10 0 q-5 4 -10 0 z`} fill={String(c)} />
            </g>
          ))}
        </g>
      )}
      <rect x="236" y="26" width="84" height="70" rx="6" fill="none" stroke="#fff" strokeWidth="5" />
      <line x1="278" y1="26" x2="278" y2="96" stroke="#fff" strokeWidth="4" />
      <line x1="236" y1="61" x2="320" y2="61" stroke="#fff" strokeWidth="4" />
    </g>
  );
}

// Level 1: windowsill with plants and a framed photo
function CozyExtras() {
  return (
    <g>
      <rect x="226" y="96" width="104" height="8" rx="2" fill="#fbf7f1" />
      <path d="M296 96 l2 -12 h16 l2 12 z" fill="#c46b4e" />
      <ellipse cx="300" cy="80" rx="7" ry="11" fill="#6f8462" transform="rotate(-20 300 80)" />
      <ellipse cx="312" cy="78" rx="6" ry="12" fill="#84987a" transform="rotate(18 312 78)" />
      <ellipse cx="306" cy="74" rx="5" ry="12" fill="#5d7353" />
      <path d="M244 96 l1 -9 h12 l1 9 z" fill="#d9bf94" />
      <rect x="246" y="72" width="10" height="16" rx="5" fill="#7fa36f" />
      <line x1="251" y1="75" x2="251" y2="86" stroke="#5d7353" strokeWidth="1" />
      {/* Photo frame with a tiny portrait of the cat */}
      <rect x="22" y="22" width="50" height="42" rx="3" fill="#f4ece2" stroke="#9c6b43" strokeWidth="5" />
      <circle cx="47" cy="47" r="10" fill="#1d1b1a" />
      <path d="M38 41 l-2 -10 l8 6 z M56 41 l2 -10 l-8 6 z" fill="#1d1b1a" />
      <path d="M47 42 c-2 4 -4 8 -7 9 c2 5 12 5 14 0 c-3 -1 -5 -5 -7 -9 z" fill="#fbfaf7" />
    </g>
  );
}

// Level 2: second room with sofa, rug, painting and a floor lamp
// (level 3 adds a ladder up to the attic)
function SecondRoom({ ladder }: { ladder: boolean }) {
  return (
    <g>
      {/* Wall piece above the doorway */}
      <rect x="356" y="0" width="12" height="70" fill="#000" opacity="0.1" />
      <line x1="356" y1="70" x2="356" y2="200" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
      <line x1="368" y1="70" x2="368" y2="200" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />

      {/* Painting */}
      <rect x="440" y="34" width="64" height="46" rx="3" fill="#cfe3ea" stroke="#9c6b43" strokeWidth="5" />
      <path d="M442 78 q16 -20 30 -8 q12 -14 30 -2 v10 z" fill="#84987a" />
      <circle cx="490" cy="48" r="6" fill="#f3c969" />

      {/* Rug */}
      <ellipse cx="472" cy="226" rx="72" ry="14" fill="#e3b04b" opacity="0.85" />
      <ellipse cx="472" cy="226" rx="58" ry="9" fill="none" stroke="#fbf7f1" strokeWidth="2" strokeDasharray="4 4" />

      {/* Sofa */}
      <rect x="420" y="130" width="104" height="44" rx="12" fill="#b94e5c" />
      <rect x="414" y="164" width="116" height="30" rx="8" fill="#a8434f" />
      <rect x="410" y="150" width="16" height="46" rx="8" fill="#9c3d48" />
      <rect x="518" y="150" width="16" height="46" rx="8" fill="#9c3d48" />
      <rect x="432" y="140" width="36" height="26" rx="8" fill="#f3dde0" />
      <rect x="476" y="140" width="36" height="26" rx="8" fill="#e8c9a8" />
      <rect x="420" y="194" width="6" height="8" fill="#6b4a32" />
      <rect x="518" y="194" width="6" height="8" fill="#6b4a32" />

      {/* Floor lamp */}
      <line x1="548" y1="84" x2="548" y2="198" stroke="#5a4a3c" strokeWidth="3" />
      <ellipse cx="548" cy="200" rx="11" ry="4" fill="#5a4a3c" />
      <path d="M536 84 h24 l-5 -20 h-14 z" fill="#f3c969" />

      {ladder && (
        <g stroke="#9c6b43" strokeWidth="4" strokeLinecap="round">
          <line x1="380" y1="-6" x2="380" y2="200" />
          <line x1="400" y1="-6" x2="400" y2="200" />
          {Array.from({ length: 11 }, (_, i) => (
            <line key={i} x1="380" y1={12 + i * 18} x2="400" y2={12 + i * 18} strokeWidth="3" />
          ))}
        </g>
      )}
    </g>
  );
}

// Level 3: attic under the roof with a round skylight, hammock and boxes
function Attic({ width, dayPart }: { width: number; dayPart: DayPart }) {
  const mid = width / 2;
  return (
    <g>
      {/* Sky around the roof */}
      <rect x="0" y="0" width={width} height={ATTIC_H} fill={skyFill(dayPart)} />
      {dayPart === 'night' && (
        <>
          <circle cx="40" cy="20" r="1.4" fill="#fff" />
          <circle cx={width - 50} cy="16" r="1.6" fill="#fff" />
          <circle cx={width - 120} cy="34" r="1.1" fill="#fff" />
        </>
      )}
      <polygon points={`0,${ATTIC_H} 0,70 ${mid},8 ${width},70 ${width},${ATTIC_H}`} fill="#e9d6bb" />
      <polyline points={`0,70 ${mid},8 ${width},70`} fill="none" stroke="#9c6b43" strokeWidth="8" strokeLinejoin="round" />
      <line x1={mid / 2} y1="40" x2={mid / 2} y2={ATTIC_H} stroke="#c9a27a" strokeWidth="5" />
      <line x1={mid * 1.5} y1="40" x2={mid * 1.5} y2={ATTIC_H} stroke="#c9a27a" strokeWidth="5" />

      {/* Round skylight */}
      <circle cx={mid} cy="54" r="20" fill={skyFill(dayPart)} />
      {dayPart === 'night' && <circle cx={mid + 6} cy="48" r="5" fill="#f6efc8" />}
      <circle cx={mid} cy="54" r="20" fill="none" stroke="#fff" strokeWidth="4" />
      <line x1={mid - 20} y1="54" x2={mid + 20} y2="54" stroke="#fff" strokeWidth="3" />
      <line x1={mid} y1="34" x2={mid} y2="74" stroke="#fff" strokeWidth="3" />

      {/* Hammock */}
      <line x1="70" y1="58" x2="70" y2={ATTIC_H - 6} stroke="#9c6b43" strokeWidth="5" />
      <line x1="200" y1="58" x2="200" y2={ATTIC_H - 6} stroke="#9c6b43" strokeWidth="5" />
      <path d="M70 64 Q135 104 200 64 Q135 90 70 64 Z" fill="#e3b04b" />
      <path d="M70 64 Q135 104 200 64" fill="none" stroke="#c99a35" strokeWidth="2" />

      {/* Boxes */}
      <rect x={width - 140} y="72" width="44" height="32" fill="#c9a27a" />
      <rect x={width - 104} y="82" width="34" height="22" fill="#b98f66" />
      <line x1={width - 118} y1="72" x2={width - 118} y2="104" stroke="#e8d3b5" strokeWidth="3" />

      {/* Attic floor = ceiling of the rooms below, with the hatch for the ladder */}
      <rect x="0" y={ATTIC_H - 8} width={width} height="10" fill="#9c6b43" />
      <rect x="374" y={ATTIC_H - 8} width="32" height="10" fill="#5a3e28" />
    </g>
  );
}

function ChristmasTree() {
  return (
    <g>
      <rect x="20" y="204" width="8" height="10" fill="#7a5233" />
      <polygon points="24,150 6,182 42,182" fill="#3f7a4f" />
      <polygon points="24,166 2,206 46,206" fill="#356b44" />
      <circle cx="16" cy="196" r="3" fill="#e05a6b" />
      <circle cx="32" cy="188" r="3" fill="#f3c969" />
      <circle cx="22" cy="176" r="2.6" fill="#6fa6b8" />
      <circle cx="36" cy="200" r="2.6" fill="#f3c969" />
      <path d="M24 140 l3 7 l7 1 l-5 5 l1 7 l-6 -4 l-6 4 l1 -7 l-5 -5 l7 -1 z" fill="#f3c969" />
    </g>
  );
}

function Pumpkin() {
  return (
    <g>
      <ellipse cx="60" cy="230" rx="16" ry="12" fill="#e3893b" />
      <ellipse cx="60" cy="230" rx="7" ry="12" fill="#d9792c" />
      <rect x="58" y="214" width="4" height="7" rx="1" fill="#6f8462" />
      <path d="M51 226 l4 -4 l4 4 z M61 226 l4 -4 l4 4 z" fill="#5a3010" />
      <path d="M50 233 q10 7 20 0 q-10 3 -20 0 z" fill="#5a3010" />
    </g>
  );
}

// The cat itself, drawn in its own 200×220 coordinate box
function Cat({
  mood,
  sleeping,
  collar,
  hat,
}: {
  mood: CatMood;
  sleeping: boolean;
  collar: string | null;
  hat: string | null;
}) {
  const happyEyes = mood === 'happy' && !sleeping;
  return (
    <>
      {/* Tail */}
      <path
        className="cat-tail"
        d="M140 196 C 185 196, 200 160, 182 128 C 176 118, 166 124, 172 134 C 184 156, 172 182, 136 184 Z"
        fill="#1d1b1a"
      />
      {/* Body */}
      <g className="cat-body">
        <ellipse cx="100" cy="160" rx="54" ry="52" fill="#1d1b1a" />
        <path d="M100 118 C 76 128, 72 190, 84 208 L 116 208 C 128 190, 124 128, 100 118 Z" fill="#fbfaf7" />
        <ellipse cx="80" cy="207" rx="15" ry="9" fill="#fbfaf7" />
        <ellipse cx="120" cy="207" rx="15" ry="9" fill="#fbfaf7" />
      </g>
      {/* Head */}
      <g className="cat-head">
        <path d="M58 70 L 56 22 L 92 50 Z" fill="#1d1b1a" />
        <path d="M142 70 L 144 22 L 108 50 Z" fill="#1d1b1a" />
        <path d="M64 58 L 62 34 L 82 50 Z" fill="#e8a3ad" />
        <path d="M136 58 L 138 34 L 118 50 Z" fill="#e8a3ad" />
        <circle cx="100" cy="88" r="48" fill="#1d1b1a" />
        {/* White blaze + muzzle */}
        <path d="M100 58 C 94 74, 88 92, 74 104 C 80 128, 120 128, 126 104 C 112 92, 106 74, 100 58 Z" fill="#fbfaf7" />

        {/* Eyes */}
        {sleeping ? (
          <>
            <path d="M72 86 q9 7 18 0" stroke="#f3e9c6" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M110 86 q9 7 18 0" stroke="#f3e9c6" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </>
        ) : happyEyes ? (
          <>
            <path d="M72 88 q9 -10 18 0" stroke="#f3e9c6" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d="M110 88 q9 -10 18 0" stroke="#f3e9c6" strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <g className="cat-eyes">
            <ellipse cx="81" cy="86" rx="9" ry={mood === 'bored' ? 6 : 10} fill="#c9d64f" />
            <ellipse cx="119" cy="86" rx="9" ry={mood === 'bored' ? 6 : 10} fill="#c9d64f" />
            <ellipse cx="81" cy="86" rx="3" ry={mood === 'hungry' ? 8 : 6} fill="#111" />
            <ellipse cx="119" cy="86" rx="3" ry={mood === 'hungry' ? 8 : 6} fill="#111" />
            <circle cx="84" cy="82" r="2" fill="#fff" />
            <circle cx="122" cy="82" r="2" fill="#fff" />
            {mood === 'bored' && (
              <>
                <rect x="70" y="76" width="22" height="6" fill="#1d1b1a" />
                <rect x="108" y="76" width="22" height="6" fill="#1d1b1a" />
              </>
            )}
            {mood === 'hungry' && (
              <>
                {/* Brows rising towards the middle = sad, not angry */}
                <path d="M70 74 l20 -6" stroke="#f3e9c6" strokeWidth="2.5" strokeLinecap="round" />
                <path d="M130 74 l-20 -6" stroke="#f3e9c6" strokeWidth="2.5" strokeLinecap="round" />
              </>
            )}
          </g>
        )}

        {/* Blush when happy */}
        {happyEyes && (
          <>
            <ellipse cx="74" cy="106" rx="7" ry="4" fill="#e8a3ad" opacity="0.6" />
            <ellipse cx="126" cy="106" rx="7" ry="4" fill="#e8a3ad" opacity="0.6" />
          </>
        )}

        {/* Nose + mouth */}
        <path d="M95 101 h10 l-5 6 z" fill="#d9808d" />
        {sleeping ? (
          <path d="M96 112 q4 3 8 0" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
        ) : mood === 'hungry' ? (
          <ellipse cx="100" cy="115" rx="5" ry="4" fill="#7a3440" />
        ) : mood === 'bored' ? (
          <path d="M93 113 h14" stroke="#555" strokeWidth="2" strokeLinecap="round" />
        ) : (
          <path d="M100 107 q-4 7 -9 3 M100 107 q4 7 9 3" stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round" />
        )}

        {/* Whiskers */}
        <g stroke="#c9c4bb" strokeWidth="1.5" strokeLinecap="round">
          <line x1="76" y1="108" x2="40" y2="100" />
          <line x1="76" y1="112" x2="40" y2="114" />
          <line x1="124" y1="108" x2="160" y2="100" />
          <line x1="124" y1="112" x2="160" y2="114" />
        </g>

        {hat && <Hat id={hat} />}
      </g>

      {collar && <Collar id={collar} />}
    </>
  );
}

function Collar({ id }: { id: string }) {
  const color = COLLAR_COLORS[id] ?? '#c0392b';
  return (
    <g>
      <path d="M68 128 Q100 148 132 128" stroke={color} strokeWidth={id === 'collar_bow' ? 5 : 8} fill="none" strokeLinecap="round" />
      {id === 'collar_bell' && (
        <g>
          <circle cx="100" cy="146" r="7" fill="#f3c969" stroke="#c9a227" strokeWidth="1.5" />
          <line x1="96" y1="148" x2="104" y2="148" stroke="#a8841c" strokeWidth="1.5" />
        </g>
      )}
      {id === 'collar_bow' && (
        <g>
          <path d="M100 140 L84 130 L84 150 Z" fill="#e07a95" />
          <path d="M100 140 L116 130 L116 150 Z" fill="#e07a95" />
          <circle cx="100" cy="140" r="4.5" fill="#c95f7b" />
        </g>
      )}
    </g>
  );
}

function Hat({ id }: { id: string }) {
  if (id === 'hat_party') {
    return (
      <g>
        <path d="M80 46 L100 0 L120 46 Z" fill="#6fa6b8" />
        <path d="M87 30 L113 30 M92 18 L108 18" stroke="#f3dde0" strokeWidth="4" />
        <circle cx="100" cy="0" r="6" fill="#f3c969" />
      </g>
    );
  }
  if (id === 'hat_crown') {
    return (
      <g>
        <path d="M76 46 L76 20 L88 32 L100 12 L112 32 L124 20 L124 46 Z" fill="#f3c969" stroke="#c9a227" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="100" cy="38" r="3.5" fill="#e05a6b" />
        <circle cx="86" cy="40" r="2.5" fill="#6fa6b8" />
        <circle cx="114" cy="40" r="2.5" fill="#6fa6b8" />
      </g>
    );
  }
  if (id === 'hat_flowers') {
    // Flowers along the top of the head
    const colors = ['#e8a3ad', '#f3c969', '#b7c9e2', '#e8a3ad', '#f3c969'];
    return (
      <g>
        {colors.map((c, i) => {
          const a = ((-150 + i * 30) * Math.PI) / 180;
          const x = 100 + 46 * Math.cos(a);
          const y = 88 + 46 * Math.sin(a);
          return (
            <g key={i}>
              <circle cx={x - 4} cy={y} r="4" fill={c} />
              <circle cx={x + 4} cy={y} r="4" fill={c} />
              <circle cx={x} cy={y - 4} r="4" fill={c} />
              <circle cx={x} cy={y + 4} r="4" fill={c} />
              <circle cx={x} cy={y} r="2.6" fill="#fff6d6" />
            </g>
          );
        })}
      </g>
    );
  }
  if (id === 'santa') {
    return (
      <g>
        <path d="M78 44 Q96 0 138 22 L124 44 Z" fill="#c0392b" />
        <rect x="72" y="38" width="58" height="11" rx="5.5" fill="#fbfaf7" />
        <circle cx="140" cy="22" r="7" fill="#fbfaf7" />
      </g>
    );
  }
  return null;
}
