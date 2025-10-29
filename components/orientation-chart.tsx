"use client"

import { memo, useEffect, useImperativeHandle, useMemo, useState, forwardRef } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts'

export interface OrientationChartProps {
  series: number[][] | null // quaternion [w, x, y, z]
  frameRate: number
  visibleAxes?: { w: boolean, x: boolean, y: boolean, z: boolean }
}

export interface OrientationChartRef {
  setFrame: (frame: number) => void
}

export const OrientationChart = memo(forwardRef<OrientationChartRef, OrientationChartProps>(function OrientationChartImpl({ series, frameRate, visibleAxes }, ref) {
  const [currentFrame, setCurrentFrame] = useState(0)

  useImperativeHandle(ref, () => ({ setFrame: (f: number) => setCurrentFrame(f) }))

  useEffect(() => setCurrentFrame(0), [series])

  const data = useMemo(() => {
    if (!series || series.length === 0) return [] as { t: number, w: number, x: number, y: number, z: number }[]
    const len = series.length
    const MAX_POINTS = 2000
    const stride = Math.max(1, Math.ceil(len / MAX_POINTS))
    const denom = Math.max(frameRate, 1)
    const out: { t: number, w: number, x: number, y: number, z: number }[] = []
    for (let i = 0; i < len; i += stride) {
      const p = series[i]
      out.push({ t: i / denom, w: p[0] ?? 0, x: p[1] ?? 0, y: p[2] ?? 0, z: p[3] ?? 0 })
    }
    if ((len - 1) % stride !== 0) {
      const p = series[len - 1]
      out.push({ t: (len - 1) / denom, w: p[0] ?? 0, x: p[1] ?? 0, y: p[2] ?? 0, z: p[3] ?? 0 })
    }
    return out
  }, [series, frameRate])

  const xDomain = useMemo(() => {
    if (data.length === 0) return [0, 1]
    return [data[0].t, data[data.length - 1].t]
  }, [data])

  const currentTime = currentFrame / Math.max(frameRate, 1)

  return (
    <div className="w-full h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="t" stroke="#94a3b8" tickFormatter={(t) => `${t.toFixed(1)}s`} domain={xDomain as any} type="number" />
          <YAxis stroke="#94a3b8" />
          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }} />
          <Legend />
          {(visibleAxes?.w ?? true) && <Line type="monotone" dataKey="w" stroke="#f97316" dot={false} name="W" isAnimationActive={false} />}
          {(visibleAxes?.x ?? true) && <Line type="monotone" dataKey="x" stroke="#60a5fa" dot={false} name="X" isAnimationActive={false} />}
          {(visibleAxes?.y ?? true) && <Line type="monotone" dataKey="y" stroke="#34d399" dot={false} name="Y" isAnimationActive={false} />}
          {(visibleAxes?.z ?? true) && <Line type="monotone" dataKey="z" stroke="#f472b6" dot={false} name="Z" isAnimationActive={false} />}
          <ReferenceLine x={currentTime} stroke="#f59e0b" strokeWidth={3} ifOverflow="extendDomain" label={{ value: `${currentTime.toFixed(2)}s`, position: 'bottom', fill: '#f59e0b', fontSize: 12, fontWeight: 'bold' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}))


