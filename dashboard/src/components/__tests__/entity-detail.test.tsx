import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EntityDetail } from '@/components/entity-detail'
import { catalogue } from '@/data/catalogue'

const supabase = catalogue.find(e => e.id === 'supabase')!
const stripeCheckout = catalogue.find(e => e.id === 'stripe-checkout')!

describe('EntityDetail', () => {
  it('renders entity name, kind, and type', () => {
    render(<EntityDetail entity={supabase} allEntities={catalogue} />)
    expect(screen.getByText('Supabase')).toBeDefined()
    expect(screen.getByText('Resource')).toBeDefined()
    expect(screen.getByText('service')).toBeDefined()
  })

  it('renders capabilities', () => {
    render(<EntityDetail entity={supabase} allEntities={catalogue} />)
    expect(screen.getByText('database')).toBeDefined()
    expect(screen.getByText('auth')).toBeDefined()
  })

  it('renders usedBy project list', () => {
    render(<EntityDetail entity={supabase} allEntities={catalogue} />)
    expect(screen.getByText(/Used by/)).toBeDefined()
  })

  it('renders dependsOn as links for API entities', () => {
    render(<EntityDetail entity={stripeCheckout} allEntities={catalogue} />)
    expect(screen.getByText(/Depends on/)).toBeDefined()
    expect(screen.getByText('Stripe')).toBeDefined()
  })

  it('renders lifecycle badge', () => {
    render(<EntityDetail entity={supabase} allEntities={catalogue} />)
    expect(screen.getByText('production')).toBeDefined()
  })
})
