import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai'
import { TranscriptSection } from '@/types/database'

// Set maximum duration for serverless function (in seconds)
// 900 seconds = 15 minutes - needed for long audio files
export const maxDuration = 900

// Configuration
const CHUNK_DURATION_MINUTES = 30 // Request transcript in 30-minute chunks
const RATE_LIMIT_DELAY_MS = 20000 // 20 seconds between requests (Gemini has 250K tokens/min limit)
const MODEL_NAME = 'gemini-2.0-flash-exp'
const MAX_CONCURRENT_ANALYSES = 1 // Only 1 analysis at a time for 512MB RAM limit

// Gemini pricing (per 1M tokens) - approximate for cost estimation
const GEMINI_PRICING = {
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
}

// Token tracking helper
interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function extractTokenUsage(result: GenerateContentResult): TokenUsage {
  const metadata = result.response.usageMetadata
  return {
    inputTokens: metadata?.promptTokenCount || 0,
    outputTokens: metadata?.candidatesTokenCount || 0,
    totalTokens: metadata?.totalTokenCount || 0,
  }
}

function calculateCost(tokens: TokenUsage, model: string): number {
  const pricing = GEMINI_PRICING[model as keyof typeof GEMINI_PRICING] || GEMINI_PRICING['gemini-2.0-flash-exp']
  const inputCost = (tokens.inputTokens / 1_000_000) * pricing.input
  const outputCost = (tokens.outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    if (!supabase) {
      return NextResponse.json({ message: 'Supabase not configured' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { recordingId, filePath } = body

    if (!recordingId || !filePath) {
      return NextResponse.json({ message: 'Missing recordingId or filePath' }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ message: 'Gemini API key not configured' }, { status: 500 })
    }

    // Verify recording ownership
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json({ message: 'Recording not found' }, { status: 404 })
    }

    // Use compressed analysis file if available (much smaller, saves RAM!)
    const analysisFilePath = recording.analysis_file_path || filePath
    if (recording.analysis_file_path) {
      console.log(`Using compressed analysis file: ${recording.analysis_file_path}`)
    } else {
      console.log(`No analysis file, using original: ${filePath}`)
    }

    // Check queue - limit concurrent analyses to prevent memory overload
    // Only count analyses started in the last 30 minutes (ignore stuck ones)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    
    const { data: activeAnalyses, error: queueError } = await supabase
      .from('audio_analyses')
      .select('id, recording_id, created_at')
      .eq('processing_status', 'processing')
      .gte('created_at', thirtyMinutesAgo) // Only recent ones
      .order('created_at', { ascending: true })

    if (!queueError && activeAnalyses && activeAnalyses.length >= MAX_CONCURRENT_ANALYSES) {
      // Check if this recording is already in queue or processing
      const existingForRecording = activeAnalyses.find(a => a.recording_id === recordingId)
      if (existingForRecording) {
        return NextResponse.json({ message: 'Analysis already in progress or queued' }, { status: 400 })
      }

      // Check for existing pending analysis
      const { data: pendingAnalysis } = await supabase
        .from('audio_analyses')
        .select('id')
        .eq('recording_id', recordingId)
        .eq('processing_status', 'pending')
        .single()

      if (pendingAnalysis) {
        return NextResponse.json({ message: 'Already in queue' }, { status: 400 })
      }

      // Create a pending analysis record so it shows in queue
      await supabase.from('audio_analyses').insert({
        recording_id: recordingId,
        processing_status: 'pending',
        transcript: '',
        sections: [],
        timeline: [],
        main_topics: [],
        glossary: [],
        insights: [],
        title: 'Queued for analysis...',
        summary: '',
        conclusion: '',
        total_chunks: 0,
        completed_chunks: 0,
        current_chunk_message: 'Waiting in queue...',
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        model_used: '',
        estimated_cost_usd: 0,
      })

      // Calculate queue position
      const queuePosition = activeAnalyses.length - MAX_CONCURRENT_ANALYSES + 1
      console.log(`Queue full (${activeAnalyses.length}/${MAX_CONCURRENT_ANALYSES}). Recording ${recordingId} added to queue.`)
      
      return NextResponse.json({ 
        message: 'Added to queue. Analysis will start automatically when server is free.',
        queued: true,
        queuePosition: queuePosition + 1,
        activeCount: activeAnalyses.length,
        maxConcurrent: MAX_CONCURRENT_ANALYSES,
        retryAfterSeconds: 60
      }, { status: 202 }) // 202 Accepted - queued for processing
    }

    // Check for existing analysis
    const { data: existingAnalysis } = await supabase
      .from('audio_analyses')
      .select('id, processing_status')
      .eq('recording_id', recordingId)
      .single()

    let analysisId: string | null = null
    
    if (existingAnalysis) {
      if (existingAnalysis.processing_status === 'processing') {
        return NextResponse.json({ message: 'Analysis already in progress' }, { status: 400 })
      }
      // If pending (from queue), we'll update it; if done/error, delete and recreate
      if (existingAnalysis.processing_status === 'pending') {
        analysisId = existingAnalysis.id
      } else {
        await supabase.from('audio_analyses').delete().eq('id', existingAnalysis.id)
      }
    }

    // Calculate chunks based on duration or file size
    let totalSeconds: number
    let durationSource: string
    
    if (recording.duration && recording.duration > 0) {
      totalSeconds = recording.duration
      durationSource = 'database'
    } else {
      // Fallback: estimate ~1MB per minute for webm/mp3
      totalSeconds = (recording.file_size / (1024 * 1024)) * 60
      durationSource = 'estimated'
    }
    
    const totalMinutes = totalSeconds / 60
    const totalChunks = Math.ceil(totalMinutes / CHUNK_DURATION_MINUTES)
    const estimatedMinutes = Math.ceil(totalChunks * 1.5) // ~1.5 min per chunk

    console.log(`Starting analysis: ${recordingId}`)
    console.log(`Duration: ${Math.floor(totalMinutes)}:${String(Math.round(totalMinutes % 1 * 60)).padStart(2, '0')} (${durationSource})`)
    console.log(`Chunks: ${totalChunks} x ${CHUNK_DURATION_MINUTES} min`)

    // Create or update analysis record
    let analysis: { id: string } | null = null
    
    if (analysisId) {
      // Update existing pending analysis
      const { data, error } = await supabase
        .from('audio_analyses')
        .update({
          title: 'Processing...',
          processing_status: 'processing',
          total_chunks: totalChunks,
          completed_chunks: 0,
          current_chunk_message: 'Downloading audio...',
        })
        .eq('id', analysisId)
        .select()
        .single()
      
      if (error) {
        console.error('Failed to update pending analysis:', error)
        return NextResponse.json({ message: 'Failed to start analysis' }, { status: 500 })
      }
      analysis = data
    } else {
      // Create new analysis record
      const { data, error: createError } = await supabase
        .from('audio_analyses')
        .insert({
          recording_id: recordingId,
          transcript: '',
          title: 'Processing...',
          summary: '',
          timeline: [],
          main_topics: [],
          glossary: [],
          insights: [],
          conclusion: '',
          sections: [],
          processing_status: 'processing',
          total_chunks: totalChunks,
          completed_chunks: 0,
          current_chunk_message: 'Downloading audio...',
          language: 'en',
          confidence_score: 0,
        })
        .select()
        .single()

      if (createError || !data) {
        return NextResponse.json({ message: 'Failed to create analysis' }, { status: 500 })
      }
      analysis = data
    }

    if (!analysis) {
      return NextResponse.json({ message: 'Failed to create analysis' }, { status: 500 })
    }

    // Update recording status
    await supabase.from('recordings').update({ status: 'processing' }).eq('id', recordingId)

    // Start processing (don't await - let it run in background)
    processWithChat({
      supabase,
      geminiApiKey,
      analysisId: analysis.id,
      recordingId,
      filePath: analysisFilePath, // Use compressed version if available!
      totalChunks,
      totalSeconds, // Pass exact duration in seconds
      userId: user.id, // Pass user ID for token tracking
    }).catch(err => {
      console.error('Processing error:', err)
    })

    return NextResponse.json({
      message: 'Analysis started',
      analysisId: analysis.id,
      totalChunks,
      estimatedMinutes,
    })

  } catch (error) {
    console.error('Analysis error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// Main processing function using Gemini Chat
async function processWithChat(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  geminiApiKey: string
  analysisId: string
  recordingId: string
  filePath: string
  totalChunks: number
  totalSeconds: number // Use seconds for precision
  userId: string // For token tracking
}) {
  const { supabase, geminiApiKey, analysisId, recordingId, filePath, totalChunks, totalSeconds, userId } = params
  const totalMinutes = totalSeconds / 60

  // Token tracking accumulators
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalTokensUsed = 0

  // Helper to log token usage
  async function logTokenUsage(
    requestType: 'transcription_chunk' | 'final_analysis' | 'ai_notes',
    tokens: TokenUsage,
    chunkIndex?: number
  ) {
    if (!supabase) return
    
    totalInputTokens += tokens.inputTokens
    totalOutputTokens += tokens.outputTokens
    totalTokensUsed += tokens.totalTokens

    try {
      await supabase.from('token_usage_logs').insert({
        user_id: userId,
        analysis_id: analysisId,
        recording_id: recordingId,
        request_type: requestType,
        chunk_index: chunkIndex ?? null,
        input_tokens: tokens.inputTokens,
        output_tokens: tokens.outputTokens,
        total_tokens: tokens.totalTokens,
        model_used: MODEL_NAME,
      })
    } catch (err) {
      console.error('Failed to log token usage:', err)
    }
  }

  if (!supabase) return

  try {
    // Download audio file 
    console.log('Downloading audio...')
    await updateProgress(supabase, analysisId, 0, 'Downloading audio file...')

    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio-files')
      .download(filePath)

    if (downloadError || !audioData) {
      throw new Error('Failed to download audio')
    }

    // Convert to base64 - minimize memory copies
    const arrayBuffer = await audioData.arrayBuffer()
    const base64Audio = Buffer.from(arrayBuffer).toString('base64')
    
    // Determine mime type
    let mimeType = 'audio/webm'
    if (filePath.endsWith('.mp3')) mimeType = 'audio/mpeg'
    else if (filePath.endsWith('.wav')) mimeType = 'audio/wav'
    else if (filePath.endsWith('.m4a')) mimeType = 'audio/mp4'
    else if (filePath.endsWith('.ogg')) mimeType = 'audio/ogg'

    console.log(`Audio loaded: ${(base64Audio.length / 1024 / 1024).toFixed(1)}MB (base64)`)
    await updateProgress(supabase, analysisId, 0, 'Starting Gemini chat...')

    // Initialize Gemini Chat
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    })

    // Start chat with the audio file
    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: 'I have uploaded an audio file. I will ask you to transcribe it in parts. Please wait for my instructions.' }
          ]
        },
        {
          role: 'model',
          parts: [{ text: 'I have received the audio file and I\'m ready to transcribe it in parts. Please tell me which time range you\'d like me to transcribe first.' }]
        }
      ]
    })

    const sections: TranscriptSection[] = []

    // Process each chunk with exact timing
    const chunkDurationSeconds = CHUNK_DURATION_MINUTES * 60
    
    for (let i = 0; i < totalChunks; i++) {
      const startSec = i * chunkDurationSeconds
      const endSec = Math.min((i + 1) * chunkDurationSeconds, totalSeconds)
      
      const startTime = formatTimeFromSeconds(startSec)
      const endTime = formatTimeFromSeconds(endSec)

      console.log(`Chunk ${i + 1}/${totalChunks}: ${startTime} - ${endTime}`)
      await updateProgress(supabase, analysisId, i, `Transcribing ${startTime} - ${endTime}...`)

      // Wait between requests (except first)
      if (i > 0) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }

      try {
        const prompt = `Please transcribe the audio from ${startTime} to ${endTime}.

Format your response like this:
TITLE: [A descriptive title for this section]
TRANSCRIPT:
[The full word-for-word transcription with speaker labels if multiple speakers]
SUMMARY: [2-3 sentence summary]
TOPICS: [comma-separated list of main topics]`

        const result = await chat.sendMessage(prompt)
        const response = result.response.text()

        // Track token usage for this chunk
        const tokenUsage = extractTokenUsage(result)
        await logTokenUsage('transcription_chunk', tokenUsage, i)
        console.log(`  Tokens: ${tokenUsage.totalTokens} (in: ${tokenUsage.inputTokens}, out: ${tokenUsage.outputTokens})`)

        // Parse response
        const section = parseSection(response, i, startSec, endSec)
        sections.push(section)

        // Save to database immediately
        await supabase
          .from('audio_analyses')
          .update({
            sections,
            completed_chunks: i + 1,
            current_chunk_message: `Completed ${i + 1}/${totalChunks} sections`,
          })
          .eq('id', analysisId)

        console.log(`✓ Section ${i + 1} saved: "${section.title}"`)

      } catch (chunkError: unknown) {
        const errMsg = chunkError instanceof Error ? chunkError.message : String(chunkError)
        console.error(`Chunk ${i + 1} error:`, errMsg.substring(0, 100))
        
        if (errMsg.includes('429') || errMsg.includes('quota')) {
          console.log('Rate limited, waiting 60s...')
          await updateProgress(supabase, analysisId, i, 'Rate limited, waiting...')
          await sleep(60000)
          i-- // Retry this chunk
        }
      }
    }

    // Final analysis request
    console.log('Requesting final analysis...')
    await updateProgress(supabase, analysisId, totalChunks, 'Creating final analysis...')
    await sleep(RATE_LIMIT_DELAY_MS)

    let finalAnalysis = {
      title: sections[0]?.title || 'Audio Recording',
      summary: '',
      main_topics: [] as string[],
      glossary: [] as { term: string; definition: string; context?: string }[],
      insights: [] as { type: string; title: string; description: string }[],
      conclusion: '',
    }

    try {
      const analysisPrompt = `Based on the full audio you've transcribed, please provide a comprehensive analysis:

Return in this format:
TITLE: [Overall title for the recording]
SUMMARY: [3-4 sentence comprehensive summary]
MAIN_TOPICS: [5-10 main topics discussed, comma-separated]
GLOSSARY:
- Term1: Definition (context where used)
- Term2: Definition (context where used)
[5-10 important terms]
INSIGHTS:
- STRENGTH: [Title] - [Description of what was done well]
- IMPROVEMENT: [Title] - [Area to improve and suggestion]
- TIP: [Title] - [Coaching advice]
[3-6 insights total]
CONCLUSION: [Key takeaways and recommendations]`

      // Try with retry for rate limits
      let analysisRetries = 3
      let analysisResult = null
      
      while (analysisRetries > 0 && !analysisResult) {
        try {
          analysisResult = await chat.sendMessage(analysisPrompt)
        } catch (retryError: unknown) {
          const errMsg = retryError instanceof Error ? retryError.message : String(retryError)
          
          if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests')) {
            analysisRetries--
            if (analysisRetries > 0) {
              console.log(`Rate limited on final analysis, waiting 60s... (${analysisRetries} retries left)`)
              await updateProgress(supabase, analysisId, totalChunks, 'Rate limited, waiting 60s...')
              await sleep(60000)
            } else {
              throw retryError
            }
          } else {
            throw retryError
          }
        }
      }
      
      if (analysisResult) {
        finalAnalysis = parseFinalAnalysis(analysisResult.response.text(), sections)

        // Track token usage for final analysis
        const analysisTokens = extractTokenUsage(analysisResult)
        await logTokenUsage('final_analysis', analysisTokens)
        console.log(`Final analysis tokens: ${analysisTokens.totalTokens}`)
      }

    } catch {
      console.error('Final analysis error, using defaults')
      finalAnalysis.summary = `Recording with ${sections.length} sections transcribed.`
      finalAnalysis.main_topics = [...new Set(sections.flatMap(s => s.topics || []))].slice(0, 10)
    }

    // Generate AI Notes - beautiful markdown article
    console.log('Generating AI Notes...')
    await updateProgress(supabase, analysisId, totalChunks, 'Writing AI Notes...')
    await sleep(RATE_LIMIT_DELAY_MS)

    let aiNotes = ''
    try {
      const notesPrompt = `Based on everything we've discussed about this audio recording, write a comprehensive article-style summary in Markdown format.

Write it like a professional journalist would write an article about this conversation/recording.

Use this structure:
# [Catchy headline about the main topic]

## Key Highlights

[2-3 paragraphs summarizing the most important points]

## Main Discussion Points

### [Topic 1 Title]
[Detailed paragraph about this topic]

> "[Include a notable quote from the recording]" — [Speaker name]

### [Topic 2 Title]
[Detailed paragraph]

### [Topic 3 Title]
[Detailed paragraph]

## Notable Quotes

> "[Quote 1]" — [Speaker]

> "[Quote 2]" — [Speaker]

## Key Takeaways

- **[Key point 1]**: [Brief explanation]
- **[Key point 2]**: [Brief explanation]
- **[Key point 3]**: [Brief explanation]

## Conclusion

[Final thoughts and summary paragraph]

---
*AI-generated notes from audio analysis*

Make it engaging, informative, and well-structured. Use actual content and quotes from the recording.`

      // Try with retry for rate limits
      let notesRetries = 3
      let notesResult = null
      
      while (notesRetries > 0 && !notesResult) {
        try {
          notesResult = await chat.sendMessage(notesPrompt)
        } catch (retryError: unknown) {
          const errMsg = retryError instanceof Error ? retryError.message : String(retryError)
          
          if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests')) {
            notesRetries--
            if (notesRetries > 0) {
              console.log(`Rate limited on AI Notes, waiting 60s... (${notesRetries} retries left)`)
              await updateProgress(supabase, analysisId, totalChunks, 'Rate limited, waiting 60s...')
              await sleep(60000) // Wait 60 seconds for quota reset
            } else {
              throw retryError
            }
          } else {
            throw retryError
          }
        }
      }
      
      if (notesResult) {
        aiNotes = notesResult.response.text()
        
        // Track token usage for AI notes
        const notesTokens = extractTokenUsage(notesResult)
        await logTokenUsage('ai_notes', notesTokens)
        console.log(`AI Notes generated: ${aiNotes.length} chars, tokens: ${notesTokens.totalTokens}`)
      }

    } catch (notesError) {
      console.error('AI Notes generation error:', notesError)
      // Create a basic notes version from what we have
      aiNotes = `# ${finalAnalysis.title}\n\n${finalAnalysis.summary}\n\n## Key Topics\n\n${finalAnalysis.main_topics.map(t => `- ${t}`).join('\n')}\n\n## Conclusion\n\n${finalAnalysis.conclusion}`
    }

    // Build combined transcript
    const transcript = sections.map(s => 
      `## [${s.timestamp_start}] ${s.title}\n\n${s.content}\n\n---`
    ).join('\n\n')

    // Build timeline
    const timeline = sections.map(s => ({
      start_time: s.timestamp_start,
      end_time: s.timestamp_end,
      title: s.title,
      summary: s.summary,
      topics: s.topics || [],
    }))

    // Calculate estimated cost
    const estimatedCost = calculateCost(
      { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, totalTokens: totalTokensUsed },
      MODEL_NAME
    )

    // Save final results with token usage
    await supabase
      .from('audio_analyses')
      .update({
        transcript,
        title: finalAnalysis.title,
        summary: finalAnalysis.summary,
        ai_notes: aiNotes,
        timeline,
        main_topics: finalAnalysis.main_topics,
        glossary: finalAnalysis.glossary,
        insights: finalAnalysis.insights,
        conclusion: finalAnalysis.conclusion,
        processing_status: 'done',
        current_chunk_message: 'Analysis complete!',
        confidence_score: sections.length >= totalChunks * 0.8 ? 0.9 : 0.7,
        duration_analyzed: totalMinutes * 60,
        // Token tracking
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        total_tokens: totalTokensUsed,
        model_used: MODEL_NAME,
        estimated_cost_usd: estimatedCost,
      })
      .eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'done' }).eq('id', recordingId)

    console.log(`✅ Analysis complete! ${sections.length} sections, ${transcript.length} chars`)
    console.log(`📊 Total tokens: ${totalTokensUsed} (in: ${totalInputTokens}, out: ${totalOutputTokens})`)
    console.log(`💰 Estimated cost: $${estimatedCost.toFixed(4)}`)

    // Check for pending analyses in queue and trigger next one
    await triggerNextPendingAnalysis(supabase)

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Processing error:', errMsg)
    
    if (supabase) {
      await supabase
        .from('audio_analyses')
        .update({
          processing_status: 'error',
          error_message: errMsg.substring(0, 500),
          current_chunk_message: 'Error occurred',
        })
        .eq('id', analysisId)

      await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId)
    }
  }
}

