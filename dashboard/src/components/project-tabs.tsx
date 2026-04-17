'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type Tab = 'spec' | 'build'

export function ProjectTabs({
  defaultTab,
  buildDisabled,
  specContent,
  buildContent,
}: {
  defaultTab: Tab
  buildDisabled: boolean
  specContent: React.ReactNode
  buildContent: React.ReactNode
}) {
  const [active, setActive] = useState<Tab>(defaultTab)

  // When the page recomputes defaultTab — most commonly on the 'spec' →
  // 'build' transition after the user presses Start and the build-status
  // poll picks up the running subprocess — sync the active tab so the
  // user is taken to Build automatically. Depending only on defaultTab
  // (not on every render) means a user's explicit click to Spec after
  // that initial flip is preserved: defaultTab won't change again while
  // the build keeps running.
  useEffect(() => {
    setActive(defaultTab)
  }, [defaultTab])

  function tabClass(isActive: boolean, isDisabled = false) {
    if (isDisabled) return 'cursor-not-allowed pb-2 text-gray-300'
    return cn(
      'pb-2',
      isActive
        ? 'border-b-2 border-gray-900 font-semibold text-gray-900'
        : 'text-gray-500 hover:text-gray-700'
    )
  }

  return (
    <div>
      <div className="mb-6 flex gap-6 border-b border-gray-200">
        <button
          role="tab"
          aria-selected={active === 'spec'}
          onClick={() => setActive('spec')}
          className={tabClass(active === 'spec')}
        >
          Spec
        </button>
        <button
          role="tab"
          aria-selected={active === 'build'}
          disabled={buildDisabled}
          onClick={() => !buildDisabled && setActive('build')}
          title={
            buildDisabled
              ? 'Build not started yet — awaiting seeding approval'
              : undefined
          }
          className={tabClass(active === 'build', buildDisabled)}
        >
          Build
        </button>
      </div>
      <div>{active === 'spec' ? specContent : buildContent}</div>
    </div>
  )
}
