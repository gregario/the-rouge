'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Flower2 } from 'lucide-react'

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/collection', label: 'Book', icon: BookOpen },
  { href: '/garden', label: 'Garden', icon: Flower2 },
] as const

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50"
      role="tablist"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around max-w-[480px] mx-auto h-16">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              role="tab"
              aria-selected={isActive}
              onKeyDown={(e) => {
                if (e.key === ' ') {
                  e.preventDefault()
                  e.currentTarget.click()
                }
              }}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[64px] px-3 py-1 transition-colors ${
                isActive
                  ? 'text-primary font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={28} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-xs mt-0.5 ${isActive ? 'font-bold' : 'font-semibold'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
