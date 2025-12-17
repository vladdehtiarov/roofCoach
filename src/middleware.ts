import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, json, js for PWA)
     */
    '/((?!_next/static|_next/image|favicon.ico|sw.js|workbox-.*\\.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)',
  ],
}

