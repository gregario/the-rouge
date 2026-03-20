export type Category = 'fruit' | 'vegetable' | 'berry'
export type Subcategory = 'tropical' | 'citrus' | 'stone-fruit' | 'root' | 'leafy' | 'legume' | 'allium' | 'gourd' | 'common' | 'exotic'
export type GrowsOn = 'tree' | 'bush' | 'vine' | 'ground' | 'underground'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter' | 'all-year'
export type Difficulty = 'easy' | 'medium'
export type QuestionType = 'colour-match' | 'where-grow' | 'true-false' | 'odd-one-out'

export interface QuestionOption {
  id: string
  text: string | null
  colour: string | null
  icon: string | null
}

export interface Question {
  id: string
  type: QuestionType
  questionText: string
  options: QuestionOption[]
  correctOptionId: string
  explanationCorrect: string
  explanationIncorrect: string
}

export interface FunFact {
  text: string
  highlightWord: string
  factType: 'origin' | 'colour' | 'growth' | 'family' | 'nutrition' | 'surprise'
}

export interface CatalogueItem {
  id: string
  name: string
  image: string
  category: Category
  subcategory: Subcategory
  colours: string[]
  growsOn: GrowsOn
  origin: string
  season: Season
  funFacts: FunFact[]
  questions: Question[]
  surpriseFact: string | null
  difficulty: Difficulty
}

