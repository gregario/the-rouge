import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock next/navigation
let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

// Mock next/link as simple anchor
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import { BottomNav } from '@/components/BottomNav'

describe('BottomNav', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  it('renders 3 tabs with correct labels', () => {
    render(<BottomNav />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Book')).toBeInTheDocument()
    expect(screen.getByText('Garden')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
  })

  it('has role="tablist" on nav and role="tab" on each tab for accessibility', () => {
    render(<BottomNav />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Main navigation')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
  })

  // @criterion: AC-NAV-01
  // @criterion-hash: 64951c0aefaf
  describe('AC-NAV-01: App defaults to Home tab', () => {
    it('marks Home tab as active when path is "/"', () => {
      mockPathname = '/'
      render(<BottomNav />)
      const homeTab = screen.getByText('Home').closest('a')!
      expect(homeTab).toHaveAttribute('aria-selected', 'true')
    })

    it('marks other tabs as inactive when path is "/"', () => {
      mockPathname = '/'
      render(<BottomNav />)
      const bookTab = screen.getByText('Book').closest('a')!
      const gardenTab = screen.getByText('Garden').closest('a')!
      expect(bookTab).toHaveAttribute('aria-selected', 'false')
      expect(gardenTab).toHaveAttribute('aria-selected', 'false')
    })
  })

  // @criterion: AC-NAV-07
  // @criterion-hash: d41f4b79dd2a
  describe('AC-NAV-07: Selected tab is visually distinct', () => {
    it('applies aria-selected=true and font-bold to the active tab', () => {
      mockPathname = '/collection'
      render(<BottomNav />)
      const bookTab = screen.getByText('Book').closest('a')!
      expect(bookTab).toHaveAttribute('aria-selected', 'true')
      expect(bookTab.className).toContain('font-bold')
    })

    it('does not apply font-bold to inactive tabs', () => {
      mockPathname = '/collection'
      render(<BottomNav />)
      const homeTab = screen.getByText('Home').closest('a')!
      const gardenTab = screen.getByText('Garden').closest('a')!
      expect(homeTab).toHaveAttribute('aria-selected', 'false')
      expect(homeTab.className).not.toContain('font-bold')
      expect(gardenTab).toHaveAttribute('aria-selected', 'false')
      expect(gardenTab.className).not.toContain('font-bold')
    })
  })

  // @criterion: AC-NAV-08
  // @criterion-hash: 73599ea089c7
  describe('AC-NAV-08: All tap targets are minimum 44x44px', () => {
    it('each tab has min-w-[64px] and min-h-[64px] classes', () => {
      render(<BottomNav />)
      const tabs = screen.getAllByRole('tab')
      tabs.forEach((tab) => {
        expect(tab.className).toContain('min-w-[64px]')
        expect(tab.className).toContain('min-h-[64px]')
      })
    })
  })

  // @criterion: AC-NAV-09
  // @criterion-hash: a99802dc278f
  describe('AC-NAV-09: URL routing matches screen state', () => {
    it('activates Book tab for /collection path', () => {
      mockPathname = '/collection'
      render(<BottomNav />)
      const bookTab = screen.getByText('Book').closest('a')!
      expect(bookTab).toHaveAttribute('aria-selected', 'true')
      expect(bookTab).toHaveAttribute('href', '/collection')
    })

    it('activates Garden tab for /garden path', () => {
      mockPathname = '/garden'
      render(<BottomNav />)
      const gardenTab = screen.getByText('Garden').closest('a')!
      expect(gardenTab).toHaveAttribute('aria-selected', 'true')
      expect(gardenTab).toHaveAttribute('href', '/garden')
    })

    it('activates Book tab for nested /collection/tomato path', () => {
      mockPathname = '/collection/tomato'
      render(<BottomNav />)
      const bookTab = screen.getByText('Book').closest('a')!
      expect(bookTab).toHaveAttribute('aria-selected', 'true')
    })

    it('does not activate Home tab for non-root paths', () => {
      mockPathname = '/collection'
      render(<BottomNav />)
      const homeTab = screen.getByText('Home').closest('a')!
      expect(homeTab).toHaveAttribute('aria-selected', 'false')
    })
  })
})
