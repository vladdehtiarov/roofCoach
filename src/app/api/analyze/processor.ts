import { GoogleGenerativeAI } from '@google/generative-ai'
import { SupabaseClient } from '@supabase/supabase-js'
import { TranscriptSection } from '@/types/database'

const CHUNK_DURATION_MINUTES = 45
const RATE_LIMIT_DELAY_MS = 35000 // 35 seconds between API calls

interface ProcessorParams {
  supabase: SupabaseClient
  analysisId: string
  recordingId: string
  filePath: string
  totalChunks: number
  durationSeconds: number | null
  fileSizeBytes: number
}

// Generate prompt for a specific time range
function getChunkPrompt(chunkIndex: number, totalChunks: number, startMinutes: number, endMinutes: number, previousSummary: string): string {
  const timeRange = `${Math.floor(startMinutes / 60)}:${String(startMinutes % 60).padStart(2, '0')} to ${Math.floor(endMinutes / 60)}:${String(endMinutes % 60).padStart(2, '0')}`
  
  let contextInfo = ''
  if (chunkIndex > 0 && previousSummary) {
    contextInfo = `\nPREVIOUS CONTEXT (summary of what happened before):\n${previousSummary}\n`
  }

  return `You are transcribing a section of an audio recording.

IMPORTANT: Focus on the time range ${timeRange} (chunk ${chunkIndex + 1} of ${totalChunks}).
${contextInfo}
Please provide:
1. A descriptive TITLE for this section
2. The full TRANSCRIPT of what is said in this time range
3. A brief SUMMARY (2-3 sentences)
4. KEY TOPICS discussed (3-5 topics)

Format your response EXACTLY like this:
===TITLE===
[Your section title here]
===TRANSCRIPT===
[Full transcript with speaker labels like "Speaker 1:" or names if mentioned]
===SUMMARY===
[Brief 2-3 sentence summary]
===TOPICS===
[Topic 1, Topic 2, Topic 3]
===END===

Remember: Only transcribe content from approximately ${timeRange}. Be thorough and accurate.`
}

