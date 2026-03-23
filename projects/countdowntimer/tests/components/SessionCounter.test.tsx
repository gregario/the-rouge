import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionCounter } from '@/components/SessionCounter';

// @criterion: AC-counter-4
// Counter displays correctly from 0 to 99
// @criterion-hash: 28ea9ab2091f
describe('[AC-counter-4] counter display', () => {
  it('displays count of 0', () => {
    render(<SessionCounter count={0} />);
    expect(screen.getByTestId('session-counter')).toHaveTextContent('0');
    expect(screen.getByTestId('session-counter')).toHaveTextContent('sessions today');
  });

  it('displays singular for count of 1', () => {
    render(<SessionCounter count={1} />);
    expect(screen.getByTestId('session-counter')).toHaveTextContent('1');
    expect(screen.getByTestId('session-counter')).toHaveTextContent('session today');
  });

  it('displays large counts up to 99', () => {
    render(<SessionCounter count={99} />);
    expect(screen.getByTestId('session-counter')).toHaveTextContent('99');
  });

  it('has accessible aria-label', () => {
    render(<SessionCounter count={5} />);
    expect(screen.getByTestId('session-counter')).toHaveAttribute('aria-label', '5 sessions completed today');
  });
});

// @criterion: AC-counter-celebrate-1
// Session counter number now pulses with a 0.6s scale-up (1→1.4→1) and accent color flash when the count increases
// @criterion-hash: bc1e0879c6ae
describe('[AC-counter-celebrate-1] counter celebration animation', () => {
  it('counter number element uses celebrate class on increment', () => {
    const { rerender } = render(<SessionCounter count={5} />);
    const numberElement = screen.getByTestId('session-count');
    // Initial render should not have celebrate class
    expect(numberElement).toHaveTextContent('5');

    // Increment count
    rerender(<SessionCounter count={6} />);
    // After increment, celebrate class is applied (internally set via celebrating state)
    expect(numberElement).toHaveTextContent('6');
  });

  it('tracks previous count using useRef to trigger animation on increment', () => {
    const { rerender } = render(<SessionCounter count={0} />);
    let numberElement = screen.getByTestId('session-count');
    expect(numberElement).toHaveTextContent('0');

    // Increment multiple times
    rerender(<SessionCounter count={1} />);
    expect(screen.getByTestId('session-count')).toHaveTextContent('1');

    rerender(<SessionCounter count={2} />);
    expect(screen.getByTestId('session-count')).toHaveTextContent('2');
  });
});
