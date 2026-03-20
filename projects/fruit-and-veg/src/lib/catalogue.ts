import { CatalogueItem, Category } from './types'

let catalogueCache: CatalogueItem[] | null = null

export async function loadCatalogue(): Promise<CatalogueItem[]> {
  if (catalogueCache) return catalogueCache
  const data = await import('@/data/catalogue.json')
  catalogueCache = data.default as CatalogueItem[]
  return catalogueCache
}

export function getCatalogueSync(): CatalogueItem[] {
  return catalogueCache ?? []
}

export function getItemById(
  catalogue: CatalogueItem[],
  id: string
): CatalogueItem | undefined {
  return catalogue.find((item) => item.id === id)
}

export function getItemsByCategory(
  catalogue: CatalogueItem[],
  category: Category
): CatalogueItem[] {
  return catalogue.filter((item) => item.category === category)
}

export function getItemsBySubcategory(
  catalogue: CatalogueItem[],
  subcategory: string
): CatalogueItem[] {
  return catalogue.filter((item) => item.subcategory === subcategory)
}

export function getCategoryColor(category: Category): string {
  switch (category) {
    case 'fruit':
      return 'var(--color-cat-fruit)'
    case 'vegetable':
      return 'var(--color-cat-vegetable)'
    case 'berry':
      return 'var(--color-cat-berry)'
  }
}
