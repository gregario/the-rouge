'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

const fallbackStyles: Record<string, React.CSSProperties> = {
  container: {
    background: '#0a0a0f',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: 'rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center' as const,
    maxWidth: '400px',
    width: '90%',
  },
  heading: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 600,
    margin: '0 0 12px 0',
  },
  message: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
    margin: '0 0 32px 0',
    lineHeight: 1.5,
  },
  button: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    padding: '12px 32px',
    transition: 'background 0.2s',
  },
};

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={fallbackStyles.container} data-testid="error-boundary-fallback">
          <div style={fallbackStyles.card}>
            <h1 style={fallbackStyles.heading}>Something went wrong</h1>
            <p style={fallbackStyles.message}>
              An unexpected error occurred. Please reload to continue.
            </p>
            <button
              style={fallbackStyles.button}
              onClick={() => window.location.reload()}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
