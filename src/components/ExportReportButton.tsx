'use client'

import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, BorderStyle, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'

interface ComprehensiveReport {
  header: {
    client_name: string
    rep_name: string
    company_name: string
  }
  overall_performance: {
    total_score: number
    max_score: number
    rating: string
    summary: string
  }
  phases: {
    why: PhaseData
    what: PhaseData
    who: PhaseData
    when: PhaseData
  }
  what_done_right: string[]
  areas_for_improvement: { area: string; recommendation: string }[]
  weakest_elements: string[]
  coaching_recommendations: { topic: string; advice: string }[]
  rank_assessment: {
    current_rank: string
    next_level: string
    requirements: string[]
  }
  quick_wins: { change: string; impact: string }[]
}

interface PhaseData {
  name: string
  max_score: number
  score: number
  checkpoints: {
    name: string
    score: number
    max: number
    justification: string
  }[]
}

interface Props {
  report: ComprehensiveReport | null
  fileName?: string
}

export default function ExportReportButton({ report, fileName = 'call-report' }: Props) {
  const [isExporting, setIsExporting] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const generateMarkdown = (): string => {
    if (!report) return ''

    const { header, overall_performance, phases, what_done_right, areas_for_improvement, weakest_elements, coaching_recommendations, rank_assessment, quick_wins } = report

    let md = `# COMPREHENSIVE CALL REPORT

**Client:** ${header.client_name || 'Unknown'}
**Representative:** ${header.rep_name || 'Unknown'}
**Company:** ${header.company_name || 'Unknown'}

---

## OVERALL PERFORMANCE

| Metric | Value |
|--------|-------|
| **Total Score** | ${overall_performance.total_score} / ${overall_performance.max_score} |
| **Rating** | ${overall_performance.rating} |

**Summary:** ${overall_performance.summary}

---

`

    const phaseOrder: (keyof typeof phases)[] = ['why', 'what', 'who', 'when']
    
    for (const phaseKey of phaseOrder) {
      const phase = phases[phaseKey]
      if (!phase) continue

      md += `## PHASE: ${phase.name} (Max: ${phase.max_score})

| Checkpoint | Score | Max | Justification |
|------------|-------|-----|---------------|
`
      for (const checkpoint of phase.checkpoints || []) {
        const justification = checkpoint.justification?.replace(/\|/g, '\\|').replace(/\n/g, ' ') || ''
        md += `| ${checkpoint.name} | ${checkpoint.score} | ${checkpoint.max} | ${justification} |
`
      }
      md += `\n**Subtotal: ${phase.score} / ${phase.max_score}**\n\n---\n\n`
    }

    md += `## TOTAL SCORES

| Phase | Score | Max |
|-------|-------|-----|
| WHY | ${phases.why?.score || 0} | ${phases.why?.max_score || 38} |
| WHAT | ${phases.what?.score || 0} | ${phases.what?.max_score || 27} |
| WHO | ${phases.who?.score || 0} | ${phases.who?.max_score || 25} |
| WHEN | ${phases.when?.score || 0} | ${phases.when?.max_score || 10} |
| **Overall Total** | **${overall_performance.total_score}** | **${overall_performance.max_score}** |

---

`

    if (what_done_right?.length > 0) {
      md += `## WHAT WAS DONE RIGHT\n\n`
      for (const item of what_done_right) {
        md += `- ${item}\n`
      }
      md += `\n---\n\n`
    }

    if (areas_for_improvement?.length > 0) {
      md += `## AREAS FOR IMPROVEMENT\n\n`
      for (const item of areas_for_improvement) {
        md += `### ${item.area}\n${item.recommendation}\n\n`
      }
      md += `---\n\n`
    }

    if (weakest_elements?.length > 0) {
      md += `## WEAKEST ELEMENTS\n\n`
      for (const item of weakest_elements) {
        md += `- ${item}\n`
      }
      md += `\n---\n\n`
    }

    if (coaching_recommendations?.length > 0) {
      md += `## COACHING RECOMMENDATIONS\n\n`
      for (const item of coaching_recommendations) {
        md += `### ${item.topic}\n${item.advice}\n\n`
      }
      md += `---\n\n`
    }

    if (rank_assessment) {
      md += `## RANK ASSESSMENT\n\n**Current Rank:** ${rank_assessment.current_rank}\n**Next Level:** ${rank_assessment.next_level}\n\n**Requirements to reach next level:**\n`
      for (const req of rank_assessment.requirements || []) {
        md += `- ${req}\n`
      }
      md += `\n---\n\n`
    }

    if (quick_wins?.length > 0) {
      md += `## QUICK WINS (Biggest ROI Improvements)\n\n`
      for (const win of quick_wins) {
        md += `1. **${win.change}** – ${win.impact}\n`
      }
    }

    return md
  }

  const handleExportMarkdown = () => {
    setIsExporting(true)
    setShowDropdown(false)
    try {
      const markdown = generateMarkdown()
      const blob = new Blob([markdown], { type: 'text/markdown' })
      saveAs(blob, `${fileName}.md`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = () => {
    if (!report) return
    setIsExporting(true)
    setShowDropdown(false)
    
    try {
      const doc = new jsPDF()
      const { header, overall_performance, phases, what_done_right, areas_for_improvement, weakest_elements, coaching_recommendations, rank_assessment, quick_wins } = report
      
      let y = 20
      const lineHeight = 7
      const margin = 20
      const pageWidth = doc.internal.pageSize.getWidth()
      
      const addText = (text: string, fontSize: number = 10, bold: boolean = false) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', bold ? 'bold' : 'normal')
        const lines = doc.splitTextToSize(text, pageWidth - margin * 2)
        for (const line of lines) {
          if (y > 280) {
            doc.addPage()
            y = 20
          }
          doc.text(line, margin, y)
          y += lineHeight * (fontSize / 10)
        }
      }
      
      const addSection = (title: string) => {
        y += 5
        if (y > 260) {
          doc.addPage()
          y = 20
        }
        doc.setDrawColor(200)
        doc.line(margin, y, pageWidth - margin, y)
        y += 8
        addText(title, 14, true)
        y += 3
      }

      // Title
      addText('COMPREHENSIVE CALL REPORT', 18, true)
      y += 5
      
      // Header
      addText(`Client: ${header.client_name || 'Unknown'}`)
      addText(`Representative: ${header.rep_name || 'Unknown'}`)
      addText(`Company: ${header.company_name || 'Unknown'}`)
      
      // Overall Performance
      addSection('OVERALL PERFORMANCE')
      addText(`Total Score: ${overall_performance.total_score} / ${overall_performance.max_score}`, 12, true)
      addText(`Rating: ${overall_performance.rating}`)
      y += 3
      addText(`Summary: ${overall_performance.summary}`)
      
      // Phases
      const phaseOrder: (keyof typeof phases)[] = ['why', 'what', 'who', 'when']
      for (const phaseKey of phaseOrder) {
        const phase = phases[phaseKey]
        if (!phase) continue
        
        addSection(`PHASE: ${phase.name} (${phase.score}/${phase.max_score})`)
        
        for (const checkpoint of phase.checkpoints || []) {
          addText(`• ${checkpoint.name}: ${checkpoint.score}/${checkpoint.max}`, 10, true)
          if (checkpoint.justification) {
            addText(`  ${checkpoint.justification}`, 9)
          }
        }
      }
      
      // Total Scores
      addSection('TOTAL SCORES')
      addText(`WHY: ${phases.why?.score || 0}/${phases.why?.max_score || 38}`)
      addText(`WHAT: ${phases.what?.score || 0}/${phases.what?.max_score || 27}`)
      addText(`WHO: ${phases.who?.score || 0}/${phases.who?.max_score || 25}`)
      addText(`WHEN: ${phases.when?.score || 0}/${phases.when?.max_score || 10}`)
      addText(`TOTAL: ${overall_performance.total_score}/${overall_performance.max_score}`, 11, true)
      
      // What Was Done Right
      if (what_done_right?.length > 0) {
        addSection('WHAT WAS DONE RIGHT')
        for (const item of what_done_right) {
          addText(`• ${item}`)
        }
      }
      
      // Areas for Improvement
      if (areas_for_improvement?.length > 0) {
        addSection('AREAS FOR IMPROVEMENT')
        for (const item of areas_for_improvement) {
          addText(item.area, 11, true)
          addText(item.recommendation)
          y += 3
        }
      }
      
      // Weakest Elements
      if (weakest_elements?.length > 0) {
        addSection('WEAKEST ELEMENTS')
        for (const item of weakest_elements) {
          addText(`• ${item}`)
        }
      }
      
      // Coaching Recommendations
      if (coaching_recommendations?.length > 0) {
        addSection('COACHING RECOMMENDATIONS')
        for (const item of coaching_recommendations) {
          addText(item.topic, 11, true)
          addText(item.advice)
          y += 3
        }
      }
      
      // Rank Assessment
      if (rank_assessment) {
        addSection('RANK ASSESSMENT')
        addText(`Current Rank: ${rank_assessment.current_rank}`, 11, true)
        addText(`Next Level: ${rank_assessment.next_level}`)
        y += 2
        addText('Requirements:', 10, true)
        for (const req of rank_assessment.requirements || []) {
          addText(`• ${req}`)
        }
      }
      
      // Quick Wins
      if (quick_wins?.length > 0) {
        addSection('QUICK WINS')
        for (let i = 0; i < quick_wins.length; i++) {
          const win = quick_wins[i]
          addText(`${i + 1}. ${win.change}`, 10, true)
          addText(`   ${win.impact}`)
        }
      }
      
      doc.save(`${fileName}.pdf`)
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportDocx = async () => {
    if (!report) return
    setIsExporting(true)
    setShowDropdown(false)
    
    try {
      const { header, overall_performance, phases, what_done_right, areas_for_improvement, weakest_elements, coaching_recommendations, rank_assessment, quick_wins } = report
      
      const children: (Paragraph | Table)[] = []
      
      // Helper functions
      const addHeading = (text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) => {
        children.push(new Paragraph({ text, heading: level, spacing: { before: 400, after: 200 } }))
      }
      
      const addParagraph = (text: string, bold: boolean = false) => {
        children.push(new Paragraph({
          children: [new TextRun({ text, bold })],
          spacing: { after: 100 }
        }))
      }
      
      const addBullet = (text: string) => {
        children.push(new Paragraph({
          children: [new TextRun({ text })],
          bullet: { level: 0 },
          spacing: { after: 50 }
        }))
      }

      // Title
      addHeading('COMPREHENSIVE CALL REPORT', HeadingLevel.TITLE)
      
      // Header info
      addParagraph(`Client: ${header.client_name || 'Unknown'}`, true)
      addParagraph(`Representative: ${header.rep_name || 'Unknown'}`)
      addParagraph(`Company: ${header.company_name || 'Unknown'}`)
      
      // Overall Performance
      addHeading('OVERALL PERFORMANCE', HeadingLevel.HEADING_1)
      addParagraph(`Total Score: ${overall_performance.total_score} / ${overall_performance.max_score}`, true)
      addParagraph(`Rating: ${overall_performance.rating}`)
      addParagraph(`Summary: ${overall_performance.summary}`)
      
      // Phases with tables
      const phaseOrder: (keyof typeof phases)[] = ['why', 'what', 'who', 'when']
      
      for (const phaseKey of phaseOrder) {
        const phase = phases[phaseKey]
        if (!phase) continue
        
        addHeading(`PHASE: ${phase.name} (Max: ${phase.max_score})`, HeadingLevel.HEADING_1)
        
        // Create table for checkpoints
        const tableRows = [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Checkpoint', bold: true })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Score', bold: true })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Max', bold: true })] })], width: { size: 10, type: WidthType.PERCENTAGE } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Justification', bold: true })] })], width: { size: 55, type: WidthType.PERCENTAGE } }),
            ],
          }),
        ]
        
        for (const checkpoint of phase.checkpoints || []) {
          tableRows.push(new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ text: checkpoint.name })] }),
              new TableCell({ children: [new Paragraph({ text: String(checkpoint.score), alignment: AlignmentType.CENTER })] }),
              new TableCell({ children: [new Paragraph({ text: String(checkpoint.max), alignment: AlignmentType.CENTER })] }),
              new TableCell({ children: [new Paragraph({ text: checkpoint.justification || '' })] }),
            ],
          }))
        }
        
        children.push(new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
            insideVertical: { style: BorderStyle.SINGLE, size: 1 },
          },
        }))
        
        addParagraph(`Subtotal: ${phase.score} / ${phase.max_score}`, true)
      }
      
      // Total Scores
      addHeading('TOTAL SCORES', HeadingLevel.HEADING_1)
      addParagraph(`WHY: ${phases.why?.score || 0} / ${phases.why?.max_score || 38}`)
      addParagraph(`WHAT: ${phases.what?.score || 0} / ${phases.what?.max_score || 27}`)
      addParagraph(`WHO: ${phases.who?.score || 0} / ${phases.who?.max_score || 25}`)
      addParagraph(`WHEN: ${phases.when?.score || 0} / ${phases.when?.max_score || 10}`)
      addParagraph(`Overall Total: ${overall_performance.total_score} / ${overall_performance.max_score}`, true)
      
      // What Was Done Right
      if (what_done_right?.length > 0) {
        addHeading('WHAT WAS DONE RIGHT', HeadingLevel.HEADING_1)
        for (const item of what_done_right) {
          addBullet(item)
        }
      }
      
      // Areas for Improvement
      if (areas_for_improvement?.length > 0) {
        addHeading('AREAS FOR IMPROVEMENT', HeadingLevel.HEADING_1)
        for (const item of areas_for_improvement) {
          addParagraph(item.area, true)
          addParagraph(item.recommendation)
        }
      }
      
      // Weakest Elements
      if (weakest_elements?.length > 0) {
        addHeading('WEAKEST ELEMENTS', HeadingLevel.HEADING_1)
        for (const item of weakest_elements) {
          addBullet(item)
        }
      }
      
      // Coaching Recommendations
      if (coaching_recommendations?.length > 0) {
        addHeading('COACHING RECOMMENDATIONS', HeadingLevel.HEADING_1)
        for (const item of coaching_recommendations) {
          addParagraph(item.topic, true)
          addParagraph(item.advice)
        }
      }
      
      // Rank Assessment
      if (rank_assessment) {
        addHeading('RANK ASSESSMENT', HeadingLevel.HEADING_1)
        addParagraph(`Current Rank: ${rank_assessment.current_rank}`, true)
        addParagraph(`Next Level: ${rank_assessment.next_level}`)
        addParagraph('Requirements to reach next level:', true)
        for (const req of rank_assessment.requirements || []) {
          addBullet(req)
        }
      }
      
      // Quick Wins
      if (quick_wins?.length > 0) {
        addHeading('QUICK WINS (Biggest ROI Improvements)', HeadingLevel.HEADING_1)
        for (let i = 0; i < quick_wins.length; i++) {
          const win = quick_wins[i]
          addParagraph(`${i + 1}. ${win.change}`, true)
          addParagraph(`   ${win.impact}`)
        }
      }
      
      const doc = new Document({
        sections: [{ children }],
      })
      
      const blob = await Packer.toBlob(doc)
      saveAs(blob, `${fileName}.docx`)
    } finally {
      setIsExporting(false)
    }
  }

  if (!report) {
    return null
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={isExporting}
        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {isExporting ? 'Exporting...' : 'Export Report'}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
          <button
            onClick={handleExportPDF}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-3"
          >
            <svg className="w-5 h-5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13.5v3h1v-1h.5a1 1 0 001-1v-1a1 1 0 00-1-1h-1.5zm1 1h.5v1h-.5v-1zm2.5-1v3h1.5a1 1 0 001-1v-1a1 1 0 00-1-1H12zm1 1v1h.5v-1H13zm3-1v3h1v-1.5h.5v-1H17v-.5h1v-1h-2z"/>
            </svg>
            PDF Document
          </button>
          <button
            onClick={handleExportDocx}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-3"
          >
            <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM9 13h6v1H9v-1zm0 2h6v1H9v-1zm0 2h4v1H9v-1z"/>
            </svg>
            Word Document
          </button>
          <button
            onClick={handleExportMarkdown}
            className="w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors flex items-center gap-3"
          >
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Markdown
          </button>
        </div>
      )}
    </div>
  )
}
