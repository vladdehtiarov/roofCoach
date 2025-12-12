import { createClient } from '@/lib/supabase/server'
import { NextResponse, NextRequest } from 'next/server'

type TimeRange = 'today' | 'week' | 'month' | 'year'

function getTimeRangeConfig(range: TimeRange) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  
  switch (range) {
    case 'today':
      return {
        startDate: today,
        days: 1,
        label: 'Today'
      }
    case 'week':
      return {
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        days: 7,
        label: 'Last 7 days'
      }
    case 'month':
      return {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        days: 30,
        label: 'Last 30 days'
      }
    case 'year':
      return {
        startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
        days: 365,
        label: 'Last year'
      }
    default:
      return {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        days: 30,
        label: 'Last 30 days'
      }
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ message: 'Supabase not configured' }, { status: 500 })
    }

    // Get time range from query params
    const { searchParams } = new URL(request.url)
    const range = (searchParams.get('range') || 'month') as TimeRange
    const timeConfig = getTimeRangeConfig(range)

    // Verify user is admin
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ message: 'Admin access required' }, { status: 403 })
    }

    // Get platform stats
    const { data: platformStats, error: platformError } = await supabase
      .rpc('admin_get_platform_token_stats')
      .single()

    if (platformError) {
      console.error('Platform stats error:', platformError)
    }

    // Get per-user stats
    const { data: userStats, error: userError } = await supabase
      .rpc('admin_get_token_stats')

    if (userError) {
      console.error('User stats error:', userError)
    }

    // Get recent token logs
    const { data: recentLogs, error: logsError } = await supabase
      .rpc('admin_get_token_logs', { p_limit: 50 })

    if (logsError) {
      console.error('Token logs error:', logsError)
    }

    // Get usage for the selected time range
    const { data: dailyUsage, error: dailyError } = await supabase
      .from('audio_analyses')
      .select('created_at, total_tokens, model_used')
      .gte('created_at', timeConfig.startDate.toISOString())
      .order('created_at', { ascending: true })

    if (dailyError) {
      console.error('Daily usage error:', dailyError)
    }

    // Aggregate usage data based on time range
    const dailyAggregated: Record<string, { date: string; tokens: number; analyses: number }> = {}
    
    // For year view, aggregate by week; for others, aggregate by day
    const aggregateByWeek = range === 'year'
    
    if (aggregateByWeek) {
      // Create entries for all weeks in the year
      for (let i = 51; i >= 0; i--) {
        const date = new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay()) // Start of week (Sunday)
        const dateStr = weekStart.toISOString().split('T')[0]
        if (!dailyAggregated[dateStr]) {
          dailyAggregated[dateStr] = { date: dateStr, tokens: 0, analyses: 0 }
        }
      }
      
      // Populate with actual data
      dailyUsage?.forEach(item => {
        const date = new Date(item.created_at)
        const weekStart = new Date(date)
        weekStart.setDate(date.getDate() - date.getDay())
        const dateStr = weekStart.toISOString().split('T')[0]
        if (dailyAggregated[dateStr]) {
          dailyAggregated[dateStr].tokens += item.total_tokens || 0
          dailyAggregated[dateStr].analyses += 1
        }
      })
    } else {
      // Create entries for all days in the range
      for (let i = timeConfig.days - 1; i >= 0; i--) {
        const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        const dateStr = date.toISOString().split('T')[0]
        dailyAggregated[dateStr] = { date: dateStr, tokens: 0, analyses: 0 }
      }
      
      // Populate with actual data
      dailyUsage?.forEach(item => {
        const date = new Date(item.created_at).toISOString().split('T')[0]
        if (dailyAggregated[date]) {
          dailyAggregated[date].tokens += item.total_tokens || 0
          dailyAggregated[date].analyses += 1
        }
      })
    }
    
    // Sort by date
    const sortedDailyUsage = Object.values(dailyAggregated).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Get model distribution
    const modelDistribution: Record<string, number> = {}
    dailyUsage?.forEach(item => {
      const model = item.model_used || 'unknown'
      modelDistribution[model] = (modelDistribution[model] || 0) + 1
    })

    return NextResponse.json({
      platform: platformStats || {
        total_users: 0,
        total_analyses: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_tokens: 0,
        total_estimated_cost_usd: 0,
        avg_tokens_per_analysis: 0,
        most_used_model: null,
        analyses_today: 0,
        tokens_today: 0,
      },
      users: userStats || [],
      recentLogs: recentLogs || [],
      dailyUsage: sortedDailyUsage,
      modelDistribution,
    })

  } catch (error) {
    console.error('Token stats error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

