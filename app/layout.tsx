import './globals.css'

export const metadata = {
  title: 'Process Joint Viewer',
  description: 'Three.js 15-sensor skeleton viewer with enhanced visualization',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  )
}


