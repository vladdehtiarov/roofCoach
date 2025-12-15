import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

// Note: On Render, there's no serverless timeout limit like Vercel
// The process can run as long as needed

const TRANSCRIPTION_MODEL = 'gemini-2.5-flash' // Cheaper & faster for transcription
const ANALYSIS_MODEL = 'gemini-3-pro-preview' // Best model for W4 analysis

// Pricing per 1M tokens (USD)
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
  'gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
}

// Retry configuration (no timeout - Render allows long-running processes)
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000 // 5 seconds base delay

// Retry helper with exponential backoff (no artificial timeout)
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 ${context} - Attempt ${attempt}/${maxRetries}...`)
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`⚠️ ${context} - Attempt ${attempt}/${maxRetries} failed:`, lastError.message)
      
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1) // Exponential backoff: 5s, 10s, 20s
        console.log(`⏳ Retrying in ${delay / 1000}s...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }
  
  throw lastError || new Error(`${context} failed after ${maxRetries} attempts`)
}

// Transcription prompt - simple and focused
const TRANSCRIPTION_PROMPT = `Transcribe the entire audio recording verbatim and accurately.

OUTPUT FORMAT:
Return only the transcript in this format:

MM:SS - Speaker Name
      What they said...

MM:SS - Other Speaker
      Their response...

REQUIREMENTS:
1. Add a timestamp at every speaker change (MM:SS or HH:MM:SS).
2. Identify speakers by name if stated; otherwise use “Speaker 1”, “Speaker 2”, etc.
3. Include all speech — no summarizing or paraphrasing.
4. Keep filler words, hesitations, and interruptions.
5. Mark unclear words as [inaudible] or [unclear].
6. The transcript must cover the full duration of the recording.
7. Output plain text only — no markdown, no commentary.`

// Helper functions
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProgress(supabase: any, analysisId: string, message: string, stage?: string) {
  const update: Record<string, unknown> = { current_chunk_message: message }
  if (stage) update.processing_stage = stage
  await supabase.from('audio_analyses').update(update).eq('id', analysisId)
}

function getMimeType(filePath: string): string {
  if (filePath.endsWith('.wav')) return 'audio/wav'
  if (filePath.endsWith('.m4a')) return 'audio/mp4'
  if (filePath.endsWith('.mp4')) return 'audio/mp4'
  if (filePath.endsWith('.webm')) return 'audio/webm'
  if (filePath.endsWith('.ogg')) return 'audio/ogg'
  if (filePath.endsWith('.flac')) return 'audio/flac'
  return 'audio/mpeg'
}

// ============================================================================
// MAIN API HANDLER
// ============================================================================
export async function POST(request: Request) {
  try {
    await loadGenAI()
    
    const supabase = await createClient()
    if (!supabase) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 500 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { recordingId, filePath, transcriptOnly = false } = await request.json()
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

    console.log(`🎙️ Starting transcription: ${recording.file_name} (${formatTime(durationSeconds)})`)

    // Create or update analysis record
    const { data: existingAnalysis } = await supabase
      .from('audio_analyses')
      .select('id, processing_status, processing_stage')
      .eq('recording_id', recordingId)
      .single()

    let analysisId: string

    if (existingAnalysis) {
      if (existingAnalysis.processing_stage === 'transcribing') {
        return NextResponse.json({ message: 'Transcription already in progress' }, { status: 400 })
      }
      
      // For transcriptOnly mode, don't change processing_stage (W4 is already done)
      const updateData = transcriptOnly 
        ? {
            transcript: '', // Reset transcript
            error_message: null,
          }
        : {
            processing_status: 'processing',
            processing_stage: 'transcribing',
            current_chunk_message: 'Starting transcription...',
            error_message: null,
            transcript: '', // Reset transcript
          }
      
      const { error: updateError } = await supabase.from('audio_analyses').update(updateData).eq('id', existingAnalysis.id)
      
      if (updateError) {
        console.error('❌ Failed to update analysis record:', updateError)
        return NextResponse.json({ message: 'Failed to update analysis record' }, { status: 500 })
      }
      analysisId = existingAnalysis.id
    } else {
      const { data: newAnalysis, error: createError } = await supabase
        .from('audio_analyses')
        .insert({
          recording_id: recordingId,
          processing_status: 'processing',
          processing_stage: 'transcribing',
          current_chunk_message: 'Starting transcription...',
          transcript: '',
          title: 'Transcribing...',
          summary: '',
          language: 'en',
          confidence_score: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          model_used: TRANSCRIPTION_MODEL,
          estimated_cost_usd: 0,
        })
        .select()
        .single()

      if (createError || !newAnalysis) {
        console.error('❌ Failed to create analysis record:', createError)
        return NextResponse.json({ message: 'Failed to create analysis record' }, { status: 500 })
      }
      analysisId = newAnalysis.id
    }

    // Start transcription in background
    processTranscription({
      supabase,
      geminiApiKey,
      analysisId,
      recordingId,
      filePath: analysisFilePath,
      durationSeconds,
      transcriptOnly, // When true, only generate transcript (no W4 analysis)
    }).catch(err => console.error('Transcription error:', err))

    return NextResponse.json({
      success: true,
      analysisId,
      message: 'Transcription started',
      stage: 'transcribing',
    })

  } catch (error) {
    console.error('❌ Transcription API error:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// ============================================================================
// TRANSCRIPTION PROCESSING
// ============================================================================
async function processTranscription(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  geminiApiKey: string
  analysisId: string
  recordingId: string
  filePath: string
  durationSeconds: number
  transcriptOnly?: boolean
}) {
  const { supabase, geminiApiKey, analysisId, recordingId, filePath, durationSeconds, transcriptOnly = false } = params

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })

    // Step 1: Get signed URL
    console.log('🔗 Getting signed URL...')
    await updateProgress(supabase, analysisId, 'Preparing audio file...')

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600)

    if (signedUrlError || !signedUrlData) {
      throw new Error('Failed to get signed URL')
    }

    // Step 2: Download and upload to Gemini
    console.log('📤 Uploading to Gemini...')
    await updateProgress(supabase, analysisId, 'Uploading audio to AI...')

    const mimeType = getMimeType(filePath)
    
    // Fetch audio from storage
    const audioResponse = await fetch(signedUrlData.signedUrl, {
      signal: AbortSignal.timeout(300000), // 5 min timeout
    })
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`)
    }
    
    const audioBlob = await audioResponse.blob()
    const audioBuffer = await audioBlob.arrayBuffer()
    
    // Upload to Gemini
    const uploadResult = await ai.files.upload({
      file: new Blob([audioBuffer], { type: mimeType }),
      config: { mimeType },
    })

    if (!uploadResult.uri) {
      throw new Error('Upload returned no URI')
    }

    console.log(`✅ File uploaded: ${uploadResult.name}`)
    console.log(`📊 Initial file state: ${uploadResult.state}`)

    // Step 3: Wait for processing - MUST be ACTIVE before use
    let file = uploadResult
    let waitCount = 0
    const maxWait = 60 // Max 5 minutes (60 * 5 seconds)
    
    while (file.state !== 'ACTIVE') {
      if (file.state === 'FAILED') {
        throw new Error('Gemini file processing failed')
      }
      
      waitCount++
      if (waitCount > maxWait) {
        throw new Error(`File processing timeout after ${maxWait * 5} seconds. State: ${file.state}`)
      }
      
      console.log(`⏳ Waiting for file to be ACTIVE... (${waitCount}/${maxWait}, state: ${file.state})`)
      await updateProgress(supabase, analysisId, `AI is processing audio... (${Math.round(waitCount * 5 / 60)}m)`)
      await new Promise(resolve => setTimeout(resolve, 5000))
      file = await ai.files.get({ name: file.name! })
    }
    
    console.log(`✅ File is ACTIVE and ready!`)

    // Step 4: Generate transcription with STREAMING (prevents timeout)
    console.log('🎙️ Generating transcription (streaming)...')
    await updateProgress(supabase, analysisId, 'Transcribing audio...')

    const durationStr = formatTime(durationSeconds)
    const dynamicPrompt = `AUDIO DURATION: ${durationStr} (${Math.round(durationSeconds / 60)} minutes)
