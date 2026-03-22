import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionCounter } from '@/components/SessionCounter';

describe('SessionCounter', () => {
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

  it('displays large counts', () => {
    render(<SessionCounter count={99} />);
    expect(screen.getByTestId('session-counter')).toHaveTextContent('99');
  });

  it('has accessible aria-label', () => {
    render(<SessionCounter count={5} />);
    expect(screen.getByTestId('session-counter')).toHaveAttribute('aria-label', '5 sessions completed today');
  });
});
