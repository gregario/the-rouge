import { describe, it, expect } from 'vitest'
import { catalogue, catalogueById } from '@/data/catalogue'
import { getItemById, getItemsByCategory, getItemsBySubcategory, getCategoryColor } from '@/lib/catalogue'

describe('Catalogue helpers', () => {
  it('catalogueById provides O(1) lookup for all items', () => {
    for (const item of catalogue) {
      expect(catalogueById[item.id]).toBe(item)
    }
    expect(Object.keys(catalogueById).length).toBe(catalogue.length)
  })

  it('getItemById returns correct item', () => {
    const item = getItemById(catalogue, 'apple')
    expect(item).toBeDefined()
    expect(item!.name).toBe('Apple')
  })

  it('getItemById returns undefined for non-existent ID', () => {
    expect(getItemById(catalogue, 'nonexistent')).toBeUndefined()
  })

  it('getItemsByCategory returns only items of that category', () => {
    const fruits = getItemsByCategory(catalogue, 'fruit')
    expect(fruits.length).toBeGreaterThan(0)
    for (const item of fruits) {
      expect(item.category).toBe('fruit')
    }
  })

  it('getItemsBySubcategory returns only items of that subcategory', () => {
    const tropical = getItemsBySubcategory(catalogue, 'tropical')
    expect(tropical.length).toBeGreaterThan(0)
    for (const item of tropical) {
      expect(item.subcategory).toBe('tropical')
    }
  })

  it('getCategoryColor returns CSS custom properties', () => {
    expect(getCategoryColor('fruit')).toBe('var(--color-cat-fruit)')
    expect(getCategoryColor('vegetable')).toBe('var(--color-cat-vegetable)')
    expect(getCategoryColor('berry')).toBe('var(--color-cat-berry)')
  })

  // AC-DAILY-11: Difficulty progression
  describe('AC-DAILY-11: catalogue has both difficulty levels', () => {
    it('has easy and medium difficulty items', () => {
      const easy = catalogue.filter(i => i.difficulty === 'easy')
      const medium = catalogue.filter(i => i.difficulty === 'medium')
      expect(easy.length).toBeGreaterThan(0)
      expect(medium.length).toBeGreaterThan(0)
    })
  })
})
