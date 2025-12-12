// Supabase Edge Function for processing audio analysis in chunks
// Deploy with: supabase functions deploy analyze-audio

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const CHUNK_DURATION_MINUTES = 45
const RATE_LIMIT_DELAY_MS = 35000

interface TranscriptSection {
  chunk_index: number
  timestamp_start: string
  timestamp_end: string
  title: string
  content: string
  summary: string
  topics?: string[]
}

interface RequestBody {
  analysisId: string
  recordingId: string
  filePath: string
  totalChunks: number
  durationSeconds: number | null
  fileSizeBytes: number
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()
    const { analysisId, recordingId, filePath, totalChunks, durationSeconds, fileSizeBytes } = body

    console.log(`Starting analysis: ${analysisId}, chunks: ${totalChunks}`)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Initialize Gemini
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      await updateError(supabase, analysisId, recordingId, 'Gemini API key not configured')
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Start processing in background
    processAnalysis(supabase, body, geminiApiKey).catch(err => {
      console.error('Background processing error:', err)
    })

    return new Response(JSON.stringify({ 
      message: 'Processing started',
      analysisId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function processAnalysis(
  supabase: ReturnType<typeof createClient>,
  params: RequestBody,
  geminiApiKey: string
): Promise<void> {
  const { analysisId, recordingId, filePath, totalChunks, durationSeconds, fileSizeBytes } = params

  try {
    // Download audio file
    console.log(`Downloading: ${filePath}`)
    await updateProgress(supabase, analysisId, 0, 'Downloading audio file...')

    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio-files')
      .download(filePath)

    if (downloadError || !audioData) {
      await updateError(supabase, analysisId, recordingId, 'Failed to download audio')
      return
    }

    const arrayBuffer = await audioData.arrayBuffer()
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
    
    let mimeType = 'audio/webm'
    if (filePath.endsWith('.mp3')) mimeType = 'audio/mp3'
    else if (filePath.endsWith('.wav')) mimeType = 'audio/wav'
    else if (filePath.endsWith('.m4a')) mimeType = 'audio/mp4'

    console.log(`Audio: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB`)

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
    })

    // Calculate duration
    let totalMinutes: number
    if (durationSeconds && durationSeconds > 0) {
      totalMinutes = durationSeconds / 60
    } else {
      totalMinutes = fileSizeBytes / (1024 * 1024)
    }

    const sections: TranscriptSection[] = []
    let previousSummary = ''

    // Process chunks
    for (let i = 0; i < totalChunks; i++) {
      const startMin = i * CHUNK_DURATION_MINUTES
      const endMin = Math.min((i + 1) * CHUNK_DURATION_MINUTES, totalMinutes)

      console.log(`Chunk ${i + 1}/${totalChunks}: ${startMin}-${endMin} min`)
      await updateProgress(supabase, analysisId, i, `Processing chunk ${i + 1}/${totalChunks}...`)

      if (i > 0) {
        await sleep(RATE_LIMIT_DELAY_MS)
      }

      try {
        const prompt = getChunkPrompt(i, totalChunks, startMin, endMin, previousSummary)
        
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64Audio } },
          { text: prompt }
        ])

        const text = result.response.text()
        const section = parseChunkResponse(text, i, startMin, endMin)
        
        if (section) {
          sections.push(section)
          previousSummary = section.summary

          await supabase.from('audio_analyses').update({
            sections,
            completed_chunks: i + 1,
            current_chunk_message: `Completed ${i + 1}/${totalChunks}`,
          }).eq('id', analysisId)

          console.log(`Saved: "${section.title}"`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`Chunk ${i + 1} error:`, msg.substring(0, 100))
        
        if (msg.includes('429')) {
          await sleep(60000)
        }
      }
    }

    // Build final transcript
    const transcript = sections.map(s => 
      `## [${s.timestamp_start}] ${s.title}\n\n${s.content}\n\n---`
    ).join('\n\n')

    const timeline = sections.map(s => ({
      start_time: s.timestamp_start,
      end_time: s.timestamp_end,
      title: s.title,
      summary: s.summary,
      topics: s.topics || [],
    }))

    // Final analysis
    await updateProgress(supabase, analysisId, totalChunks, 'Creating final analysis...')
    await sleep(RATE_LIMIT_DELAY_MS)

