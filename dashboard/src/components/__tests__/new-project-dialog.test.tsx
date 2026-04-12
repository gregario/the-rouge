import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NewProjectDialog } from '@/components/new-project-dialog'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe('NewProjectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<NewProjectDialog open={false} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders form when open', () => {
    render(<NewProjectDialog open={true} onClose={() => {}} />)
    expect(screen.getByText('New Project')).toBeDefined()
    expect(screen.getByPlaceholderText('MTG Oracle')).toBeDefined()
    expect(screen.getByPlaceholderText('mtg-oracle')).toBeDefined()
  })

  it('auto-generates slug from name', async () => {
    const user = userEvent.setup()
    render(<NewProjectDialog open={true} onClose={() => {}} />)
    const nameInput = screen.getByPlaceholderText('MTG Oracle')
    await user.type(nameInput, 'My New App')
    const slugInput = screen.getByPlaceholderText('mtg-oracle') as HTMLInputElement
    expect(slugInput.value).toBe('my-new-app')
  })

  it('calls onClose when Cancel clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<NewProjectDialog open={true} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })
})
