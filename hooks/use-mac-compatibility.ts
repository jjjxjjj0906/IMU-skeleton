'use client'

import { useMemo, useEffect, useCallback } from 'react'

interface MacCompatibilityInfo {
  isMac: boolean
  isSafari: boolean
  isChrome: boolean
  isFirefox: boolean
  supportsWebGL: boolean
  supportsPointerEvents: boolean
  devicePixelRatio: number
  recommendedSettings: {
    pixelRatio: number
    antialias: boolean
    shadows: boolean
    powerPreference: 'high-performance' | 'low-power' | 'default'
  }
}

export function useMacCompatibility(): MacCompatibilityInfo {
  const compatibility = useMemo((): MacCompatibilityInfo => {
    if (typeof window === 'undefined') {
      return {
        isMac: false,
        isSafari: false,
        isChrome: false,
        isFirefox: false,
        supportsWebGL: false,
        supportsPointerEvents: false,
        devicePixelRatio: 1,
        recommendedSettings: {
          pixelRatio: 1,
          antialias: true,
          shadows: true,
          powerPreference: 'default'
        }
      }
    }

    const userAgent = navigator.userAgent
    const platform = navigator.platform
    
    const isMac = /Mac|iPod|iPhone|iPad/.test(platform) || /Mac|iPod|iPhone|iPad/.test(userAgent)
    const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent)
    const isChrome = /chrome/i.test(userAgent) && !/edge/i.test(userAgent)
    const isFirefox = /firefox/i.test(userAgent)
    
    // Check WebGL support
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    const supportsWebGL = !!gl
    
    // Check pointer events support
    const supportsPointerEvents = 'onpointerdown' in window
    
    const devicePixelRatio = window.devicePixelRatio || 1

    // Mac-specific recommendations
    const recommendedSettings = {
      pixelRatio: isMac ? Math.min(devicePixelRatio, 2) : devicePixelRatio,
      antialias: !isSafari || devicePixelRatio <= 1, // Disable antialias on high-DPI Safari
      shadows: !isSafari, // Disable shadows on Safari for better performance
      powerPreference: isMac ? 'high-performance' as const : 'default' as const
    }

    return {
      isMac,
      isSafari,
      isChrome,
      isFirefox,
      supportsWebGL,
      supportsPointerEvents,
      devicePixelRatio,
      recommendedSettings
    }
  }, [])

  // Log compatibility info in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Mac Compatibility Info:', compatibility)
    }
  }, [compatibility])

  // Warn about potential issues
  useEffect(() => {
    if (compatibility.isMac && compatibility.isSafari && !compatibility.supportsWebGL) {
      console.warn('Safari on Mac detected but WebGL is not supported. 3D visualization may not work.')
    }
    
    if (compatibility.isMac && !compatibility.supportsPointerEvents) {
      console.warn('Pointer events not supported. Touch interactions may be limited.')
    }
  }, [compatibility])

  return compatibility
}

// Hook for handling Mac-specific gestures and interactions
export function useMacGestures() {
  const compatibility = useMacCompatibility()
  
  const handleTrackpadGesture = useCallback((event: WheelEvent) => {
    // Mac trackpad sends wheel events with small deltaY values
    // We can use this to detect trackpad vs mouse wheel
    const isTrackpad = Math.abs(event.deltaY) < 100 && event.deltaMode === 0
    
    if (isTrackpad && compatibility.isMac) {
      // Adjust sensitivity for trackpad
      return {
        deltaX: event.deltaX * 0.5,
        deltaY: event.deltaY * 0.5,
        deltaZ: event.deltaZ * 0.5
      }
    }
    
    return {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ
    }
  }, [compatibility.isMac])

  return {
    handleTrackpadGesture,
    isMac: compatibility.isMac
  }
}
