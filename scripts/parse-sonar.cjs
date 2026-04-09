const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const jsonPath = process.argv[2] || join(__dirname, '../sonar-results.json')
const results = JSON.parse(readFileSync(jsonPath, 'utf8'))
const issues = []

for (const file of results) {
  for (const msg of file.messages) {
    const shortPath = file.filePath.split('pleks').pop().replace(/^[\\/]+/, '')
    issues.push({
      file: shortPath,
      line: msg.line,
      rule: msg.ruleId || 'unknown',
      severity: msg.severity === 2 ? 'ERROR' : 'WARN',
      message: msg.message
    })
  }
}

const byRule = {}
for (const i of issues) {
  if (!byRule[i.rule]) byRule[i.rule] = { severity: i.severity, items: [] }
  byRule[i.rule].items.push(i)
}

const sorted = Object.entries(byRule).sort((a, b) => {
  if (a[1].severity !== b[1].severity) return a[1].severity === 'ERROR' ? -1 : 1
  return a[0].localeCompare(b[0])
})

const lines = ['SonarJS ESLint Report', '='.repeat(60)]
for (const [rule, { severity, items }] of sorted) {
  lines.push('')
  lines.push('[' + severity + '] ' + rule + ' — ' + items.length + ' occurrence(s)')
  for (const i of items.slice(0, 5)) {
    lines.push('  ' + i.file + ':' + i.line + ' — ' + i.message.substring(0, 110))
  }
  if (items.length > 5) lines.push('  … +' + (items.length - 5) + ' more')
}

lines.push('')
lines.push('='.repeat(60))
const errs = issues.filter(i => i.severity === 'ERROR').length
const warns = issues.filter(i => i.severity === 'WARN').length
lines.push('Total: ' + issues.length + ' issues (' + errs + ' errors, ' + warns + ' warnings)')

const out = lines.join('\n')
console.log(out)

const outPath = join(__dirname, '../sonar-report.txt')
writeFileSync(outPath, out)
console.log('\nSaved: ' + outPath)
