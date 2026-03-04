import React from 'react'
import { ThemeProvider } from './components/ThemeProvider'
import './styles/light-hc.css'
import './styles/dark-hc.css'
import './styles/utilities.css'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}