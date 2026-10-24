export interface MissionCard {
  id: string;
  title: string;
  /** Read aloud by the host. */
  brief: string;
  /** What counts as a full success. */
  goal: string;
  reward: number;
}

/**
 * Party missions played in the room. The host reads the brief from the TV and
 * records the result, which adds gold to the prize pot.
 */
export const MISSIONS: MissionCard[] = [
  {
    id: 'whisper-chain',
    title: 'The Whispering Gallery',
    brief: 'Stand in a line. The first player reads a secret phrase on the host screen and whispers it down the line.',
    goal: 'The last player repeats the phrase word for word.',
    reward: 1500,
  },
  {
    id: 'candle-relay',
    title: 'The Candle Relay',
    brief: 'Pass a spoon with a coin balanced on it from hand to hand around the room. Hands behind backs when not holding it.',
    goal: 'The coin completes a full lap without falling, within 60 seconds.',
    reward: 2000,
  },
  {
    id: 'portrait-hall',
    title: 'The Portrait Hall',
    brief: 'One player describes a famous painting or film poster without naming it. Everyone else sketches it in 90 seconds.',
    goal: 'At least half the sketches are recognisable to the describer.',
    reward: 1500,
  },
  {
    id: 'cellar-count',
    title: 'Count the Cellar',
    brief: 'Close your eyes. Count up from one as a group, one player at a time, with no order agreed. If two speak at once, start again.',
    goal: 'Reach a number equal to the players in the room plus five.',
    reward: 2000,
  },
  {
    id: 'riddle-gate',
    title: 'The Riddle Gate',
    brief: 'The host asks three riddles. The group has 30 seconds per riddle and one shared answer.',
    goal: 'Solve all three. Two out of three counts as a partial success.',
    reward: 2500,
  },
  {
    id: 'silent-line',
    title: 'The Silent Procession',
    brief: 'Without speaking, line up in order of birthday through the year.',
    goal: 'The line is in the right order when checked aloud.',
    reward: 1500,
  },
  {
    id: 'tower-build',
    title: 'Raise the Tower',
    brief: 'Using only cups, books, or whatever is on the table, build a free-standing tower in two minutes.',
    goal: 'The tower stands taller than the shortest player’s knee for ten seconds.',
    reward: 2000,
  },
  {
    id: 'memory-feast',
    title: 'The Banquet of Memory',
    brief: 'The host shows ten objects on a tray (or lists them aloud) for 20 seconds, then hides them.',
    goal: 'Together, name all ten. Seven or more is a partial success.',
    reward: 2000,
  },
  {
    id: 'hum-tune',
    title: 'The Minstrel’s Hum',
    brief: 'Players take turns humming a well-known tune for ten seconds while the rest guess.',
    goal: 'The group guesses five tunes before anyone guesses wrong three times.',
    reward: 1500,
  },
  {
    id: 'mirror-mirror',
    title: 'Mirror, Mirror',
    brief: 'Pair up. One player in each pair makes slow movements while the other mirrors them. The host guesses who is leading.',
    goal: 'The host guesses wrong on at least half the pairs.',
    reward: 1500,
  },
  {
    id: 'ten-words',
    title: 'The Ten Word Tale',
    brief: 'Go around the room, each player adding one word to a story. The story must make sense.',
    goal: 'Three full laps without a pause longer than three seconds.',
    reward: 1500,
  },
  {
    id: 'keyholder',
    title: 'The Keyholder',
    brief: 'One player hides a key (or small object) in the room while everyone else waits outside. The group has two minutes to find it.',
    goal: 'The key is found in time.',
    reward: 2000,
  },
];

export function missionById(id: string): MissionCard {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}
