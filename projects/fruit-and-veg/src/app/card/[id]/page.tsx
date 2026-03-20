import Link from 'next/link'
import { loadCatalogue, getItemById } from '@/lib/catalogue'
import { AppShell } from '@/components/AppShell'
import { CardView } from '@/components/CardView'

interface Props {
  params: Promise<{ id: string }>
}

export default async function CardPage({ params }: Props) {
  const { id } = await params
  const catalogue = await loadCatalogue()
  const item = getItemById(catalogue, id)

  if (!item) {
    return (
      <AppShell catalogue={catalogue}>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Item not found</p>
          <Link
            href="/"
            className="text-primary font-semibold hover:underline"
          >
            Back to home
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell catalogue={catalogue}>
      <CardView item={item} />
    </AppShell>
  )
}
