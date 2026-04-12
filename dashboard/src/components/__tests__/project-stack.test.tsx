import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectStack } from '@/components/project-stack'

const mockStack = {
  components: ['nextjs', 'tailwind', 'shadcn-ui'],
  resources: ['supabase', 'cloudflare'],
  apis: ['supabase-auth-ssr'],
}

describe('ProjectStack', () => {
  it('renders three kind groups', () => {
    render(<ProjectStack stack={mockStack} />)
    expect(screen.getByText('Components')).toBeDefined()
    expect(screen.getByText('Resources')).toBeDefined()
    expect(screen.getByText('APIs')).toBeDefined()
  })

  it('renders entity names resolved from catalogue', () => {
    render(<ProjectStack stack={mockStack} />)
    expect(screen.getByText('Next.js')).toBeDefined()
    expect(screen.getByText('Supabase')).toBeDefined()
    expect(screen.getByText('Supabase Auth SSR')).toBeDefined()
  })

  it('renders items as links to catalogue detail', () => {
    render(<ProjectStack stack={mockStack} />)
    const link = screen.getByRole('link', { name: 'Next.js' })
    expect(link.getAttribute('href')).toBe('/catalogue/nextjs')
  })
})
