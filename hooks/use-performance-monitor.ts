'use client'

import { useEffect, useRef, useCallback } from 'react'

interface PerformanceMetrics {
  fps: number
  frameTime: number
  memoryUsage?: number
  isLowPerformance: boolean
}

interface UsePerformanceMonitorOptions {
  targetFps?: number
  lowPerformanceThreshold?: number
  onLowPerformance?: (metrics: PerformanceMetrics) => void
  onPerformanceRecover?: (metrics: PerformanceMetrics) => void
}

export function usePerformanceMonitor(options: UsePerformanceMonitorOptions = {}) {
  const {
    targetFps = 60,
    lowPerformanceThreshold = 0.7, // 70% of target FPS
    onLowPerformance,
    onPerformanceRecover
  } = options

  const frameCountRef = useRef(0)
  const lastTimeRef = useRef(performance.now())
  const fpsRef = useRef(0)
  const frameTimeRef = useRef(0)
  const isLowPerformanceRef = useRef(false)
  const rafIdRef = useRef<number>()

  const updateMetrics = useCallback(() => {
    const now = performance.now()
    const deltaTime = now - lastTimeRef.current
    frameCountRef.current++

    // Update FPS every second
    if (deltaTime >= 1000) {
      fpsRef.current = Math.round((frameCountRef.current * 1000) / deltaTime)
      frameTimeRef.current = deltaTime / frameCountRef.current
      frameCountRef.current = 0
      lastTimeRef.current = now

      // Check for low performance
      const isLowPerformance = fpsRef.current < (targetFps * lowPerformanceThreshold)
      
      if (isLowPerformance && !isLowPerformanceRef.current) {
        isLowPerformanceRef.current = true
        onLowPerformance?.({
          fps: fpsRef.current,
          frameTime: frameTimeRef.current,
          memoryUsage: (performance as any).memory?.usedJSHeapSize,
          isLowPerformance: true
        })
      } else if (!isLowPerformance && isLowPerformanceRef.current) {
        isLowPerformanceRef.current = false
        onPerformanceRecover?.({
          fps: fpsRef.current,
          frameTime: frameTimeRef.current,
          memoryUsage: (performance as any).memory?.usedJSHeapSize,
          isLowPerformance: false
        })
      }
    }

    rafIdRef.current = requestAnimationFrame(updateMetrics)
  }, [targetFps, lowPerformanceThreshold, onLowPerformance, onPerformanceRecover])

  useEffect(() => {
    rafIdRef.current = requestAnimationFrame(updateMetrics)
    
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [updateMetrics])

  const getCurrentMetrics = useCallback((): PerformanceMetrics => ({
    fps: fpsRef.current,
    frameTime: frameTimeRef.current,
    memoryUsage: (performance as any).memory?.usedJSHeapSize,
    isLowPerformance: isLowPerformanceRef.current
  }), [])

  return {
    getCurrentMetrics,
    isLowPerformance: isLowPerformanceRef.current
  }
}
