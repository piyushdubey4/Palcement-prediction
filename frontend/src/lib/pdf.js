import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const p = (v) => `${(v * 100).toFixed(1)}%`

export function downloadReport({ user, report, inputs, createdAt }) {
  const doc = new jsPDF()
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(39, 83, 224)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255)
  doc.setFontSize(16)
  doc.text('Student Performance & Placement Report', 14, 13)
  doc.setFontSize(10)
  doc.text(`${user.name}  |  ${user.email}${user.roll_no ? `  |  Roll ${user.roll_no}` : ''}`, 14, 21)
  doc.setTextColor(30)
  doc.setFontSize(9)
  doc.text(`Generated ${new Date(createdAt || Date.now()).toLocaleString()}`, 14, 35)

  autoTable(doc, {
    startY: 40,
    head: [['Summary', 'Result']],
    body: [
      ['Performance score', `${report.performance_score} / 100 (${report.performance_level})`],
      ['Placement probability', `${p(report.placement_probability)} - ${report.placement_status}`],
      ['Model', report.model_name || report.prediction_source],
      ['Readiness index', `${report.readiness_index} / 100`],
      ['Risk flag', report.risk_flag],
    ],
    theme: 'grid', headStyles: { fillColor: [39, 83, 224] },
  })

  autoTable(doc, {
    head: [['Input', 'Value', 'Input', 'Value']],
    body: (() => {
      const e = Object.entries(inputs)
      const rows = []
      for (let i = 0; i < e.length; i += 2) rows.push([e[i][0], e[i][1], e[i + 1]?.[0] ?? '', e[i + 1]?.[1] ?? ''])
      return rows
    })(),
    theme: 'striped', headStyles: { fillColor: [71, 85, 105] }, styles: { fontSize: 9 },
  })

  autoTable(doc, {
    head: [['Hiring criterion (learned from data)', 'Your value', 'Met']],
    body: report.hiring_criteria.map((c) => [c.criterion, String(c.value), c.met ? 'Yes' : 'No']),
    theme: 'grid', headStyles: { fillColor: [71, 85, 105] }, styles: { fontSize: 9 },
  })

  if (report.improvement_path?.length) {
    autoTable(doc, {
      head: [['Improvement plan', 'New probability']],
      body: report.improvement_path.map((pl) => [
        pl.changes.map((c) => `${c.label}: ${c.from} -> ${c.to}`).join('; '), p(pl.new_probability)]),
      theme: 'grid', headStyles: { fillColor: [16, 185, 129] }, styles: { fontSize: 9 },
    })
  }

  autoTable(doc, {
    head: [['Skill gap', 'Severity', 'Recommendation']],
    body: report.skill_gaps.length
      ? report.skill_gaps.map((g) => [g.gap, g.severity, g.recommendation])
      : [['None detected', '-', 'Keep practising and apply to drives.']],
    theme: 'grid', headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 9 },
    columnStyles: { 2: { cellWidth: 110 } },
  })

  doc.setFontSize(8)
  doc.setTextColor(120)
  doc.text('Performance score = 0.40 x CGPA x 10 + 0.30 x Attendance + 0.30 x Semester avg x 10. ' +
    'Placement threshold 55%.', 14, doc.internal.pageSize.getHeight() - 10)
  doc.save(`placement_report_${user.name.replace(/\s+/g, '_')}.pdf`)
}
