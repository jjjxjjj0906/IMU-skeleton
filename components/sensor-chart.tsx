"use client"

import { useMemo, useState, forwardRef, useImperativeHandle, useEffect } from 'react'
import { memo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'

export interface SensorChartProps {
  series: number[][] | null
  frameRate: number
  title?: string
  visibleAxes?: { w?: boolean, x: boolean, y: boolean, z: boolean }
  showGrid?: boolean
  showLegend?: boolean
  showDots?: boolean
}

export interface SensorChartRef {
  setFrame: (frame: number) => void
}

interface ChartPoint { t: number, w?: number, x?: number, y?: number, z?: number }
interface ChartCoreProps { data: ChartPoint[] }

const ChartCore = memo(({ data }: ChartCoreProps) => {
  // Calculate domain to ensure full time range is visible
  const xDomain = useMemo(() => {
    if (data.length === 0) return [0, 1]
    const minT = data[0].t
    const maxT = data[data.length - 1].t
    return [minT, maxT]
  }, [data])

  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
      <XAxis 
        dataKey="t" 
        stroke="#94a3b8" 
        tickFormatter={(t) => `${t.toFixed(1)}s`}
        domain={xDomain}
        type="number"
        allowDataOverflow={false}
      />
      <YAxis stroke="#94a3b8" />
      <Tooltip
        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', color: '#e2e8f0' }}
        labelFormatter={(t) => `t=${Number(t).toFixed(3)}s`}
      />
      <Legend />
    </>
  )
})
ChartCore.displayName = 'ChartCore'


const SensorChartImpl = forwardRef<SensorChartRef, SensorChartProps>(({ series, frameRate, title, visibleAxes, showGrid = true, showLegend = true, showDots = false }, ref) => {
  const [currentFrame, setCurrentFrame] = useState(0)

  useImperativeHandle(ref, () => ({
    setFrame: (frame: number) => {
      setCurrentFrame(frame)
    }
  }))

  // Reset frame when series changes
  useEffect(() => {
    setCurrentFrame(0)
  }, [series])

  // Chart data should not depend on currentFrame to avoid re-rendering the whole chart each tick
  const data = useMemo(() => {
    if (!series || series.length === 0) return [] as ChartPoint[]
    const len = series.length
    const MAX_POINTS = 2000
    const stride = Math.max(1, Math.ceil(len / MAX_POINTS))
    const out: ChartPoint[] = []
    const denom = Math.max(frameRate, 1)
    for (let i = 0; i < len; i += stride) {
      const p = series[i]
      // Support 3-axis [x,y,z] or quaternion [w,x,y,z]
      if (p.length === 4) out.push({ t: i / denom, w: p[0] ?? 0, x: p[1] ?? 0, y: p[2] ?? 0, z: p[3] ?? 0 })
      else out.push({ t: i / denom, x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 })
    }
    if ((len - 1) % stride !== 0) {
      const p = series[len - 1]
      if (p.length === 4) out.push({ t: (len - 1) / denom, w: p[0] ?? 0, x: p[1] ?? 0, y: p[2] ?? 0, z: p[3] ?? 0 })
      else out.push({ t: (len - 1) / denom, x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 })
    }
    return out
  }, [series, frameRate])

  const currentTime = currentFrame / Math.max(frameRate, 1)
  // Avoid deriving y from original high-res series (not aligned with downsample); use linear interpolation on downsampled data for dots
  const currentDataPoint = useMemo(() => {
    if (!series || series.length === 0) return null as number[] | null
    const idx = Math.min(currentFrame, series.length - 1)
    return series[idx]
  }, [series, currentFrame])

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#334155" />}
          <ChartCore data={data} />
          {showLegend && <Legend />}
          {(visibleAxes?.w ?? false) && (
            <Line type="monotone" dataKey="w" stroke="#f59e0b" dot={showDots} name="W" isAnimationActive={false} />
          )}
          {(visibleAxes?.x ?? true) && (
            <Line type="monotone" dataKey="x" stroke="#60a5fa" dot={showDots} name="X" isAnimationActive={false} />
          )}
          {(visibleAxes?.y ?? true) && (
            <Line type="monotone" dataKey="y" stroke="#34d399" dot={showDots} name="Y" isAnimationActive={false} />
          )}
          {(visibleAxes?.z ?? true) && (
            <Line type="monotone" dataKey="z" stroke="#f472b6" dot={showDots} name="Z" isAnimationActive={false} />
          )}
          <ReferenceLine 
            x={currentTime} 
            stroke="#f59e0b" 
            strokeWidth={3}
            strokeDasharray="none"
            label={{ 
              value: `${currentTime.toFixed(2)}s`, 
              position: 'bottom',
              fill: '#f59e0b',
              fontSize: 12,
              fontWeight: 'bold'
            }}
            ifOverflow="extendDomain"
          />
          {currentDataPoint && (
            <>
              {/* Show W dot if W axis is visible (orientation data) */}
              {(visibleAxes?.w ?? false) && (
                <ReferenceDot x={currentTime} y={currentDataPoint[0]} r={5} fill="#f59e0b" stroke="#0f172a" strokeWidth={2} />
              )}
              {/* Show X, Y, Z dots */}
              {(visibleAxes?.x ?? true) && (
                <ReferenceDot x={currentTime} y={currentDataPoint[visibleAxes?.w ? 1 : 0]} r={5} fill="#60a5fa" stroke="#0f172a" strokeWidth={2} />
              )}
              {(visibleAxes?.y ?? true) && (
                <ReferenceDot x={currentTime} y={currentDataPoint[visibleAxes?.w ? 2 : 1]} r={5} fill="#34d399" stroke="#0f172a" strokeWidth={2} />
              )}
              {(visibleAxes?.z ?? true) && (
                <ReferenceDot x={currentTime} y={currentDataPoint[visibleAxes?.w ? 3 : 2]} r={5} fill="#f472b6" stroke="#0f172a" strokeWidth={2} />
              )}
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})
SensorChartImpl.displayName = 'SensorChartImpl'

export const SensorChart = memo(SensorChartImpl)


