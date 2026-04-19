/**
 * Rendering helpers so every command supports `--json` uniformly.
 */

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function printTable(rows: Array<Record<string, unknown>>, columns?: string[]): void {
  if (rows.length === 0) {
    console.info("(no results)")
    return
  }

  const cols = columns ?? Object.keys(rows[0]!)
  const widths = cols.map((col) => {
    const header = col.length
    const maxRow = Math.max(...rows.map((r) => String(r[col] ?? "").length))
    return Math.max(header, maxRow)
  })

  const header = cols.map((col, i) => col.padEnd(widths[i]!)).join("  ")
  const separator = cols.map((_, i) => "-".repeat(widths[i]!)).join("  ")
  process.stdout.write(`${header}\n${separator}\n`)

  for (const row of rows) {
    const line = cols.map((col, i) => String(row[col] ?? "").padEnd(widths[i]!)).join("  ")
    process.stdout.write(`${line}\n`)
  }
}

export function fail(message: string, code = 1): never {
  process.stderr.write(`error: ${message}\n`)
  // eslint-disable-next-line unicorn/no-process-exit -- sr is a CLI binary
  process.exit(code)
}
