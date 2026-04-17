import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SpecsTable } from '../specs-table'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/bridge-client', () => ({
  isBridgeEnabled: () => true,
  createBridgeProject: vi.fn(),
}))

describe('SpecsTable empty state', () => {
  it('renders a New spec CTA inside the empty state', () => {
    render(<SpecsTable specs={[]} />)
    expect(screen.getByText(/no specs yet/i)).toBeInTheDocument()
    // The NewProjectButton renders a button labelled "New spec"
    expect(screen.getByRole('button', { name: /new spec/i })).toBeInTheDocument()
  })
})
