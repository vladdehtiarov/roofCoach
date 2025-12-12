'use client'

import { useState } from 'react'
import { AudioAnalysis, TimelineSegment, GlossaryTerm, AnalysisInsight } from '@/types/database'

interface AnalysisDisplayProps {
  analysis: AudioAnalysis
  onSeek?: (timestamp: string) => void // Called when user clicks a timestamp
}

// Helper to strip markdown formatting
const cleanMarkdown = (text: string): string => {
  return text
    .replace(/\*\*/g, '')  // Remove **
    .replace(/\*/g, '')    // Remove *
    .replace(/__/g, '')    // Remove __
    .replace(/_/g, ' ')    // Replace _ with space
    .trim()
}

export default function AnalysisDisplay({ analysis, onSeek }: AnalysisDisplayProps) {
  const [activeTab, setActiveTab] = useState<'timeline' | 'transcript' | 'notes' | 'glossary' | 'insights'>('notes')
  const [expandedTimeline, setExpandedTimeline] = useState<number | null>(0)
  const [expandedGlossary, setExpandedGlossary] = useState<string | null>(null)

  const tabs: Array<{ id: 'timeline' | 'transcript' | 'notes' | 'glossary' | 'insights', label: string, icon: string, count?: number }> = [
    { id: 'notes', label: 'AI Notes', icon: '📋' },
    { id: 'timeline', label: 'Timeline', icon: '⏱️', count: (analysis.timeline as unknown[])?.length || 0 },
    { id: 'transcript', label: 'Transcript', icon: '📝' },
    { id: 'glossary', label: 'Glossary', icon: '📖', count: (analysis.glossary as unknown[])?.length || 0 },
    { id: 'insights', label: 'Insights', icon: '💡', count: (analysis.insights as unknown[])?.length || 0 },
  ]

  const getInsightStyles = (type: AnalysisInsight['type']) => {
    switch (type) {
      case 'strength':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          icon: '✅',
          iconBg: 'bg-emerald-500/20',
          iconText: 'text-emerald-400',
          title: 'text-emerald-400',
        }
      case 'improvement':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          icon: '🎯',
          iconBg: 'bg-amber-500/20',
          iconText: 'text-amber-400',
          title: 'text-amber-400',
        }
      case 'tip':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          icon: '💡',
          iconBg: 'bg-blue-500/20',
          iconText: 'text-blue-400',
          title: 'text-blue-400',
        }
      default:
        return {
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/30',
          icon: '📌',
          iconBg: 'bg-slate-500/20',
          iconText: 'text-slate-400',
          title: 'text-slate-400',
        }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Title & Summary */}
      <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 rounded-2xl border border-purple-500/20 p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white mb-2">{cleanMarkdown(analysis.title)}</h2>
            <p className="text-slate-400">{cleanMarkdown(analysis.summary)}</p>
            
            {/* Main Topics */}
            {analysis.main_topics && analysis.main_topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {(analysis.main_topics as string[]).slice(0, 8).map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-purple-500/20 text-purple-300 text-sm rounded-full"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {/* Confidence Score */}
          <div className="text-right flex-shrink-0">
            <div className="text-sm text-slate-500">Confidence</div>
            <div className="text-2xl font-bold text-purple-400">
              {Math.round((analysis.confidence_score || 0.8) * 100)}%
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-800/50 rounded-xl overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-slate-700 text-white shadow-lg'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded text-xs ${
                activeTab === tab.id ? 'bg-slate-600' : 'bg-slate-700'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-6">
        {/* AI Notes Tab */}
        {activeTab === 'notes' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>📋</span> AI Notes
              </h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(analysis.ai_notes || '')
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>
            
            {analysis.ai_notes ? (
              <article className="prose prose-invert prose-slate max-w-none">
                {/* Render markdown content */}
                {analysis.ai_notes.split('\n').map((line, index) => {
                  const trimmedLine = line.trim()
                  
                  // H1
                  if (trimmedLine.startsWith('# ')) {
                    return (
                      <h1 key={index} className="text-3xl font-bold text-white mt-6 mb-4 first:mt-0">
                        {cleanMarkdown(trimmedLine.slice(2))}
                      </h1>
                    )
                  }
                  
                  // H2
                  if (trimmedLine.startsWith('## ')) {
                    return (
                      <h2 key={index} className="text-2xl font-semibold text-white mt-8 mb-3 border-b border-slate-700 pb-2">
                        {cleanMarkdown(trimmedLine.slice(3))}
                      </h2>
                    )
                  }
                  
                  // H3
                  if (trimmedLine.startsWith('### ')) {
                    return (
                      <h3 key={index} className="text-xl font-medium text-purple-300 mt-6 mb-2">
                        {cleanMarkdown(trimmedLine.slice(4))}
                      </h3>
                    )
                  }
                  
                  // Blockquote
                  if (trimmedLine.startsWith('> ')) {
                    return (
                      <blockquote key={index} className="border-l-4 border-amber-500 pl-4 my-4 italic text-slate-300 bg-slate-900/50 py-3 pr-4 rounded-r-lg">
                        {cleanMarkdown(trimmedLine.slice(2))}
                      </blockquote>
                    )
                  }
                  
                  // Bullet list
                  if (trimmedLine.startsWith('- ')) {
                    const content = trimmedLine.slice(2)
                    // Check for bold at start
                    const boldMatch = content.match(/^\*\*(.+?)\*\*:?\s*(.*)/)
                    if (boldMatch) {
                      return (
                        <div key={index} className="flex items-start gap-3 my-2 ml-2">
                          <span className="text-purple-400 mt-1">•</span>
                          <span>
                            <span className="font-semibold text-white">{boldMatch[1]}</span>
                            {boldMatch[2] && <span className="text-slate-300">: {cleanMarkdown(boldMatch[2])}</span>}
                          </span>
                        </div>
                      )
                    }
                    return (
                      <div key={index} className="flex items-start gap-3 my-2 ml-2">
                        <span className="text-purple-400 mt-1">•</span>
                        <span className="text-slate-300">{cleanMarkdown(content)}</span>
                      </div>
                    )
                  }
                  
                  // Horizontal rule
                  if (trimmedLine === '---' || trimmedLine === '***') {
                    return <hr key={index} className="border-slate-700 my-6" />
                  }
                  
                  // Italic/small text (like footer)
                  if (trimmedLine.startsWith('*') && trimmedLine.endsWith('*') && !trimmedLine.startsWith('**')) {
                    return (
                      <p key={index} className="text-sm text-slate-500 italic mt-6">
                        {cleanMarkdown(trimmedLine)}
                      </p>
                    )
                  }
                  
                  // Regular paragraph
                  if (trimmedLine) {
                    return (
                      <p key={index} className="text-slate-300 leading-relaxed my-3">
                        {cleanMarkdown(trimmedLine)}
                      </p>
                    )
                  }
                  
                  return null
                })}
              </article>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-slate-500">AI Notes not available for this recording.</p>
                <p className="text-slate-600 text-sm mt-2">Re-run analysis to generate AI Notes.</p>
              </div>
            )}
          </div>
        )}

        {/* Timeline Tab */}
        {activeTab === 'timeline' && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>⏱️</span> Recording Timeline
            </h3>
            
            {analysis.timeline && (analysis.timeline as TimelineSegment[]).length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[23px] top-0 bottom-0 w-0.5 bg-slate-700" />
                
                {(analysis.timeline as TimelineSegment[]).map((segment, index) => (
                  <div key={index} className="relative pl-12 pb-4">
                    {/* Timeline dot */}
                    <div className={`absolute left-4 w-4 h-4 rounded-full border-2 ${
                      expandedTimeline === index
                        ? 'bg-purple-500 border-purple-400'
                        : 'bg-slate-800 border-slate-600'
                    }`} />
                    
                    <button
                      onClick={() => setExpandedTimeline(expandedTimeline === index ? null : index)}
                      className={`w-full text-left p-4 rounded-xl transition-all ${
                        expandedTimeline === index
                          ? 'bg-slate-700/70 border border-purple-500/30'
                          : 'bg-slate-800/50 hover:bg-slate-700/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <button
                              onClick={() => onSeek?.(segment.start_time)}
                              className="text-sm font-mono text-purple-400 hover:text-purple-300 hover:underline cursor-pointer transition-colors"
                              title="Click to play from this point"
                            >
                              ▶ {segment.start_time} - {segment.end_time}
                            </button>
                          </div>
                          <h4 className="text-white font-medium">{segment.title}</h4>
                          
                          {expandedTimeline === index && (
                            <div className="mt-3 animate-fade-in">
                              <p className="text-slate-400 text-sm mb-3">{segment.summary}</p>
                              {segment.topics && segment.topics.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {segment.topics.slice(0, 6).map((topic, topicIndex) => (
                                    <span
                                      key={topicIndex}
                                      className="px-2 py-0.5 bg-slate-600/50 text-slate-300 text-xs rounded"
                                    >
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform flex-shrink-0 ${
                            expandedTimeline === index ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No timeline segments available</p>
            )}
          </div>
        )}

        {/* Transcript Tab */}
        {activeTab === 'transcript' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>📝</span> Full Transcript
              </h3>
              <button
                onClick={() => {
                  // Copy clean text version
                  const cleanText = analysis.transcript
                    ?.replace(/## \[[^\]]+\] /g, '\n\n### ')
                    ?.replace(/---/g, '')
                    ?.replace(/\*\*/g, '')
                    || ''
                  navigator.clipboard.writeText(cleanText)
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </button>
            </div>
            
            {/* Parse sections for TOC */}
            {(() => {
              const sections = analysis.transcript && analysis.transcript.includes('## [')
                ? analysis.transcript.split('---').filter(s => s.trim()).map((section, index) => {
                    const lines = section.trim().split('\n')
                    const headerLine = lines.find(l => l.startsWith('## ['))
                    const headerMatch = headerLine?.match(/## \[([^\]]+)\] (.+)/)
                    return {
                      index,
                      timestamp: headerMatch?.[1] || '',
                      title: headerMatch?.[2] || `Section ${index + 1}`,
                    }
                  })
                : []

              return (
                <>
                  {/* Table of Contents */}
                  {sections.length > 1 && (
                    <div className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                      <div className="flex items-center gap-2 mb-3">
                        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                        </svg>
                        <h4 className="text-sm font-semibold text-white">Table of Contents</h4>
                        <span className="text-xs text-slate-500">({sections.length} sections)</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {sections.map((section) => (
                          <button
                            key={section.index}
                            onClick={() => {
                              const el = document.getElementById(`transcript-section-${section.index}`)
                              el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }}
                            className="flex items-center gap-3 p-2 text-left rounded-lg hover:bg-slate-700/50 transition-colors group"
                          >
                            <button
                              onClick={() => onSeek?.(section.timestamp)}
                              className="text-xs font-mono px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded flex-shrink-0 hover:bg-purple-500/30 hover:text-purple-300 transition-colors cursor-pointer"
                              title="Click to play from this point"
                            >
                              ▶ {section.timestamp}
                            </button>
                            <span className="text-sm text-slate-300 group-hover:text-white truncate">
                              {cleanMarkdown(section.title)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Article-style transcript */}
                  <article className="prose prose-invert prose-slate max-w-none">
                    {analysis.transcript && analysis.transcript.includes('## [') ? (
                      // Parse and render as article
                      analysis.transcript.split('---').filter(s => s.trim()).map((section, index) => {
                        const lines = section.trim().split('\n')
                        const headerLine = lines.find(l => l.startsWith('## ['))
                        const content = lines.filter(l => !l.startsWith('## [')).join('\n').trim()
                        
                        // Parse header: ## [0:00] Section Title
                        const headerMatch = headerLine?.match(/## \[([^\]]+)\] (.+)/)
                        const timestamp = headerMatch?.[1] || ''
                        const title = headerMatch?.[2] || ''
                        
                        // Format content - convert speaker labels to styled quotes
                        const formattedContent = content
                          .split('\n')
                          .map(line => {
                            // Check if line starts with speaker label
                            const speakerMatch = line.match(/^\*\*([^*]+):\*\*\s*(.*)/)
                            if (speakerMatch) {
                              return { type: 'speaker', name: speakerMatch[1], text: speakerMatch[2] }
                            }
                            return { type: 'text', text: line }
                          })
                        
                        return (
                          <section 
                            key={index} 
                            id={`transcript-section-${index}`}
                            className={index > 0 ? 'mt-8 pt-8 border-t border-slate-700/50 scroll-mt-4' : 'scroll-mt-4'}
                          >
                            {/* Section header */}
                            {(timestamp || title) && (
                              <header className="mb-4">
                                <div className="flex items-center gap-3 mb-2">
                                  {timestamp && (
                                    <button
                                      onClick={() => onSeek?.(timestamp)}
                                      className="text-xs font-mono px-2 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 hover:text-purple-300 transition-colors cursor-pointer"
                                      title="Click to play from this point"
                                    >
                                      ▶ {timestamp}
                                    </button>
                                  )}
                                </div>
                                {title && (
                                  <h2 className="text-xl font-semibold text-white m-0">{cleanMarkdown(title)}</h2>
                                )}
                              </header>
                            )}
                            
                            {/* Content */}
                            <div className="space-y-3">
                              {formattedContent.map((item, i) => {
                                if (item.type === 'speaker') {
                                  return (
                                    <div key={i} className="pl-4 border-l-2 border-slate-600">
                                      <span className="font-semibold text-amber-400">{item.name}:</span>
                                      <span className="text-slate-300 ml-2">{item.text}</span>
                                    </div>
                                  )
                                }
                                if (item.text?.trim()) {
                                  return (
                                    <p key={i} className="text-slate-300 leading-relaxed m-0">
                                      {cleanMarkdown(item.text)}
                                    </p>
                                  )
                                }
                                return null
                              })}
                            </div>
                          </section>
                        )
                      })
                    ) : (
                      // Plain text fallback
                      <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {cleanMarkdown(analysis.transcript || '')}
                      </div>
                    )}
                  </article>
                </>
              )
            })()}
          </div>
        )}

        {/* Glossary Tab */}
        {activeTab === 'glossary' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📖</span> Terms & Definitions
            </h3>
            
            {analysis.glossary && (analysis.glossary as GlossaryTerm[]).length > 0 ? (
              <div className="grid gap-3">
                {(analysis.glossary as GlossaryTerm[]).map((term, index) => {
                  const cleanTerm = cleanMarkdown(term.term)
                  return (
                    <div
                      key={index}
                      className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden"
                    >
                      <button
                        onClick={() => setExpandedGlossary(expandedGlossary === cleanTerm ? null : cleanTerm)}
                        className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-700/30 transition-colors"
                      >
                        <span className="font-medium text-amber-400">{cleanTerm}</span>
                        <svg
                          className={`w-5 h-5 text-slate-400 transition-transform ${
                            expandedGlossary === cleanTerm ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {expandedGlossary === cleanTerm && (
                        <div className="px-4 pb-4 animate-fade-in">
                          <p className="text-slate-300 mb-2">{cleanMarkdown(term.definition)}</p>
                          {term.context && (
                            <p className="text-sm text-slate-500 italic">
                              Context: &quot;{cleanMarkdown(term.context)}&quot;
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No technical terms identified</p>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>💡</span> AI Coaching Insights
            </h3>
            
            {analysis.insights && (analysis.insights as AnalysisInsight[]).length > 0 ? (
              <div className="grid gap-4">
                {(analysis.insights as AnalysisInsight[]).map((insight, index) => {
                  const styles = getInsightStyles(insight.type)
                  return (
                    <div
                      key={index}
                      className={`${styles.bg} ${styles.border} border rounded-xl p-4`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-lg ${styles.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-lg">{styles.icon}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className={`font-semibold ${styles.title}`}>{cleanMarkdown(insight.title)}</h4>
                            <span className={`px-2 py-0.5 text-xs rounded ${styles.iconBg} ${styles.iconText} capitalize`}>
                              {insight.type}
                            </span>
                          </div>
                          <p className="text-slate-300 text-sm">{cleanMarkdown(insight.description)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No insights available</p>
            )}
          </div>
        )}
      </div>

      {/* Conclusion */}
      {analysis.conclusion && (
        <div className="bg-gradient-to-br from-emerald-500/10 to-green-500/10 rounded-2xl border border-emerald-500/20 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-green-500/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">Conclusion & Recommendations</h3>
              <p className="text-slate-300 leading-relaxed">{cleanMarkdown(analysis.conclusion)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