    let analysis = {
      title: sections[0]?.title || 'Audio Recording',
      summary: `${sections.length} sections transcribed.`,
      main_topics: [] as string[],
      glossary: [] as { term: string; definition: string }[],
      insights: [] as { type: string; title: string; description: string }[],
      conclusion: '',
    }

    if (sections.length > 0) {
      try {
        const analysisModel = genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash-exp',
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
        })

        const analysisResult = await analysisModel.generateContent([
          { text: getFinalAnalysisPrompt(sections) }
        ])

        const json = analysisResult.response.text().replace(/```json?\n?/g, '').replace(/```/g, '').trim()
        analysis = { ...analysis, ...JSON.parse(json) }
      } catch {
        analysis.main_topics = [...new Set(sections.flatMap(s => s.topics || []))].slice(0, 10)
      }
    }

    // Save final
    await supabase.from('audio_analyses').update({
      transcript,
      title: analysis.title,
      summary: analysis.summary,
      timeline,
      main_topics: analysis.main_topics,
      glossary: analysis.glossary,
      insights: analysis.insights,
      conclusion: analysis.conclusion,
      processing_status: 'done',
      current_chunk_message: 'Complete!',
      confidence_score: sections.length >= totalChunks * 0.8 ? 0.9 : 0.7,
      duration_analyzed: totalMinutes * 60,
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'done' }).eq('id', recordingId)
    
    console.log(`✅ Done! ${sections.length} sections`)

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Error:', msg)
    await updateError(supabase, analysisId, recordingId, msg.substring(0, 500))
  }
}

function getChunkPrompt(i: number, total: number, startMin: number, endMin: number, prevSummary: string): string {
  const range = `${Math.floor(startMin / 60)}:${String(startMin % 60).padStart(2, '0')} to ${Math.floor(endMin / 60)}:${String(endMin % 60).padStart(2, '0')}`
  const context = i > 0 && prevSummary ? `\nPREVIOUS: ${prevSummary}\n` : ''
  
  return `Transcribe time range ${range} (chunk ${i + 1}/${total}).${context}

Format:
===TITLE===
[Section title]
===TRANSCRIPT===
[Full transcript with speakers]
===SUMMARY===
[2-3 sentences]
===TOPICS===
[Topic1, Topic2]
===END===`
}

function parseChunkResponse(text: string, i: number, startMin: number, endMin: number): TranscriptSection | null {
  const title = text.match(/===TITLE===\s*([\s\S]*?)(?====|$)/i)?.[1]?.trim()
  const content = text.match(/===TRANSCRIPT===\s*([\s\S]*?)(?====|$)/i)?.[1]?.trim() || text
  const summary = text.match(/===SUMMARY===\s*([\s\S]*?)(?====|$)/i)?.[1]?.trim()
  const topics = text.match(/===TOPICS===\s*([\s\S]*?)(?====|$)/i)?.[1]?.trim().split(',').map(t => t.trim())

  if (content.length < 50) return null

  const fmt = (m: number) => m >= 60 ? `${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}:00` : `${m}:00`
  
  return {
    chunk_index: i,
    timestamp_start: fmt(startMin),
    timestamp_end: fmt(endMin),
    title: title || `Part ${i + 1}`,
    content,
    summary: summary || content.substring(0, 200) + '...',
    topics: topics || [],
  }
}

function getFinalAnalysisPrompt(sections: TranscriptSection[]): string {
  const summaries = sections.map(s => `[${s.timestamp_start}] ${s.title}: ${s.summary}`).join('\n')
  return `Analyze:\n${summaries}\n\nReturn JSON: {"title":"","summary":"","main_topics":[],"glossary":[{"term":"","definition":""}],"insights":[{"type":"strength|improvement|tip","title":"","description":""}],"conclusion":""}`
}

async function updateProgress(supabase: ReturnType<typeof createClient>, id: string, chunk: number, msg: string) {
  await supabase.from('audio_analyses').update({
    processing_status: 'processing',
    completed_chunks: chunk,
    current_chunk_message: msg,
  }).eq('id', id)
}

async function updateError(supabase: ReturnType<typeof createClient>, id: string, recId: string, msg: string) {
  await supabase.from('audio_analyses').update({
    processing_status: 'error',
    error_message: msg,
  }).eq('id', id)
  await supabase.from('recordings').update({ status: 'error' }).eq('id', recId)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

