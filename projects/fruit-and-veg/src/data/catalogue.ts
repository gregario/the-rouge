import type { CatalogueItem } from '@/lib/types'
import catalogueJson from './catalogue.json'

export const catalogue: CatalogueItem[] = catalogueJson as CatalogueItem[]

export const catalogueById: Record<string, CatalogueItem> = Object.fromEntries(
  catalogue.map(item => [item.id, item])
)
