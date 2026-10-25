import { RESORT_MISSIONS } from './missions-resort';

/**
 * Party missions played in the room. The host reads the card from the TV,
 * runs it, and records the result, which adds gold to the prize pot.
 *
 * Each card can carry a set of prompts (tunes, riddles, phrases...). A few are
 * drawn at random each time the mission is played, so repeat games differ.
 */

export interface PromptItem {
  text: string;
  /** Riddle answers and the like, hidden on the TV until the host reveals them. */
  answer?: string;
}

export type PromptKind =
  /** Each drawn prompt goes privately to one player's phone. The TV only says who has it. */
  | 'secret'
  /** Shown on the TV for everyone. */
  | 'public'
  /** Question on the TV, answer hidden until the host reveals it. */
  | 'riddle'
  /** Shown on the TV for a short time, then hidden while the group remembers it. */
  | 'memory';

export interface PromptSet {
  kind: PromptKind;
  /** Heading for the drawn prompts, e.g. "Tunes" or "Riddles". */
  label: string;
  /** How many prompts to draw. */
  count: number;
  pool: PromptItem[];
  /** Seconds the prompts stay visible, for 'memory'. */
  showSeconds?: number;
}

export type MissionPack = 'castle' | 'resort';

export const MISSION_PACKS: { id: MissionPack; name: string; blurb: string }[] = [
  { id: 'resort', name: 'Resort & Pool', blurb: 'Warm and cold pools, an inflatable ring and an inflatable football' },
  { id: 'castle', name: 'Castle (indoors)', blurb: 'Living room games with paper, cups and a spoon' },
];

export interface MissionCard {
  id: string;
  /** Missions not tagged belong to the castle pack. */
  pack?: MissionPack;
  title: string;
  /** One line of atmosphere, read aloud first. */
  intro: string;
  /** What the room needs before starting. */
  props: string[];
  /** Total time for the mission, as shown to players. */
  time: string;
  /** If set, players are chosen at random for this job, e.g. "Hider". Count defaults to 1. */
  roles?: { name: string; count?: number; duty: string };
  /** Step by step instructions, read aloud by the host. */
  steps: string[];
  prompts?: PromptSet;
  scoring: { success: string; partial: string; fail: string };
  reward: number;
}

const TUNES: PromptItem[] = [
  { text: 'Happy Birthday to You' },
  { text: 'Twinkle, Twinkle, Little Star' },
  { text: 'Jingle Bells' },
  { text: 'Ode to Joy (Beethoven)' },
  { text: 'Here Comes the Bride (Wagner’s Bridal Chorus)' },
  { text: 'Für Elise (Beethoven)' },
  { text: 'Greensleeves' },
  { text: 'Auld Lang Syne' },
  { text: 'The Entertainer (Scott Joplin)' },
  { text: 'Row, Row, Row Your Boat' },
  { text: 'Old MacDonald Had a Farm' },
  { text: 'When the Saints Go Marching In' },
  { text: 'In the Hall of the Mountain King (Grieg)' },
  { text: 'The William Tell Overture, the galloping finale (Rossini)' },
  { text: 'Swan Lake, the main theme (Tchaikovsky)' },
  { text: 'Rule, Britannia!' },
  { text: 'Frère Jacques' },
  { text: 'Pop Goes the Weasel' },
  { text: 'The Blue Danube waltz (Strauss)' },
  { text: 'Silent Night' },
  { text: 'Baa, Baa, Black Sheep' },
  { text: 'Toreador Song from Carmen (Bizet)' },
];

