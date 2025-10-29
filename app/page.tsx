'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SkeletonViewer, DatasetPayload } from '../components/skeleton-viewer'
import { SensorChart, SensorChartRef } from '@/components/sensor-chart'
import { ErrorBoundary } from '@/components/error-boundary'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Play, Pause, RotateCcw, AlertCircle, Loader2 } from 'lucide-react'
import { getCachedJson, prefetchJson } from '@/lib/utils'
import { computeStats, movingAverageSmooth, normalizeSeries, type NormalizeMode } from '@/lib/processing'
import { useMacCompatibility } from '@/hooks/use-mac-compatibility'
import { usePerformanceMonitor } from '@/hooks/use-performance-monitor'
import { SENSOR_NAMES, EDGES, exampleTPose, exampleStandingRest, validateSkeletonStructure } from '@/lib/skeleton-constants'

const defaultDatasets = [
  { id: '6km', label: '6 km/h Walking', path: '/datasets/speed6kmh.json' },
  { id: '10km', label: '10 km/h Running', path: '/datasets/speed10kmh.json' },
]

export default function Page() {
  const [data, setData] = useState<DatasetPayload | null>(null)
  const [displayFrame, setDisplayFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [selectedDataset, setSelectedDataset] = useState<string>('6km')
  const [error, setError] = useState<string | null>(null)
  const [showOrientation, setShowOrientation] = useState(false)
  const [showGyroscope, setShowGyroscope] = useState(false)
  const [showAccelerometer, setShowAccelerometer] = useState(false)
  const [showMagnetometer, setShowMagnetometer] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedJoint, setSelectedJoint] = useState<string | null>(null)
  // Charts use a separate selection so 3D/calibration changes do not disrupt chart controls
  const [selectedChartJoint, setSelectedChartJoint] = useState<string | null>(null)
  const [selectedSignal, setSelectedSignal] = useState<'orientation' | 'gyroscope' | 'accelerometer' | 'magnetometer' | null>(null)
  const [showControls, setShowControls] = useState(true)
  const [showChart, setShowChart] = useState(true)
  const [targetFps, setTargetFps] = useState<number>(0) // 0 means dataset's frameRate
  const [seekFrame, setSeekFrame] = useState<number | null>(null)
  const [isSeeking, setIsSeeking] = useState(false)

  // Mac compatibility and performance monitoring
  const macCompatibility = useMacCompatibility()
  const { isLowPerformance } = usePerformanceMonitor({
    targetFps: targetFps || 60,
    onLowPerformance: (metrics) => {
      console.warn('Low performance detected:', metrics)
      if (macCompatibility.isSafari) {
        console.warn('Consider using Chrome or Firefox for better performance on Mac')
      }
    }
  })

  const frameUpdateTimer = useRef<number | null>(null)
  const chartRef = useRef<SensorChartRef>(null)

  // Axis visibility for charts
  const [sensorAxesVisible, setSensorAxesVisible] = useState<{ x: boolean, y: boolean, z: boolean }>({ x: true, y: true, z: true })
  const [orientationAxesVisible, setOrientationAxesVisible] = useState<{ w: boolean, x: boolean, y: boolean, z: boolean }>({ w: true, x: true, y: true, z: true })

  // Calibration: per-joint position offset [dx, dy, dz]
  const [calibration, setCalibration] = useState<{ [joint: string]: { positionOffset?: [number, number, number] } }>({})

  // Analytics / processing controls
  const [normalizeMode, setNormalizeMode] = useState<NormalizeMode>('none')
  const [smoothWindow, setSmoothWindow] = useState<number>(1)
  const [showGrid, setShowGrid] = useState<boolean>(true)
  const [showLegend, setShowLegend] = useState<boolean>(true)
  const [showDots, setShowDots] = useState<boolean>(false)
  const [showCalibrationJson, setShowCalibrationJson] = useState<boolean>(false)
  const [showSkeletonInfo, setShowSkeletonInfo] = useState<boolean>(false)

  // Only include joints that have a non-zero calibration
  const calibrationFiltered = useMemo(() => {
    const out: { [joint: string]: { positionOffset?: [number, number, number] } } = {}
    for (const key of Object.keys(calibration || {})) {
      const off = calibration[key]?.positionOffset
      if (!off || off.length !== 3) continue
      if ((off[0] || 0) !== 0 || (off[1] || 0) !== 0 || (off[2] || 0) !== 0) {
        out[key] = { positionOffset: [off[0] || 0, off[1] || 0, off[2] || 0] }
      }
    }
    return out
  }, [calibration])

  // Prefetch datasets on first mount for faster switching
  useEffect(() => {
    prefetchJson(defaultDatasets.map(d => d.path))
  }, [])

  // Make skeleton constants available globally for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.SENSOR_NAMES = SENSOR_NAMES
      window.EDGES = EDGES
      window.exampleTPose = exampleTPose
      window.exampleStandingRest = exampleStandingRest
      window.validateSkeletonStructure = validateSkeletonStructure
    }
  }, [])

  const handleFrameChange = (frame: number) => {
    // Update chart immediately for smooth line by calling method on child component
    chartRef.current?.setFrame(frame)
    // single chart handles both sensor and orientation

    // We want to throttle the state updates to avoid re-rendering the whole UI on every frame
    if (frameUpdateTimer.current === null) {
      frameUpdateTimer.current = window.setTimeout(() => {
        if (!isSeeking) {
          setDisplayFrame(frame)
        }
        frameUpdateTimer.current = null
      }, 1000 / 30) // Update UI at max 30fps
    }
  }

  const handleSliderChange = (value: number[]) => {
    const frame = value[0]
    if (!isSeeking) setIsSeeking(true)
    setDisplayFrame(frame)
    setSeekFrame(frame)
  }

  const handleSliderCommit = () => {
    setIsSeeking(false)
    // After seeking, we might want to ensure the animation component knows seeking is done
    // by setting seekFrame to null after a short delay.
    window.setTimeout(() => setSeekFrame(null), 100)
  }
  
  useEffect(() => {
    const meta = defaultDatasets.find(d => d.id === selectedDataset)
    if (!meta) return

    const abortController = new AbortController()

    async function doFetch() {
      setError(null)
      setIsLoading(true)
      setIsPlaying(false)
      
      try {
        const payload = (await getCachedJson(meta!.path, { signal: abortController.signal })) as DatasetPayload
        console.log('Loaded dataset:', {
          frames: payload.numFrames,
          sensors: payload.numSensors,
          frameRate: payload.frameRate
        })

        setData(payload)
        setDisplayFrame(0)
        setSeekFrame(0) // Reset skeleton to frame 0
        setIsPlaying(true)

        // Reset seek frame after a short delay to allow autoplay to start
        window.setTimeout(() => setSeekFrame(null), 100)

        // Initialize selections: do not auto-select any joint for calibration
        setSelectedJoint(null)
        if (payload.rawSensorData) {
          const joints = Object.keys(payload.rawSensorData)
          if (joints.length > 0) {
            setSelectedChartJoint(joints[0])
            const first = payload.rawSensorData[joints[0]]
            const sig = first.orientation ? 'orientation' : first.gyroscope ? 'gyroscope' : first.accelerometer ? 'accelerometer' : first.magnetometer ? 'magnetometer' : null
            setSelectedSignal(sig)
          } else {
            setSelectedChartJoint(payload.sensorNames[0] ?? null)
            setSelectedSignal(null)
          }
        } else {
          setSelectedChartJoint(payload.sensorNames[0] ?? null)
          setSelectedSignal(null)
        }

        // Load persisted calibration for this dataset if available
        try {
          const storageKey = `pj_calibration_${meta!.id}`
          const saved = localStorage.getItem(storageKey)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (parsed && typeof parsed === 'object') setCalibration(parsed)
          } else {
            setCalibration({})
          }
        } catch (e) {
          console.warn('Failed to load persisted calibration:', e)
          setCalibration({})
        }
      } catch (e: any) {
        if (e.name === 'AbortError') return
        console.error('Failed to load dataset:', e)
        // More specific error message for mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const errorMsg = isMobile 
          ? 'Failed to load dataset on mobile. Please check your internet connection and try again.'
          : e?.message || 'Failed to fetch dataset JSON. Did you export it?'
        setError(errorMsg)
      } finally {
        if (!abortController.signal.aborted) setIsLoading(false)
      }
    }

    doFetch()

    return () => abortController.abort()
  }, [selectedDataset])

  // Persist calibration whenever it changes for the active dataset
  useEffect(() => {
    try {
      const meta = defaultDatasets.find(d => d.id === selectedDataset)
      if (!meta) return
      const storageKey = `pj_calibration_${meta.id}`
      localStorage.setItem(storageKey, JSON.stringify(calibration))
    } catch (e) {
      // ignore persistence errors
    }
  }, [calibration, selectedDataset])

  const chartableJoints = useMemo(() => {
    if (!data) return [] as string[]
    if (data.rawSensorData) return Object.keys(data.rawSensorData)
    return data.sensorNames
  }, [data])

  // Ensure selectedJoint (calibration/3D) remains valid when dataset changes, allow null
  useEffect(() => {
    if (!data) return
    const names = data.sensorNames
    if (selectedJoint !== null && !names.includes(selectedJoint)) setSelectedJoint(null)
  }, [data, selectedJoint])

  // Ensure selectedChartJoint (charts) remains valid when dataset/raw data changes
  useEffect(() => {
    if (!data) return
    if (!selectedChartJoint || !chartableJoints.includes(selectedChartJoint)) setSelectedChartJoint(chartableJoints[0] ?? null)
  }, [data, chartableJoints, selectedChartJoint])

  const chartableSignals = useMemo(() => {
    if (!data || !selectedChartJoint || !data.rawSensorData) return [] as Array<'orientation'|'gyroscope'|'accelerometer'|'magnetometer'>
    const entry = data.rawSensorData[selectedChartJoint]
    if (!entry) return []
    const out: Array<'orientation'|'gyroscope'|'accelerometer'|'magnetometer'> = []
    if (entry.orientation) out.push('orientation')
    if (entry.gyroscope) out.push('gyroscope')
    if (entry.accelerometer) out.push('accelerometer')
    if (entry.magnetometer) out.push('magnetometer')
    return out
  }, [data, selectedChartJoint])

  const chartSeries = useMemo(() => {
    if (!data || !selectedChartJoint || !selectedSignal) return null
    const entry = data.rawSensorData?.[selectedChartJoint]
    if (!entry) return null
    if (selectedSignal === 'orientation') return entry.orientation ?? null
    if (selectedSignal === 'gyroscope') return entry.gyroscope ?? null
    if (selectedSignal === 'accelerometer') return entry.accelerometer ?? null
    if (selectedSignal === 'magnetometer') return entry.magnetometer ?? null
    return null
  }, [data, selectedChartJoint, selectedSignal])

  // Keep selectedSignal valid when selectedChartJoint changes
  useEffect(() => {
    if (!data || !selectedChartJoint || !data.rawSensorData) return
    const entry = data.rawSensorData[selectedChartJoint]
    if (!entry) {
      setSelectedSignal(null)
      return
    }
    if (selectedSignal === 'orientation' && !entry.orientation) setSelectedSignal(null)
    else if (selectedSignal === 'gyroscope' && !entry.gyroscope) setSelectedSignal(null)
    else if (selectedSignal === 'accelerometer' && !entry.accelerometer) setSelectedSignal(null)
    else if (selectedSignal === 'magnetometer' && !entry.magnetometer) setSelectedSignal(null)
  }, [data, selectedChartJoint])

  const processedSeries = useMemo(() => {
    if (!chartSeries) return null as number[][] | null
    let s = chartSeries
    const autoMode: NormalizeMode = selectedSignal === 'orientation' ? 'quaternion-unit' : 'none'
    const modeToUse = normalizeMode === 'none' ? autoMode : normalizeMode
    s = normalizeSeries(s, modeToUse)
    s = movingAverageSmooth(s, smoothWindow)
    return s
  }, [chartSeries, normalizeMode, smoothWindow, selectedSignal])

  const seriesStats = useMemo(() => {
    if (!processedSeries) return null
    return computeStats(processedSeries)
  }, [processedSeries])

  // Sync chart frame when chart series changes (not on every displayFrame change!)
  useEffect(() => {
    if (chartRef.current && chartSeries) {
      chartRef.current.setFrame(0)
    }
  }, [chartSeries])

  const currentFrameProgress = data ? ((displayFrame + 1) / data.numFrames) * 100 : 0
  
  const visibleAxesForChart = useMemo(() => {
    if (selectedSignal === 'orientation') {
      return {
        w: orientationAxesVisible.w,
        x: sensorAxesVisible.x,
        y: sensorAxesVisible.y,
        z: sensorAxesVisible.z,
      }
    }
    return {
      x: sensorAxesVisible.x,
      y: sensorAxesVisible.y,
      z: sensorAxesVisible.z,
    }
  }, [selectedSignal, sensorAxesVisible, orientationAxesVisible])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Header Controls (overlay) */}
      <Card className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 bg-slate-900 border-slate-800 z-20">
        <CardHeader className="pb-2 md:pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
            <div className="text-center md:text-left">
              <CardTitle className="text-lg md:text-2xl text-slate-100">3D Skeleton Viewer</CardTitle>
              <CardDescription className="text-xs md:text-sm text-slate-400">
                Interactive 15-sensor motion capture visualization
              </CardDescription>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-2 md:gap-2">
              <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-slate-100">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {defaultDatasets.map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-slate-100 hover:bg-slate-700">
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 md:gap-3 w-full md:w-[320px]">
                <span className="text-xs md:text-sm text-slate-300 whitespace-nowrap">FPS</span>
                <div className="flex-1">
                  <Slider
                    value={[Math.min(180, Math.max(1, targetFps || 60))]}
                    onValueChange={(vals) => setTargetFps(Math.min(180, Math.max(1, vals[0])))}
                    min={1}
                    max={180}
                    step={1}
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={Math.min(180, Math.max(1, targetFps || 60))}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    if (Number.isFinite(val)) setTargetFps(Math.min(180, Math.max(1, val)))
                  }}
                  className="w-12 md:w-16 bg-slate-800 border border-slate-700 text-slate-100 rounded px-1 md:px-2 py-1 text-xs md:text-sm"
                />
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button variant="outline" className="flex-1 md:flex-none border-slate-600 text-slate-300 hover:bg-slate-800 text-xs md:text-sm" onClick={() => setShowControls(v => !v)}>
                  {showControls ? 'Hide Controls' : 'Show Controls'}
                </Button>
                <Button variant="outline" className="flex-1 md:flex-none border-slate-600 text-slate-300 hover:bg-slate-800 text-xs md:text-sm" onClick={() => setShowChart(v => !v)}>
                  {showChart ? 'Hide Chart' : 'Show Chart'}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        {showControls && (
        <CardContent className="space-y-4 md:space-y-6">
          {/* Playback Controls */}
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
            <Button
              onClick={() => setIsPlaying(p => !p)}
              disabled={!data}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>

            <Button
              onClick={() => {
                setDisplayFrame(0)
                setSeekFrame(0)
                setIsPlaying(true)
              }}
              disabled={!data}
              variant="outline"
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset
            </Button>

            {data && (
              <div className="flex-1 w-full md:ml-4">
                <div className="flex justify-between text-xs md:text-sm text-slate-400 mb-2">
                  <span>Frame {displayFrame + 1} of {data.numFrames}</span>
                  <span>{Math.round(currentFrameProgress)}%</span>
                </div>
                <Slider
                  value={[displayFrame]}
                  onValueChange={handleSliderChange}
                  onValueCommit={handleSliderCommit}
                  max={data.numFrames - 1}
                  step={1}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Analytics / Processing */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">Analytics</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300 whitespace-nowrap">Normalize</span>
                <Select value={normalizeMode} onValueChange={(v) => setNormalizeMode(v as NormalizeMode)}>
                  <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue placeholder="none" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {['none','minmax','zscore','vector-unit','quaternion-unit'].map(opt => (
                      <SelectItem key={opt} value={opt} className="text-slate-100 hover:bg-slate-700">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300 whitespace-nowrap">Smoothing</span>
                <div className="flex-1">
                  <Slider
                    value={[Math.min(101, Math.max(1, smoothWindow))]}
                    onValueChange={(vals) => setSmoothWindow(Math.min(101, Math.max(1, vals[0])))}
                    min={1}
                    max={101}
                    step={2}
                  />
                </div>
                <div className="w-10 text-right text-xs text-slate-300">{smoothWindow}</div>
              </div>

              <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                <div className="flex items-center space-x-2">
                  <Checkbox id="opt-grid" checked={showGrid} onCheckedChange={(c) => setShowGrid(c === true)} />
                  <label htmlFor="opt-grid" className="text-xs text-slate-300 cursor-pointer">Grid</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="opt-legend" checked={showLegend} onCheckedChange={(c) => setShowLegend(c === true)} />
                  <label htmlFor="opt-legend" className="text-xs text-slate-300 cursor-pointer">Legend</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="opt-dots" checked={showDots} onCheckedChange={(c) => setShowDots(c === true)} />
                  <label htmlFor="opt-dots" className="text-xs text-slate-300 cursor-pointer">Dots</label>
                </div>
              </div>
            </div>

            {seriesStats && (
              <div className="text-xs text-slate-400 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <div>Min: {seriesStats.min.map(v => v.toFixed(3)).join(', ')}</div>
                  <div>Max: {seriesStats.max.map(v => v.toFixed(3)).join(', ')}</div>
                </div>
                <div>
                  <div>Mean: {seriesStats.mean.map(v => v.toFixed(3)).join(', ')}</div>
                  <div>Std: {seriesStats.std.map(v => v.toFixed(3)).join(', ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Calibration */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">Calibration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-300">Joint</span>
                <Select value={selectedJoint ?? ''} onValueChange={(val) => setSelectedJoint(val)} disabled={!data || data.sensorNames.length === 0}>
                  <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select Joint" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {(data?.sensorNames ?? []).map(joint => (
                      <SelectItem key={joint} value={joint} className="text-slate-100 hover:bg-slate-700 capitalize">
                        {joint.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-slate-300">Offset</span>
                {(['x','y','z'] as const).map((axis, idx) => (
                  <div key={axis} className="flex items-center gap-2">
                    <label className="text-xs text-slate-400 w-3 uppercase">{axis}</label>
                    <input
                      type="number"
                      step={0.01}
                      className="w-20 bg-slate-800 border border-slate-700 text-slate-100 rounded px-2 py-1 text-sm"
                      value={(() => {
                        const key = selectedJoint ?? ''
                        const off = calibration[key]?.positionOffset ?? [0,0,0]
                        return off[idx]
                      })()}
                      onChange={(e) => {
                        const key = selectedJoint
                        if (!key) return
                        const v = Number(e.target.value)
                        setCalibration(prev => {
                          const cur = prev[key]?.positionOffset ?? [0,0,0]
                          const next: [number, number, number] = [cur[0], cur[1], cur[2]]
                          next[idx] = Number.isFinite(v) ? v : 0
                          return { ...prev, [key]: { ...(prev[key]||{}), positionOffset: next } }
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                className="border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 bg-transparent"
                onClick={() => {
                  const payload = JSON.stringify(calibration, null, 2)
                  const blob = new Blob([payload], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'calibration.json'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                Export Calibration JSON
              </Button>
              <Button
                variant="ghost"
                className="border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 bg-transparent"
                onClick={() => {
                  if (!selectedJoint) return
                  setCalibration(prev => {
                    const next = { ...prev }
                    // If resetting to zero, remove the entry entirely to keep JSON filtered smart
                    delete next[selectedJoint]
                    return next
                  })
                }}
                disabled={!selectedJoint}
              >
                Reset Current Joint Offset
              </Button>
              <label className="text-sm text-slate-300 cursor-pointer">
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const inputEl = e.currentTarget
                    const file = inputEl?.files?.[0]
                    if (!file) {
                      if (inputEl) inputEl.value = ''
                      return
                    }
                    try {
                      const text = await file.text()
                      const raw = JSON.parse(text)
                      // Basic schema validation: map of joint -> { positionOffset: [x,y,z] }
                      if (!raw || typeof raw !== 'object') throw new Error('Invalid calibration format')
                      const next: { [joint: string]: { positionOffset?: [number, number, number] } } = {}
                      for (const key of Object.keys(raw)) {
                        const entry = raw[key]
                        if (!entry || typeof entry !== 'object') continue
                        const off = entry.positionOffset
                        if (
                          Array.isArray(off) &&
                          off.length === 3 &&
                          off.every((v) => typeof v === 'number' && Number.isFinite(v))
                        ) {
                          next[key] = { positionOffset: [off[0], off[1], off[2]] }
                        }
                      }
                      setCalibration(next)
                    } catch (err) {
                      console.error('Failed to import calibration:', err)
                    } finally {
                      if (inputEl) inputEl.value = ''
                    }
                  }}
                />
                <span className="border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">Import Calibration JSON</span>
              </label>
              <Button
                variant="ghost"
                className="border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 bg-transparent"
                onClick={() => setShowCalibrationJson(v => !v)}
              >
                {showCalibrationJson ? 'Hide Calibration JSON' : 'Show Calibration JSON'}
              </Button>
              <Button
                variant="ghost"
                className="border border-slate-600 rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 bg-transparent"
                onClick={() => setShowSkeletonInfo(v => !v)}
              >
                {showSkeletonInfo ? 'Hide Skeleton Info' : 'Show Skeleton Info'}
              </Button>
            </div>

            {showCalibrationJson && (
              <div className="mt-3">
                <pre className="bg-slate-800 border border-slate-700 rounded p-3 text-xs text-slate-200 max-h-64 overflow-auto">
{JSON.stringify(calibrationFiltered, null, 2)}
                </pre>
              </div>
            )}

            {showSkeletonInfo && (
              <div className="mt-3">
                <div className="bg-slate-800 border border-slate-700 rounded p-3 text-xs text-slate-200 max-h-64 overflow-auto">
                  <div className="mb-3">
                    <h4 className="text-slate-100 font-medium mb-2">15-Sensor Skeleton Structure</h4>
                    <p className="text-slate-300 mb-2">This matches the exact structure from plot_skeleton_15_sensors.py</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h5 className="text-slate-100 font-medium mb-2">Sensors ({SENSOR_NAMES.length}):</h5>
                      <div className="space-y-1">
                        {SENSOR_NAMES.map((sensor, i) => (
                          <div key={sensor} className="text-slate-300">
                            {i + 1}. {sensor}
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h5 className="text-slate-100 font-medium mb-2">Connections ({EDGES.length}):</h5>
                      <div className="space-y-1">
                        {EDGES.map((edge, i) => (
                          <div key={i} className="text-slate-300">
                            {i + 1}. {edge[0]} → {edge[1]}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <p className="text-slate-400 text-xs">
                      This structure ensures the 3D skeleton matches exactly with the Python visualization code.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </CardContent>
        )}
      </Card>

      {/* 3D Viewer */}
      <div className="absolute inset-0">
        {error && (
          <Card className="absolute top-4 left-4 right-4 bg-red-950 border-red-800 text-red-100 z-10">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-red-100">Error Loading Dataset</h3>
                  <p className="text-red-300 mt-1">{error}</p>
                  <p className="text-red-400 text-sm mt-2">
                    Make sure you have exported the data from the H5 files:
                  </p>
                  <code className="block bg-red-900/50 p-2 rounded text-xs mt-2 font-mono">
                    python export_web_dataset.py --input speed6kmh/... --output web/public/datasets/speed6kmh.json
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Performance warning for Mac Safari users */}
        {macCompatibility.isMac && macCompatibility.isSafari && isLowPerformance && (
          <Card className="absolute top-20 left-4 right-4 bg-yellow-950 border-yellow-800 text-yellow-100 z-10">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-medium text-yellow-100">Performance Warning</h3>
                  <p className="text-yellow-300 mt-1">
                    The app is running slowly on Safari. For better performance on Mac, try using Chrome or Firefox.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mac zoom instructions */}
        {macCompatibility.isMac && (
          <Card className="absolute top-32 left-4 right-4 bg-blue-950 border-blue-800 text-blue-100 z-10">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0">🔍</div>
                <div>
                  <h3 className="font-medium text-blue-100">Mac Zoom Instructions</h3>
                  <p className="text-blue-300 mt-1 text-sm">
                    <strong>Trackpad:</strong> Pinch to zoom in/out • <strong>Mouse:</strong> Scroll wheel • <strong>Touch:</strong> Two-finger scroll
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Loading dataset...</span>
            </div>
          </div>
        )}

        {data ? (
          <ErrorBoundary
            onError={(error, errorInfo) => {
              console.error('SkeletonViewer error:', error, errorInfo)
              if (macCompatibility.isMac && macCompatibility.isSafari) {
                console.warn('Error occurred in Safari on Mac. Consider using Chrome or Firefox.')
              }
            }}
          >
          <SkeletonViewer 
            data={data} 
            isPlaying={isPlaying}
            targetFps={targetFps}
            seekFrame={seekFrame}
            onFrameChange={handleFrameChange}
            showOrientation={showOrientation}
            showGyroscope={showGyroscope}
            showAccelerometer={showAccelerometer}
            showMagnetometer={showMagnetometer}
            calibration={calibration}
            selectedJoint={selectedJoint}
            onCalibrationChange={(joint, offset) => {
              setCalibration(prev => ({ ...prev, [joint]: { ...(prev[joint]||{}), positionOffset: offset } }))
            }}
            onSelectJoint={(joint) => setSelectedJoint(joint)}
          />
          </ErrorBoundary>
        ) : !isLoading && !error ? (
          <div className="w-full h-full flex items-center justify-center bg-slate-900">
            <div className="text-slate-400">Select a dataset to begin</div>
          </div>
        ) : null}

        {/* Charts (overlay) */}
        {data && showChart && (
        <Card className="absolute bottom-2 left-2 right-2 md:bottom-4 md:left-4 md:right-4 bg-slate-900 border-slate-800 z-20">
          <CardHeader className="pb-2 md:pb-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
              <div className="text-center md:text-left">
                <CardTitle className="text-lg md:text-xl text-slate-100">Sensor Data Chart</CardTitle>
                <CardDescription className="text-xs md:text-sm text-slate-400">
                  View raw sensor streams over time, synced with playback.
                </CardDescription>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4">
                <Select
                  value={selectedChartJoint ?? ''}
                  onValueChange={(val) => setSelectedChartJoint(val)}
                  disabled={chartableJoints.length === 0}
                >
                  <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select Joint" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {chartableJoints.map(joint => (
                      <SelectItem key={joint} value={joint} className="text-slate-100 hover:bg-slate-700 capitalize">
                        {joint.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedSignal ?? ''}
                  onValueChange={(val) => setSelectedSignal(val as any)}
                  disabled={!selectedChartJoint || chartableSignals.length === 0}
                >
                  <SelectTrigger className="w-full md:w-48 bg-slate-800 border-slate-700 text-slate-100">
                    <SelectValue placeholder="Select Signal" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {chartableSignals.map(sig => (
                      <SelectItem key={sig} value={sig} className="text-slate-100 hover:bg-slate-700 capitalize">
                        {sig}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Axes toggles: show W when orientation selected */}
                <div className="flex md:hidden items-center gap-2 flex-wrap">
                  {selectedSignal === 'orientation' && (
                    <div className="flex items-center space-x-2">
                      <Checkbox id="hdr-sensor-w-mobile" checked={orientationAxesVisible.w} onCheckedChange={(c) => setOrientationAxesVisible(v => ({ ...v, w: c === true }))} />
                      <label htmlFor="hdr-sensor-w-mobile" className="text-xs text-slate-300 cursor-pointer">W</label>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-x-mobile" checked={sensorAxesVisible.x} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, x: c === true }))} />
                    <label htmlFor="hdr-sensor-x-mobile" className="text-xs text-slate-300 cursor-pointer">X</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-y-mobile" checked={sensorAxesVisible.y} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, y: c === true }))} />
                    <label htmlFor="hdr-sensor-y-mobile" className="text-xs text-slate-300 cursor-pointer">Y</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-z-mobile" checked={sensorAxesVisible.z} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, z: c === true }))} />
                    <label htmlFor="hdr-sensor-z-mobile" className="text-xs text-slate-300 cursor-pointer">Z</label>
                  </div>
                </div>
                {/* Desktop axes toggles */}
                <div className="hidden md:flex items-center gap-2">
                  {selectedSignal === 'orientation' && (
                    <div className="flex items-center space-x-2">
                      <Checkbox id="hdr-sensor-w" checked={orientationAxesVisible.w} onCheckedChange={(c) => setOrientationAxesVisible(v => ({ ...v, w: c === true }))} />
                      <label htmlFor="hdr-sensor-w" className="text-xs text-slate-300 cursor-pointer">W</label>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-x" checked={sensorAxesVisible.x} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, x: c === true }))} />
                    <label htmlFor="hdr-sensor-x" className="text-xs text-slate-300 cursor-pointer">X</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-y" checked={sensorAxesVisible.y} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, y: c === true }))} />
                    <label htmlFor="hdr-sensor-y" className="text-xs text-slate-300 cursor-pointer">Y</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="hdr-sensor-z" checked={sensorAxesVisible.z} onCheckedChange={(c) => setSensorAxesVisible(v => ({ ...v, z: c === true }))} />
                    <label htmlFor="hdr-sensor-z" className="text-xs text-slate-300 cursor-pointer">Z</label>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {processedSeries && selectedSignal ? (
              <SensorChart
                ref={chartRef}
                series={processedSeries}
                frameRate={data.frameRate}
                visibleAxes={visibleAxesForChart as any}
                showGrid={showGrid}
                showLegend={showLegend}
                showDots={showDots}
              />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-slate-500 bg-slate-800/50 rounded-md">
                Select a joint and signal to display data.
              </div>
            )}
            {/* Orientation axis toggles merged into single chart when orientation selected */}
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}


