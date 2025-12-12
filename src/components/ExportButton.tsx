'use client'

import { useState } from 'react'
import { AudioAnalysis, Recording } from '@/types/database'

interface ExportButtonProps {
  recording: Recording
  analysis: AudioAnalysis | null
}

type ExportFormat = 'pdf' | 'markdown' | 'word'

export default function ExportButton({ recording, analysis }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [showOptions, setShowOptions] = useState(false)

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return 'Unknown'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hrs > 0) return `${hrs}h ${mins}m`
    return `${mins}m`
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const generateMarkdown = (): string => {
    const lines: string[] = []
    
    lines.push(`# ${analysis?.title || recording.file_name}`)
    lines.push('')
    lines.push(`**Date:** ${formatDate(recording.created_at)}`)
    lines.push(`**Duration:** ${formatDuration(recording.duration)}`)
    lines.push('')
    
    if (analysis?.summary) {
      lines.push('## Summary')
      lines.push(analysis.summary)
      lines.push('')
    }

    if (analysis?.ai_notes) {
      lines.push('## AI Notes')
      lines.push(analysis.ai_notes)
      lines.push('')
    }

    if (analysis?.timeline && analysis.timeline.length > 0) {
      lines.push('## Timeline')
      analysis.timeline.forEach(segment => {
        lines.push(`### ${segment.start_time} - ${segment.end_time}: ${segment.title}`)
        lines.push(segment.summary)
        if (segment.topics && segment.topics.length > 0) {
          lines.push(`*Topics: ${segment.topics.join(', ')}*`)
        }
        lines.push('')
      })
    }

    if (analysis?.main_topics && analysis.main_topics.length > 0) {
      lines.push('## Key Topics')
      analysis.main_topics.forEach(topic => {
        lines.push(`- ${topic}`)
      })
      lines.push('')
    }

    if (analysis?.insights && analysis.insights.length > 0) {
      lines.push('## Insights')
      analysis.insights.forEach(insight => {
        const emoji = insight.type === 'strength' ? '💪' : insight.type === 'tip' ? '💡' : '📈'
        lines.push(`${emoji} **${insight.title}**`)
        lines.push(insight.description)
        lines.push('')
      })
    }

    if (analysis?.glossary && analysis.glossary.length > 0) {
      lines.push('## Glossary')
      analysis.glossary.forEach(term => {
        lines.push(`**${term.term}:** ${term.definition}`)
      })
      lines.push('')
    }

    if (analysis?.conclusion) {
      lines.push('## Conclusion')
      lines.push(analysis.conclusion)
      lines.push('')
    }

    if (analysis?.transcript) {
      lines.push('---')
      lines.push('## Full Transcript')
      lines.push(analysis.transcript)
    }

    return lines.join('\n')
  }

  const exportAsMarkdown = () => {
    const markdown = generateMarkdown()
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${recording.file_name.replace(/\.[^/.]+$/, '')}_analysis.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportAsPDF = async () => {
    setIsExporting(true)
    try {
      const markdown = generateMarkdown()
      
      // Create a simple HTML document for printing
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${analysis?.title || recording.file_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    
    h1 { font-size: 28px; margin-bottom: 8px; color: #111827; }
    h2 { font-size: 20px; margin: 32px 0 16px; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 24px 0 8px; color: #4b5563; }
    
    p { margin: 8px 0; }
    
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
    
    ul { margin: 8px 0 8px 24px; }
    li { margin: 4px 0; }
    
    .topic-badge {
      display: inline-block;
      background: #ede9fe;
      color: #7c3aed;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      margin: 2px;
    }
    
    .insight {
      background: #f9fafb;
      border-left: 3px solid #10b981;
      padding: 12px 16px;
      margin: 12px 0;
      border-radius: 0 8px 8px 0;
    }
    
    .glossary-term {
      margin: 8px 0;
    }
    
    .glossary-term strong {
      color: #7c3aed;
    }
    
    .timeline-item {
      background: #f3f4f6;
      padding: 16px;
      border-radius: 8px;
      margin: 12px 0;
    }
    
    .timeline-time {
      font-family: monospace;
      color: #8b5cf6;
      font-size: 13px;
    }
    
    .transcript {
      background: #f9fafb;
      padding: 24px;
      border-radius: 8px;
      font-size: 14px;
      white-space: pre-wrap;
      margin-top: 16px;
    }
    
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 32px 0;
    }
    
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>${analysis?.title || recording.file_name}</h1>
  <p class="meta">
    📅 ${formatDate(recording.created_at)} • 
    ⏱️ ${formatDuration(recording.duration)}
  </p>
  
  ${analysis?.summary ? `
    <h2>📋 Summary</h2>
    <p>${analysis.summary}</p>
  ` : ''}
  
  ${analysis?.timeline && analysis.timeline.length > 0 ? `
    <h2>📍 Timeline</h2>
    ${analysis.timeline.map(s => `
      <div class="timeline-item">
        <span class="timeline-time">${s.start_time} - ${s.end_time}</span>
        <h3>${s.title}</h3>
        <p>${s.summary}</p>
        ${s.topics && s.topics.length > 0 ? `
          <div style="margin-top: 8px;">
            ${s.topics.slice(0, 6).map(t => `<span class="topic-badge">${t}</span>`).join(' ')}
          </div>
        ` : ''}
      </div>
    `).join('')}
  ` : ''}
  
  ${analysis?.main_topics && analysis.main_topics.length > 0 ? `
    <h2>🏷️ Key Topics</h2>
    <div>
      ${analysis.main_topics.map(t => `<span class="topic-badge">${t}</span>`).join(' ')}
    </div>
  ` : ''}
  
  ${analysis?.insights && analysis.insights.length > 0 ? `
    <h2>💡 Insights</h2>
    ${analysis.insights.map(i => `
      <div class="insight">
        <strong>${i.type === 'strength' ? '💪' : i.type === 'tip' ? '💡' : '📈'} ${i.title}</strong>
        <p>${i.description}</p>
      </div>
    `).join('')}
  ` : ''}
  
  ${analysis?.glossary && analysis.glossary.length > 0 ? `
    <h2>📖 Glossary</h2>
    ${analysis.glossary.map(g => `
      <p class="glossary-term"><strong>${g.term}:</strong> ${g.definition}</p>
    `).join('')}
  ` : ''}
  
  ${analysis?.conclusion ? `
    <h2>🎯 Conclusion</h2>
    <p>${analysis.conclusion}</p>
  ` : ''}
  
  ${analysis?.transcript ? `
    <hr>
    <h2>📝 Full Transcript</h2>
    <div class="transcript">${analysis.transcript.replace(/\n/g, '<br>')}</div>
  ` : ''}
</body>
</html>
      `

      // Open print dialog
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        
        // Wait for styles to load, then print
        setTimeout(() => {
          printWindow.print()
          // Don't close immediately to allow PDF save
        }, 500)
      }
    } catch (err) {
      console.error('Error exporting PDF:', err)
    } finally {
      setIsExporting(false)
    }
  }

  const exportAsWord = () => {
    // Generate HTML that Word can open
    const markdown = generateMarkdown()
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${analysis?.title || recording.file_name}</title>
</head>
<body>
  <h1>${analysis?.title || recording.file_name}</h1>
  <p><strong>Date:</strong> ${formatDate(recording.created_at)}</p>
  <p><strong>Duration:</strong> ${formatDuration(recording.duration)}</p>
  
  ${analysis?.summary ? `<h2>Summary</h2><p>${analysis.summary}</p>` : ''}
  
  ${analysis?.ai_notes ? `<h2>AI Notes</h2><div>${analysis.ai_notes.replace(/\n/g, '<br>')}</div>` : ''}
  
  ${analysis?.timeline && analysis.timeline.length > 0 ? `
    <h2>Timeline</h2>
    ${analysis.timeline.map(s => `
      <h3>${s.start_time} - ${s.end_time}: ${s.title}</h3>
      <p>${s.summary}</p>
    `).join('')}
  ` : ''}
  
  ${analysis?.main_topics && analysis.main_topics.length > 0 ? `
    <h2>Key Topics</h2>
    <ul>${analysis.main_topics.map(t => `<li>${t}</li>`).join('')}</ul>
  ` : ''}
  
  ${analysis?.insights && analysis.insights.length > 0 ? `
    <h2>Insights</h2>
    ${analysis.insights.map(i => `<p><strong>${i.title}:</strong> ${i.description}</p>`).join('')}
  ` : ''}
  
  ${analysis?.glossary && analysis.glossary.length > 0 ? `
    <h2>Glossary</h2>
    ${analysis.glossary.map(g => `<p><strong>${g.term}:</strong> ${g.definition}</p>`).join('')}
  ` : ''}
  
  ${analysis?.conclusion ? `<h2>Conclusion</h2><p>${analysis.conclusion}</p>` : ''}
  
  ${analysis?.transcript ? `<h2>Full Transcript</h2><p>${analysis.transcript.replace(/\n/g, '<br>')}</p>` : ''}
</body>
</html>
    `

    const blob = new Blob([html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${recording.file_name.replace(/\.[^/.]+$/, '')}_analysis.doc`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = (format: ExportFormat) => {
    setShowOptions(false)
    
    switch (format) {
      case 'pdf':
        exportAsPDF()
        break
      case 'markdown':
        exportAsMarkdown()
        break
      case 'word':
        exportAsWord()
        break
    }
  }

  if (!analysis) return null

  return (
    <div className="relative">
      <button
        onClick={() => setShowOptions(!showOptions)}
        disabled={isExporting}
        className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-lg hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
      >
        {isExporting ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </>
        )}
      </button>

      {showOptions && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg border border-slate-700 shadow-xl z-10 overflow-hidden">
          <button
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4zm-3 9v6H9v-6h1zm1 0h2v6h-2v-6zm-4 0v6H6v-6h1z"/>
            </svg>
            Export as PDF
          </button>
          
          <button
            onClick={() => handleExport('word')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM9.998 14.768L8.5 19H7l2.25-6h1.5L13 19h-1.5l-1.498-4.232zm3.002-1.768v6h-1v-6h1z"/>
            </svg>
            Export as Word
          </button>
          
          <button
            onClick={() => handleExport('markdown')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-white hover:bg-slate-700 transition-colors"
          >
            <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.27 19.385H1.73A1.73 1.73 0 010 17.655V6.345a1.73 1.73 0 011.73-1.73h20.54A1.73 1.73 0 0124 6.345v11.31a1.73 1.73 0 01-1.73 1.73zM5.769 15.923v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.077h-2.308l-2.307 2.885-2.308-2.885H3.461v7.846h2.308zM21.231 12h-2.308V8.077h-2.307V12h-2.308l3.461 4.039 3.462-4.039z"/>
            </svg>
            Export as Markdown
          </button>
        </div>
      )}
    </div>
  )
}

