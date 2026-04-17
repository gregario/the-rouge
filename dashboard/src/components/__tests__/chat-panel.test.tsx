import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ChatPanel } from '../chat-panel'
import type { ChatMessage } from '@/lib/types'

const messages: ChatMessage[] = [
  {
    id: 'msg-1',
    role: 'rouge',
    type: 'question',
    discipline: 'brainstorming',
    content: 'What problem are you solving?',
    reasoning: 'There are many ambient sound apps. Need to narrow the use case.',
    options: [
      { label: 'A', text: 'Deep focus' },
      { label: 'B', text: 'Sleep' },
    ],
    timestamp: '2026-04-01T09:01:00Z',
  },
  {
    id: 'msg-2',
    role: 'human',
    type: 'answer',
    content: 'A — deep focus.',
    timestamp: '2026-04-01T09:05:00Z',
  },
  {
    id: 'msg-3',
    role: 'rouge',
    type: 'transition',
    discipline: 'competition',
    content: 'Starting competition review.',
    timestamp: '2026-04-01T09:43:00Z',
  },
]

describe('ChatPanel', () => {
  it('renders all messages', () => {
    render(<ChatPanel messages={messages} />)
    const msgs = screen.getAllByTestId('chat-message')
    expect(msgs).toHaveLength(3)
  })

  it('has a textarea input', () => {
    render(<ChatPanel messages={messages} />)
    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
  })

  it('has a send button', () => {
    render(<ChatPanel messages={messages} />)
    expect(screen.getByTestId('send-button')).toBeInTheDocument()
  })

  it('shows reasoning on expand', () => {
    render(<ChatPanel messages={messages} />)
    const trigger = screen.getAllByTestId('reasoning-trigger')[0]
    expect(screen.queryByTestId('reasoning-content')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByTestId('reasoning-content')).toBeInTheDocument()
    expect(screen.getByTestId('reasoning-content')).toHaveTextContent(
      'There are many ambient sound apps'
    )
  })

  it('renders options for question messages', () => {
    render(<ChatPanel messages={messages} />)
    expect(screen.getByTestId('chat-options')).toBeInTheDocument()
    expect(screen.getByText('Deep focus')).toBeInTheDocument()
    expect(screen.getByText('Sleep')).toBeInTheDocument()
  })

  it('renders human messages with distinct role', () => {
    render(<ChatPanel messages={messages} />)
    const humanMsg = screen.getByText('A — deep focus.')
    expect(humanMsg.closest('[data-testid="chat-message"]')).toHaveAttribute(
      'data-role',
      'human'
    )
  })

  it('shows resume button when paused', () => {
    render(<ChatPanel messages={messages} isPaused />)
    expect(screen.getByTestId('resume-button')).toBeInTheDocument()
  })

  it('does not show resume button when not paused', () => {
    render(<ChatPanel messages={messages} />)
    expect(screen.queryByTestId('resume-button')).not.toBeInTheDocument()
  })

  describe('progression signals', () => {
    const groupedMessages: ChatMessage[] = [
      {
        id: 'b-1',
        role: 'rouge',
        type: 'question',
        discipline: 'brainstorming',
        content: 'Brainstorming question.',
        timestamp: '2026-04-01T09:00:00Z',
      },
      {
        id: 'c-1',
        role: 'rouge',
        type: 'question',
        discipline: 'competition',
        content: 'Competition question.',
        timestamp: '2026-04-01T09:05:00Z',
      },
    ]

    it('renders a transition banner after a completed discipline', () => {
      render(
        <ChatPanel
          messages={groupedMessages}
          completedDisciplines={['brainstorming']}
          currentDiscipline="competition"
        />,
      )
      const banner = screen.getByTestId('discipline-transition-banner')
      expect(banner).toHaveTextContent(/Brainstorming complete/i)
      expect(banner).toHaveTextContent(/now in Competition/i)
    })

    it('does not render a transition banner when no discipline is complete', () => {
      render(
        <ChatPanel
          messages={groupedMessages}
          completedDisciplines={[]}
          currentDiscipline="brainstorming"
        />,
      )
      expect(screen.queryByTestId('discipline-transition-banner')).not.toBeInTheDocument()
    })
  })
})
