import { loadCatalogue } from '@/lib/catalogue'
import { AppShell } from '@/components/AppShell'
import CollectionView from '@/components/CollectionView'

export default async function CollectionPage() {
  const catalogue = await loadCatalogue()

  return (
    <AppShell catalogue={catalogue}>
      <CollectionView />
    </AppShell>
  )
}
