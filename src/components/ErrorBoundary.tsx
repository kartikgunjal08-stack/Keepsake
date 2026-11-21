import {Component, type ErrorInfo, type ReactNode} from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F8F7] text-neutral-900 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-7 text-center space-y-4 shadow-sm">
            <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
            <p className="text-xs leading-relaxed text-neutral-600">
              We hit an unexpected issue while loading this page. Refresh to recover your draft.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-rose-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-rose-800 whitespace-nowrap"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
