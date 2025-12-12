'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isNavigating, setIsNavigating] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    // Reset on route change complete
    setIsNavigating(false)
    setProgress(100)
    
    const timeout = setTimeout(() => setProgress(0), 200)
    return () => clearTimeout(timeout)
  }, [pathname, searchParams])

  useEffect(() => {
    let progressInterval: NodeJS.Timeout

    const handleStart = () => {
      setIsNavigating(true)
      setProgress(20)
      
      // Simulate progress
      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev
          return prev + Math.random() * 10
        })
      }, 200)
    }

    // Listen for link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      
      if (anchor && anchor.href && !anchor.target && !anchor.download) {
        const url = new URL(anchor.href)
        if (url.origin === window.location.origin && url.pathname !== pathname) {
          handleStart()
        }
      }
    }

    document.addEventListener('click', handleClick)

    return () => {
      document.removeEventListener('click', handleClick)
      if (progressInterval) clearInterval(progressInterval)
    }
  }, [pathname])

  if (progress === 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1">
      <div 
        className="h-full bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-400 transition-all duration-200 ease-out shadow-lg shadow-emerald-500/50"
        style={{ 
          width: `${progress}%`,
          opacity: isNavigating ? 1 : 0,
          transition: isNavigating ? 'width 200ms ease-out' : 'width 200ms ease-out, opacity 200ms ease-out 100ms'
        }}
      />
    </div>
  )
}

