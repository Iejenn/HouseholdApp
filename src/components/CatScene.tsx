import type { CatMood } from '../data/catShop';

// Hand-drawn black-and-white (tuxedo) cat in its little room. The bed,
// scratching post and toys only appear once they've been bought.
export default function CatScene({
  mood,
  fullness,
  owned,
  petting,
  onPet,
}: {
  mood: CatMood;
  fullness: number;
  owned: Set<string>;
  petting: boolean;
  onPet: () => void;
}) {
  const fill = fullness / 100;
  const hasBed = owned.has('bed');
  // Cat sits a little higher when it's in its bed
  const catY = hasBed ? 6 : 18;

  return (
    <svg viewBox="0 0 360 250" className="cat-scene" role="img" aria-label="Jullie kat">
      {/* Room */}
      <rect x="0" y="0" width="360" height="200" fill="var(--color-surface-alt)" />
      <rect x="0" y="200" width="360" height="50" fill="#e2d5c3" />
      <line x1="0" y1="200" x2="360" y2="200" stroke="#d3c4b0" strokeWidth="2" />
      {/* Window */}
      <rect x="236" y="26" width="84" height="70" rx="6" fill="#dfeef2" stroke="#fff" strokeWidth="5" />
      <line x1="278" y1="26" x2="278" y2="96" stroke="#fff" strokeWidth="4" />
      <line x1="236" y1="61" x2="320" y2="61" stroke="#fff" strokeWidth="4" />

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
        {fill > 0 && (
          <ellipse cx="300" cy="206" rx={6 + 18 * fill} ry={2 + 7 * fill} fill="#8a5a33" />
        )}
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

      {/* The cat */}
      <g
        transform={`translate(95 ${catY}) scale(0.85)`}
        className={`cat${petting ? ' cat-petting' : ''}`}
        onClick={onPet}
        style={{ cursor: 'pointer' }}
      >
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
          {mood === 'happy' ? (
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
          {mood === 'happy' && (
            <>
              <ellipse cx="74" cy="106" rx="7" ry="4" fill="#e8a3ad" opacity="0.6" />
              <ellipse cx="126" cy="106" rx="7" ry="4" fill="#e8a3ad" opacity="0.6" />
            </>
          )}

          {/* Nose + mouth */}
          <path d="M95 101 h10 l-5 6 z" fill="#d9808d" />
          {mood === 'hungry' ? (
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
        </g>
      </g>

      {/* Thought bubble when hungry */}
      {mood === 'hungry' && (
        <g className="cat-thought">
          <circle cx="226" cy="64" r="4" fill="#fff" />
          <circle cx="236" cy="50" r="6" fill="#fff" />
          <ellipse cx="258" cy="30" rx="22" ry="16" fill="#fff" />
          <text x="258" y="37" textAnchor="middle" fontSize="18">🥣</text>
        </g>
      )}
    </svg>
  );
}
