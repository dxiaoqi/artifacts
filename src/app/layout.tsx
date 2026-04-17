import type { Metadata } from 'next'
import { Source_Serif_4, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-serif-var',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-var',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Artifacts',
  description: '流式 AI Artifacts 生成系统',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="dark" className={`${sourceSerif.variable} ${jetbrainsMono.variable}`}>
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  )
}
