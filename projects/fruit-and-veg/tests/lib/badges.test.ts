import { describe, it, expect } from 'vitest'
import { generateBadges, checkNewBadges } from '@/lib/badges'
import type { CatalogueItem } from '@/lib/types'

const makeMockItem = (id: string, subcategory: string): CatalogueItem => ({
  id,
  name: id,
  image: `/images/catalogue/${id}.webp`,
  category: 'fruit',
  subcategory: subcategory as CatalogueItem['subcategory'],
  colours: ['red'],
  growsOn: 'tree',
  origin: 'Worldwide',
  season: 'all-year',
  funFacts: [
    { text: 'I am tasty!', highlightWord: 'tasty', factType: 'surprise' },
    { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
    { text: 'I am red!', highlightWord: 'red', factType: 'colour' },
  ],
  questions: [],
  surpriseFact: null,
  difficulty: 'easy',
})

describe('badges', () => {
  const catalogue = [
    makeMockItem('mango', 'tropical'),
    makeMockItem('pineapple', 'tropical'),
    makeMockItem('coconut', 'tropical'),
    makeMockItem('carrot', 'root'),
    makeMockItem('potato', 'root'),
  ]

  describe('generateBadges', () => {
    it('creates badges for each subcategory', () => {
      const badges = generateBadges(catalogue)
      expect(badges.length).toBe(2) // tropical, root
      expect(badges.find(b => b.category === 'tropical')).toBeDefined()
      expect(badges.find(b => b.category === 'root')).toBeDefined()
    })

    it('includes all items in category', () => {
      const badges = generateBadges(catalogue)
      const tropical = badges.find(b => b.category === 'tropical')!
      expect(tropical.requiredItemIds).toEqual(['mango', 'pineapple', 'coconut'])
    })
  })

  describe('checkNewBadges', () => {
    it('returns empty when no badge completed', () => {
      const badges = generateBadges(catalogue)
      const earned = checkNewBadges(badges, ['mango', 'pineapple'], [])
      expect(earned).toHaveLength(0)
    })

    it('detects newly earned badge', () => {
      const badges = generateBadges(catalogue)
      const earned = checkNewBadges(badges, ['mango', 'pineapple', 'coconut'], [])
      expect(earned).toHaveLength(1)
      expect(earned[0].category).toBe('tropical')
    })

    it('does not re-award existing badges', () => {
      const badges = generateBadges(catalogue)
      const earned = checkNewBadges(
        badges,
        ['mango', 'pineapple', 'coconut'],
        ['badge-tropical']
      )
      expect(earned).toHaveLength(0)
    })
  })
})
