'use client'

import { usePathname } from 'next/navigation'
import { AppProvider } from '@/lib/app-context'
import { BottomNav } from './BottomNav'
import { SettingsButton } from './SettingsButton'
import type { CatalogueItem } from '@/lib/types'

export function AppShell({
  catalogue,
  children,
}: {
  catalogue: CatalogueItem[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isCardView = pathname.startsWith('/card/')

  return (
    <AppProvider catalogue={catalogue}>
      <div className="min-h-screen flex flex-col">
        {!isCardView && (
          <header className="flex items-center justify-between px-4 py-3 max-w-[480px] mx-auto w-full">
            <div />
            <SettingsButton />
          </header>
        )}
        <main className={`flex-1 max-w-[480px] mx-auto w-full px-4 ${isCardView ? '' : 'pb-20'}`}>
          {children}
        </main>
        {!isCardView && <BottomNav />}
      </div>
    </AppProvider>
  )
}
