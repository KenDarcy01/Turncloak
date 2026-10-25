import type { MissionCard, PromptItem } from './missions';

/**
 * The Family Dinner pack: quiet, seated missions for a restaurant table,
 * for players aged 10 and up. Nothing needed beyond phones and what is
 * already on the table.
 */

export const TABLE_MANNERS =
  'Keep voices at table level, stay in your seats, and pause any mission when the food or the waiter arrives.';

const DINNER_MIMES: PromptItem[] = [
  { text: 'Eating spaghetti that will not stop being long' },
  { text: 'Blowing on soup that is far too hot' },
  { text: 'A waiter carrying five plates at once' },
  { text: 'Trying to open a stuck ketchup bottle' },
  { text: 'Brushing your teeth' },
  { text: 'A penguin waddling across ice' },
  { text: 'Walking a very excited dog' },
  { text: 'Building a sandcastle' },
  { text: 'Riding a roller coaster' },
  { text: 'A chef tossing a pizza' },
  { text: 'Taking a photo of your food before anyone can eat it' },
  { text: 'Licking an ice cream that is melting fast' },
  { text: 'A superhero getting dressed' },
  { text: 'Playing the drums' },
];

const DINNER_TRIVIA: PromptItem[] = [
  { text: 'Which country did pizza come from?', answer: 'Italy' },
  { text: 'What is the main ingredient in guacamole?', answer: 'Avocado' },
  { text: 'How many legs does a spider have?', answer: 'Eight' },
  { text: 'What is the largest planet in our solar system?', answer: 'Jupiter' },
  { text: 'Which fruit has its seeds on the outside?', answer: 'The strawberry' },
  { text: 'What do bees make?', answer: 'Honey' },
  { text: 'What is the tallest animal in the world?', answer: 'The giraffe' },
  { text: 'How many sides does a hexagon have?', answer: 'Six' },
  { text: 'What is frozen water called?', answer: 'Ice' },
  { text: 'Which ocean is the biggest?', answer: 'The Pacific Ocean' },
  { text: 'What is the name of the wizard school in Harry Potter?', answer: 'Hogwarts' },
  { text: 'Which vegetable is famous for helping you see in the dark?', answer: 'The carrot' },
  { text: 'What colour do you get when you mix blue and yellow?', answer: 'Green' },
  { text: 'How many minutes are in an hour?', answer: 'Sixty' },
  { text: 'Which planet is known as the Red Planet?', answer: 'Mars' },
  { text: 'What is a baby kangaroo called?', answer: 'A joey' },
];

const WHISPERS: PromptItem[] = [
  { text: 'The pudding chef hides a rubber duck in every seventh trifle.' },
  { text: 'Grandad once beat a seagull in a race for the last chip.' },
  { text: 'Purple penguins prefer pancakes with peanut butter on Tuesdays.' },
  { text: 'The waiter has a twin who works here on Thursdays and nobody knows.' },
  { text: 'Never order the soup if the spoon is already standing up in it.' },
  { text: 'Six slippery sausages slid silently off the silver serving dish.' },
];

const CATEGORIES: PromptItem[] = [
  { text: 'Things you find in a kitchen' },
  { text: 'Animals that live in the sea' },
  { text: 'Pizza toppings' },
  { text: 'Things that are yellow' },
  { text: 'Famous cartoon characters' },
  { text: 'Countries in Europe' },
  { text: 'Things you take on holiday' },
  { text: 'Sports' },
  { text: 'Fruits and vegetables' },
  { text: 'Things that make a loud noise' },
];

const SECRET_WORDS: PromptItem[] = [
  { text: 'Banana' },
  { text: 'Elephant' },
  { text: 'Wobbly' },
  { text: 'Pirate' },
  { text: 'Moustache' },
  { text: 'Volcano' },
  { text: 'Spaghetti' },
  { text: 'Dinosaur' },
  { text: 'Tickle' },
  { text: 'Rocket' },
];

const TABLE_ESTIMATES: PromptItem[] = [
  { text: 'How many chairs are in the whole restaurant, including ours?' },
  { text: 'How many people are eating in the restaurant right now, not counting staff?' },
  { text: 'How many lights or lamps can you see from your seat?' },
  { text: 'How many items are on the main course page of the menu?' },
  { text: 'How many pieces of cutlery (knives, forks and spoons) are on our table right now?' },
];

const RHYMES: PromptItem[] = [
  { text: 'Cat' },
  { text: 'Cake' },
  { text: 'Bee' },
  { text: 'Light' },
  { text: 'Fish' },
  { text: 'Moon' },
  { text: 'Chair' },
  { text: 'Snow' },
];

