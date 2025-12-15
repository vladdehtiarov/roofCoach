import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET - Fetch prompt by name
export async function GET(request: Request) {
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

    const url = new URL(request.url)
    const name = url.searchParams.get('name') || 'w4_analysis'

    const { data: prompt, error } = await supabase
      .from('admin_prompts')
      .select('*')
      .eq('name', name)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error
    }

    return NextResponse.json({ prompt })
  } catch (error) {
    console.error('Error fetching prompt:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to fetch prompt' },
      { status: 500 }
    )
  }
}

// PUT - Update or create prompt
export async function PUT(request: Request) {
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

    const { name, prompt, description } = await request.json()

    if (!name || !prompt) {
      return NextResponse.json({ message: 'Name and prompt are required' }, { status: 400 })
    }

    // Upsert the prompt
    const { data, error } = await supabase
      .from('admin_prompts')
      .upsert({
        name,
        prompt,
        description,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, {
        onConflict: 'name',
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, prompt: data })
  } catch (error) {
    console.error('Error updating prompt:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to update prompt' },
      { status: 500 }
    )
  }
}

// GET all prompts (for listing)
export async function POST(request: Request) {
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

    const { action } = await request.json()

    if (action === 'list') {
      const { data: prompts, error } = await supabase
        .from('admin_prompts')
        .select('id, name, description, is_active, updated_at')
        .order('name')

      if (error) throw error
      return NextResponse.json({ prompts })
    }

    return NextResponse.json({ message: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}