Transcribe the ENTIRE recording from start to finish.

${TRANSCRIPTION_PROMPT}`

    // Use streaming to prevent timeout for long audio
    const stream = await ai.models.generateContentStream({
      model: TRANSCRIPTION_MODEL,
      contents: createUserContent([
        createPartFromUri(file.uri!, mimeType),
        dynamicPrompt,
      ]),
      config: {
        temperature: 0.3,
        maxOutputTokens: 100000,
      },
    })

    // Collect streamed chunks
    let transcript = ''
    let chunkCount = 0
    let inputTokens = 0
    let outputTokens = 0

    for await (const chunk of stream) {
      const text = chunk.text || ''
      transcript += text
      chunkCount++
      
      // Update progress every 10 chunks
      if (chunkCount % 10 === 0) {
        const charCount = transcript.length
        console.log(`📝 Chunk ${chunkCount}: ${charCount} characters so far...`)
        await updateProgress(supabase, analysisId, `Transcribing... (${Math.round(charCount / 1000)}k chars)`)
      }

      // Get token counts from last chunk
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens
      }
    }

    console.log(`📊 Transcription complete: ${chunkCount} chunks, ${inputTokens} in, ${outputTokens} out`)

    // Cleanup Gemini file
    try {
      await ai.files.delete({ name: file.name! })
      console.log('🗑️ Cleaned up Gemini file')
    } catch {
      // Ignore cleanup errors
    }

    console.log(`✅ Transcription complete! ${transcript.length} characters`)

    // If transcript only, mark as done and return
    if (transcriptOnly) {
      await supabase.from('audio_analyses').update({
        transcript: transcript,
        processing_status: 'done', // Mark overall status as done (not processing)
        processing_stage: 'done', // Transcript only - mark as done
        current_chunk_message: 'Transcription complete!',
        transcription_completed_at: new Date().toISOString(),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      }).eq('id', analysisId)
      
      console.log('✅ Transcript-only mode - done!')
      return
    }

    // Step 5: Save transcript and move to W4 analysis stage
    await supabase.from('audio_analyses').update({
      transcript: transcript,
      processing_stage: 'analyzing', // Ready for W4 analysis
      current_chunk_message: 'Transcription complete! Starting W4 analysis...',
      transcription_completed_at: new Date().toISOString(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    }).eq('id', analysisId)

    // Auto-trigger W4 analysis
    console.log('🤖 Auto-starting W4 analysis...')
    
    // Call analyze endpoint internally
    await processW4Analysis({
      supabase,
      geminiApiKey,
      analysisId,
      recordingId,
      filePath,
      durationSeconds,
      transcript,
    })

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ Transcription error:', errMsg)

    await supabase.from('audio_analyses').update({
      processing_status: 'error',
      processing_stage: 'error',
      error_message: errMsg.substring(0, 500),
      current_chunk_message: 'Transcription failed',
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId)
  }
}

// ============================================================================
// W4 ANALYSIS (called after transcription)
// ============================================================================
async function processW4Analysis(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  geminiApiKey: string
  analysisId: string
  recordingId: string
  filePath: string
  durationSeconds: number
  transcript: string
}) {
  const { supabase, geminiApiKey, analysisId, recordingId, filePath, durationSeconds, transcript } = params

  try {
    const ai = new GoogleGenAI({ apiKey: geminiApiKey })
    
    await updateProgress(supabase, analysisId, 'Starting W4 analysis...', 'analyzing')

    // Re-upload audio for analysis (need tone, pauses, etc.)
    console.log('📤 Re-uploading audio for W4 analysis...')
    
    const { data: signedUrlData } = await supabase.storage
      .from('audio-files')
      .createSignedUrl(filePath, 3600)

    if (!signedUrlData) {
      throw new Error('Failed to get signed URL for analysis')
    }

    const mimeType = getMimeType(filePath)
    
    // Fetch audio from storage
    const audioResponse = await fetch(signedUrlData.signedUrl, {
      signal: AbortSignal.timeout(300000),
    })
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`)
    }
    
    const audioBlob = await audioResponse.blob()
    const audioBuffer = await audioBlob.arrayBuffer()
    
    // Upload to Gemini
    const uploadResult = await ai.files.upload({
      file: new Blob([audioBuffer], { type: mimeType }),
      config: { mimeType },
    })

    if (!uploadResult.uri) {
      throw new Error('Upload returned no URI')
    }

    console.log(`✅ File uploaded for W4: ${uploadResult.name}`)
    console.log(`📊 Initial file state: ${uploadResult.state}`)

    // Wait for processing - MUST be ACTIVE before use
    let file = uploadResult
    let waitCount = 0
    const maxWait = 60
    
    while (file.state !== 'ACTIVE') {
      if (file.state === 'FAILED') {
        throw new Error('Gemini file processing failed')
      }
      
      waitCount++
      if (waitCount > maxWait) {
        throw new Error(`File processing timeout. State: ${file.state}`)
      }
      
      console.log(`⏳ Waiting for W4 file to be ACTIVE... (${waitCount}/${maxWait})`)
      await updateProgress(supabase, analysisId, `Processing audio for analysis... (${Math.round(waitCount * 5 / 60)}m)`)
      await new Promise(resolve => setTimeout(resolve, 5000))
      file = await ai.files.get({ name: file.name! })
    }
    
    console.log(`✅ W4 file is ACTIVE!`)

    // W4 Analysis with BOTH audio and transcript
    console.log('🤖 Running W4 analysis...')
    await updateProgress(supabase, analysisId, 'Analyzing with W4 methodology...')

    const W4_ANALYSIS_PROMPT = buildW4Prompt(durationSeconds, transcript)

    // Direct call without retry
    const response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: createUserContent([
        createPartFromUri(file.uri!, mimeType),
        W4_ANALYSIS_PROMPT,
      ]),
      config: {
        temperature: 0.3,
        maxOutputTokens: 50000,
        responseMimeType: 'application/json',
      },
    })

    const responseText = response.text || ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let analysisResult: any

    try {
      analysisResult = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse W4 analysis response')
      }
    }

    // Build W4 report
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

    const title = `${w4Report.rep_name} - ${w4Report.client_name} (${w4Report.overall_performance.rating}: ${w4Report.overall_performance.total_score}/100)`

    const inputTokens = response.usageMetadata?.promptTokenCount || 0
    const outputTokens = response.usageMetadata?.candidatesTokenCount || 0

    // Save final results
    await supabase.from('audio_analyses').update({
      title: title,
      summary: w4Report.overall_performance.summary || '',
      w4_report: w4Report,
      processing_status: 'done',
      processing_stage: 'done',
      current_chunk_message: 'Analysis complete!',
      analysis_completed_at: new Date().toISOString(),
      confidence_score: 0.9,
      duration_analyzed: durationSeconds,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      model_used: ANALYSIS_MODEL,
      estimated_cost_usd: (inputTokens / 1_000_000) * GEMINI_PRICING[ANALYSIS_MODEL].input + (outputTokens / 1_000_000) * GEMINI_PRICING[ANALYSIS_MODEL].output,
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'done' }).eq('id', recordingId)

    // Cleanup
    try {
      await ai.files.delete({ name: file.name! })
    } catch {
      // Ignore
    }

    console.log(`🎉 W4 Analysis complete! Score: ${w4Report.overall_performance.total_score}/100 (${w4Report.overall_performance.rating})`)

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ W4 Analysis error:', errMsg)

    await supabase.from('audio_analyses').update({
      processing_status: 'error',
      processing_stage: 'error',
      error_message: `W4 Analysis failed: ${errMsg.substring(0, 400)}`,
      current_chunk_message: 'Analysis failed',
    }).eq('id', analysisId)

    await supabase.from('recordings').update({ status: 'error' }).eq('id', recordingId)
  }
}

