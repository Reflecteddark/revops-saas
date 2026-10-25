import * as React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center p-6 text-center bg-background text-foreground">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 text-destructive">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Что-то пошло не так</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md">
            Произошла ошибка при отображении интерфейса. Попробуйте обновить страницу.
          </p>
          {this.state.error && (
            <pre className="mt-4 max-w-lg overflow-auto rounded bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <Button onClick={this.handleReload} className="mt-6 gap-2" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Обновить страницу
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
