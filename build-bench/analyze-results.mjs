import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR =
  process.env.RESULTS_DIR || path.resolve(__dirname, 'results')
const REPORT_DIR = path.join(RESULTS_DIR, 'reports')
fs.mkdirSync(REPORT_DIR, { recursive: true })

async function readJsonLines(filepath) {
  if (!fs.existsSync(filepath)) return []
  const records = []
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath),
    crlfDelay: Infinity,
  })
  for await (const line of rl) {
    const trimmed = line.trim()
    if (trimmed) {
      try {
        records.push(JSON.parse(trimmed))
      } catch {}
    }
  }
  return records
}

function percentile(arr, p) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)
  return sorted[idx]
}

function formatMb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1)
}

function formatKb(kb) {
  return (kb / 1024).toFixed(1)
}

async function analyze() {
  console.log(
    `\n=================================================================`,
  )
  console.log(
    `        Bundlephobia Build Service Benchmark Analysis            `,
  )
  console.log(
    `=================================================================\n`,
  )

  const buildRecords = await readJsonLines(
    path.join(RESULTS_DIR, 'build-timeline.jsonl'),
  )
  const cdpRecords = await readJsonLines(
    path.join(RESULTS_DIR, 'cdp-timeline.jsonl'),
  )
  const sysRecords = await readJsonLines(
    path.join(RESULTS_DIR, 'system-timeline.jsonl'),
  )

  const markdownLines = []
  markdownLines.push('# Build Service Benchmark & Profiling Report\n')
  markdownLines.push(`*Generated at: ${new Date().toISOString()}*\n`)

  // --- 1. BUILD DURATION & THROUGHPUT ---
  console.log(`[1/4] Build Throughput & Duration Statistics:`)
  if (buildRecords.length === 0) {
    console.log(
      `  No build records found in ${RESULTS_DIR}/build-timeline.jsonl`,
    )
  } else {
    const total = buildRecords.length
    const successCount = buildRecords.filter(r => r.status === 200).length
    const failCount = total - successCount
    const allDurations = buildRecords.map(r => r.durationMs)
    const successDurations = buildRecords
      .filter(r => r.status === 200)
      .map(r => r.durationMs)

    const minDur = Math.min(...allDurations)
    const maxDur = Math.max(...allDurations)
    const meanDur = (allDurations.reduce((a, b) => a + b, 0) / total).toFixed(0)
    const p50 = percentile(allDurations, 50)
    const p90 = percentile(allDurations, 90)
    const p99 = percentile(allDurations, 99)

    console.log(`  - Total Completed Tasks:  ${total}`)
    console.log(
      `  - Successful Builds:      ${successCount} (${((successCount / total) * 100).toFixed(1)}%)`,
    )
    console.log(`  - Failed / Handled:       ${failCount}`)
    console.log(`  - Build Latency:`)
    console.log(`      Min:     ${minDur} ms`)
    console.log(`      Median:  ${p50} ms`)
    console.log(`      Mean:    ${meanDur} ms`)
    console.log(`      p90:     ${p90} ms`)
    console.log(`      p99:     ${p99} ms`)
    console.log(`      Max:     ${maxDur} ms`)

    markdownLines.push('## 1. Build Throughput & Latency\n')
    markdownLines.push(`| Metric | Value |`)
    markdownLines.push(`|---|---|`)
    markdownLines.push(`| **Total Builds** | ${total} |`)
    markdownLines.push(
      `| **Success Rate** | ${successCount}/${total} (${((successCount / total) * 100).toFixed(1)}%) |`,
    )
    markdownLines.push(`| **Median Duration** | ${p50} ms |`)
    markdownLines.push(`| **Mean Duration** | ${meanDur} ms |`)
    markdownLines.push(`| **p90 Duration** | ${p90} ms |`)
    markdownLines.push(`| **p99 Duration** | ${p99} ms |`)
    markdownLines.push(`| **Max Duration** | ${maxDur} ms |\n`)

    // Group by Tier
    const tiers = {}
    for (const r of buildRecords) {
      if (!tiers[r.tier]) tiers[r.tier] = []
      tiers[r.tier].push(r.durationMs)
    }

    console.log(`\n  - Breakdown by Package Tier:`)
    markdownLines.push('### Tier Breakdown\n')
    markdownLines.push(
      `| Tier | Count | Min (ms) | Median (ms) | p90 (ms) | Max (ms) |`,
    )
    markdownLines.push(`|---|---|---|---|---|---|`)

    for (const [tier, durs] of Object.entries(tiers)) {
      const tMin = Math.min(...durs)
      const tMed = percentile(durs, 50)
      const tP90 = percentile(durs, 90)
      const tMax = Math.max(...durs)
      console.log(
        `      ${tier.padEnd(14)}: n=${durs.length.toString().padStart(2)} | med: ${tMed.toString().padStart(5)}ms | p90: ${tP90.toString().padStart(5)}ms | max: ${tMax.toString().padStart(5)}ms`,
      )
      markdownLines.push(
        `| **${tier}** | ${durs.length} | ${tMin} | ${tMed} | ${tP90} | ${tMax} |`,
      )
    }
    markdownLines.push('')

    // Top Slowest Builds
    const sortedSlow = [...buildRecords]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5)
    console.log(`\n  - Top 5 Slowest Builds:`)
    markdownLines.push('### Slowest Builds\n')
    markdownLines.push(`| Package | Endpoint | Tier | Duration | Status |`)
    markdownLines.push(`|---|---|---|---|---|`)
    for (const s of sortedSlow) {
      console.log(
        `      ${(s.durationMs / 1000).toFixed(2)}s | ${s.package} (${s.endpoint}, status: ${s.status})`,
      )
      markdownLines.push(
        `| \`${s.package}\` | \`${s.endpoint}\` | ${s.tier} | ${(s.durationMs / 1000).toFixed(2)}s | ${s.status} |`,
      )
    }
    markdownLines.push('')
  }

  // --- 2. V8 RUNTIME MEMORY DYNAMICS ---
  console.log(`\n[2/4] Node.js V8 Memory Profile (CDP):`)
  if (cdpRecords.length === 0) {
    console.log(`  No CDP records found in ${RESULTS_DIR}/cdp-timeline.jsonl`)
  } else {
    const baseRss = cdpRecords[0].rss
    const peakRss = Math.max(...cdpRecords.map(r => r.rss))
    const endRss = cdpRecords[cdpRecords.length - 1].rss

    const baseHeap = cdpRecords[0].heapUsed
    const peakHeap = Math.max(...cdpRecords.map(r => r.heapUsed))
    const endHeap = cdpRecords[cdpRecords.length - 1].heapUsed

    const peakExt = Math.max(...cdpRecords.map(r => r.external || 0))
    const endExt = cdpRecords[cdpRecords.length - 1].external || 0

    const peakHandles = Math.max(...cdpRecords.map(r => r.activeHandles || 0))
    const endHandles = cdpRecords[cdpRecords.length - 1].activeHandles || 0

    const residualHeap = endHeap - baseHeap
    const residualRss = endRss - baseRss

    console.log(`  - V8 Heap Used:`)
    console.log(`      Baseline (Cold):   ${formatMb(baseHeap)} MB`)
    console.log(`      Peak during Load:  ${formatMb(peakHeap)} MB`)
    console.log(`      Post-Cooldown:     ${formatMb(endHeap)} MB`)
    console.log(
      `      Residual Growth:   ${residualHeap >= 0 ? '+' : ''}${formatMb(residualHeap)} MB`,
    )

    console.log(`  - Process RSS:`)
    console.log(`      Baseline (Cold):   ${formatMb(baseRss)} MB`)
    console.log(`      Peak during Load:  ${formatMb(peakRss)} MB`)
    console.log(`      Post-Cooldown:     ${formatMb(endRss)} MB`)
    console.log(
      `      Residual Growth:   ${residualRss >= 0 ? '+' : ''}${formatMb(residualRss)} MB`,
    )

    console.log(
      `  - External / ArrayBuffers Peak: ${formatMb(peakExt)} MB (Final: ${formatMb(endExt)} MB)`,
    )
    console.log(
      `  - Active Libuv Handles:         Peak: ${peakHandles} -> Final: ${endHandles}`,
    )

    markdownLines.push('## 2. V8 Memory & Leak Analysis\n')
    markdownLines.push(
      `| Stage | V8 Heap Used | Process RSS | External / C++ Buffers | Active Handles |`,
    )
    markdownLines.push(`|---|---|---|---|---|`)
    markdownLines.push(
      `| **Baseline (Cold)** | ${formatMb(baseHeap)} MB | ${formatMb(baseRss)} MB | ${formatMb(cdpRecords[0].external || 0)} MB | ${cdpRecords[0].activeHandles || 0} |`,
    )
    markdownLines.push(
      `| **Peak Load** | ${formatMb(peakHeap)} MB | ${formatMb(peakRss)} MB | ${formatMb(peakExt)} MB | ${peakHandles} |`,
    )
    markdownLines.push(
      `| **Post-Cooldown** | ${formatMb(endHeap)} MB | ${formatMb(endRss)} MB | ${formatMb(endExt)} MB | ${endHandles} |`,
    )
    markdownLines.push(
      `| **Residual Delta** | **${residualHeap >= 0 ? '+' : ''}${formatMb(residualHeap)} MB** | **${residualRss >= 0 ? '+' : ''}${formatMb(residualRss)} MB** | - | - |\n`,
    )
  }

  // --- 3. SYSTEM & KERNEL PROFILE (smaps, context switches, child processes) ---
  console.log(`\n[3/4] System & Kernel OS Profile:`)
  if (sysRecords.length === 0) {
    console.log(
      `  No system records found in ${RESULTS_DIR}/system-timeline.jsonl`,
    )
  } else {
    const peakPss = Math.max(...sysRecords.map(r => r.pssKb || 0))
    const peakAnon = Math.max(...sysRecords.map(r => r.anonymousKb || 0))
    const peakDirty = Math.max(...sysRecords.map(r => r.privateDirtyKb || 0))
    const peakFds = Math.max(...sysRecords.map(r => r.fdCount || 0))
    const endFds = sysRecords[sysRecords.length - 1].fdCount || 0

    const peakChildren = Math.max(
      ...sysRecords.map(r => r.children?.count || 0),
    )
    const peakChildrenRss = Math.max(
      ...sysRecords.map(r => r.children?.totalRssKb || 0),
    )
    const endChildren = sysRecords[sysRecords.length - 1].children?.count || 0

    const peakScratchBytes = Math.max(
      ...sysRecords.map(r => r.tmpScratchBytes || 0),
    )
    const endScratchBytes =
      sysRecords[sysRecords.length - 1].tmpScratchBytes || 0

    const totalVolCtx = sysRecords.reduce(
      (acc, r) => acc + (r.ctxSwitches?.voluntary || 0),
      0,
    )
    const totalInvolCtx = sysRecords.reduce(
      (acc, r) => acc + (r.ctxSwitches?.involuntary || 0),
      0,
    )
    const totalUserTicks = sysRecords.reduce(
      (acc, r) => acc + (r.cpuTicks?.user || 0),
      0,
    )
    const totalSysTicks = sysRecords.reduce(
      (acc, r) => acc + (r.cpuTicks?.system || 0),
      0,
    )

    console.log(`  - Kernel Memory Distribution:`)
    console.log(`      Peak PSS:            ${formatKb(peakPss)} MB`)
    console.log(`      Peak Anonymous RAM:  ${formatKb(peakAnon)} MB`)
    console.log(`      Peak Private Dirty:  ${formatKb(peakDirty)} MB`)
    console.log(
      `  - File Descriptors:      Peak: ${peakFds} -> Final: ${endFds}`,
    )
    console.log(
      `  - Child Installer Procs: Peak: ${peakChildren} (RSS: ${formatKb(peakChildrenRss)} MB) -> Final: ${endChildren}`,
    )
    console.log(
      `  - Temp Directory Churn:  Peak: ${formatMb(peakScratchBytes)} MB -> Final: ${formatMb(endScratchBytes)} MB`,
    )
    console.log(
      `  - Context Switches:      Voluntary: ${totalVolCtx} | Involuntary (CPU preemption): ${totalInvolCtx}`,
    )
    console.log(
      `  - CPU Ticks Ratio:       User: ${totalUserTicks} vs Kernel (Syscall): ${totalSysTicks}`,
    )

    markdownLines.push('## 3. Kernel & Operating System Metrics\n')
    markdownLines.push(`| Kernel Metric | Value |`)
    markdownLines.push(`|---|---|`)
    markdownLines.push(`| **Peak PSS Memory** | ${formatKb(peakPss)} MB |`)
    markdownLines.push(
      `| **Peak Anonymous Memory** | ${formatKb(peakAnon)} MB |`,
    )
    markdownLines.push(`| **Peak Private Dirty** | ${formatKb(peakDirty)} MB |`)
    markdownLines.push(
      `| **Open File Descriptors** | Peak: ${peakFds} -> Final: ${endFds} |`,
    )
    markdownLines.push(
      `| **Active Child Processes** | Peak: ${peakChildren} -> Final: ${endChildren} |`,
    )
    markdownLines.push(
      `| **Peak Child Process RSS** | ${formatKb(peakChildrenRss)} MB |`,
    )
    markdownLines.push(
      `| **Temp Scratch Space** | Peak: ${formatMb(peakScratchBytes)} MB -> Final: ${formatMb(endScratchBytes)} MB |`,
    )
    markdownLines.push(
      `| **Context Switches** | Vol: ${totalVolCtx} / Invol: ${totalInvolCtx} |`,
    )
    markdownLines.push(
      `| **CPU User/Kernel Ticks** | User: ${totalUserTicks} / Sys: ${totalSysTicks} |\n`,
    )
  }

  // --- 4. PROFILING ARTIFACTS INVENTORY ---
  console.log(`\n[4/4] Profiling & Tracing Artifacts:`)
  const artifactFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter(f => !f.startsWith('.'))
  markdownLines.push('## 4. Generated Profiling Artifacts\n')
  for (const f of artifactFiles) {
    const fPath = path.join(RESULTS_DIR, f)
    const st = fs.statSync(fPath)
    if (st.isFile()) {
      const szMb = (st.size / 1024 / 1024).toFixed(2)
      console.log(`  - ${f.padEnd(35)} (${szMb} MB)`)
      markdownLines.push(`- \`${f}\` (${szMb} MB)`)
    }
  }

  const reportFile = path.join(REPORT_DIR, 'benchmark-report.md')
  fs.writeFileSync(reportFile, markdownLines.join('\n'))
  console.log(
    `\n=================================================================`,
  )
  console.log(`Detailed Markdown Report written to:`)
  console.log(`  ${reportFile}`)
  console.log(
    `=================================================================\n`,
  )
}

analyze().catch(err => {
  console.error('Analysis error:', err)
  process.exit(1)
})
