import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Use env variable for production URL, fallback to request origin
  const requestOrigin = new URL(request.url).origin
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || requestOrigin
  
  // Ensure we never redirect to localhost in production
  const baseUrl = siteUrl.includes('localhost') && process.env.NODE_ENV === 'production'
    ? 'https://roofcoach.onrender.com'
    : siteUrl

  if (code) {
    const supabase = await createClient()
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(`${baseUrl}${next}`)
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${baseUrl}/login?error=Could not authenticate user`)
}
