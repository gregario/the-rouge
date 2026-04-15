import { catalogue } from '@/data/catalogue'
import { CatalogueTabs } from '@/components/catalogue-tabs'
import { Beaker } from 'lucide-react'

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
      <p className="mb-4 text-sm text-muted-foreground">
        Available technologies, services, and integration patterns.
      </p>

      {/* Static-data disclosure. The catalogue ships as a curated seed
          taxonomy so Rouge has a shared vocabulary on day one. Wiring each
          entry to live per-project usage (which builds actually depend on
          Supabase, how the Cloudflare slot is filled, etc.) is a
          contribution opportunity — see CONTRIBUTING.md. */}
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
        <Beaker className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
        <div>
          <p className="font-medium">Seed taxonomy — not yet live state.</p>
          <p className="mt-0.5 text-xs text-violet-800">
            The catalogue ships with a curated starter set so every Rouge
            install speaks the same vocabulary on day one. Turning it into
            live project inventory — which builds actually use which
            entries, quota headroom per integration, real-time status — is
            an open contribution. See
            {' '}
            <a className="underline underline-offset-2" href="https://github.com/gregario/the-rouge/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">
              CONTRIBUTING.md
            </a>.
          </p>
        </div>
      </div>

      {/* Catalogue browser */}
      <CatalogueTabs entities={catalogue} />
    </div>
  )
}
