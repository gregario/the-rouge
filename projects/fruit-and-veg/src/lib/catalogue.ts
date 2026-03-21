import { CatalogueItem } from './types'
import { catalogue as catalogueData } from '@/data/catalogue'

export async function loadCatalogue(): Promise<CatalogueItem[]> {
  return catalogueData
}
