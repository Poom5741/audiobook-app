import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/components/AuthProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AudioBook Central',
  description: 'Your personal audiobook library with AI-powered book discovery and conversion',
  keywords: 'audiobooks, books, TTS, text-to-speech, library, reading',
  authors: [{ name: 'AudioBook Central' }],
  creator: 'AudioBook Central',
  robots: 'index, follow',
  openGraph: {
    title: 'AudioBook Central',
    description: 'Your personal audiobook library with AI-powered book discovery and conversion',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AudioBook Central',
    description: 'Your personal audiobook library with AI-powered book discovery and conversion',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={inter.className}>
        <AuthProvider>
          <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
            <Navbar />
            <main className="container mx-auto px-4 py-8">
              {children}
            </main>
            <Toaster 
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
            }}
          />
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}