const DINNER_ORDER: PromptItem[] = [
  'Fish and chips', 'Spaghetti bolognese', 'A cheeseburger', 'Tomato soup', 'Chicken curry', 'A margherita pizza',
  'Garlic bread', 'Chocolate cake', 'A banana split', 'Lemonade', 'Apple pie', 'A caesar salad',
  'Roast chicken', 'Pancakes with syrup', 'A hot dog', 'Strawberry milkshake',
].map((text) => ({ text }));

const FAMOUS_FACES: PromptItem[] = [
  'Harry Potter', 'Spider-Man', 'Mickey Mouse', 'Shrek', 'Elsa from Frozen', 'Santa Claus',
  'SpongeBob SquarePants', 'Pikachu', 'Mario', 'Batman', 'Peppa Pig', 'Sherlock Holmes',
  'Darth Vader', 'Paddington Bear', 'Cinderella', 'Buzz Lightyear',
].map((text) => ({ text }));

export const DINNER_MISSIONS: MissionCard[] = [
  {
    id: 'dinner-mime',
    pack: 'dinner',
    title: 'The Silent Supper',
    intro: 'Somewhere at this table, someone is pretending. Let’s see how good you all are at it.',
    props: ['Nothing'],
    time: 'About 5 minutes',
    steps: [
      'The players named below have each been sent something to mime on their phone.',
      'In turn, each player mimes theirs from their seat for up to 45 seconds. No words, no sounds, and no pointing at things on the table.',
      'Everyone else guesses in quiet voices. The mimer nods when someone gets it close enough.',
      'The host reveals each one on the screen afterwards.',
    ],
    prompts: { kind: 'secret', label: 'Mimes', count: 5, pool: DINNER_MIMES },
    scoring: { success: 'All 5 guessed', partial: '3 or 4 guessed', fail: '2 or fewer' },
    reward: 1500,
  },
  {
    id: 'dinner-trivia',
    pack: 'dinner',
    title: 'The Head Waiter’s Quiz',
    intro: 'The head waiter has a question for every course.',
    props: ['Nothing'],
    time: 'About 4 minutes',
    steps: [
      'The host reads each question aloud from the screen.',
      'The table has 30 seconds to agree one answer. No looking it up on phones.',
      'The youngest player gets the final say if the table cannot agree.',
      'The host reveals the answer, then moves on. Five questions in total.',
    ],
    prompts: { kind: 'riddle', label: 'Questions', count: 5, pool: DINNER_TRIVIA },
    scoring: { success: 'All 5 correct', partial: '3 or 4 correct', fail: '2 or fewer' },
    reward: 2000,
  },
  {
    id: 'dinner-whisper',
    pack: 'dinner',
    title: 'Pass the Gossip',
    intro: 'Every restaurant has its secrets. Can you pass one round the table without spoiling it?',
    props: ['Nothing'],
    time: 'About 3 minutes',
    roles: { name: 'First whisperer', duty: 'Has the gossip on their phone.' },
    steps: [
      'The first whisperer (named below) reads the gossip on their phone, puts the phone face down, and whispers it once to the player on their left.',
      'Each player whispers what they heard once only. No repeats.',
      'The last player says it out loud, then the host reveals the original.',
    ],
    prompts: { kind: 'secret', label: 'The gossip', count: 1, pool: WHISPERS },
    scoring: { success: 'Word perfect', partial: 'No more than three words wrong or missing', fail: 'Four or more words wrong' },
    reward: 1500,
  },
  {
    id: 'dinner-categories',
    pack: 'dinner',
    title: 'Round the Table',
    intro: 'The answers go round and round. Whoever runs dry first lets the whole table down.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    steps: [
      'The host reads the category on the screen.',
      'Going round the table to the left, each player names one thing in that category. No repeats.',
      'Each player has five seconds. Count every answer out loud together.',
      'The round ends when someone is stuck or repeats an answer.',
    ],
    prompts: { kind: 'public', label: 'Category', count: 1, pool: CATEGORIES },
    scoring: { success: '20 answers or more', partial: '12 to 19 answers', fail: 'Fewer than 12' },
    reward: 1500,
  },
  {
    id: 'dinner-secret-word',
    pack: 'dinner',
    title: 'The Secret Ingredient',
    intro: 'One of you carries a secret word. Slip it into conversation and nobody must notice.',
    props: ['Nothing'],
    time: 'About 5 minutes',
    roles: { name: 'Smuggler', duty: 'Has the secret word and must say it in a normal sentence without anyone catching it.' },
    steps: [
      'The smuggler (named below) has a secret word on their phone.',
      'For the next five minutes, everyone chats normally about anything. The smuggler must use the word naturally in a sentence.',
      'Anyone can call “Caught!” once, and name the word they think was smuggled. A wrong call is used up.',
      'At the end, the smuggler reveals the word.',
    ],
    prompts: { kind: 'secret', label: 'Secret word', count: 1, pool: SECRET_WORDS },
    scoring: {
      success: 'The word was said and nobody caught it',
      partial: 'The word was said but someone caught it',
      fail: 'The word was never said',
    },
    reward: 2000,
  },
  {
    id: 'dinner-estimate',
    pack: 'dinner',
    title: 'The Maître d’s Count',
    intro: 'A good spy knows the room without counting it.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    steps: [
      'The host reads the question on the screen.',
      'Without counting out loud or pointing, the table has 60 seconds to agree one number.',
      'Then count it properly together, quietly, and the host checks the guess.',
    ],
    prompts: { kind: 'public', label: 'Estimate', count: 1, pool: TABLE_ESTIMATES },
    scoring: { success: 'Within 10% of the real number', partial: 'Within 25%', fail: 'Further out than that' },
    reward: 1500,
  },
  {
    id: 'dinner-memory',
    pack: 'dinner',
    title: 'The Order Pad',
    intro: 'The waiter wrote the order down, then lost the pad. Can the table remember it?',
    props: ['Nothing'],
    time: 'About 2 minutes',
    steps: [
      'The host shows the order on the screen for 20 seconds. Everyone memorises it. No writing it down.',
      'The screen hides the order. Going round the table, each player names one dish until the table thinks it has them all.',
      'The host shows the order again to check.',
    ],
    prompts: { kind: 'memory', label: 'The order', count: 8, showSeconds: 20, pool: DINNER_ORDER },
    scoring: { success: 'All 8 remembered', partial: '5 to 7 remembered', fail: '4 or fewer' },
    reward: 2000,
  },
  {
    id: 'dinner-rhyme',
    pack: 'dinner',
    title: 'The Poet’s Table',
    intro: 'The castle poet has run out of rhymes. Lend them yours.',
    props: ['Nothing'],
    time: 'About 3 minutes',
    steps: [
      'The host reads the word on the screen.',
      'Going round the table to the left, each player says a real word that rhymes with it. No repeats.',
      'Each player has five seconds. Count every rhyme out loud together.',
      'When someone is stuck, the host shows the next word and the round carries on from that player. Three words in total.',
    ],
    prompts: { kind: 'public', label: 'Words', count: 3, pool: RHYMES },
    scoring: { success: '24 rhymes or more', partial: '15 to 23 rhymes', fail: 'Fewer than 15' },
    reward: 1500,
  },
  {
    id: 'dinner-napkin',
    pack: 'dinner',
    title: 'The Napkin Tower',
    intro: 'The kitchen needs a tower. Build it from what the table gives you.',
    props: ['Paper napkins, sugar sachets, menus, empty cups: anything on the table that will not spill'],
    time: '2 minutes',
    steps: [
      'Clear a space in the middle of the table. No glasses with drinks in, no plates, nothing hot or sharp.',
      'Together, build the tallest tower you can in two minutes, using only things already on the table.',
      'When time is up, hands off. The tower must stand on its own for five seconds.',
    ],
    scoring: { success: 'Taller than the tallest glass on the table', partial: 'At least as tall as a salt shaker', fail: 'It fell, or it is shorter' },
    reward: 2000,
  },
  {
    id: 'dinner-story',
    pack: 'dinner',
    title: 'The Never-Ending Menu',
    intro: 'Every dish has a story. Tell this one, one word at a time.',
    props: ['Nothing'],
    time: 'About 2 minutes',
    roles: { name: 'Storyteller', duty: 'Says the first word of the story.' },
    steps: [
      'The storyteller (named below) starts a story about the strangest dinner ever with one word.',
      'Going round the table to the left, each player adds exactly one word. The story must make sense.',
      'Pauses longer than five seconds, two words at once, or a word that makes no sense ends the story.',
      'Keep going for two minutes.',
    ],
    scoring: { success: 'The story lasts the full two minutes', partial: 'It lasts more than one minute', fail: 'It ends in under a minute' },
    reward: 1500,
  },
  {
    id: 'dinner-guess-who',
    pack: 'dinner',
    title: 'Who Am I?',
    intro: 'The guest of honour has forgotten who they are. Help them remember, with only yes or no.',
    props: ['Nothing'],
    time: 'About 4 minutes',
    roles: { name: 'Guest of honour', duty: 'Asks yes or no questions to work out who they are.' },
    steps: [
      'The guest of honour (named below) closes their eyes. The host shows a famous person or character on the screen for everyone else, then hides it.',
      'The guest of honour asks the table yes or no questions. The table answers only “yes”, “no” or “sort of”.',
      'They have 20 questions to name who they are.',
    ],
    prompts: { kind: 'memory', label: 'Who they are', count: 1, showSeconds: 8, pool: FAMOUS_FACES },
    scoring: { success: 'Named in 10 questions or fewer', partial: 'Named in 11 to 20 questions', fail: 'Not named' },
    reward: 2000,
  },
];
