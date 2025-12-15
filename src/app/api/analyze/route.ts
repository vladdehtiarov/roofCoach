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

// Serverless function timeout (15 minutes for long audio)
export const maxDuration = 900

// Configuration
const MODEL_NAME = 'gemini-2.5-flash' // Cheaper & more reliable (same as transcription)

// Gemini pricing (per 1M tokens)
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3-pro-preview': { input: 2.00, output: 12.00 },
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-2.0-flash-exp': { input: 0.075, output: 0.30 },
}

// ============================================================================
// W4 SALES SYSTEM PROMPT (RoofCoach Methodology)
// ============================================================================
const W4_ANALYSIS_PROMPT = `You are RoofCoach, an expert roofing sales coaching AI trained in the W4 Sales System methodology. 
Your purpose is to analyze this sales call recording with extreme precision, evaluate performance objectively against the comprehensive RepFuel AI Rubric, and produce a detailed coaching analysis.

## W4 SYSTEM SCORING FRAMEWORK

**Total Score: 0-100 points**
- **WHY Phase: 38 points** (6 checkpoints)
- **WHAT Phase: 27 points** (4 checkpoints)
- **WHO Phase: 25 points** (3 checkpoints)
- **WHEN Phase: 10 points** (2 checkpoints)

### Performance Ratings
- **MVP:** 90-100 points
- **Playmaker:** 75-89 points
- **Starter:** 60-74 points
- **Prospect:** 45-59 points
- **Below Prospect:** 0-44 points

## DETAILED CHECKPOINT SCORING CRITERIA

### WHY PHASE (38 points total)

1. **Sitdown/Transition (0-5 points)**
   - 5 pts: Clear request with benefit statement, successful indoor transition
   - 3 pts: Request made but missing benefit statement
   - 1 pt: Minimal attempt to create indoor meeting
   - 0 pts: Conducts presentation in driveway or skips sitdown

2. **Rapport Building – FORM Method (0-5 points)**
   - 5 pts: Uses 3+ FORM elements (Family/Occupation/Recreation/Material)
   - 4 pts: Uses 2-3 FORM elements
   - 2 pts: Uses 1-2 elements or basic rapport
   - 0 pts: No rapport building

3. **Assessment Questions Q1-Q16 (0-12 points)**
   - 12 pts: Asks all 16 questions systematically
   - 10 pts: Asks 13-15 questions
   - 8 pts: Asks 10-12 questions
   - 6 pts: Asks 7-9 questions
   - 4 pts: Asks 4-6 questions
   - 0 pts: No systematic assessment
   **CRITICAL:** Q8 (insurance claim) must be asked

4. **Inspection (0-3 points)**
   - 3 pts: Complete roof/attic inspection with photos, findings referenced later
   - 2 pts: Good inspection, some documentation
   - 1 pt: Basic inspection mentioned
   - 0 pts: No clear inspection process

5. **Present Findings (0-5 points)**
   - 5 pts: Complete R/Y/G system, 3-step explanations (What/Why/Implication), visual proof, no solutions yet
   - 3 pts: Basic findings presentation
   - 0 pts: Jumps to solutions or no findings presentation

6. **Tie-Down WHY & Repair vs. Replace (0-8 points)**
   - 8 pts: Both questions asked confidently, waits for verbal confirmation, homeowner agrees
   - 6 pts: Questions asked but doesn't handle misalignment
   - 3 pts: Implies need without direct question
   - 0 pts: Assumes agreement without asking

### WHAT PHASE (27 points total)

7. **Formal Presentation System (0-5 points)**
   - 5 pts: Clear introduction of guide, explains purpose, uses throughout
   - 3 pts: Uses guide but less clear introduction
   - 0 pts: Freestyles without structure

8. **System Options – FBAL Method (0-12 points)**
   - 12 pts: Complete FBAL (Feature/Benefit/Advantage/Limitation) for all major components
   - 10 pts: FBAL for most components
   - 8 pts: Some FBAL structure
   - 4 pts: Minimal options presentation
   - 0 pts: No systematic options presentation

9. **Backup Recommendations/Visuals (0-5 points)**
   - 5 pts: Multiple types of visual proof (samples, literature, photos, codes)
   - 3 pts: Some visual proof
   - 0 pts: No physical/visual proof

10. **Tie-Down WHAT (0-5 points)**
    - 5 pts: Clear tie-down, silence maintained, homeowner verbally agrees
    - 3 pts: Tie-down asked but execution weak
    - 0 pts: Skips tie-down, moves to price without confirmation

### WHO PHASE (25 points total)

11. **Company Advantages (0-8 points)**
    - 8 pts: Strong differentiators in People/Process/Company categories
    - 6 pts: Good advantages in most categories
    - 4 pts: Some advantages mentioned
    - 0 pts: Generic claims or no differentiation

12. **Pyramid of Pain (0-8 points)**
    - 8 pts: Multiple complete 5-step pyramids (Introduce/Stimulate/Desire to Eliminate/Solution/Close)
    - 6 pts: Some pyramid structure used
    - 4 pts: Basic pain/solution contrast
    - 0 pts: Only presents positives, no emotional contrast

13. **WHO Tie-Down (0-9 points)**
    - 9 pts: Asks both questions clearly, maintains silence, gets clear "yes" or resolves hedge
    - 6 pts: Asks both questions but accepts hedged answers
    - 3 pts: Asks only one question
    - 0 pts: Skips WHO tie-down entirely
    **Required questions:**
    - "Do you feel we're properly licensed/insured/trained?"
    - "Other than the amount, any reason you wouldn't want us?"

### WHEN PHASE (10 points total)

14. **Price Presentation (0-5 points)**
    - 5 pts: Clear total and monthly options, confident delivery, alternate-choice close
    - 3 pts: Price presented but weak close
    - 0 pts: No clear price presentation

15. **Post-Close Silence (0-5 points)**
    - 5 pts: Rep remains completely silent until homeowner speaks first
    - 0 pts: Rep speaks before homeowner (ANY talking before HO response = 0)

## OUTPUT FORMAT

Return your analysis as a valid JSON object with this EXACT structure:

{
  "client_name": "Client name from transcript or 'Unknown'",
  "rep_name": "Rep name from transcript or 'Unknown'",
  "company_name": "Company name from transcript or 'Unknown'",
  
  "overall_performance": {
    "total_score": <0-100>,
    "rating": "MVP|Playmaker|Starter|Prospect|Below Prospect",
    "summary": "1-3 sentence overview of call performance"
  },
  
  "phases": {
    "why": {
      "score": <0-38>,
      "max_score": 38,
      "checkpoints": [
        {"name": "Sitdown/Transition", "score": <0-5>, "max_score": 5, "justification": "Evidence with specific quotes or behaviors observed"},
        {"name": "Rapport Building – FORM Method", "score": <0-5>, "max_score": 5, "justification": "..."},
        {"name": "Assessment Questions (Q1–Q16)", "score": <0-12>, "max_score": 12, "justification": "List questions asked/missed, note if Q8 was missed"},
        {"name": "Inspection", "score": <0-3>, "max_score": 3, "justification": "..."},
        {"name": "Present Findings", "score": <0-5>, "max_score": 5, "justification": "..."},
        {"name": "Tie-Down WHY & Repair vs. Replace", "score": <0-8>, "max_score": 8, "justification": "..."}
      ]
    },
    "what": {
      "score": <0-27>,
      "max_score": 27,
      "checkpoints": [
        {"name": "Formal Presentation System", "score": <0-5>, "max_score": 5, "justification": "..."},
        {"name": "System Options – FBAL Method", "score": <0-12>, "max_score": 12, "justification": "..."},
        {"name": "Backup Recommendations/Visuals", "score": <0-5>, "max_score": 5, "justification": "..."},
        {"name": "Tie-Down WHAT", "score": <0-5>, "max_score": 5, "justification": "..."}
      ]
    },
    "who": {
      "score": <0-25>,
      "max_score": 25,
      "checkpoints": [
        {"name": "Company Advantages", "score": <0-8>, "max_score": 8, "justification": "..."},
        {"name": "Pyramid of Pain", "score": <0-8>, "max_score": 8, "justification": "..."},
        {"name": "WHO Tie-Down", "score": <0-9>, "max_score": 9, "justification": "..."}
      ]
    },
    "when": {
      "score": <0-10>,
      "max_score": 10,
      "checkpoints": [
        {"name": "Price Presentation", "score": <0-5>, "max_score": 5, "justification": "..."},
        {"name": "Post-Close Silence", "score": <0-5>, "max_score": 5, "justification": "..."}
      ]
    }
  },
  
  "what_done_right": [
    "Specific positive behavior 1 with evidence",
    "Specific positive behavior 2 with evidence"
  ],
  
  "areas_for_improvement": [
    "Specific improvement point 1 with actionable steps",
    "Specific improvement point 2 with actionable steps"
  ],
  
  "weakest_elements": [
    "Critical deficiency 1 with specific impact",
    "Critical deficiency 2 with specific impact"
  ],
  
  "coaching_recommendations": {
    "rapport_building": "Specific, actionable recommendation",
    "structured_communication": "Specific, actionable recommendation",
    "tie_downs": "Specific, actionable recommendation",
    "post_price_silence": "Specific, actionable recommendation"
  },
  
  "rank_assessment": {
    "current_rank": "MVP|Playmaker|Starter|Prospect|Below Prospect",
    "next_level_requirements": "What specifically needs improvement to reach next rank"
  },
  
  "quick_wins": [
    {"title": "Highest-impact improvement", "action": "Specific 1-sentence action", "points_worth": <number>},
    {"title": "Second improvement", "action": "Specific 1-sentence action", "points_worth": <number>}
  ],
  
  "transcript": "Full transcript in plain text format:\\nHH:MM:SS - Speaker Name\\n      What they said...\\n\\nHH:MM:SS - Other Speaker\\n      Their response..."
}

## CRITICAL REQUIREMENTS

1. Analyze the ENTIRE audio from start to end
2. Be OBJECTIVE - base every score on specific evidence from the call
3. Never inflate scores - stay consistent with the rubric
4. Every justification must cite specific quotes or behaviors observed
5. The transcript MUST cover the FULL call duration - DO NOT summarize or skip parts
6. Return ONLY valid JSON, no markdown or extra text`

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
    const audioResponse = await fetch(signedUrlData.signedUrl)
    
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`)
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

    // Add duration info to prompt
    const durationStr = formatTime(durationSeconds)
    const dynamicPrompt = W4_ANALYSIS_PROMPT + `

