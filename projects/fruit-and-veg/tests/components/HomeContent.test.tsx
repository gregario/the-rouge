import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}))

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const Icon = (name: string) => (props: any) => <svg data-testid={`${name}-icon`} {...props} />
  return {
    Settings: Icon('settings'),
    X: Icon('close'),
    Cloud: Icon('cloud'),
    CloudOff: Icon('cloudoff'),
    Loader2: Icon('loader'),
    ChevronLeft: Icon('chevron-left'),
    Check: Icon('check'),
    Star: Icon('star'),
    Circle: Icon('circle'),
  }
})

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowser: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: null } }),
      signOut: () => Promise.resolve(),
    },
  }),
}))

// Mock accounts module
vi.mock('@/lib/accounts', () => ({
  createAccount: vi.fn(),
  signIn: vi.fn(),
  deleteAccount: vi.fn(),
  getProgress: vi.fn().mockResolvedValue(null),
  syncProgress: vi.fn().mockResolvedValue(null),
}))

import { AppProvider, useApp } from '@/lib/app-context'
import { HomeContent } from '@/app/HomeContent'
import type { CatalogueItem } from '@/lib/types'

function makeMockItem(id: string): CatalogueItem {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    image: `/images/catalogue/${id}.webp`,
    category: 'fruit',
    subcategory: 'common',
    colours: ['red'],
    growsOn: 'tree',
    origin: 'Worldwide',
    season: 'all-year',
    funFacts: [
      { text: 'I am tasty!', highlightWord: 'tasty', factType: 'surprise' },
      { text: 'I grow on trees!', highlightWord: 'trees', factType: 'growth' },
      { text: 'I am red!', highlightWord: 'red', factType: 'colour' },
    ],
    questions: [
      {
        id: `${id}-q1`,
        type: 'true-false',
        questionText: 'Is this a fruit?',
        options: [
          { id: 'yes', text: 'Yes', colour: null, icon: null },
          { id: 'no', text: 'No', colour: null, icon: null },
        ],
        correctOptionId: 'yes',
        explanationCorrect: 'Correct!',
        explanationIncorrect: 'Wrong!',
      },
    ],
    surpriseFact: null,
    difficulty: 'easy',
  }
}

const mockCatalogue = [makeMockItem('apple'), makeMockItem('banana'), makeMockItem('cherry')]

// Helper component that sets user via context and renders HomeContent
function HomeContentWithUser({ displayName }: { displayName?: string }) {
  const { setUser } = useApp()

  React.useEffect(() => {
    if (displayName) {
      setUser({
        id: 'test-user',
        email: 'parent@example.com',
        email_confirmed_at: '2024-01-01',
        user_metadata: { display_name: displayName },
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2024-01-01',
      } as any)
    }
  }, [displayName, setUser])

  return <HomeContent />
}

// ─── AC-ACCT-13: Display name shown in app ──────────────────────────────────
// @criterion: AC-ACCT-13
// @criterion-hash: bee381621b92
// GIVEN an account with displayName "Lily"
// WHEN the app loads
// THEN the home screen shows "Hi, Lily!" greeting
describe('AC-ACCT-13: display name shown in HomeContent', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('shows "Hi, Lily!" when displayName is "Lily"', () => {
    render(
      <AppProvider catalogue={mockCatalogue}>
        <HomeContentWithUser displayName="Lily" />
      </AppProvider>
    )
    expect(screen.getByText(/Hi, Lily!/)).toBeInTheDocument()
  })

  it('REGRESSION: AC-ACCT-13 — greeting must not be hardcoded to "Hi there!"', () => {
    render(
      <AppProvider catalogue={mockCatalogue}>
        <HomeContentWithUser displayName="Max" />
      </AppProvider>
    )
    // The greeting must use displayName, not a hardcoded string
    expect(screen.queryByText('Hi there!')).not.toBeInTheDocument()
    expect(screen.getByText(/Hi, Max!/)).toBeInTheDocument()
  })

  it('shows "Hi there!" when no displayName is set', () => {
    render(
      <AppProvider catalogue={mockCatalogue}>
        <HomeContentWithUser />
      </AppProvider>
    )
    expect(screen.getByText(/Hi there!/)).toBeInTheDocument()
  })
})
