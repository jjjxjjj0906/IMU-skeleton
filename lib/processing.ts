export interface Stats {
  min: number[]
  max: number[]
  mean: number[]
  std: number[]
}

export function computeStats(series: number[][]): Stats {
  if (!series || series.length === 0) return { min: [], max: [], mean: [], std: [] }
  const dims = series[0].length
  const n = series.length
  const min = new Array(dims).fill(Infinity)
  const max = new Array(dims).fill(-Infinity)
  const sum = new Array(dims).fill(0)
  for (let i = 0; i < n; i++) {
    const row = series[i]
    for (let d = 0; d < dims; d++) {
      const v = row[d] ?? 0
      if (v < min[d]) min[d] = v
      if (v > max[d]) max[d] = v
      sum[d] += v
    }
  }
  const mean = sum.map(s => s / n)
  const varSum = new Array(dims).fill(0)
  for (let i = 0; i < n; i++) {
    const row = series[i]
    for (let d = 0; d < dims; d++) {
      const v = row[d] ?? 0
      const diff = v - mean[d]
      varSum[d] += diff * diff
    }
  }
  const std = varSum.map(v => Math.sqrt(v / Math.max(1, n - 1)))
  return { min, max, mean, std }
}

export type NormalizeMode = 'none' | 'minmax' | 'zscore' | 'vector-unit' | 'quaternion-unit'

export function normalizeSeries(series: number[][], mode: NormalizeMode): number[][] {
  if (!series || series.length === 0 || mode === 'none') return series
  const dims = series[0].length
  if (mode === 'vector-unit' && dims >= 3) {
    return series.map(row => {
      const x = row[0] ?? 0, y = row[1] ?? 0, z = row[2] ?? 0
      const len = Math.hypot(x, y, z) || 1
      return [x / len, y / len, z / len, ...row.slice(3)]
    })
  }
  if (mode === 'quaternion-unit' && dims === 4) {
    return series.map(row => {
      const w = row[0] ?? 0, x = row[1] ?? 0, y = row[2] ?? 0, z = row[3] ?? 0
      const len = Math.hypot(w, x, y, z) || 1
      return [w / len, x / len, y / len, z / len]
    })
  }
  if (mode === 'minmax') {
    const { min, max } = computeStats(series)
    return series.map(row => row.map((v, i) => {
      const denom = (max[i] - min[i]) || 1
      return ((v ?? 0) - min[i]) / denom
    }))
  }
  if (mode === 'zscore') {
    const { mean, std } = computeStats(series)
    return series.map(row => row.map((v, i) => ((v ?? 0) - mean[i]) / (std[i] || 1)))
  }
  return series
}

export function movingAverageSmooth(series: number[][], window: number): number[][] {
  const w = Math.max(1, Math.floor(window))
  if (!series || series.length === 0 || w === 1) return series
  const n = series.length
  const dims = series[0].length
  const out: number[][] = new Array(n)
  const acc = new Array(dims).fill(0)
  const buf: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = series[i]
    buf.push(row)
    for (let d = 0; d < dims; d++) acc[d] += row[d] ?? 0
    if (buf.length > w) {
      const old = buf.shift()!
      for (let d = 0; d < dims; d++) acc[d] -= old[d] ?? 0
    }
    const denom = buf.length
    out[i] = new Array(dims)
    for (let d = 0; d < dims; d++) out[i][d] = acc[d] / denom
  }
  return out
}


