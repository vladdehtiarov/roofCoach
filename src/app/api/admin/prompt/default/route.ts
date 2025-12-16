import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { W4_EDITABLE_CONTENT, W4_OUTPUT_FORMAT } from '@/app/api/analyze/w4-prompt'

// GET - Return the default prompt from the codebase
export async function GET() {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    return NextResponse.json({ 
      prompt: W4_EDITABLE_CONTENT,
      lockedOutput: W4_OUTPUT_FORMAT 
    })
  } catch (error) {
    console.error('Error fetching default prompt:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch prompt' },
      { status: 500 }
    )
  }
}

