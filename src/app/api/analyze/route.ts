import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { W4_ANALYSIS_PROMPT } from './w4-prompt'

// Dynamic import to avoid build issues
let GoogleGenAI: typeof import('@google/genai').GoogleGenAI
let createUserContent: typeof import('@google/genai').createUserContent
let createPartFromUri: typeof import('@google/genai').createPartFromUri

async function loadGenAI() {
  if (!GoogleGenAI) {
    const genai = await import('@google/genai')
    GoogleGenAI = genai.GoogleGenAI
    createUserContent = genai.createUserContent
    createPartFromUri = genai.createPartFromUri
  }
}

// Serverless function timeout (15 minutes for long audio)
export const maxDuration = 900

// Configuration
const MODEL_NAME = 'gemini-3-pro-preview' // Better quality for W4 analysis

// Gemini pricing (per 1M tokens)
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
}

// W4 prompt imported from ./w4-prompt.ts

// ============================================================================
// Helper functions
// ============================================================================
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProgress(supabase: any, analysisId: string, message: string, progress?: number) {
  await supabase.from('audio_analyses').update({
    current_chunk_message: message,
    ...(progress !== undefined && { completed_chunks: progress }),
  }).eq('id', analysisId)
}

function getMimeType(filePath: string): string {
  if (filePath.endsWith('.wav')) return 'audio/wav'
  if (filePath.endsWith('.m4a')) return 'audio/mp4'
  if (filePath.endsWith('.mp4')) return 'audio/mp4'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  if (filePath.endsWith('.ogg')) return 'audio/ogg'
  if (filePath.endsWith('.flac')) return 'audio/flac'
  return 'audio/mpeg' // default to mp3
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: Request) {
  try {
    // Load Gen AI SDK dynamically
    await loadGenAI()
    
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { recordingId, filePath } = await request.json()
    if (!recordingId || !filePath) {
      return NextResponse.json({ message: 'Missing recordingId or filePath' }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ message: 'AI API key not configured' }, { status: 500 })
    }

    // Get recording details
    const { data: recording, error: recordingError } = await supabase
      .from('recordings')
      .select('*')
      .eq('id', recordingId)
      .eq('user_id', user.id)
      .single()

    if (recordingError || !recording) {
      return NextResponse.json({ message: 'Recording not found' }, { status: 404 })
    }

    const durationSeconds = recording.duration || 0
    const analysisFilePath = recording.analysis_file_path || filePath

    console.log(`📊 Starting W4 analysis: ${recording.file_name} (${formatTime(durationSeconds)})`)

    // Create or update analysis record
    const { data: existingAnalysis } = await supabase
      .from('audio_analyses')
      .select('id, processing_status')
      .eq('recording_id', recordingId)
      .single()

    let analysisId: string

    if (existingAnalysis) {
      if (existingAnalysis.processing_status === 'processing') {
        return NextResponse.json({ message: 'Analysis already in progress' }, { status: 400 })
      }
      const { error: updateError } = await supabase.from('audio_analyses').update({
        processing_status: 'processing',
        processing_stage: 'analyzing', // Direct to W4 analysis (no transcription step)
        current_chunk_message: 'Starting W4 analysis...',
        error_message: null,
      }).eq('id', existingAnalysis.id)
      
      if (updateError) {
        console.error('❌ Failed to update analysis record:', updateError)
        return NextResponse.json({ 
          message: 'Failed to update analysis record', 
          error: updateError.message 
        }, { status: 500 })
      }
      analysisId = existingAnalysis.id
    } else {
      const { data: newAnalysis, error: createError } = await supabase
        .from('audio_analyses')
        .insert({
          recording_id: recordingId,
          processing_status: 'processing',
          processing_stage: 'analyzing', // Direct to W4 analysis (no transcription step)
          current_chunk_message: 'Starting W4 analysis...',
          transcript: '', // Will be generated on-demand if user requests
          title: 'Analyzing...',
          summary: '',
          language: 'en',
          confidence_score: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          model_used: MODEL_NAME,
          estimated_cost_usd: 0,
        })
        .select()
        .single()

      if (createError || !newAnalysis) {
        console.error('❌ Failed to create analysis record:', createError)
        return NextResponse.json({ 
          message: 'Failed to create analysis record', 
          error: createError?.message,
          details: createError 
        }, { status: 500 })
      }
      analysisId = newAnalysis.id
    }

    // Start processing in background
    processAnalysis({
      supabase,
      geminiApiKey,
      analysisId,
      recordingId,
      filePath: analysisFilePath,
      durationSeconds,
    }).catch(err => console.error('Processing error:', err))

    return NextResponse.json({
      success: true,
      analysisId,
      message: 'W4 Analysis started',
    })

  } catch (error) {
    console.error('❌ Analysis API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    const errorStack = error instanceof Error ? error.stack : ''
    console.error('Stack:', errorStack)
    return NextResponse.json(
      { message: errorMessage, stack: errorStack },
      { status: 500 }
    )
  }
}