const WHISPERS: PromptItem[] = [
  { text: 'The baron’s black cat buried seven silver spoons beneath the bell tower.' },
  { text: 'Lady Rowena keeps a frog in her left boot every second Tuesday.' },
  { text: 'Never trust a butler who whistles while polishing the candlesticks.' },
  { text: 'Forty frightened ferrets fled the frozen fortress before breakfast.' },
  { text: 'The third painting in the east wing has hung upside down since Easter.' },
  { text: 'My grandmother’s parrot speaks fluent Portuguese, but only at midnight.' },
  { text: 'Pass the marmalade quietly or the duke will hear us plotting.' },
  { text: 'Twelve tall torches lit the tower until the clumsy tailor tripped.' },
];

const RIDDLES: PromptItem[] = [
  { text: 'What has keys but cannot open a single lock?', answer: 'A piano' },
  { text: 'The more you take, the more you leave behind. What are they?', answer: 'Footsteps' },
  { text: 'What has a neck but no head?', answer: 'A bottle' },
  { text: 'What can travel around the world while staying in a corner?', answer: 'A stamp' },
  { text: 'I have cities but no houses, forests but no trees, and water but no fish. What am I?', answer: 'A map' },
  { text: 'What gets wetter the more it dries?', answer: 'A towel' },
  { text: 'What has one eye but cannot see?', answer: 'A needle' },
  { text: 'What comes once in a minute, twice in a moment, but never in a thousand years?', answer: 'The letter M' },
  { text: 'Forward I am heavy, backward I am not. What am I?', answer: 'A ton' },
  { text: 'What belongs to you, but other people use it more than you do?', answer: 'Your name' },
  { text: 'What has hands but cannot clap?', answer: 'A clock' },
  { text: 'What can you catch but never throw?', answer: 'A cold' },
  { text: 'I speak without a mouth and hear without ears. I come alive with the wind. What am I?', answer: 'An echo' },
  { text: 'The one who makes it sells it. The one who buys it never uses it. The one who uses it never knows. What is it?', answer: 'A coffin' },
  { text: 'What runs but never walks, and has a mouth but never talks?', answer: 'A river' },
  { text: 'What has to be broken before you can use it?', answer: 'An egg' },
];

const PAINTINGS: PromptItem[] = [
  { text: 'The Mona Lisa (Leonardo da Vinci)' },
  { text: 'The Starry Night (Van Gogh)' },
  { text: 'The Scream (Munch)' },
  { text: 'Girl with a Pearl Earring (Vermeer)' },
  { text: 'The Birth of Venus (Botticelli)' },
  { text: 'American Gothic (Grant Wood)' },
  { text: 'The Great Wave off Kanagawa (Hokusai)' },
  { text: 'Sunflowers (Van Gogh)' },
  { text: 'The Last Supper (Leonardo da Vinci)' },
  { text: 'The Creation of Adam (Michelangelo)' },
  { text: 'The Kiss (Klimt)' },
  { text: 'Nighthawks (Edward Hopper)' },
  { text: 'Water Lilies (Monet)' },
  { text: 'The Persistence of Memory, the melting clocks (Dalí)' },
];

const BANQUET: PromptItem[] = [
  'a silver goblet', 'a raven feather', 'a rusty key', 'a pewter plate', 'a candle stub', 'a pocket watch',
  'a velvet glove', 'a wax seal', 'a hunting horn', 'a chess knight', 'a bowl of figs', 'a quill pen',
  'an empty dagger sheath', 'a lantern', 'a wedding ring', 'a loaf of rye bread', 'an hourglass', 'a pair of bone dice',
  'a map of the moors', 'a jar of honey', 'a tarnished crown', 'a lace handkerchief', 'a bottle of port', 'a brass compass',
  'a sprig of rosemary', 'a hand bell', 'the queen of spades', 'a red apple', 'a snuff box', 'a wooden spoon',
].map((text) => ({ text }));

const TALE_OPENINGS: PromptItem[] = [
  { text: 'Late one night, the castle cook discovered...' },
  { text: 'Nobody believed the gardener when he said...' },
  { text: 'On the morning of the duke’s wedding, a horse walked into...' },
  { text: 'The ghost in the library only ever wanted...' },
  { text: 'Deep in the cellar, behind the oldest barrel, there was...' },
  { text: 'The new butler had one strange rule:' },
];