export const catalogue: CatalogueItem[] = [
  // ─── FRUIT / COMMON (10) ───
  {
    id: 'apple',
    name: 'Apple',
    image: '/images/catalogue/apple.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['red', 'green', 'yellow'],
    growsOn: 'tree',
    origin: 'Central Asia',
    season: 'autumn',
    funFacts: [
      { text: 'I come in over 7,500 varieties around the world!', highlightWord: 'varieties', factType: 'surprise' },
      { text: 'I float in water because I am 25% air!', highlightWord: 'float', factType: 'surprise' },
      { text: 'I originally came from mountains in Asia!', highlightWord: 'Asia', factType: 'origin' },
      { text: 'I can be red, green or yellow on the outside!', highlightWord: 'red', factType: 'colour' },
    ],
    questions: [
      {
        id: 'apple-q1', type: 'colour-match', questionText: 'What colour am I?',
        options: [
          { id: 'apple-q1-a', text: null, colour: '#FF0000', icon: null },
          { id: 'apple-q1-b', text: null, colour: '#0000FF', icon: null },
          { id: 'apple-q1-c', text: null, colour: '#FF69B4', icon: null },
          { id: 'apple-q1-d', text: null, colour: '#800080', icon: null },
        ],
        correctOptionId: 'apple-q1-a',
        explanationCorrect: 'Yes! Apples can be red, green or yellow!',
        explanationIncorrect: 'Not quite! Apples are often red, green or yellow.',
      },
      {
        id: 'apple-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'apple-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'apple-q2-b', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'apple-q2-c', text: 'On a bush', colour: null, icon: '🌿' },
          { id: 'apple-q2-d', text: 'On a vine', colour: null, icon: '🌱' },
        ],
        correctOptionId: 'apple-q2-a',
        explanationCorrect: 'That is right! I grow on apple trees!',
        explanationIncorrect: 'Oops! I actually grow on trees!',
      },
      {
        id: 'apple-q3', type: 'true-false', questionText: 'I float in water. True or false?',
        options: [
          { id: 'apple-q3-a', text: 'True', colour: null, icon: null },
          { id: 'apple-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'apple-q3-a',
        explanationCorrect: 'Yes! Apples float because they are 25% air!',
        explanationIncorrect: 'Actually, apples do float! They are 25% air inside.',
      },
      {
        id: 'apple-q4', type: 'odd-one-out', questionText: 'Which one is NOT a fruit like me?',
        options: [
          { id: 'apple-q4-a', text: 'Pear', colour: null, icon: null },
          { id: 'apple-q4-b', text: 'Plum', colour: null, icon: null },
          { id: 'apple-q4-c', text: 'Carrot', colour: null, icon: null },
          { id: 'apple-q4-d', text: 'Cherry', colour: null, icon: null },
        ],
        correctOptionId: 'apple-q4-c',
        explanationCorrect: 'Correct! A carrot is a vegetable, not a fruit!',
        explanationIncorrect: 'Not quite! Carrot is the odd one out — it is a vegetable.',
      },
    ],
    surpriseFact: 'Apple seeds contain a tiny bit of cyanide, but you would need to eat hundreds to feel any effect!',
    difficulty: 'easy',
  },
  {
    id: 'banana',
    name: 'Banana',
    image: '/images/catalogue/banana.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['yellow', 'green'],
    growsOn: 'tree',
    origin: 'Southeast Asia',
    season: 'all-year',
    funFacts: [
      { text: 'I am actually a giant herb, not a tree fruit!', highlightWord: 'herb', factType: 'surprise' },
      { text: 'I start off green and turn yellow as I ripen!', highlightWord: 'green', factType: 'colour' },
      { text: 'I first grew in the rainforests of Southeast Asia!', highlightWord: 'rainforests', factType: 'origin' },
    ],
    questions: [
      {
        id: 'banana-q1', type: 'colour-match', questionText: 'What colour am I when I am ripe?',
        options: [
          { id: 'banana-q1-a', text: null, colour: '#FFD700', icon: null },
          { id: 'banana-q1-b', text: null, colour: '#FF0000', icon: null },
          { id: 'banana-q1-c', text: null, colour: '#0000FF', icon: null },
          { id: 'banana-q1-d', text: null, colour: '#800080', icon: null },
        ],
        correctOptionId: 'banana-q1-a',
        explanationCorrect: 'Yes! I turn bright yellow when I am ripe!',
        explanationIncorrect: 'Not quite! I am yellow when ripe.',
      },
      {
        id: 'banana-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'banana-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'banana-q2-b', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'banana-q2-c', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'banana-q2-d', text: 'On the ground', colour: null, icon: '🌾' },
        ],
        correctOptionId: 'banana-q2-a',
        explanationCorrect: 'Right! I grow on tall banana plants that look like trees!',
        explanationIncorrect: 'I actually grow on tall plants that look like trees!',
      },
      {
        id: 'banana-q3', type: 'true-false', questionText: 'I grow on a herb plant, not a real tree. True or false?',
        options: [
          { id: 'banana-q3-a', text: 'True', colour: null, icon: null },
          { id: 'banana-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'banana-q3-a',
        explanationCorrect: 'Yes! Banana plants are actually giant herbs!',
        explanationIncorrect: 'Surprise! Banana plants are really giant herbs, not trees!',
      },
      {
        id: 'banana-q4', type: 'odd-one-out', questionText: 'Which one does NOT grow on a tree or tall plant?',
        options: [
          { id: 'banana-q4-a', text: 'Apple', colour: null, icon: null },
          { id: 'banana-q4-b', text: 'Banana', colour: null, icon: null },
          { id: 'banana-q4-c', text: 'Strawberry', colour: null, icon: null },
          { id: 'banana-q4-d', text: 'Mango', colour: null, icon: null },
        ],
        correctOptionId: 'banana-q4-c',
        explanationCorrect: 'Right! Strawberries grow on the ground!',
        explanationIncorrect: 'Strawberry is the odd one — it grows on the ground!',
      },
      {
        id: 'banana-q5', type: 'true-false', questionText: 'I originally come from Southeast Asia. True or false?',
        options: [
          { id: 'banana-q5-a', text: 'True', colour: null, icon: null },
          { id: 'banana-q5-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'banana-q5-a',
        explanationCorrect: 'Yes! Bananas first grew in Southeast Asia!',
        explanationIncorrect: 'Actually, bananas do come from Southeast Asia!',
      },
    ],
    surpriseFact: 'Bananas are slightly radioactive because they contain potassium!',
    difficulty: 'easy',
  },
  {
    id: 'orange',
    name: 'Orange',
    image: '/images/catalogue/orange.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['orange'],
    growsOn: 'tree',
    origin: 'China',
    season: 'winter',
    funFacts: [
      { text: 'The colour orange was named after me, not the other way!', highlightWord: 'colour', factType: 'colour' },
      { text: 'I originally came from ancient China!', highlightWord: 'China', factType: 'origin' },
      { text: 'I am packed with vitamin C to keep you healthy!', highlightWord: 'vitamin', factType: 'nutrition' },
    ],
    questions: [
      {
        id: 'orange-q1', type: 'colour-match', questionText: 'What colour am I?',
        options: [
          { id: 'orange-q1-a', text: null, colour: '#FFA500', icon: null },
          { id: 'orange-q1-b', text: null, colour: '#00FF00', icon: null },
          { id: 'orange-q1-c', text: null, colour: '#0000FF', icon: null },
          { id: 'orange-q1-d', text: null, colour: '#FF69B4', icon: null },
        ],
        correctOptionId: 'orange-q1-a',
        explanationCorrect: 'Yes! I am orange, of course!',
        explanationIncorrect: 'I am orange — the colour was named after me!',
      },
      {
        id: 'orange-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'orange-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'orange-q2-b', text: 'On a bush', colour: null, icon: '🌿' },
          { id: 'orange-q2-c', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'orange-q2-d', text: 'On the ground', colour: null, icon: '🌾' },
        ],
        correctOptionId: 'orange-q2-a',
        explanationCorrect: 'Right! I grow on orange trees in warm places!',
        explanationIncorrect: 'I actually grow on trees!',
      },
      {
        id: 'orange-q3', type: 'true-false', questionText: 'The colour orange was named after me. True or false?',
        options: [
          { id: 'orange-q3-a', text: 'True', colour: null, icon: null },
          { id: 'orange-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'orange-q3-a',
        explanationCorrect: 'Yes! The colour orange was named after the fruit!',
        explanationIncorrect: 'Actually, the colour really was named after the fruit!',
      },
      {
        id: 'orange-q4', type: 'odd-one-out', questionText: 'Which one is NOT a citrus fruit like me?',
        options: [
          { id: 'orange-q4-a', text: 'Lemon', colour: null, icon: null },
          { id: 'orange-q4-b', text: 'Lime', colour: null, icon: null },
          { id: 'orange-q4-c', text: 'Banana', colour: null, icon: null },
          { id: 'orange-q4-d', text: 'Grapefruit', colour: null, icon: null },
        ],
        correctOptionId: 'orange-q4-c',
        explanationCorrect: 'Right! Banana is not a citrus fruit!',
        explanationIncorrect: 'Banana is the odd one out — it is not citrus!',
      },
    ],
    surpriseFact: 'There are over 600 varieties of oranges grown around the world!',
    difficulty: 'easy',
  },
  {
    id: 'grape',
    name: 'Grape',
    image: '/images/catalogue/grape.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['green', 'red', 'purple'],
    growsOn: 'vine',
    origin: 'Middle East',
    season: 'autumn',
    funFacts: [
      { text: 'I grow in bunches on twisting vines!', highlightWord: 'vines', factType: 'growth' },
      { text: 'I can be green, red or deep purple!', highlightWord: 'purple', factType: 'colour' },
      { text: 'People have been growing me for over 8,000 years!', highlightWord: '8,000', factType: 'origin' },
    ],
    questions: [
      {
        id: 'grape-q1', type: 'colour-match', questionText: 'What colour can I be?',
        options: [
          { id: 'grape-q1-a', text: null, colour: '#800080', icon: null },
          { id: 'grape-q1-b', text: null, colour: '#0000FF', icon: null },
          { id: 'grape-q1-c', text: null, colour: '#FFA500', icon: null },
          { id: 'grape-q1-d', text: null, colour: '#FF69B4', icon: null },
        ],
        correctOptionId: 'grape-q1-a',
        explanationCorrect: 'Yes! Grapes can be purple, red or green!',
        explanationIncorrect: 'Grapes are often purple, red or green!',
      },
      {
        id: 'grape-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'grape-q2-a', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'grape-q2-b', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'grape-q2-c', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'grape-q2-d', text: 'On a bush', colour: null, icon: '🌿' },
        ],
        correctOptionId: 'grape-q2-a',
        explanationCorrect: 'Right! I grow on vines!',
        explanationIncorrect: 'I actually grow on vines in bunches!',
      },
      {
        id: 'grape-q3', type: 'true-false', questionText: 'I grow in bunches. True or false?',
        options: [
          { id: 'grape-q3-a', text: 'True', colour: null, icon: null },
          { id: 'grape-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'grape-q3-a',
        explanationCorrect: 'Yes! Grapes grow in lovely bunches!',
        explanationIncorrect: 'Actually, grapes do grow in bunches on vines!',
      },
      {
        id: 'grape-q4', type: 'odd-one-out', questionText: 'Which one does NOT grow on a vine?',
        options: [
          { id: 'grape-q4-a', text: 'Grape', colour: null, icon: null },
          { id: 'grape-q4-b', text: 'Passion fruit', colour: null, icon: null },
          { id: 'grape-q4-c', text: 'Kiwi', colour: null, icon: null },
          { id: 'grape-q4-d', text: 'Apple', colour: null, icon: null },
        ],
        correctOptionId: 'grape-q4-d',
        explanationCorrect: 'Right! Apples grow on trees, not vines!',
        explanationIncorrect: 'Apple is the odd one — it grows on a tree!',
      },
    ],
    surpriseFact: 'It takes about 2.5 pounds of grapes to make one bottle of grape juice!',
    difficulty: 'easy',
  },
  {
    id: 'pear',
    name: 'Pear',
    image: '/images/catalogue/pear.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['green', 'yellow', 'red'],
    growsOn: 'tree',
    origin: 'Europe',
    season: 'autumn',
    funFacts: [
      { text: 'I am related to the rose flower — we are family!', highlightWord: 'rose', factType: 'family' },
      { text: 'I ripen best after I am picked from the tree!', highlightWord: 'ripen', factType: 'growth' },
      { text: 'I can be green, yellow or even red!', highlightWord: 'green', factType: 'colour' },
    ],
    questions: [
      {
        id: 'pear-q1', type: 'colour-match', questionText: 'What colour am I most often?',
        options: [
          { id: 'pear-q1-a', text: null, colour: '#90EE90', icon: null },
          { id: 'pear-q1-b', text: null, colour: '#0000FF', icon: null },
          { id: 'pear-q1-c', text: null, colour: '#FF69B4', icon: null },
          { id: 'pear-q1-d', text: null, colour: '#800080', icon: null },
        ],
        correctOptionId: 'pear-q1-a',
        explanationCorrect: 'Yes! Pears are often green or yellow!',
        explanationIncorrect: 'Pears are usually green, yellow or red!',
      },
      {
        id: 'pear-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'pear-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'pear-q2-b', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'pear-q2-c', text: 'On a bush', colour: null, icon: '🌿' },
          { id: 'pear-q2-d', text: 'Underground', colour: null, icon: '🕳️' },
        ],
        correctOptionId: 'pear-q2-a',
        explanationCorrect: 'Right! I grow on pear trees!',
        explanationIncorrect: 'I actually grow on trees!',
      },
      {
        id: 'pear-q3', type: 'true-false', questionText: 'I am related to roses. True or false?',
        options: [
          { id: 'pear-q3-a', text: 'True', colour: null, icon: null },
          { id: 'pear-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'pear-q3-a',
        explanationCorrect: 'Yes! Pears belong to the rose family!',
        explanationIncorrect: 'Surprise! Pears really are in the rose family!',
      },
      {
        id: 'pear-q4', type: 'odd-one-out', questionText: 'Which one is NOT in the rose family?',
        options: [
          { id: 'pear-q4-a', text: 'Pear', colour: null, icon: null },
          { id: 'pear-q4-b', text: 'Apple', colour: null, icon: null },
          { id: 'pear-q4-c', text: 'Cherry', colour: null, icon: null },
          { id: 'pear-q4-d', text: 'Banana', colour: null, icon: null },
        ],
        correctOptionId: 'pear-q4-d',
        explanationCorrect: 'Right! Banana is not in the rose family!',
        explanationIncorrect: 'Banana is the odd one — pear, apple and cherry are all in the rose family!',
      },
    ],
    surpriseFact: 'Pears ripen from the inside out, which is why they can feel hard on the outside!',
    difficulty: 'easy',
  },
  {
    id: 'peach',
    name: 'Peach',
    image: '/images/catalogue/peach.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['orange', 'pink', 'yellow'],
    growsOn: 'tree',
    origin: 'China',
    season: 'summer',
    funFacts: [
      { text: 'I have soft fuzzy skin that feels like velvet!', highlightWord: 'fuzzy', factType: 'surprise' },
      { text: 'I originally came from China over 8,000 years ago!', highlightWord: 'China', factType: 'origin' },
      { text: 'My skin is a beautiful mix of orange and pink!', highlightWord: 'orange', factType: 'colour' },
    ],
    questions: [
      {
        id: 'peach-q1', type: 'colour-match', questionText: 'What colour am I?',
        options: [
          { id: 'peach-q1-a', text: null, colour: '#FFCC99', icon: null },
          { id: 'peach-q1-b', text: null, colour: '#0000FF', icon: null },
          { id: 'peach-q1-c', text: null, colour: '#800080', icon: null },
          { id: 'peach-q1-d', text: null, colour: '#00FF00', icon: null },
        ],
        correctOptionId: 'peach-q1-a',
        explanationCorrect: 'Yes! I am a peachy orange-pink colour!',
        explanationIncorrect: 'I am actually a peachy orange-pink!',
      },
      {
        id: 'peach-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'peach-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'peach-q2-b', text: 'On the ground', colour: null, icon: '🌾' },
          { id: 'peach-q2-c', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'peach-q2-d', text: 'Underground', colour: null, icon: '🕳️' },
        ],
        correctOptionId: 'peach-q2-a',
        explanationCorrect: 'Right! I grow on peach trees!',
        explanationIncorrect: 'I actually grow on trees!',
      },
      {
        id: 'peach-q3', type: 'true-false', questionText: 'I have fuzzy skin. True or false?',
        options: [
          { id: 'peach-q3-a', text: 'True', colour: null, icon: null },
          { id: 'peach-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'peach-q3-a',
        explanationCorrect: 'Yes! Peaches have lovely soft fuzzy skin!',
        explanationIncorrect: 'Actually, peaches do have fuzzy skin!',
      },
      {
        id: 'peach-q4', type: 'odd-one-out', questionText: 'Which one does NOT have a stone inside?',
        options: [
          { id: 'peach-q4-a', text: 'Peach', colour: null, icon: null },
          { id: 'peach-q4-b', text: 'Plum', colour: null, icon: null },
          { id: 'peach-q4-c', text: 'Cherry', colour: null, icon: null },
          { id: 'peach-q4-d', text: 'Banana', colour: null, icon: null },
        ],
        correctOptionId: 'peach-q4-d',
        explanationCorrect: 'Right! Bananas do not have a stone inside!',
        explanationIncorrect: 'Banana is the odd one — it has no stone!',
      },
    ],
    surpriseFact: 'Peaches and almonds are actually cousins — they are in the same family!',
    difficulty: 'easy',
  },
  {
    id: 'plum',
    name: 'Plum',
    image: '/images/catalogue/plum.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['purple', 'red', 'yellow'],
    growsOn: 'tree',
    origin: 'China',
    season: 'summer',
    funFacts: [
      { text: 'I am one of the oldest fruits people have grown!', highlightWord: 'oldest', factType: 'origin' },
      { text: 'When dried, I become a prune!', highlightWord: 'prune', factType: 'surprise' },
      { text: 'My skin is usually a deep purple colour!', highlightWord: 'purple', factType: 'colour' },
    ],
    questions: [
      {
        id: 'plum-q1', type: 'colour-match', questionText: 'What colour am I usually?',
        options: [
          { id: 'plum-q1-a', text: null, colour: '#800080', icon: null },
          { id: 'plum-q1-b', text: null, colour: '#FFA500', icon: null },
          { id: 'plum-q1-c', text: null, colour: '#00FF00', icon: null },
          { id: 'plum-q1-d', text: null, colour: '#FFFFFF', icon: null },
        ],
        correctOptionId: 'plum-q1-a',
        explanationCorrect: 'Yes! Plums are usually purple!',
        explanationIncorrect: 'Plums are most often purple!',
      },
      {
        id: 'plum-q2', type: 'true-false', questionText: 'When I am dried, I am called a prune. True or false?',
        options: [
          { id: 'plum-q2-a', text: 'True', colour: null, icon: null },
          { id: 'plum-q2-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'plum-q2-a',
        explanationCorrect: 'Yes! Dried plums are called prunes!',
        explanationIncorrect: 'Actually, dried plums really are called prunes!',
      },
      {
        id: 'plum-q3', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'plum-q3-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'plum-q3-b', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'plum-q3-c', text: 'On the ground', colour: null, icon: '🌾' },
          { id: 'plum-q3-d', text: 'Underground', colour: null, icon: '🕳️' },
        ],
        correctOptionId: 'plum-q3-a',
        explanationCorrect: 'Right! I grow on plum trees!',
        explanationIncorrect: 'I actually grow on trees!',
      },
      {
        id: 'plum-q4', type: 'odd-one-out', questionText: 'Which one is NOT purple?',
        options: [
          { id: 'plum-q4-a', text: 'Plum', colour: null, icon: null },
          { id: 'plum-q4-b', text: 'Aubergine', colour: null, icon: null },
          { id: 'plum-q4-c', text: 'Carrot', colour: null, icon: null },
          { id: 'plum-q4-d', text: 'Grape', colour: null, icon: null },
        ],
        correctOptionId: 'plum-q4-c',
        explanationCorrect: 'Right! Carrots are usually orange, not purple!',
        explanationIncorrect: 'Carrot is the odd one — it is usually orange!',
      },
    ],
    surpriseFact: 'There are over 2,000 varieties of plums around the world!',
    difficulty: 'easy',
  },
  {
    id: 'cherry',
    name: 'Cherry',
    image: '/images/catalogue/cherry.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['red', 'dark red'],
    growsOn: 'tree',
    origin: 'Europe',
    season: 'summer',
    funFacts: [
      { text: 'I grow in pairs hanging from my stem!', highlightWord: 'pairs', factType: 'growth' },
      { text: 'I am a bright shiny red when ripe!', highlightWord: 'red', factType: 'colour' },
      { text: 'Cherry trees have beautiful blossom in spring!', highlightWord: 'blossom', factType: 'growth' },
    ],
    questions: [
      {
        id: 'cherry-q1', type: 'colour-match', questionText: 'What colour am I?',
        options: [
          { id: 'cherry-q1-a', text: null, colour: '#DC143C', icon: null },
          { id: 'cherry-q1-b', text: null, colour: '#00FF00', icon: null },
          { id: 'cherry-q1-c', text: null, colour: '#0000FF', icon: null },
          { id: 'cherry-q1-d', text: null, colour: '#FFD700', icon: null },
        ],
        correctOptionId: 'cherry-q1-a',
        explanationCorrect: 'Yes! Cherries are red!',
        explanationIncorrect: 'Cherries are bright red!',
      },
      {
        id: 'cherry-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'cherry-q2-a', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'cherry-q2-b', text: 'On a bush', colour: null, icon: '🌿' },
          { id: 'cherry-q2-c', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'cherry-q2-d', text: 'On the ground', colour: null, icon: '🌾' },
        ],
        correctOptionId: 'cherry-q2-a',
        explanationCorrect: 'Right! I grow on cherry trees!',
        explanationIncorrect: 'I actually grow on cherry trees!',
      },
      {
        id: 'cherry-q3', type: 'true-false', questionText: 'I often grow in pairs. True or false?',
        options: [
          { id: 'cherry-q3-a', text: 'True', colour: null, icon: null },
          { id: 'cherry-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'cherry-q3-a',
        explanationCorrect: 'Yes! Cherries often hang in pairs from their stems!',
        explanationIncorrect: 'Actually, cherries really do grow in pairs!',
      },
      {
        id: 'cherry-q4', type: 'odd-one-out', questionText: 'Which one is NOT red?',
        options: [
          { id: 'cherry-q4-a', text: 'Cherry', colour: null, icon: null },
          { id: 'cherry-q4-b', text: 'Strawberry', colour: null, icon: null },
          { id: 'cherry-q4-c', text: 'Raspberry', colour: null, icon: null },
          { id: 'cherry-q4-d', text: 'Blueberry', colour: null, icon: null },
        ],
        correctOptionId: 'cherry-q4-d',
        explanationCorrect: 'Right! Blueberries are blue, not red!',
        explanationIncorrect: 'Blueberry is the odd one — it is blue!',
      },
    ],
    surpriseFact: 'Japan holds a special cherry blossom festival called Hanami every spring!',
    difficulty: 'easy',
  },
  {
    id: 'melon',
    name: 'Melon',
    image: '/images/catalogue/melon.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['green', 'orange', 'yellow'],
    growsOn: 'ground',
    origin: 'Africa',
    season: 'summer',
    funFacts: [
      { text: 'I am about 90% water inside — so refreshing!', highlightWord: 'water', factType: 'nutrition' },
      { text: 'I grow along the ground on spreading vines!', highlightWord: 'ground', factType: 'growth' },
      { text: 'I first grew in hot parts of Africa!', highlightWord: 'Africa', factType: 'origin' },
    ],
    questions: [
      {
        id: 'melon-q1', type: 'colour-match', questionText: 'What colour is my flesh inside?',
        options: [
          { id: 'melon-q1-a', text: null, colour: '#FFA500', icon: null },
          { id: 'melon-q1-b', text: null, colour: '#0000FF', icon: null },
          { id: 'melon-q1-c', text: null, colour: '#800080', icon: null },
          { id: 'melon-q1-d', text: null, colour: '#000000', icon: null },
        ],
        correctOptionId: 'melon-q1-a',
        explanationCorrect: 'Yes! Melons are often orange or green inside!',
        explanationIncorrect: 'Melons are usually orange or green inside!',
      },
      {
        id: 'melon-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'melon-q2-a', text: 'On the ground', colour: null, icon: '🌾' },
          { id: 'melon-q2-b', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'melon-q2-c', text: 'On a bush', colour: null, icon: '🌿' },
          { id: 'melon-q2-d', text: 'Underground', colour: null, icon: '🕳️' },
        ],
        correctOptionId: 'melon-q2-a',
        explanationCorrect: 'Right! I grow along the ground on vines!',
        explanationIncorrect: 'I actually grow on the ground!',
      },
      {
        id: 'melon-q3', type: 'true-false', questionText: 'I am about 90% water. True or false?',
        options: [
          { id: 'melon-q3-a', text: 'True', colour: null, icon: null },
          { id: 'melon-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'melon-q3-a',
        explanationCorrect: 'Yes! Melons are mostly water inside!',
        explanationIncorrect: 'Actually, melons really are about 90% water!',
      },
      {
        id: 'melon-q4', type: 'odd-one-out', questionText: 'Which one does NOT grow on the ground?',
        options: [
          { id: 'melon-q4-a', text: 'Melon', colour: null, icon: null },
          { id: 'melon-q4-b', text: 'Pumpkin', colour: null, icon: null },
          { id: 'melon-q4-c', text: 'Cucumber', colour: null, icon: null },
          { id: 'melon-q4-d', text: 'Apple', colour: null, icon: null },
        ],
        correctOptionId: 'melon-q4-d',
        explanationCorrect: 'Right! Apples grow on trees, not on the ground!',
        explanationIncorrect: 'Apple is the odd one — it grows on a tree!',
      },
    ],
    surpriseFact: 'Watermelons are actually related to cucumbers and pumpkins!',
    difficulty: 'easy',
  },
  {
    id: 'kiwi',
    name: 'Kiwi',
    image: '/images/catalogue/kiwi.webp',
    category: 'fruit',
    subcategory: 'common',
    colours: ['brown', 'green'],
    growsOn: 'vine',
    origin: 'China',
    season: 'winter',
    funFacts: [
      { text: 'I have fuzzy brown skin but bright green flesh!', highlightWord: 'green', factType: 'colour' },
      { text: 'I was named after the kiwi bird from New Zealand!', highlightWord: 'kiwi', factType: 'origin' },
      { text: 'I have more vitamin C than an orange!', highlightWord: 'vitamin', factType: 'nutrition' },
    ],
    questions: [
      {
        id: 'kiwi-q1', type: 'colour-match', questionText: 'What colour is my flesh inside?',
        options: [
          { id: 'kiwi-q1-a', text: null, colour: '#32CD32', icon: null },
          { id: 'kiwi-q1-b', text: null, colour: '#FF0000', icon: null },
          { id: 'kiwi-q1-c', text: null, colour: '#0000FF', icon: null },
          { id: 'kiwi-q1-d', text: null, colour: '#800080', icon: null },
        ],
        correctOptionId: 'kiwi-q1-a',
        explanationCorrect: 'Yes! Kiwis are bright green inside!',
        explanationIncorrect: 'Kiwis have bright green flesh inside!',
      },
      {
        id: 'kiwi-q2', type: 'where-grow', questionText: 'Where do I grow?',
        options: [
          { id: 'kiwi-q2-a', text: 'On a vine', colour: null, icon: '🌱' },
          { id: 'kiwi-q2-b', text: 'On a tree', colour: null, icon: '🌳' },
          { id: 'kiwi-q2-c', text: 'Underground', colour: null, icon: '🕳️' },
          { id: 'kiwi-q2-d', text: 'On a bush', colour: null, icon: '🌿' },
        ],
        correctOptionId: 'kiwi-q2-a',
        explanationCorrect: 'Right! Kiwis grow on vines!',
        explanationIncorrect: 'Kiwis actually grow on vines!',
      },
      {
        id: 'kiwi-q3', type: 'true-false', questionText: 'I was named after a bird. True or false?',
        options: [
          { id: 'kiwi-q3-a', text: 'True', colour: null, icon: null },
          { id: 'kiwi-q3-b', text: 'False', colour: null, icon: null },
        ],
        correctOptionId: 'kiwi-q3-a',
        explanationCorrect: 'Yes! Named after the kiwi bird from New Zealand!',
        explanationIncorrect: 'Actually, kiwi fruit was named after the kiwi bird!',
      },
      {
        id: 'kiwi-q4', type: 'odd-one-out', questionText: 'Which one is NOT green inside?',
        options: [
          { id: 'kiwi-q4-a', text: 'Kiwi', colour: null, icon: null },
          { id: 'kiwi-q4-b', text: 'Avocado', colour: null, icon: null },
          { id: 'kiwi-q4-c', text: 'Cucumber', colour: null, icon: null },
          { id: 'kiwi-q4-d', text: 'Mango', colour: null, icon: null },
        ],
        correctOptionId: 'kiwi-q4-d',
        explanationCorrect: 'Right! Mango is orange inside, not green!',
        explanationIncorrect: 'Mango is the odd one — it is orange inside!',
      },
    ],
    surpriseFact: 'Kiwi skin is actually edible and packed with nutrients!',
    difficulty: 'easy',
  },
