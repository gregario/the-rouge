import { catalogue } from '@/data/catalogue'
import { CatalogueTabs } from '@/components/catalogue-tabs'

export default function CataloguePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Catalogue</h1>
        <span
          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-gray-600"
          data-testid="catalogue-count"
        >
          {catalogue.length}
        </span>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Available technologies, services, and integration patterns.
      </p>

      {/* Catalogue browser */}
      <CatalogueTabs entities={catalogue} />
    </div>
  )
}
