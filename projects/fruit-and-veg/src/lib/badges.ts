import { CategoryBadge, CatalogueItem, Subcategory } from './types'

export function generateBadges(catalogue: CatalogueItem[]): CategoryBadge[] {
  const subcategories = new Map<Subcategory, CatalogueItem[]>()

  for (const item of catalogue) {
    const existing = subcategories.get(item.subcategory) || []
    existing.push(item)
    subcategories.set(item.subcategory, existing)
  }

  const badgeNames: Record<Subcategory, { name: string; description: string }> = {
    'tropical': { name: 'Tropical Explorer', description: 'You learned ALL the tropical fruits!' },
    'citrus': { name: 'Citrus Champion', description: 'You know every citrus fruit!' },
    'stone-fruit': { name: 'Stone Fruit Star', description: 'You mastered all the stone fruits!' },
    'root': { name: 'Root Ranger', description: 'You dug up all the root veggies!' },
    'leafy': { name: 'Leafy Legend', description: 'You know every leafy green!' },
    'legume': { name: 'Legume Leader', description: 'You learned all the legumes!' },
    'allium': { name: 'Allium Ace', description: 'You know the whole onion family!' },
    'gourd': { name: 'Gourd Guru', description: 'You mastered all the gourds!' },
    'common': { name: 'Common Collector', description: 'You collected all the common ones!' },
    'exotic': { name: 'Exotic Explorer', description: 'You discovered all the exotic veggies!' },
  }

  const badges: CategoryBadge[] = []
  for (const [subcat, items] of subcategories) {
    const info = badgeNames[subcat]
    badges.push({
      id: `badge-${subcat}`,
      name: info.name,
      description: info.description,
      category: subcat,
      requiredItemIds: items.map(i => i.id),
      icon: `/images/badges/${subcat}.webp`,
    })
  }

  return badges
}

export function checkNewBadges(
  badges: CategoryBadge[],
  completedItems: string[],
  existingBadges: string[],
): CategoryBadge[] {
  return badges.filter(badge => {
    if (existingBadges.includes(badge.id)) return false
    return badge.requiredItemIds.every(id => completedItems.includes(id))
  })
}