// ============================================================================
// MAIN PROCESSING FUNCTION - Using Files API
// ============================================================================
async function processAnalysis(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  geminiApiKey: string
  analysisId: string
  recordingId: string
  filePath: string
  durationSeconds: number
}) {
  const { supabase, geminiApiKey, analysisId, recordingId, filePath, durationSeconds } = params

  try {
    // Initialize new Gen AI SDK
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })

    // Get signed URL and upload to Gemini Files API
    await updateProgress(supabase, analysisId, 'Preparing audio for analysis...')

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600)

    if (signedUrlError || !signedUrlData) {
      throw new Error('Failed to get signed URL for audio file')
    }

    const mimeType = getMimeType(filePath)
    
    // Fetch with simple retry for 5xx errors
    let audioResponse: Response | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      audioResponse = await fetch(signedUrlData.signedUrl)
      if (audioResponse.ok) break
      if (audioResponse.status >= 500 && attempt < 3) {
        console.log(`⚠️ Fetch failed (${audioResponse.status}), retrying in ${attempt * 2}s...`)
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
    
    if (!audioResponse?.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse?.status}`)
    }
    
    const audioBuffer = await (await audioResponse.blob()).arrayBuffer()
    console.log(`📤 Uploading ${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)}MB to Gemini...`)
    
    const uploadResult = await ai.files.upload({
      file: new Blob([audioBuffer], { type: mimeType }),
      config: { mimeType },
    })

    if (!uploadResult.uri) {
      throw new Error('Failed to upload file to Gemini')
    }

    console.log(`✅ File ready: ${uploadResult.name} (${formatTime(durationSeconds)})`)

    // Step 3: Wait for file to be processed
    let file = uploadResult
    while (file.state === 'PROCESSING') {
      console.log('⏳ Waiting for file processing...')
      await updateProgress(supabase, analysisId, 'AI is processing audio file...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      file = await ai.files.get({ name: file.name! })
    }

    if (file.state === 'FAILED') {
      throw new Error('File processing failed')
    }

    // Step 4: Generate W4 analysis
    console.log('🤖 Generating W4 analysis...')
    await updateProgress(supabase, analysisId, 'AI is analyzing the call using W4 methodology...')

    // Try to get prompt from database, fall back to file
    let basePrompt = W4_ANALYSIS_PROMPT
    const { data: dbPrompt } = await supabase
      .from('admin_prompts')
      .select('prompt')
      .eq('name', 'w4_analysis')
      .eq('is_active', true)
      .single()
    
    if (dbPrompt?.prompt) {
      console.log('📝 Using custom prompt from database')
      basePrompt = dbPrompt.prompt
    } else {
      console.log('📝 Using default prompt from file')
    }

    // Add duration info and STRICT scoring rules to prompt
    const durationStr = formatTime(durationSeconds)
    const dynamicPrompt = basePrompt + `

AUDIO DURATION: ${durationStr} (${Math.round(durationSeconds / 60)} minutes).

