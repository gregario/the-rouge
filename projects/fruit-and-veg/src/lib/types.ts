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

export interface UserProgress {
  completedItems: string[]
  completedAt: Record<string, string>
  categoryBadges: string[]
  currentStreak: number
  longestStreak: number
  lastPlayedDate: string | null
  dailyStamps: string[]
  totalQuizCorrect: number
  totalQuizAnswered: number
}

export interface DailyChallenge {
  date: string
  featuredItemId: string
  reviewItemIds: string[]
  completedCards: string[]
  isComplete: boolean
}

export interface CategoryBadge {
  id: string
  name: string
  description: string
  category: Subcategory
  requiredItemIds: string[]
  icon: string
}
