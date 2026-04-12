import { catalogue } from '@/data/catalogue'
import { EntityDetail } from '@/components/entity-detail'
import { notFound } from 'next/navigation'

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const entity = catalogue.find(e => e.id === id)
  if (!entity) notFound()
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <EntityDetail entity={entity} allEntities={catalogue} />
    </div>
  )
}