## STRICT SCORING RULES - MANDATORY
1. **Default to 0 points** - Only give points if you hear CLEAR, EXPLICIT evidence
2. **No assumptions** - If you don't hear it clearly, it didn't happen = 0 points
3. **Partial credit is rare** - "Sort of did it" or "implied" = 0 or 1 point MAX
4. **Be skeptical** - Ask yourself: "Would a tough sales manager accept this as evidence?"
5. **Quote requirement** - Every score above 0 MUST have a direct quote from the audio
6. **When in doubt, score LOWER** - It's better to be too strict than too lenient
7. **Average call = 40-55 points** - A 60+ score means EXCELLENT execution with clear evidence

DO NOT include a full transcript - only key quotes as evidence for scores.
Focus on finding GAPS and WEAKNESSES, not praising what was done.`

    // Use streaming to prevent timeout for long audio
    const stream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: createUserContent([
        createPartFromUri(file.uri!, mimeType),
        dynamicPrompt,
      ]),
      config: {
        temperature: 0.1, // Very low = strict, factual, follows rubric exactly
        maxOutputTokens: 32000, // W4 report should be ~20-30k chars
        responseMimeType: 'application/json',
      },
    })

    // Collect streamed response
    let responseText = ''
    let inputTokens = 0
    let outputTokens = 0
    let chunkCount = 0

    let finishReason = ''
    
    for await (const chunk of stream) {
      responseText += chunk.text || ''
      chunkCount++
      
      // Update progress every 5 chunks
      if (chunkCount % 5 === 0) {
        await updateProgress(supabase, analysisId, `Analyzing... (${Math.round(responseText.length / 1000)}k)`)
        console.log(`📝 W4 chunk ${chunkCount}: ${responseText.length} chars`)
      }
      
      // Get token counts and finish reason from chunk
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens
      }
      
      // Check for finish reason (why the model stopped)
      if (chunk.candidates?.[0]?.finishReason) {
        finishReason = chunk.candidates[0].finishReason
        console.log(`🏁 Finish reason: ${finishReason}`)
      }
    }
    
    // Log finish reason if present
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`⚠️ Model stopped with reason: ${finishReason}`)
    }

    const totalTokens = inputTokens + outputTokens
    console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out, ${totalTokens} total`)
    
    // Check for empty response
    if (!responseText || responseText.trim().length === 0) {
      console.error('❌ Empty response from AI model!')
      console.error('Input tokens:', inputTokens, '- this might be too many')
      console.error('Chunks received:', chunkCount)
      throw new Error(`AI returned empty response. Input tokens: ${inputTokens}. Try with shorter audio or simpler prompt.`)
    }
    
    console.log('📝 Response preview:', responseText.substring(0, 200))
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let analysisResult: any

    try {
      analysisResult = JSON.parse(responseText)
    } catch (parseError) {
      console.warn('⚠️ JSON parse failed, attempting repair...', parseError)
      console.warn('Response length:', responseText.length)
      console.warn('First 500 chars:', responseText.substring(0, 500))
      
      // Try to extract and repair JSON
      let jsonText = responseText
      
      // Remove any markdown code blocks
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')
      
      // Try to find JSON object
      const jsonMatch = jsonText.match(/\{[\s\S]*/)
      if (jsonMatch) {
        jsonText = jsonMatch[0]
        
        // Try to repair truncated JSON by closing brackets
        let openBraces = 0
        let openBrackets = 0
        let inString = false
        let escaped = false
        
        for (const char of jsonText) {
          if (escaped) { escaped = false; continue }
          if (char === '\\') { escaped = true; continue }
          if (char === '"' && !escaped) { inString = !inString; continue }
          if (inString) continue
          if (char === '{') openBraces++
          if (char === '}') openBraces--
          if (char === '[') openBrackets++
          if (char === ']') openBrackets--
        }
        
        // Close unclosed brackets/braces
        jsonText += ']'.repeat(Math.max(0, openBrackets))
        jsonText += '}'.repeat(Math.max(0, openBraces))
        
        try {
          analysisResult = JSON.parse(jsonText)
          console.log('✅ JSON repaired successfully')
        } catch {
          console.error('❌ JSON repair failed. Response length:', responseText.length)
          console.error('First 500 chars:', responseText.substring(0, 500))
          console.error('Last 500 chars:', responseText.substring(responseText.length - 500))
          throw new Error('Failed to parse AI response as JSON - response may be truncated')
        }
      } else {
        throw new Error('No JSON object found in AI response')
      }
    }

    // Step 5: Save results
    const pricing = GEMINI_PRICING[MODEL_NAME] || GEMINI_PRICING['gemini-3-pro-preview']
    const estimatedCost = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output

    // Build W4 report object (without transcript)
    const w4Report = {
      client_name: analysisResult.client_name || 'Unknown',
      rep_name: analysisResult.rep_name || 'Unknown',
      company_name: analysisResult.company_name || 'Unknown',
      overall_performance: analysisResult.overall_performance || {
        total_score: 0,
        rating: 'Below Prospect',
        summary: 'Analysis incomplete',
      },
      phases: analysisResult.phases || {
        why: { score: 0, max_score: 38, checkpoints: [] },
        what: { score: 0, max_score: 27, checkpoints: [] },
        who: { score: 0, max_score: 25, checkpoints: [] },
        when: { score: 0, max_score: 10, checkpoints: [] },
      },
      what_done_right: analysisResult.what_done_right || [],
      areas_for_improvement: analysisResult.areas_for_improvement || [],
      weakest_elements: analysisResult.weakest_elements || [],
      coaching_recommendations: analysisResult.coaching_recommendations || {},
      rank_assessment: analysisResult.rank_assessment || {
        current_rank: 'Below Prospect',
        next_level_requirements: 'Complete fundamental training',
      },
      quick_wins: analysisResult.quick_wins || [],
    }

    // Generate title from report
    const title = `${w4Report.rep_name} - ${w4Report.client_name} (${w4Report.overall_performance.rating}: ${w4Report.overall_performance.total_score}/100)`

    const { error: updateAnalysisError } = await supabase.from('audio_analyses').update({
      // Main data
      title: title,
      summary: w4Report.overall_performance.summary || '',
      // transcript: NOT set here - generated on-demand via /api/transcribe
      
      // W4 Report (new structure)
      w4_report: w4Report,
      
      // Metadata
      processing_status: 'done',
      processing_stage: 'done',
      current_chunk_message: 'W4 Analysis complete!',
      confidence_score: 0.9,
      duration_analyzed: durationSeconds,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      model_used: MODEL_NAME,
      estimated_cost_usd: estimatedCost,
    }).eq('id', analysisId)

    if (updateAnalysisError) {
      console.error('❌ Failed to save analysis result:', updateAnalysisError)
      throw new Error(`Failed to save analysis: ${updateAnalysisError.message}`)
    }

    const { error: updateRecordingError } = await supabase.from('recordings').update({ status: 'done' }).eq('id', recordingId)
    if (updateRecordingError) {
      console.error('⚠️ Failed to update recording status:', updateRecordingError)
    }

    // Step 6: Cleanup - delete file from Gemini (optional, auto-deletes after 48h)
    try {
      await ai.files.delete({ name: file.name! })
      console.log('🗑️ Cleaned up uploaded file')
    } catch {
      // Ignore cleanup errors
    }

    console.log(`🎉 W4 Analysis complete! Score: ${w4Report.overall_performance.total_score}/100 (${w4Report.overall_performance.rating})`)
    console.log(`📊 Tokens: ${totalTokens}, Cost: $${estimatedCost.toFixed(4)}`)

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ Processing error:', errMsg)

    await supabase.from('audio_analyses').update({
      processing_status: 'error',
      processing_stage: 'error',
      error_message: errMsg.substring(0, 500),
      current_chunk_message: 'Error occurred',
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId)
  }
}
