import { loadCatalogue } from '@/lib/catalogue'
import { AppShell } from '@/components/AppShell'
import GardenView from '@/components/GardenView'

export default async function GardenPage() {
  const catalogue = await loadCatalogue()

  return (
    <AppShell catalogue={catalogue}>
      <GardenView />
    </AppShell>
  )
}
