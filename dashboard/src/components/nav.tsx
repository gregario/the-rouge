'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { catalogue } from '@/data/catalogue'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/platform', label: 'Platform' },
  { href: '/catalogue', label: 'Catalogue' },
]

function RougeLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-red-500">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8 8h4a3 3 0 010 6h-1l3 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function Nav() {
  const pathname = usePathname()

  // Build breadcrumbs for project pages
  const projectMatch = pathname.match(/^\/projects\/(.+)$/)
  const breadcrumb = projectMatch ? projectMatch[1] : null

  // Build breadcrumbs for catalogue entity pages
  const catalogueMatch = pathname.match(/^\/catalogue\/(.+)$/)
  const catalogueEntity = catalogueMatch
    ? catalogue.find((e) => e.id === catalogueMatch[1])
    : null

  return (
    <nav className="flex h-16 items-center border-b border-gray-200 bg-white px-6">
      <Link href="/" className="mr-6 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground">
        <RougeLogo />
        Rouge
      </Link>
      <div className="flex gap-1">
        {links.map((link) => {
          const isActive =
            link.href === '/'
              ? pathname === '/'
              : pathname.startsWith(link.href)

          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>

      {/* Breadcrumb for project pages */}
      {breadcrumb && (
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground transition-colors">Dashboard</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{breadcrumb}</span>
        </div>
      )}

      {/* Breadcrumb for catalogue entity pages */}
      {catalogueEntity && (
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/catalogue" className="hover:text-foreground transition-colors">Catalogue</Link>
          <span>/</span>
          <span className="text-foreground font-medium">{catalogueEntity.name}</span>
        </div>
      )}
    </nav>
  )
}