// Helper functions
function formatTimeFromSeconds(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function parseSection(text: string, index: number, startSec: number, endSec: number): TranscriptSection {
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/i)
  const transcriptMatch = text.match(/TRANSCRIPT:\s*([\s\S]*?)(?=SUMMARY:|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?:\n|TOPICS:|$)/i)
  const topicsMatch = text.match(/TOPICS:\s*(.+?)(?:\n|$)/i)

  return {
    chunk_index: index,
    timestamp_start: formatTimeFromSeconds(startSec),
    timestamp_end: formatTimeFromSeconds(endSec),
    title: titleMatch?.[1]?.trim() || `Part ${index + 1}`,
    content: transcriptMatch?.[1]?.trim() || text,
    summary: summaryMatch?.[1]?.trim() || text.substring(0, 200) + '...',
    topics: topicsMatch?.[1]?.split(',').map(t => t.trim()).filter(Boolean) || [],
  }
}

function parseFinalAnalysis(text: string, sections: TranscriptSection[]) {
  const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*?)(?=MAIN_TOPICS:|$)/i)
  const topicsMatch = text.match(/MAIN_TOPICS:\s*(.+?)(?:\n|GLOSSARY:|$)/i)
  const conclusionMatch = text.match(/CONCLUSION:\s*([\s\S]*?)$/i)

  // Parse glossary
  const glossary: { term: string; definition: string; context?: string }[] = []
  const glossarySection = text.match(/GLOSSARY:\s*([\s\S]*?)(?=INSIGHTS:|$)/i)?.[1] || ''
  const glossaryLines = glossarySection.split('\n').filter(l => l.includes(':'))
  for (const line of glossaryLines.slice(0, 10)) {
    const match = line.match(/-?\s*(.+?):\s*(.+?)(?:\((.+?)\))?$/)
    if (match) {
      glossary.push({
        term: match[1].trim(),
        definition: match[2].trim(),
        context: match[3]?.trim(),
      })
    }
  }

  // Parse insights
  const insights: { type: string; title: string; description: string }[] = []
  const insightsSection = text.match(/INSIGHTS:\s*([\s\S]*?)(?=CONCLUSION:|$)/i)?.[1] || ''
  const insightLines = insightsSection.split('\n').filter(l => l.includes(':'))
  for (const line of insightLines.slice(0, 6)) {
    const match = line.match(/-?\s*(STRENGTH|IMPROVEMENT|TIP):\s*(.+?)\s*-\s*(.+)/i)
    if (match) {
      insights.push({
        type: match[1].toLowerCase(),
        title: match[2].trim(),
        description: match[3].trim(),
      })
    }
  }

  return {
    title: titleMatch?.[1]?.trim() || sections[0]?.title || 'Audio Analysis',
    summary: summaryMatch?.[1]?.trim() || `${sections.length} sections analyzed.`,
    main_topics: topicsMatch?.[1]?.split(',').map(t => t.trim()).filter(Boolean) || 
                 [...new Set(sections.flatMap(s => s.topics || []))].slice(0, 10),
    glossary,
    insights,
    conclusion: conclusionMatch?.[1]?.trim() || 'Analysis complete.',
  }
}

