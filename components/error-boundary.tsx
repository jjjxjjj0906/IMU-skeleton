'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({ error, errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Card className="w-full h-full bg-red-950 border-red-800 text-red-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-100">
              <AlertCircle className="w-5 h-5" />
              3D Viewer Error
            </CardTitle>
            <CardDescription className="text-red-300">
              Something went wrong with the 3D visualization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-red-200">
              <p className="mb-2">
                The 3D viewer encountered an error and couldn't render properly.
              </p>
              {this.state.error && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-300 hover:text-red-100">
                    Technical Details
                  </summary>
                  <pre className="mt-2 p-2 bg-red-900/50 rounded text-xs overflow-auto">
                    {this.state.error.message}
                    {this.state.errorInfo?.componentStack && (
                      <div className="mt-2">
                        <strong>Component Stack:</strong>
                        <pre className="mt-1">{this.state.errorInfo.componentStack}</pre>
                      </div>
                    )}
                  </pre>
                </details>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={this.handleRetry}
                variant="outline"
                className="border-red-600 text-red-300 hover:bg-red-800"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                className="border-red-600 text-red-300 hover:bg-red-800"
              >
                Refresh Page
              </Button>
            </div>
            <div className="text-xs text-red-400">
              <p>If the problem persists:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Try using Chrome or Firefox instead of Safari</li>
                <li>Check if your browser supports WebGL</li>
                <li>Disable browser extensions temporarily</li>
                <li>Update your browser to the latest version</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )
    }

    return this.props.children
  }
}
