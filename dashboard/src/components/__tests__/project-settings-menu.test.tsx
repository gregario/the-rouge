import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectSettingsMenu } from '../project-settings-menu'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

describe('ProjectSettingsMenu', () => {
  it('opens a modal with a slug input when the gear is clicked', () => {
    render(<ProjectSettingsMenu slug="testimonials" state="seeding" />)
    fireEvent.click(screen.getByRole('button', { name: /project settings/i }))
    expect(screen.getByText(/project settings/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/url slug/i)).toHaveValue('testimonials')
  })

  it('disables the slug input once the build loop has started', () => {
    render(<ProjectSettingsMenu slug="my-app" state="story-building" />)
    fireEvent.click(screen.getByRole('button', { name: /project settings/i }))
    expect(screen.getByLabelText(/url slug/i)).toBeDisabled()
    expect(
      screen.getByText(/slug is locked once the build loop starts/i),
    ).toBeInTheDocument()
  })
})
