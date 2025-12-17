declare module 'next-pwa' {
  import type { NextConfig } from 'next'
  
  interface PWAConfig {
    dest: string
    register?: boolean
    skipWaiting?: boolean
    disable?: boolean
    runtimeCaching?: Array<{
      urlPattern: RegExp
      handler: 'CacheFirst' | 'CacheOnly' | 'NetworkFirst' | 'NetworkOnly' | 'StaleWhileRevalidate'
      options?: {
        cacheName?: string
        expiration?: {
          maxEntries?: number
          maxAgeSeconds?: number
        }
      }
    }>
  }
  
  function withPWA(config: PWAConfig): (nextConfig: NextConfig) => NextConfig
  export default withPWA
}