// Parse chunk response
function parseChunkResponse(text: string, chunkIndex: number, startMinutes: number, endMinutes: number): TranscriptSection | null {
  const titleMatch = text.match(/===TITLE===\s*([\s\S]*?)(?====|$)/i)
  const transcriptMatch = text.match(/===TRANSCRIPT===\s*([\s\S]*?)(?====|$)/i)
  const summaryMatch = text.match(/===SUMMARY===\s*([\s\S]*?)(?====|$)/i)
  const topicsMatch = text.match(/===TOPICS===\s*([\s\S]*?)(?====|$)/i)
  
  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:00` : `${m}:00`
  }

  const content = transcriptMatch?.[1]?.trim() || text.trim()
  
  if (content.length < 50) {
    return null
  }

  return {
    chunk_index: chunkIndex,
    timestamp_start: formatTime(startMinutes),
    timestamp_end: formatTime(endMinutes),
    title: titleMatch?.[1]?.trim() || `Part ${chunkIndex + 1}`,
    content,
    summary: summaryMatch?.[1]?.trim() || content.substring(0, 200) + '...',
    topics: topicsMatch?.[1]?.trim().split(',').map(t => t.trim()).filter(Boolean) || [],
  }
}

// Final analysis prompt
function getFinalAnalysisPrompt(sections: TranscriptSection[]): string {
  const sectionSummaries = sections.map(s => 
    `[${s.timestamp_start} - ${s.timestamp_end}] ${s.title}:\n${s.summary}`
  ).join('\n\n')

  return `Analyze this recording based on the following section summaries:

${sectionSummaries}

Provide a comprehensive analysis in JSON format:
{
  "title": "Overall title for the recording",
  "summary": "3-4 sentence comprehensive summary",
  "main_topics": ["topic1", "topic2", "topic3", "topic4", "topic5"],
  "glossary": [
    {"term": "Term1", "definition": "Definition"},
    {"term": "Term2", "definition": "Definition"}
  ],
  "insights": [
    {"type": "strength", "title": "Title", "description": "Description"},
    {"type": "improvement", "title": "Title", "description": "Description"},
    {"type": "tip", "title": "Title", "description": "Description"}
  ],
  "conclusion": "Key takeaways and recommendations"
}

Return ONLY valid JSON.`
}

export async function processAnalysis(params: ProcessorParams): Promise<void> {
  const { supabase, analysisId, recordingId, filePath, totalChunks, durationSeconds, fileSizeBytes } = params

  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    await updateError(supabase, analysisId, recordingId, 'Gemini API key not configured')
    return
  }

  try {
    // Download audio file
    console.log(`Downloading audio file: ${filePath}`)
    await updateProgress(supabase, analysisId, 0, 'Downloading audio file...')

    const { data: audioData, error: downloadError } = await supabase.storage
      .from('audio-files')
      .download(filePath)

    if (downloadError || !audioData) {
      await updateError(supabase, analysisId, recordingId, 'Failed to download audio file')
      return
    }

    const arrayBuffer = await audioData.arrayBuffer()
    const base64Audio = Buffer.from(arrayBuffer).toString('base64')
    
    let mimeType = 'audio/webm'
    if (filePath.endsWith('.mp3')) mimeType = 'audio/mp3'
    else if (filePath.endsWith('.wav')) mimeType = 'audio/wav'
    else if (filePath.endsWith('.m4a')) mimeType = 'audio/mp4'
    else if (filePath.endsWith('.ogg')) mimeType = 'audio/ogg'

    console.log(`Audio loaded: ${(base64Audio.length / 1024 / 1024).toFixed(2)}MB, type: ${mimeType}`)

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      }
    })

    // Calculate duration in minutes
    let totalMinutes: number
    if (durationSeconds && durationSeconds > 0) {
      totalMinutes = durationSeconds / 60
    } else {
      totalMinutes = fileSizeBytes / (1024 * 1024) // Estimate: 1MB ≈ 1 minute
    }

    const sections: TranscriptSection[] = []
    let previousSummary = ''

    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startMinutes = chunkIndex * CHUNK_DURATION_MINUTES
      const endMinutes = Math.min((chunkIndex + 1) * CHUNK_DURATION_MINUTES, totalMinutes)

      console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}: ${startMinutes} - ${endMinutes} minutes`)
      await updateProgress(supabase, analysisId, chunkIndex, `Processing chunk ${chunkIndex + 1} of ${totalChunks}...`)

      // Wait between API calls (except first)
      if (chunkIndex > 0) {
        console.log(`Waiting ${RATE_LIMIT_DELAY_MS / 1000}s for rate limit...`)
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
      }

      try {
        const prompt = getChunkPrompt(chunkIndex, totalChunks, startMinutes, endMinutes, previousSummary)
        
        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64Audio } },
          { text: prompt }
        ])

        const responseText = result.response.text()
        console.log(`Chunk ${chunkIndex + 1} response: ${responseText.length} chars`)

        const section = parseChunkResponse(responseText, chunkIndex, startMinutes, endMinutes)
        
        if (section) {
          sections.push(section)
          previousSummary = section.summary // Use for context in next chunk

          // Save section to database immediately
          await supabase
            .from('audio_analyses')
            .update({
              sections: sections,
              completed_chunks: chunkIndex + 1,
              current_chunk_message: `Completed chunk ${chunkIndex + 1} of ${totalChunks}`,
            })
            .eq('id', analysisId)

          console.log(`Chunk ${chunkIndex + 1} saved: "${section.title}"`)
        } else {
          console.error(`Failed to parse chunk ${chunkIndex + 1}`)
        }

      } catch (chunkError: unknown) {
        const errMsg = chunkError instanceof Error ? chunkError.message : String(chunkError)
        console.error(`Chunk ${chunkIndex + 1} error:`, errMsg.substring(0, 200))
        
        // If rate limited, wait longer and retry once
        if (errMsg.includes('429') || errMsg.includes('quota')) {
          console.log('Rate limited, waiting 60 seconds...')
          await new Promise(resolve => setTimeout(resolve, 60000))
          
          // Don't retry for now, just continue to next chunk
          await updateProgress(supabase, analysisId, chunkIndex, `Chunk ${chunkIndex + 1} skipped (rate limit)`)
        }
      }
    }

    // Build combined transcript
    const combinedTranscript = sections.map(s => 
      `## [${s.timestamp_start}] ${s.title}\n\n${s.content}\n\n---`
    ).join('\n\n')

    // Build timeline from sections
    const timeline = sections.map(s => ({
      start_time: s.timestamp_start,
      end_time: s.timestamp_end,
      title: s.title,
      summary: s.summary,
      topics: s.topics || [],
    }))

    // Final analysis
    console.log('Running final analysis...')
    await updateProgress(supabase, analysisId, totalChunks, 'Creating final analysis...')
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS))

    let finalAnalysis = {
      title: sections[0]?.title || 'Audio Recording',
      summary: `Recording with ${sections.length} sections transcribed.`,
      main_topics: [] as string[],
      glossary: [] as { term: string; definition: string }[],
      insights: [] as { type: string; title: string; description: string }[],
      conclusion: '',
    }

    if (sections.length > 0) {
      try {
        const analysisModel = genAI.getGenerativeModel({ 
          model: 'gemini-2.0-flash-exp',
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          }
        })

        const analysisResult = await analysisModel.generateContent([
          { text: getFinalAnalysisPrompt(sections) }
        ])

        const analysisResponse = analysisResult.response.text()
        let jsonText = analysisResponse.trim()
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '')
        }
        
        const parsed = JSON.parse(jsonText)
        finalAnalysis = { ...finalAnalysis, ...parsed }
        console.log('Final analysis parsed successfully')

      } catch (analysisError) {
        console.error('Final analysis error, using defaults')
        // Extract topics from sections
        finalAnalysis.main_topics = [...new Set(sections.flatMap(s => s.topics || []))].slice(0, 10)
      }
    }

    // Save final results
    await supabase
      .from('audio_analyses')
      .update({
        transcript: combinedTranscript,
        title: finalAnalysis.title,
        summary: finalAnalysis.summary,
        timeline,
        main_topics: finalAnalysis.main_topics,
        glossary: finalAnalysis.glossary,
        insights: finalAnalysis.insights,
        conclusion: finalAnalysis.conclusion,
        processing_status: 'done',
        current_chunk_message: 'Analysis complete!',
        confidence_score: sections.length >= totalChunks * 0.8 ? 0.9 : 0.7,
        duration_analyzed: totalMinutes * 60,
      })
      .eq('id', analysisId)

    // Update recording status
    await supabase
      .from('recordings')
      .update({ status: 'done' })
      .eq('id', recordingId)

    console.log(`✅ Analysis complete! ${sections.length} sections, ${combinedTranscript.length} chars`)

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Processing error:', errMsg)
    await updateError(supabase, analysisId, recordingId, errMsg.substring(0, 500))
  }
}

async function updateProgress(supabase: SupabaseClient, analysisId: string, chunkIndex: number, message: string) {
  await supabase
    .from('audio_analyses')
    .update({
      processing_status: 'processing',
      completed_chunks: chunkIndex,
      current_chunk_message: message,
    })
    .eq('id', analysisId)
}

async function updateError(supabase: SupabaseClient, analysisId: string, recordingId: string, message: string) {
  await supabase
    .from('audio_analyses')
    .update({
      processing_status: 'error',
      error_message: message,
      current_chunk_message: 'Error occurred',
    })
    .eq('id', analysisId)

  await supabase
    .from('recordings')
    .update({ status: 'error' })
    .eq('id', recordingId)
}

