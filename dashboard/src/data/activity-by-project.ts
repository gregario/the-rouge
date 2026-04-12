import type { ActivityEvent } from '@/lib/types'
import { epochTimerActivity, recipeOracleActivity, colorQuizActivity } from './activity'

/** Lookup activity events by project slug */
export const activityByProject: Record<string, ActivityEvent[]> = {
  'epoch-timer': epochTimerActivity,
  'recipe-oracle': recipeOracleActivity,
  'color-quiz': colorQuizActivity,
}

export function getProjectActivity(slug: string): ActivityEvent[] {
  return activityByProject[slug] ?? []
}
