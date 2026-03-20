import { loadCatalogue } from '@/lib/catalogue'
import { AppShell } from '@/components/AppShell'
import { HomeContent } from './HomeContent'

export default async function HomePage() {
  const catalogue = await loadCatalogue()

  return (
    <AppShell catalogue={catalogue}>
      <HomeContent />
    </AppShell>
  )
}