const LINE_ORDERS: PromptItem[] = [
  { text: 'By birthday through the calendar year, 1 January at one end and 31 December at the other. Day and month only, not year.' },
  { text: 'By shoe size, smallest at one end.' },
  { text: 'By the number of letters in your first name, shortest at one end. Ties go alphabetically.' },
  { text: 'By how many countries you have set foot in, fewest at one end.' },
  { text: 'By the hour you woke up this morning, earliest at one end.' },
  { text: 'By house or flat number of where you live now, lowest at one end.' },
];

const TOWER_MATERIALS: PromptItem[] = [
  { text: 'Playing cards only, one deck. No folding the cards in half.' },
  { text: 'Cups only (paper or plastic), as many as the kitchen has.' },
  { text: 'Books and magazines only.' },
  { text: '20 sheets of paper and nothing else. Folding and rolling allowed, no tape.' },
  { text: 'Anything from one kitchen drawer, chosen by the host.' },
];

const CASTLE_MISSIONS: MissionCard[] = [
  {
    id: 'minstrel-hum',
    title: 'The Minstrel’s Hum',
    intro: 'The castle minstrel has lost his voice. Only his tunes remain.',
    props: ['Nothing'],
    time: 'About 5 minutes',
    steps: [
      'Six players are named below. Each has been sent a secret tune on their phone.',
      'In the order shown, each minstrel stands and hums their tune for up to 20 seconds. No words, no la-la-la, no clues.',
      'The rest of the room has 20 seconds after the humming stops to agree one shared answer. Shout it out.',
      'The host reveals each tune on the TV after the guess. One guess per tune.',
    ],
    prompts: { kind: 'secret', label: 'Tunes', count: 6, pool: TUNES },
    scoring: { success: '5 or 6 tunes guessed', partial: '3 or 4 tunes guessed', fail: '2 or fewer' },
    reward: 2000,
  },
  {
    id: 'whisper-chain',
    title: 'The Whispering Gallery',
    intro: 'Secrets travel fast in these halls, but rarely intact.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    steps: [
      'Everyone stands in one line, shoulder to shoulder.',
      'The first in line (named below) has the secret phrase on their phone. They read it, put the phone away, and whisper it once into the next player’s ear.',
      'Each player whispers what they heard to the next. Only one whisper each: no repeats, no “say that again”.',
      'The last player says the phrase out loud. The host then reveals the original on the TV.',
    ],
    roles: { name: 'First in line', duty: 'Has the phrase on their phone.' },
    prompts: { kind: 'secret', label: 'The secret phrase', count: 1, pool: WHISPERS },
    scoring: { success: 'Word perfect', partial: 'No more than three words wrong or missing', fail: 'Four or more words wrong' },
    reward: 1500,
  },
  {
    id: 'riddle-gate',
    title: 'The Riddle Gate',
    intro: 'The gatekeeper lets no fool pass. Answer, or stay outside.',
    props: ['A timer (the host can use a phone)'],
    time: 'About 3 minutes',
    steps: [
      'The host reads the first riddle aloud from the TV.',
      'The group has 45 seconds to agree one answer. Only the first answer said clearly to the host counts.',
      'The host reveals the answer on the TV, then moves to the next riddle.',
      'Three riddles in total.',
    ],
    prompts: { kind: 'riddle', label: 'Riddles', count: 3, pool: RIDDLES },
    scoring: { success: 'All 3 correct', partial: '2 correct', fail: '1 or none' },
    reward: 2500,
  },
  {
    id: 'portrait-hall',
    title: 'The Portrait Hall',
    intro: 'A portrait has been stolen from the long gallery. Only one of you saw it.',
    props: ['Paper and a pen for every player'],
    time: 'About 4 minutes',
    roles: { name: 'Witness', duty: 'Has the painting on their phone and describes it.' },
    steps: [
      'The witness (named below) has a famous painting on their phone.',
      'For 90 seconds the witness describes what is in it: shapes, colours, where things are. They must not say the title, the painter, or any word from the title.',
      'Everyone else sketches what they hear. No questions allowed.',
      'When time is up, each sketcher writes down which painting they think it is. Then the host reveals it on the TV.',
    ],
    prompts: { kind: 'secret', label: 'The painting', count: 1, pool: PAINTINGS },
    scoring: { success: 'Half or more of the sketchers name it', partial: 'At least one sketcher names it', fail: 'Nobody names it' },
    reward: 1500,
  },
  {
    id: 'cellar-count',
    title: 'Count the Cellar',
    intro: 'In the dark cellar, nobody can see who speaks next.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    steps: [
      'Everyone closes their eyes and keeps them closed. No signals, no taps, no agreed order.',
      'Count up from one, out loud, one number per voice. Anyone may say the next number at any time.',
      'If two people speak at once, or anyone speaks twice in a row, the count goes back to one.',
      'The target is the number of players in the room plus five. You have three minutes.',
    ],
    scoring: { success: 'Reach the target', partial: 'Reach half the target', fail: 'Fall short of half' },
    reward: 2000,
  },
  {
    id: 'silent-line',
    title: 'The Silent Procession',
    intro: 'The lords of the castle process in strict order, and in perfect silence.',
    props: ['Nothing'],
    time: '2 minutes',
    steps: [
      'Line up in the order shown on the TV.',
      'No speaking, mouthing, writing or phones. Pointing, nodding and holding up fingers are allowed.',
      'When everyone is happy, the line raises their hands. The host then asks each player for their answer, from one end to the other.',
    ],
    prompts: { kind: 'public', label: 'Line up', count: 1, pool: LINE_ORDERS },
    scoring: { success: 'Everyone in the right place', partial: 'One or two players out of place', fail: 'Three or more out of place' },
    reward: 1500,
  },
  {
    id: 'tower-build',
    title: 'Raise the Tower',
    intro: 'The watchtower has fallen. Rebuild it before the enemy arrives.',
    props: ['The materials shown on the TV', 'A tape measure, or a dining chair to compare against'],
    time: '3 minutes to build, 10 seconds to stand',
    steps: [
      'Build one free-standing tower using only the materials shown.',
      'Nothing may hold it up: no walls, no furniture, no hands once the time is up.',
      'When the three minutes end, everyone steps back. The tower must stand for 10 seconds while the host counts.',
      'The target height is 45 cm, about the height of a dining chair seat.',
    ],
    prompts: { kind: 'public', label: 'Materials', count: 1, pool: TOWER_MATERIALS },
    scoring: { success: '45 cm or taller, standing for 10 seconds', partial: '25 cm or taller', fail: 'Under 25 cm or it falls' },
    reward: 2000,
  },
  {
    id: 'memory-feast',
    title: 'The Banquet of Memory',
    intro: 'The feast is laid for only a moment before the servants clear it away.',
    props: ['Nothing'],
    time: 'About 2 minutes',
    steps: [
      'When everyone is watching the TV, the host shows the banquet: ten items, on screen for 20 seconds. No writing, no photos.',
      'The banquet then disappears.',
      'The group has 60 seconds to name all ten items out loud. The host keeps count.',
      'The host reveals the list again to check.',
    ],
    prompts: { kind: 'memory', label: 'The banquet', count: 10, pool: BANQUET, showSeconds: 20 },
    scoring: { success: 'All 10 named', partial: '7 to 9 named', fail: '6 or fewer' },
    reward: 2000,
  },
  {
    id: 'ten-words',
    title: 'The Chronicle',
    intro: 'The castle scribe writes one word at a time, and never stops.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    roles: { name: 'Scribe', duty: 'Reads the opening line and adds the first word.' },
    steps: [
      'Sit or stand in a circle. The scribe (named below) reads the opening line from the TV.',
      'Going clockwise from the scribe, each player adds exactly one word to continue the story.',
      'Pausing for more than three seconds, repeating the previous word, or making the sentence nonsense ends the story.',
      'Goal: three full laps of the circle.',
    ],
    prompts: { kind: 'public', label: 'Opening line', count: 1, pool: TALE_OPENINGS },
    scoring: { success: 'Three full laps', partial: 'Two full laps', fail: 'Fewer than two laps' },
    reward: 1500,
  },
  {
    id: 'mirror-mirror',
    title: 'Mirror, Mirror',
    intro: 'In the hall of mirrors, who moves first?',
    props: ['Nothing'],
    time: 'About 4 minutes',
    roles: { name: 'Seer', duty: 'Leaves the room, then guesses who is leading.' },
    steps: [
      'The seer (named below) leaves the room. Everyone else pairs up (one group of three if needed).',
      'Each pair secretly chooses a leader. Pairs face each other and make slow, smooth movements, with the follower copying the leader as a mirror.',
      'The seer returns and watches for 60 seconds, then names the leader of each pair.',
    ],
    scoring: { success: 'The seer is wrong on at least half the pairs', partial: 'The seer is wrong on at least one pair', fail: 'The seer is right every time' },
    reward: 1500,
  },
  {
    id: 'keyholder',
    title: 'The Keyholder',
    intro: 'The key to the treasury is hidden somewhere in this very room.',
    props: ['A small object to hide: a key, a coin or a ring'],
    time: '1 minute to hide, up to 4 minutes to search',
    roles: { name: 'Keyholder', duty: 'Hides the key while everyone else waits outside.' },
    steps: [
      'Everyone except the keyholder (named below) leaves the room.',
      'The keyholder has one minute to hide the key. It must be reachable without moving furniture, and at least part of it must be visible.',
      'Everyone returns and searches. The keyholder must stay silent and still.',
    ],
    scoring: { success: 'Found within 2 minutes', partial: 'Found within 4 minutes', fail: 'Not found in 4 minutes' },
    reward: 2000,
  },
  {
    id: 'candle-relay',
    title: 'The Candle Relay',
    intro: 'Carry the flame around the castle without letting it fall.',
    props: ['One tablespoon', 'One coin'],
    time: '60 seconds',
    steps: [
      'Stand in a circle. The first player holds the spoon by the very end of its handle with a coin resting in the bowl.',
      'Pass the spoon hand to hand around the circle. Hold it only by the handle, and keep your other hand behind your back.',
      'If the coin falls, the spoon goes back to the first player and the lap starts again. The clock keeps running.',
    ],
    scoring: { success: 'A full lap in 60 seconds', partial: 'More than half a lap in 60 seconds', fail: 'Less than half a lap' },
    reward: 2000,
  },
  {
    id: 'herald-roll',
    title: 'The Herald’s Roll',
    intro: 'Every guest must be announced, along with the gift they bring.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    roles: { name: 'First herald', duty: 'Starts the roll.' },
    steps: [
      'Sit in a circle. The first herald (named below) says their name and a gift starting with A: “I am Ken and I bring an anchor.”',
      'Clockwise, each player repeats every name and gift so far, in order, then adds their own with the next letter of the alphabet.',
      'Any mistake or a pause longer than five seconds ends the roll.',
    ],
    scoring: { success: 'The whole circle completes the roll', partial: 'At least half the circle completes it', fail: 'Fewer than half' },
    reward: 2000,
  },
];

export const MISSIONS: MissionCard[] = [...CASTLE_MISSIONS, ...RESORT_MISSIONS];

export const packOf = (m: MissionCard): MissionPack => m.pack ?? 'castle';

export function missionById(id: string): MissionCard {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}