async function updateProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  analysisId: string,
  chunk: number,
  message: string
) {
  if (!supabase) return
  await supabase
    .from('audio_analyses')
    .update({
      completed_chunks: chunk,
      current_chunk_message: message,
    })
    .eq('id', analysisId)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Trigger the next pending analysis in queue
async function triggerNextPendingAnalysis(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return
  
  try {
    // Find the oldest pending analysis
    const { data: pendingAnalysis, error } = await supabase
      .from('audio_analyses')
      .select('id, recording_id')
      .eq('processing_status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (error || !pendingAnalysis) {
      console.log('📭 No pending analyses in queue')
      return
    }

    console.log(`🚀 Triggering next pending analysis for recording: ${pendingAnalysis.recording_id}`)
    
    // Update status to processing
    await supabase
      .from('audio_analyses')
      .update({ 
        processing_status: 'processing',
        current_chunk_message: 'Starting analysis...',
      })
      .eq('id', pendingAnalysis.id)

    // Trigger the analysis via internal call (fire and forget)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recordingId: pendingAnalysis.recording_id }),
    }).catch(err => {
      console.error('Failed to trigger pending analysis:', err)
    })

  } catch (err) {
    console.error('Error triggering next pending analysis:', err)
  }
}

// GET endpoint to check status
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ message: 'Supabase not configured' }, { status: 500 })
    }

    const { searchParams } = new URL(request.url)
    const recordingId = searchParams.get('recordingId')

    if (!recordingId) {
      return NextResponse.json({ message: 'Missing recordingId' }, { status: 400 })
    }

    const { data: analysis } = await supabase
      .from('audio_analyses')
      .select('*')
      .eq('recording_id', recordingId)
      .single()

    if (!analysis) {
      return NextResponse.json({ message: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: analysis.processing_status,
      totalChunks: analysis.total_chunks,
      completedChunks: analysis.completed_chunks,
      message: analysis.current_chunk_message,
    })
  } catch {
    return NextResponse.json({ message: 'Error' }, { status: 500 })
  }
}