// ============================================================================
// W4 PROMPT BUILDER - Full client prompt with JSON output
// ============================================================================
function buildW4Prompt(durationSeconds: number, transcript: string): string {
  const durationStr = formatTime(durationSeconds)
  
  return `## ROLE
You are RoofCoach, an expert roofing sales coaching AI trained in the W4 Sales System methodology. Your purpose is to analyze roofing sales call transcripts with extreme precision, evaluate performance objectively against the comprehensive RepFuel AI Rubric, and produce detailed coaching reports. Your tone must be professional, direct, and actionable—exactly how a top sales coach would deliver feedback to a sales rep, providing feedback that is both diagnostic and prescriptive.

## AUDIO INFORMATION
AUDIO DURATION: ${durationStr} (${Math.round(durationSeconds / 60)} minutes)

You have access to:
1. THE AUDIO FILE - Use this to evaluate tone, pauses, silence, pacing, confidence
2. THE TRANSCRIPT (below) - Use this for content analysis

TRANSCRIPT:
---
${transcript}
---

IMPORTANT: Use the AUDIO to evaluate:
- Post-Close Silence (detect actual silence duration after closing question)
- Pacing/speaking speed
- Tone confidence during price presentation
- Who interrupts whom
- Emotional cues (sighs, hesitation, enthusiasm)

Use the TRANSCRIPT to evaluate:
- What was said (content)
- Questions asked (Q1-Q16)
- FBAL structure usage
- Tie-downs and responses

## TASK
Given the sales transcript above, produce a structured analysis that contains:

1. **Overall Performance Summary:** A scorecard with total score, rating, and concise summary of call effectiveness
2. **Detailed Checkpoint Scoring:** Breakdown of scores for each of the 16 checkpoints within WHY, WHAT, WHO, and WHEN phases
3. **Evidence-Based Justifications:** For each checkpoint, provide specific examples from the transcript showing what was done correctly and what was missed or done incorrectly
4. **Actionable Coaching Recommendations:** Specific, practical advice tied directly to identified weaknesses

Your analysis must be grounded in the RepFuel AI Rubric, and all feedback must be supported by direct evidence from the transcript. Avoid filler language—every comment should have coaching value, either reinforcing best practice or identifying a correction.

## W4 SYSTEM CONTEXT & SCORING FRAMEWORK

**Total Score: 0-100 points**
- **WHY Phase: 38% weight (0-38 points)**
- **WHAT Phase: 27% weight (0-27 points)**
- **WHO Phase: 25% weight (0-25 points)**
- **WHEN Phase: 10% weight (0-10 points)**

### Scoring Rubric
- **0 – Missed:** Step not attempted or completely ineffective
- **1 – Attempted:** Step partially executed or poorly done
- **2 – Effective:** Step executed successfully and achieved its intent

### Performance Ratings
| Range | Rating |
|:------|:-------|
| 90-100 | **MVP** |
| 75-89 | **Playmaker** |
| 60-74 | **Starter** |
| 45-59 | **Prospect** |
| 0-44 | **Below Prospect** |

## DETAILED SCORING CRITERIA

### WHY PHASE (38 POINTS TOTAL)

#### 1. Sitdown/Transition (5 points)
**Detection Criteria:** "Is there a place we can sit," "Could we sit inside," "Before I get started, can we sit down"

**Successful Outcome:** Rep is inside the home, seated with homeowner, and homeowner participates in the interview process where the salesperson asks the Assessment Questions.

**Common Errors to Avoid:** Allowing full presentation in driveway; skipping straight to findings without sitdown.

**Scoring:**
- 5 points: Clear request with benefit statement, successful indoor transition, homeowner participates
- 3 points: Request made but missing benefit statement or less smooth transition  
- 1 point: Minimal attempt to create indoor meeting environment
- 0 points: Conducts presentation in driveway/yard or skips sitdown entirely

**Example Full-Credit Quotes:**
- "Before I get started, is there a place we can sit down for a few minutes?"
- "I want to ask you some questions so I make sure I look at the right things."
- "Can we sit inside? This will help me understand what you need."

**Red Flags (Automatic Deductions):**
- ❌ Conducts entire presentation in driveway or garage
- ❌ Skips benefit statement (doesn't explain WHY sitting down helps)
- ❌ Jumps straight to inspection without assessment questions


#### 2. Rapport Building - FORM Method (5 points)
**Detection Criteria:** Personal interest questions beyond small talk.

**Successful Outcome:** Homeowner shares personal details, showing rapport has been built before assessment begins.

**Common Errors to Avoid:** Talking too much about self; dominating conversation; missing FORM structure.

**FORM Elements:**
- **Family:** "How long have you lived here with your family?" "Do you have kids/grandkids?"
- **Occupation:** "What kind of work do you do?" "How long have you worked there?"
- **Recreation:** "What do you like to do for fun?" "Are those your golf clubs?"
- **Material:** "That's a nice truck—work or fun?" "I see you have a pool—spend time there in summer?"

**Scoring:**
- 5 points: Uses 3+ FORM elements naturally, strong personal connection established
- 4 points: Uses 2-3 FORM elements with good rapport building
- 2 points: Uses 1-2 FORM elements or basic rapport attempts
- 1 point: Minimal personal connection, mostly transactional
- 0 points: No rapport building or jumps straight to assessment

**Example Full-Credit Quotes:**
- "How long have you lived here with your family?"
- "What kind of work do you do? How long have you been there?"
- "I see you have a boat—do you get out on the water much?"
- "That's a beautiful garden—do you spend a lot of time out here?"

**Red Flags (Automatic Deductions):**
- ❌ Talks only about self, doesn't ask homeowner questions
- ❌ Jumps straight to assessment without any personal connection
- ❌ Uses only surface-level small talk (weather, traffic)


#### 3. Assessment Questions - Q1-Q16 (12 points)
**Detection Criteria:** Uses guided form or checklist questions.

**Successful Outcome:** Rep gathers clear homeowner input on needs, concerns, and priorities.

**Common Errors to Avoid:** Offering opinions, recommendations, or company processes too early; skipping key questions.

**Must Ask All 16 Questions Systematically:**

**Diagnostic Questions (Q1-Q10) - 7 points:**
1. How were you referred? ("How were you referred to [Company]?")
2. Experiencing leaks? ("Are you experiencing leaks now, or have you in the past?")
3. Leak conditions? ("In what conditions do leaks occur? Every rain? Driving rain?")
4. Shingle blowoff? ("Do you know if you have missing shingles now or in the past?")
5. Granule loss? ("Have you noticed granules in gutters or downspouts?")
6. Issue timeline? ("When did you first notice...?")
7. Repair attempts? ("Have you or someone hired attempted to fix the roof?")
8. Insurance claim? ("Is your roof part of an existing insurance claim?") ← **CRITICAL: Never skip Q8**
9. Time in home? ("How long have you lived in your home?")
10. Roof age? ("Do you know how old the roof is?")

**Motive Questions (Q11-Q13) - 3 points:**
11. Future plans? ("How long do you plan to live here? 3, 5, 7, 10+ years?")
12. Recent inspection? ("Has your roof been professionally inspected in last 5 years?")
13. Work timeline? ("If issues found, when would you want work done?")

**Objective Questions (Q14-Q16) - 2 points:**
14. Other projects? ("Are there other projects you're planning?")
15. Goals? ("What are your goals for the work?")
16. Preferred solution? ("In a perfect world, what solution would you prefer?")

**Scoring:**
- 12 points: Asks all 16 questions systematically using assessment form
- 10 points: Asks 13-15 questions covering all categories
- 8 points: Asks 10-12 questions, covers most categories
- 6 points: Asks 7-9 questions, some gaps in coverage
- 4 points: Asks 4-6 questions, significant gaps
- 2 points: Asks 1-3 questions, minimal assessment
- 0 points: No systematic assessment questions

**Example Full-Credit Execution:**
- Systematically asks all 16 questions using assessment form
- Takes notes on homeowner responses
- Does NOT offer solutions or recommendations during assessment
- Confirms understanding: "So if I heard you right, you're planning to stay here 10+ years?"

**Red Flags (Automatic Deductions):**
- ❌ Skips Q8 (insurance claim question) - CRITICAL MISS
- ❌ Offers opinions or solutions during assessment phase
- ❌ Skips entire categories (e.g., no motive questions asked)
- ❌ Rushes through questions without listening to answers


#### 4. Inspection (3 points)
**Detection Criteria:** Transcript mentions attic/roof photos, diagramming issues.

**Successful Outcome:** Rep references findings from inspection to support later presentation.

**Common Errors to Avoid:** Cutting corners; failing to take photos; not referencing findings later.

**Scoring:**
- 3 points: Complete roof and attic inspection with photos/diagram, findings referenced later
- 2 points: Good inspection process, some documentation
- 1 point: Basic inspection mentioned
- 0 points: No clear inspection process or cutting corners

**Example Full-Credit Execution:**
- "I'm going to take some photos and diagram what I find"
- References specific photos later: "Remember this photo I showed you of the high nails?"
- Shows attic inspection photos with clear issues documented

**Red Flags (Automatic Deductions):**
- ❌ No mention of taking photos or documenting findings
- ❌ Doesn't reference inspection findings during presentation
- ❌ Skips attic inspection entirely


#### 5. Present Findings (5 points)
**Detection Criteria:** Clear presentation of problems, no skipping to solution.

**Successful Outcome:** Homeowner acknowledges or shows understanding of roof condition before moving to solution.

**Common Errors to Avoid:** Jumping into solutions, product talk, how the company addresses these issues; talking over homeowner.

**What to Look For:**
- Uses Red/Yellow/Green system to categorize severity
- 3-step explanation for each issue:
  1. What the issue IS (define problem simply)
  2. WHY it occurred (wear, poor installation, storm/animal)  
  3. IMPLICATIONS now and if not addressed (what happens next)
- References roof diagram, photos, checklist for proof
- No solutions offered during findings presentation

**Scoring:**
- 5 points: Complete R/Y/G system, consistent 3-step explanations, visual proof, no solutions
- 4 points: Good findings structure, most issues explained properly
- 3 points: Basic findings presentation, some 3-step explanations
- 2 points: Findings presented but missing key structure elements
- 1 point: Minimal findings presentation
- 0 points: No clear findings presentation or jumps to solutions

**Example Full-Credit Execution:**
- "Let me show you what I found, using red for urgent, yellow for monitor, green for good"
- For each issue: "This IS [problem]. It happened because [cause]. If not addressed, [implication]"
- Uses diagram and photos as proof
- Does NOT mention solutions, products, or company processes

**Red Flags (Automatic Deductions):**
- ❌ Jumps into solutions during findings ("We can fix this with...")
- ❌ Talks about products or company processes
- ❌ Doesn't use Red/Yellow/Green severity system
- ❌ No 3-step explanations (what/why/implications)


#### 6. Tie-Down WHY & Repair vs. Replace (8 points)
**Detection Criteria:** "Do you think your roof needs work?", "What type of work do you think is appropriate?"

**Successful Outcome:** Homeowner verbally confirms agreement that the roof needs work and the type of work that should be done (Repair, Restoration, Replacement).

**Common Errors to Avoid:** Not asking the questions and waiting for answer. Moving forward without agreement; assuming agreement without asking.

**What to Look For:**
- **Standard Script:** "Based on what I've shown you, do you think your roof needs work?"
- **If Active Issue:** "You called in because of [X issue], so we can agree that the roof needs some work. Now that you've seen what I found, what kind of work do you think is appropriate? Repair, restore, replace?"
- "What kind of work do you think would be appropriate—repair, restoration, or replacement?"
- Waits in silence for homeowner's verbal confirmation
- Does not proceed until homeowner agrees

**Repair vs. Replace Assessment (Reference Assessment Form Page 4):**

If homeowner says "repair" but inspection findings show **REPLACE** conditions, rep must educate using the table below:

**REPAIR/RESTORE Conditions:**
- Isolated Roof Covering Failure or Wear
- Isolated Component Failure or Damage
- Minor Storm Related Damage
- Moss, Algae or Roof Debris

**REPLACE Conditions:**
- Widespread Covering Worn Out or Damage
- Widespread Seal Failure
- Pressure Washer Damage
- Improper Fastening
- Manufacturer Defect
- Improper/Damaged Substrate or Ventilation Issues

**If misalignment occurs:** Rep must pause, reference the table, explain why repair is not warrantable, and re-ask for agreement on replacement.

**Scoring:**
- 8 points: Both questions asked confidently, waits for verbal confirmation, homeowner agrees on appropriate work type aligned with evidence
- 6 points: Questions asked but execution could be stronger or doesn't handle repair vs. replace misalignment
- 3 points: Implies need for agreement but doesn't ask directly
- 0 points: Assumes agreement without asking or moves forward without confirmation

**Example Full-Credit Quotes:**
- "Based on what I've shown you, do you think your roof needs work?"
- "What kind of work do you think would be appropriate—repair, restoration, or replacement?"
- "I understand you're hoping for a repair. May I show you why a repair wouldn't address the improper fastening I found throughout the roof?"

**Red Flags (Automatic Deductions):**
- ❌ Uses "feel" instead of "think"
- ❌ Assumes agreement without asking the questions
- ❌ Homeowner says "repair" but rep proceeds without educating on replace conditions
- ❌ Doesn't wait for verbal confirmation before moving forward


### WHAT PHASE (27 POINTS TOTAL)

#### 7. Formal Presentation System (5 points)
**Detection Criteria:** Guide/visual aid reference.

**Successful Outcome:** Homeowner follows along with a structured guide or presentation tool.

**Common Errors to Avoid:** "Freestyling" without structure; skipping visuals.

**What to Look For:**
- Introduces company presentation guide/tool
- Explains purpose: "This guide makes sure I don't accidentally leave anything out"
- Uses guide to structure system options presentation

**Scoring:**
- 5 points: Clear introduction of guide, explains purpose, uses throughout presentation
- 3 points: Uses guide but less clear introduction
- 1 point: Some structure mentioned
- 0 points: Freestyles without guide or structure

**Example Full-Credit Quotes:**
- "I'm going to introduce you to our system guide that walks through all the options"
- "This guide makes sure I don't accidentally leave anything out"
- "Let me show you page by page what goes into a quality roofing system"

**Red Flags (Automatic Deductions):**
- ❌ Freestyles without any structured guide or presentation tool
- ❌ Skips visual aids entirely
- ❌ Doesn't explain purpose of using a guide


#### 8. System Options - FBAL Method (12 points)
**Detection Criteria:** Feature → Benefit → Advantage → Limitations. Example:
**Feature:** "This is a synthetic underlayment made with interwoven fibers and Fusion Back Coating Technology®."
**Benefit:** "That means it repels water and resists tearing."
**Advantage:** "So your home stays protected from leaks even in harsh weather."
**Limitation:** "The tradeoff is it costs a bit more than felt, but it performs far better and lasts longer."

**Successful Outcome:** Homeowner can articulate differences between options and sees value beyond features. Homeowner chooses options as the salesperson shows them. They build the roof together.

**Common Errors to Avoid:** Listing features without benefits; going off-script; using jargon without lifestyle tie-down. Dictating the system being offered by only showing the homeowner what the salesperson "Thinks they will want" or a one size fits all approach.

**What to Look For:**
- Educates on roofing components (shingles, underlayment, flashing, fasteners, ventilation)
- Uses FBAL framework for each option:
  - **Feature** (what it IS): part, material, characteristic
  - **Benefit** (what it DOES): positive impact/function
  - **Advantage** (what it does for YOU): ties to homeowner certainty
  - **Limitation** (what it's NOT good at): weaknesses vs other options
- Asks tie-down/choice questions: "Which shingle option feels right?"

**Scoring:**
- 12 points: Complete FBAL for all major components, homeowner engages and makes choices
- 10 points: FBAL used for most components, good homeowner engagement
- 8 points: Some FBAL structure, covers main components
- 6 points: Basic system education, limited FBAL usage
- 4 points: Minimal system options presentation
- 2 points: Lists features without benefits/advantages
- 0 points: No systematic options presentation

**Example Full-Credit Execution:**
- For each component (shingles, underlayment, ventilation, etc.):
  - **Feature:** "This is architectural shingles with a Class 4 impact rating"
  - **Benefit:** "That means they resist hail damage better than standard shingles"
  - **Advantage:** "So your home stays protected and your insurance rates may be lower"
  - **Limitation:** "The tradeoff is they cost more upfront, but they last 30+ years vs. 20"
- Asks tie-down: "Which shingle option feels right for your home?"

**Red Flags (Automatic Deductions):**
- ❌ Lists features without explaining benefits ("It's GAF Timberline HDZ")
- ❌ Uses jargon without translating to homeowner value
- ❌ Doesn't give homeowner choices—dictates one system
- ❌ Skips limitations (makes everything sound perfect)


#### 9. Backup Recommendations/Visuals (5 points)
**Detection Criteria:** "Here's the sample shingle," "manufacturer spec sheet," "Before and After examples," etc.

**Successful Outcome:** Homeowner visually engages with materials and acknowledges proof/recommendations.

**Common Errors to Avoid:** No physical/visual proof; relying only on words.

**What to Look For:**
- Physical samples (shingles, underlayment, etc.)
- Literature/spec sheets/warranty documentation
- Inspection photos and diagrams
- Manufacturer requirements and building codes referenced

**Scoring:**
- 5 points: Multiple types of visual proof (samples, literature, photos, codes)
- 4 points: 2-3 types of backup evidence used effectively
- 3 points: Some visual proof provided
- 2 points: Limited backup evidence
- 1 point: Minimal visual support
- 0 points: No physical/visual proof, relies only on words

**Example Full-Credit Execution:**
- Shows physical shingle samples: "Feel the difference in weight"
- References manufacturer spec sheets and warranty documents
- Shows inspection photos: "Here's what I found on your roof"
- References building codes: "Code requires X, we're recommending Y for extra protection"

**Red Flags (Automatic Deductions):**
- ❌ No physical samples or visual proof
- ❌ Relies only on verbal descriptions
- ❌ Doesn't reference inspection findings


#### 10. Tie-Down WHAT (5 points)
**Detection Criteria:** "Do you feel that this is the system you can see on your home?"

**Successful Outcome:** Homeowner verbally agrees to the proposed system before price is presented.

**Common Errors to Avoid:** Presenting price before agreement; assuming buy-in without confirmation.

**What to Look For:**
- "Now that we've covered all options, is this the system you can see on your home?"
- Waits in silence for homeowner's verbal agreement
- Homeowner takes psychological ownership using ownership language

**Scoring:**
- 5 points: Clear tie-down question, silence maintained, homeowner verbally agrees with ownership language
- 3 points: Tie-down asked but execution could be stronger
- 1 point: Implies agreement without direct question
- 0 points: Skips tie-down, assumes agreement, moves to price without confirmation

**Example Full-Credit Quotes:**
- "Now that we've covered all the options, is this the system you can see on your home?"
- "Can you picture this on your house?"
- [Waits for homeowner to say "yes" with ownership language]

**Red Flags (Automatic Deductions):**
- ❌ Skips the question entirely and jumps to WHO phase
- ❌ Doesn't wait for verbal agreement
- ❌ Assumes agreement without confirmation


### WHO PHASE (25 POINTS TOTAL)

#### 11. Company Advantages (8 points)
**Detection Criteria:** Explicit mention of company strengths.

**Successful Outcome:** Homeowner acknowledges or affirms confidence in the company's qualifications.

**Common Errors to Avoid:** Only explaining features and benefits of the company processes and warrantees without first introducing the pitfalls of investing without having these processes in place. Generic claims with no proof; talking too long without tie-downs.

**What to Look For:**
- 2-5 strong differentiators in each category:
  - **People Difference**: hiring, training, background checks, certifications
  - **Process Difference**: quality control, installation methods, safety
  - **Company Difference**: licensing, insurance, reputation, awards
- Frames using Universal Value Builders (safety, longevity, investment, certainty)
- Uses examples/analogies to make differences tangible

**Scoring:**
- 8 points: Strong differentiators in all categories, clear value framing, tangible examples
- 6 points: Good advantages in most categories, some value framing
- 4 points: Some company advantages mentioned
- 2 points: Generic claims with minimal proof
- 0 points: No specific company advantages or generic "we're the best" claims

**Example Full-Credit Execution:**
- **People:** "All installers are background-checked, drug-tested, and certified by [manufacturer]"
- **Process:** "We use a 7-point quality control checklist signed off by a supervisor"
- **Company:** "We've been in business 30+ years with an A+ BBB rating and [X] 5-star reviews"
- Frames using Universal Value Builders: "This protects your investment and gives you certainty"

**Red Flags (Automatic Deductions):**
- ❌ Generic claims without proof ("We're the best in town")
- ❌ Only talks about features without explaining why they matter
- ❌ Doesn't differentiate from competitors


#### 12. Pyramid of Pain (8 points)
**Detection Criteria:** Highlights consequences of choosing wrong.

**Successful Outcome:** Homeowner responds emotionally (agreement, concern, relief) to pain vs. solution contrast.

**Common Errors to Avoid:** Presenting positives only; skipping emotional impact. Jumping right to features of services and processes.

**Example:** "We have been in business for 30 years". Vs. "Do you know how long most roofers stay in business? 5 years or less. If your roof has an issue in the next 10 years and the contractor was not in business to help, would that sit well with you? We agree, that's why we are proud to say that we have been in business for..."

**What to Look For:**
- Uses 5-step Pyramid framework (6-8 pyramids maximum):
  1. **Introduce**: Curiosity question homeowner hasn't considered
  2. **Stimulate**: Show what happens when done wrong (stories, scenarios)
  3. **Desire to Eliminate**: Ask if they'd want to avoid this
  4. **Solution**: Present company's unique process using FBAL
  5. **Close**: Get confirmation they want this solution

**Scoring:**
- 8 points: Multiple complete pyramids, homeowner shows concern/relief, strong emotional impact
- 6 points: Some pyramid structure used, good emotional engagement
- 4 points: Basic pain/solution contrast presented
- 2 points: Mentions some risks but weak structure
- 0 points: Only presents positives, no emotional contrast, jumps to features

**Example Full-Credit Execution (Complete Pyramid):**
1. **Introduce:** "Do you know how long most roofers stay in business?"
2. **Stimulate:** "5 years or less. If your roof has an issue in 10 years and they're gone, you're stuck"
3. **Desire to Eliminate:** "Would that sit well with you?"
4. **Solution:** "That's why we've been in business 30+ years with transferable warranties"
5. **Close:** "Does that give you peace of mind?"

**Red Flags (Automatic Deductions):**
- ❌ Only presents positives ("We're great!") without showing pain of alternatives
- ❌ Jumps straight to features without emotional setup
- ❌ Doesn't use complete 5-step pyramid structure


#### 13. WHO Tie-Down (9 points)
**Detection Criteria:** "Do you feel that we are competent and qualified with all the proper training, certifications, insurances and warrantees to install your new roofing system?" (Wait for answer) "Other than the amount, is there any reason you would NOT want our company to be your partner in your new roofing system?"

**Successful Outcome:** Homeowner verbally confirms company is qualified and price is the only remaining objection.

**Common Errors to Avoid:** Not waiting for answer; accepting vague responses; moving forward with unresolved concerns.

**What to Look For:**
- **Company Confidence Question**: "Based on what I've covered, do you feel our company has the proper licenses, insurance, trained employees, and warranties to protect your home?"
- **Pre-Price Filter**: "Other than the amount of the job, is there any reason you wouldn't want [Company] to be the ones to complete this project?"
- Waits 5-10 seconds in silence after each question
- If homeowner hedges (e.g., "We'll check reviews"), rep must pause and resolve before proceeding

**Scoring:**
- 9 points: Asks both questions clearly, maintains silence, gets clear "yes" or resolves any hedge immediately
- 6 points: Asks both questions but accepts hedged/unclear answers
- 3 points: Asks only one of the two questions
- 0 points: Skips WHO tie-down entirely

**Example Full-Credit Quotes:**
- "Based on what I've covered, do you feel our company has the proper licenses, insurance, trained employees, and warranties to protect your home?"
- [Wait 5-10 seconds]
- "Other than the amount of the job, is there any reason you wouldn't want [Company] to be the ones to complete this project?"
- [Wait 5-10 seconds]
- [If hedging: "Let me address that concern before we talk about price"]

**Red Flags (Automatic Deductions):**
- ❌ Skips one or both questions
- ❌ Doesn't wait for answer (rushes through)
- ❌ Accepts hedged answers without resolving ("We'll think about it")
- ❌ Moves to price with unresolved concerns


### WHEN PHASE (10 POINTS TOTAL)

#### 14. Price Presentation (5 points)
**Detection Criteria:** Clear statement of total investment and monthly payment options.

**Successful Outcome:** Price delivered confidently with alternate-choice close.

**Common Errors to Avoid:** Apologizing for price; weak delivery; no closing question.

**What to Look For:**
- States total investment clearly
- Presents monthly payment option with rate and term
- Uses alternate-choice close: "Which option will work better for you—the total investment of $X or the monthly payment of $Y?"

**Scoring:**
- 5 points: Clear total and monthly options, confident delivery, alternate-choice close
- 3 points: Price presented but weak close or missing monthly option
- 1 point: Price mentioned but poor delivery
- 0 points: No clear price presentation

**Example Full-Credit Quotes:**
- "The total investment for everything we've discussed is $22,240"
- "We can also structure this as $278 per month at 6.99% for 10 years"
- "Which option works better for you—the total investment of $22,240 or the monthly payment of $278?"

**Red Flags (Automatic Deductions):**
- ❌ Apologizes for price or shows weakness
- ❌ Doesn't present monthly payment option
- ❌ No alternate-choice close
- ❌ Presents price without confidence


#### 15. Post-Close Silence (5 points)
**Detection Criteria:** After closing question, rep stops talking.

**Successful Outcome:** Rep maintains **absolute silence** until homeowner speaks first.

**Common Errors to Avoid:** Speaking before homeowner; breaking silence with clarifying questions; filling awkward silence.

**What to Look For:**
- After alternate-choice close, rep goes completely silent
- Rep does NOT speak until homeowner responds
- **No exceptions** - silence must be maintained regardless of how long it takes

**Scoring:**
- 5 points: Rep remains completely silent until homeowner speaks first
- 0 points: Rep speaks before homeowner, breaking the silence

**What Full Credit Looks Like:**
- Rep asks closing question
- Rep goes completely silent
- Rep maintains silence for 5, 10, 15+ seconds if needed
- Rep does NOT speak until homeowner speaks first
- NO EXCEPTIONS

**Red Flags (Automatic Deductions - ALL result in 0 points):**
- ❌ Rep breaks silence with clarifying questions
- ❌ Rep repeats the price
- ❌ Rep offers to "go over" anything
- ❌ Rep makes jokes or small talk
- ❌ ANY talking before homeowner speaks = 0 points


## EXECUTION GUIDELINES

1. **Precision:** Base every justification on transcript evidence—quote or paraphrase specific examples.  
2. **Objectivity:** Never inflate scores; stay consistent with the rubric.  
3. **Clarity:** Use plain language suitable for roofing sales professionals.  
4. **Actionable Coaching:** Every recommendation must be something the rep can *immediately* apply.  
5. **Tone:** Professional, direct, and encouraging—like a one-on-one sales manager debrief.  
6. **Evidence-Based:** Support every score and suggestion with a quote or behavior.  
7. **Comprehensive Coverage:** Evaluate all 16 checkpoints even if some score 0.


## QUICK WINS SECTION

After completing your analysis, identify the 1-2 easiest changes that would boost the rep's score the most.


## OUTPUT FORMAT (JSON)

Return your analysis as a valid JSON object with this exact structure:

{
  "client_name": "Client Name from transcript",
  "rep_name": "Rep Name from transcript",
  "company_name": "Company Name from transcript",
  "overall_performance": {
    "total_score": <number 0-100>,
    "rating": "MVP|Playmaker|Starter|Prospect|Below Prospect",
    "summary": "1-3 sentence overview of call performance and sales effectiveness."
  },
  "phases": {
    "why": {
      "score": <number 0-38>,
      "max_score": 38,
      "checkpoints": [
        {"name": "Sitdown / Transition", "score": <number 0-5>, "max_score": 5, "justification": "Evidence and reasoning with specific examples."},
        {"name": "Rapport Building – FORM Method", "score": <number 0-5>, "max_score": 5, "justification": "Evidence and reasoning with FORM elements identified."},
        {"name": "Assessment Questions (Q1–Q16)", "score": <number 0-12>, "max_score": 12, "justification": "Evidence and reasoning with count of questions by category. Note if Q8 was missed."},
        {"name": "Inspection", "score": <number 0-3>, "max_score": 3, "justification": "Evidence about inspection thoroughness."},
        {"name": "Present Findings", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about R/Y/G system usage."},
        {"name": "Tie-Down WHY & Repair vs. Replace", "score": <number 0-8>, "max_score": 8, "justification": "Evidence about verbal commitment and handling of repair vs. replace."}
      ]
    },
    "what": {
      "score": <number 0-27>,
      "max_score": 27,
      "checkpoints": [
        {"name": "Formal Presentation System", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about guide usage."},
        {"name": "System Options – FBAL Method", "score": <number 0-12>, "max_score": 12, "justification": "Evidence about FBAL framework usage."},
        {"name": "Backup Recommendations/Visuals", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about visual proof usage."},
        {"name": "Tie-Down WHAT", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about system agreement."}
      ]
    },
    "who": {
      "score": <number 0-25>,
      "max_score": 25,
      "checkpoints": [
        {"name": "Company Advantages", "score": <number 0-8>, "max_score": 8, "justification": "Evidence about differentiators presented."},
        {"name": "Pyramid of Pain", "score": <number 0-8>, "max_score": 8, "justification": "Evidence about emotional contrast usage."},
        {"name": "WHO Tie-Down", "score": <number 0-9>, "max_score": 9, "justification": "Evidence about qualification questions."}
      ]
    },
    "when": {
      "score": <number 0-10>,
      "max_score": 10,
      "checkpoints": [
        {"name": "Price Presentation", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about price delivery and closing."},
        {"name": "Post-Close Silence", "score": <number 0-5>, "max_score": 5, "justification": "Evidence about silence maintenance. LISTEN TO AUDIO for actual silence duration."}
      ]
    }
  },
  "what_done_right": [
    "Specific positive behavior 1 with evidence",
    "Specific positive behavior 2 with evidence",
    "Specific positive behavior 3 with evidence"
  ],
  "areas_for_improvement": [
    {"area": "Specific improvement area 1", "recommendation": "Actionable steps to improve"},
    {"area": "Specific improvement area 2", "recommendation": "Actionable steps to improve"},
    {"area": "Specific improvement area 3", "recommendation": "Actionable steps to improve"}
  ],
  "weakest_elements": [
    "Critical deficiency 1 with specific impact",
    "Critical deficiency 2 with specific impact"
  ],
  "coaching_recommendations": {
    "rapport_building": "Specific, actionable recommendation with examples",
    "structured_communication": "Specific, actionable recommendation with examples",
    "tie_downs": "Specific, actionable recommendation with examples",
    "post_price_silence": "The sales rep must NOT speak until the homeowner does. No exceptions."
  },
  "rank_assessment": {
    "current_rank": "MVP|Playmaker|Starter|Prospect|Below Prospect",
    "next_level_requirements": "What specifically needs improvement to reach next rank"
  },
  "quick_wins": [
    {"title": "Highest-impact improvement", "action": "Specific 1-sentence action", "points_worth": <number>},
    {"title": "Second improvement", "action": "Specific 1-sentence action", "points_worth": <number>}
  ]
}

Return ONLY valid JSON, no markdown or extra text.`
}