AUDIO DURATION: This recording is ${durationStr} long (${Math.round(durationSeconds / 60)} minutes).
Your transcript MUST cover the ENTIRE duration from 00:00:00 to approximately ${durationStr}.
For a recording this long, expect to produce a VERY detailed transcript with many entries.
DO NOT stop early or summarize - transcribe EVERYTHING.`

    // Use streaming to prevent timeout for long audio
    const stream = await ai.models.generateContentStream({
      model: MODEL_NAME,
      contents: createUserContent([
        createPartFromUri(file.uri!, mimeType),
        dynamicPrompt,
      ]),
      config: {
        temperature: 0.3,
        maxOutputTokens: 100000,
        responseMimeType: 'application/json',
      },
    })

    // Collect streamed response
    let responseText = ''
    let inputTokens = 0
    let outputTokens = 0
    let chunkCount = 0

    for await (const chunk of stream) {
      responseText += chunk.text || ''
      chunkCount++
      
      // Update progress every 5 chunks
      if (chunkCount % 5 === 0) {
        await updateProgress(supabase, analysisId, `Analyzing... (${Math.round(responseText.length / 1000)}k)`)
        console.log(`📝 W4 chunk ${chunkCount}: ${responseText.length} chars`)
      }
      
      // Get token counts from last chunk
      if (chunk.usageMetadata) {
        inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens
      }
    }

    const totalTokens = inputTokens + outputTokens
    console.log(`📊 Tokens: ${inputTokens} in, ${outputTokens} out, ${totalTokens} total`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let analysisResult: any

    try {
      analysisResult = JSON.parse(responseText)
    } catch {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse AI response as JSON')
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
