#!/usr/bin/env node
/**
 * benchmark-compare.js — Compare guardrail overhead across providers
 * Run: node scripts/benchmark-compare.js
 *
 * Uses the benchmark CLI with two configurations:
 * 1. guardrails: true  — measures GPT-4o-mini with StreamingGuard
 * 2. guardrails: false — baseline for comparison
 */

const { spawn } = require('child_process')
const path = require('path')

function runBenchmark(config, cb) {
  const args = [
    'run', 'src/cli.ts',
    '--runs', '2',
    '--providers', 'openai',
    '--guardrails', config.guardrails ? 'true' : 'false',
    '--ceiling', '0.50',
  ]
  const child = spawn('npx', args, {
    cwd: __dirname + '/..',
    stdio: 'pipe',
  })
  let stdout = ''
  child.stdout.on('data', d => stdout += d)
  child.stderr.on('data', d => {})
  child.on('close', (code) => cb(code, stdout))
}

console.log('\n=== guardrail-proxy benchmark comparison ===\n')
console.log('Running baseline (no guardrails)...\n')

runBenchmark({ guardrails: false }, (baselineCode, baselineOut) => {
  console.log('Running with guardrails (StreamingGuard)...\n')

  runBenchmark({ guardrails: true }, (guardCode, guardOut) => {
    console.log('Done. Review results.json for comparison.\n')
    console.log('Baseline exit code:', baselineCode)
    console.log('Guarded exit code:', guardCode)
    process.exit(0)
  })
})