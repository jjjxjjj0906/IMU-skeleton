'use client'

import { useEffect, useMemo, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { SENSOR_NAMES, EDGES, validateSkeletonStructure } from '@/lib/skeleton-constants'

export interface DatasetPayload {
  frameRate: number
  sensorNames: string[]
  edges: [string, string][]
  numFrames: number
  numSensors: number
  frames: number[][][]
  rawSensorData?: {
    [jointName: string]: {
      orientation?: number[][]
      gyroscope?: number[][]
      accelerometer?: number[][]
      magnetometer?: number[][]
    }
  }
}

interface SkeletonViewerProps {
  data: DatasetPayload | null
  isPlaying: boolean
  targetFps: number
  showOrientation: boolean
  showGyroscope: boolean
  showAccelerometer: boolean
  showMagnetometer: boolean
  onFrameChange?: (frame: number) => void
  seekFrame?: number | null
  calibration?: { [jointName: string]: { positionOffset?: [number, number, number] } }
  selectedJoint?: string | null
  onCalibrationChange?: (jointName: string, positionOffset: [number, number, number]) => void
  onSelectJoint?: (jointName: string | null) => void
}

const JOINT_RADIUS = 0.04
const BONE_RADIUS = 0.02

export function SkeletonViewer({
  data,
  isPlaying,
  targetFps,
  showOrientation,
  showGyroscope,
  showAccelerometer,
  showMagnetometer,
  onFrameChange,
  seekFrame,
  calibration,
  selectedJoint,
  onCalibrationChange,
  onSelectJoint,
}: SkeletonViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const tControlsRef = useRef<TransformControls | null>(null)
  const raycasterRef = useRef<THREE.Raycaster | null>(null)
  const pointerRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 })
  
  const jointsRef = useRef<THREE.Mesh[]>([])
  const bonesRef = useRef<THREE.Line[]>([])
  const jointPositionsRef = useRef<THREE.Vector3[]>([])
  const currentFrameRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const isDraggingRef = useRef<boolean>(false)
  const isSeekingRef = useRef(false)
  const selectedJointRef = useRef<string | null>(null)
  const calibrationRef = useRef<{ [jointName: string]: { positionOffset?: [number, number, number] } }>({})
  const tempVecRef = useRef<{ a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3 }>({
    a: new THREE.Vector3(),
    b: new THREE.Vector3(),
    c: new THREE.Vector3(),
  })
  
  const rawDataVizRef = useRef<{
    [jointName: string]: {
      orientation?: THREE.AxesHelper
      gyroscope?: THREE.ArrowHelper
      accelerometer?: THREE.ArrowHelper
      magnetometer?: THREE.ArrowHelper
    }
  }>({})
  const SCALE_FACTOR = 0.01

  // Mac-specific compatibility checks
  const isMac = useMemo(() => {
    if (typeof window === 'undefined') return false
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform) || 
           /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
  }, [])

  const isSafari = useMemo(() => {
    if (typeof window === 'undefined') return false
    return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
  }, [])

  // WebGL context loss handling for Mac Safari
  const handleWebGLContextLoss = useCallback((event: Event) => {
    console.warn('WebGL context lost, attempting to restore...')
    event.preventDefault()
    // Force re-initialization on next frame
    setTimeout(() => {
      if (mountRef.current && rendererRef.current) {
        const mount = mountRef.current
        const width = mount.clientWidth
        const height = mount.clientHeight
        rendererRef.current.setSize(width, height)
        rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      }
    }, 100)
  }, [])

  const handleWebGLContextRestore = useCallback(() => {
    console.log('WebGL context restored')
    // Re-initialize scene if needed
    if (sceneRef.current && rendererRef.current) {
      // Scene should still exist, just re-render
      if (cameraRef.current && controlsRef.current) {
        controlsRef.current.update()
      }
    }
  }, [])

  function getBasePositionForJoint(jointIndex: number, frameIndex: number): THREE.Vector3 {
    const base = new THREE.Vector3()
    if (!data) return base
    const f = data.frames[frameIndex]
    const p = f?.[jointIndex]
    if (!p) return base
    base.set((p[0] ?? 0) * SCALE_FACTOR, (p[1] ?? 0) * SCALE_FACTOR, (p[2] ?? 0) * SCALE_FACTOR)
    return base
  }


  // Validate skeleton structure and compute edge pairs
  const skeletonValidation = useMemo(() => {
    if (!data) return { isValid: true, missingSensors: [], missingEdges: [] }
    return validateSkeletonStructure(data)
  }, [data])

  // Compute edge pairs using the validated structure
  const edgeIndexPairs = useMemo(() => {
    if (!data) return []
    
    // Use the standard skeleton structure from constants
    const nameToIdx = new Map(data.sensorNames.map((n, i) => [n, i]))
    return EDGES.map(([a, b]) => {
      const idxA = nameToIdx.get(a)
      const idxB = nameToIdx.get(b)
      if (idxA === undefined || idxB === undefined) {
        console.warn(`Missing sensor for edge: ${a} -> ${b}`)
        return null
      }
      return [idxA, idxB] as [number, number]
    }).filter((edge): edge is [number, number] => edge !== null)
  }, [data])

  // Animation logic with Mac Safari optimizations
  useEffect(() => {
    if (!data) return

    let rafId: number
    const fps = targetFps > 0 ? targetFps : (data.frameRate || 60)
    const intervalMs = 1000 / fps
    let lastTime = performance.now()
    let accumulator = 0
    let frameSkip = 0
    const maxFrameSkip = isSafari ? 3 : 5 // Limit frame skipping on Safari

    const tick = (time: number) => {
      rafId = requestAnimationFrame(tick)

      // Pause-safe timing and skip updates while dragging
      if (!isPlaying || isSeekingRef.current || isDraggingRef.current) {
        lastTime = time
        return
      }

      const delta = time - lastTime
      lastTime = time
      accumulator += delta

      // Advance simulation in fixed steps to honor target FPS exactly
      let framesToUpdate = 0
      while (accumulator >= intervalMs && framesToUpdate < maxFrameSkip) {
        accumulator -= intervalMs
        framesToUpdate++
        currentFrameRef.current = (currentFrameRef.current + 1) % data.numFrames
        updateSkeleton(currentFrameRef.current)
        if (onFrameChange) onFrameChange(currentFrameRef.current)
      }
      
      // If we're falling behind, skip frames to catch up
      if (framesToUpdate === 0 && accumulator > intervalMs * 2) {
        frameSkip++
        if (frameSkip % 10 === 0) {
          console.warn('Animation falling behind, skipping frames')
        }
      } else {
        frameSkip = 0
      }
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [data, isPlaying, targetFps, onFrameChange, isSafari])

  // Keep refs in sync for event handlers
  useEffect(() => { isPlayingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { selectedJointRef.current = selectedJoint ?? null }, [selectedJoint])
  useEffect(() => { calibrationRef.current = calibration ?? {} }, [calibration])
  
  // Handle seeking
  useEffect(() => {
    if (seekFrame !== undefined && seekFrame !== null) {
      isSeekingRef.current = true
      const frame = Math.max(0, Math.min(seekFrame, data?.numFrames ? data.numFrames - 1 : 0))
      currentFrameRef.current = frame
      updateSkeleton(frame)
      if (onFrameChange) {
        onFrameChange(frame)
      }
    } else {
      isSeekingRef.current = false
    }
  }, [seekFrame, data, onFrameChange])

  // Update skeleton positions per frame - separated for direct calls
  const updateSkeleton = (frameIndex: number) => {
    if (!data || !cameraRef.current) return
    if (jointsRef.current.length === 0 || bonesRef.current.length === 0) return

    const frame = data.frames[frameIndex]
    if (!frame) return

    // Update joint positions
    const jointPositions = jointPositionsRef.current
    const cal = calibrationRef.current
    const selectedIdx = selectedJointRef.current ? data.sensorNames.indexOf(selectedJointRef.current) : -1
    
    for (let i = 0; i < data.numSensors; i++) {
      const p = frame[i]
      const pos = jointPositions[i]
      pos.set(p[0] * SCALE_FACTOR, p[1] * SCALE_FACTOR, p[2] * SCALE_FACTOR)

      // Apply per-joint calibration position offsets if provided
      if (cal && data.sensorNames[i]) {
        const jointName = data.sensorNames[i]
        const cfg = cal[jointName]
        if (cfg && cfg.positionOffset) {
          pos.x += (cfg.positionOffset[0] ?? 0) * SCALE_FACTOR
          pos.y += (cfg.positionOffset[1] ?? 0) * SCALE_FACTOR
          pos.z += (cfg.positionOffset[2] ?? 0) * SCALE_FACTOR
        }
      }
      
      // Skip updating the joint mesh if it's being dragged (transform controls manage it)
      if (i !== selectedIdx || !isDraggingRef.current) {
        jointsRef.current[i].position.copy(pos)
      }
    }

    // Update bone lines
    for (let i = 0; i < edgeIndexPairs.length; i++) {
      const [a, b] = edgeIndexPairs[i]
      const pa = jointPositions[a]
      const pb = jointPositions[b]

      const line = bonesRef.current[i]
      const positions = line.geometry.attributes.position.array as Float32Array
      positions[0] = pa.x
      positions[1] = pa.y
      positions[2] = pa.z
      positions[3] = pb.x
      positions[4] = pb.y
      positions[5] = pb.z
      line.geometry.attributes.position.needsUpdate = true
    }

    // Auto-center camera on first frame only per dataset
    const hasAutoCenteredKey = '__hasAutoCentered'
    const scene: any = sceneRef.current as any
    if (frameIndex === 0 && controlsRef.current && !scene[hasAutoCenteredKey]) {
      const box = new THREE.Box3().setFromPoints(jointPositions)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      
      const fov = cameraRef.current.fov * (Math.PI / 180)
      const distance = (maxDim * SCALE_FACTOR) / (2 * Math.tan(fov / 2)) * 1.8

      cameraRef.current.position.set(
        center.x + distance * 0.8,
        center.y + distance * 0.6,
        center.z + distance * 0.8
      )
      controlsRef.current.target.copy(center)
      controlsRef.current.update()
      scene[hasAutoCenteredKey] = true
    }

    // Update raw data visualizations
    if (data.rawSensorData) {
      const nameToIndex = new Map(data.sensorNames.map((n, i) => [n, i]))
      for (const jointName in data.rawSensorData) {
        const index = nameToIndex.get(jointName)
        if (index === undefined) continue

        const viz = rawDataVizRef.current[jointName]
        const jointPos = jointPositions[index]
        const jointRawData = data.rawSensorData[jointName]

        if (viz.orientation && jointRawData.orientation) {
          const quatData = jointRawData.orientation[frameIndex]
          if (quatData) {
            viz.orientation.position.copy(jointPos)
            viz.orientation.quaternion.set(quatData[0], quatData[1], quatData[2], quatData[3])
          }
        }
        if (viz.gyroscope && jointRawData.gyroscope) {
          const gyroData = jointRawData.gyroscope[frameIndex]
          if (gyroData) {
            const dir = tempVecRef.current.a.set(gyroData[0], gyroData[1], gyroData[2])
            const len = Math.max(dir.length() * 0.1, 0.05)
            dir.normalize()
            viz.gyroscope.position.copy(jointPos)
            viz.gyroscope.setDirection(dir)
            viz.gyroscope.setLength(len)
          }
        }
        if (viz.accelerometer && jointRawData.accelerometer) {
          const accelData = jointRawData.accelerometer[frameIndex]
          if (accelData) {
            const dir = tempVecRef.current.b.set(accelData[0], accelData[1], accelData[2])
            const len = Math.max(dir.length() * 0.01, 0.03)
            dir.normalize()
            viz.accelerometer.position.copy(jointPos)
            viz.accelerometer.setDirection(dir)
            viz.accelerometer.setLength(len)
          }
        }
        if (viz.magnetometer && jointRawData.magnetometer) {
          const magnetData = jointRawData.magnetometer[frameIndex]
          if (magnetData) {
            const dir = tempVecRef.current.c.set(magnetData[0], magnetData[1], magnetData[2])
            const len = Math.max(dir.length() * 0.001, 0.02)
            dir.normalize()
            viz.magnetometer.position.copy(jointPos)
            viz.magnetometer.setDirection(dir)
            viz.magnetometer.setLength(len)
          }
        }
      }
    }
  }

  // Initialize Three.js scene once with error handling
  useEffect(() => {
    if (!mountRef.current) return

    const mount = mountRef.current
    const width = mount.clientWidth
    const height = mount.clientHeight

    // Error handling wrapper
    const safeExecute = (fn: () => void, errorMsg: string) => {
      try {
        fn()
      } catch (error) {
        console.error(`${errorMsg}:`, error)
        // Show user-friendly error message
        if (mount) {
          mount.innerHTML = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100%;
              background: #1e293b;
              color: #ef4444;
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              padding: 20px;
            ">
              <div>
                <h3 style="margin: 0 0 10px 0; font-size: 18px;">3D Viewer Error</h3>
                <p style="margin: 0; font-size: 14px; opacity: 0.8;">
                  ${errorMsg}. Please refresh the page or try a different browser.
                </p>
                ${isMac ? '<p style="margin: 10px 0 0 0; font-size: 12px; opacity: 0.6;">Mac users: Try using Chrome or Firefox if Safari has issues.</p>' : ''}
              </div>
            </div>
          `
        }
        return false
      }
      return true
    }

    // Initialize Three.js with error handling
    let scene: THREE.Scene | undefined
    let camera: THREE.PerspectiveCamera | undefined
    let renderer: THREE.WebGLRenderer | undefined

    if (!safeExecute(() => {
      // Scene
      scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0d1117)
      sceneRef.current = scene

      // Camera
      camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 100)
      camera.position.set(3, 2, 3)
      cameraRef.current = camera
    }, 'Failed to initialize Three.js scene and camera')) {
      return
    }

    if (!safeExecute(() => {
      // Renderer with Mac-specific optimizations
      const rendererOptions: THREE.WebGLRendererParameters = {
        antialias: true,
        alpha: false,
        powerPreference: isMac ? "high-performance" : "default",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: isSafari, // Safari needs this for proper rendering
        stencil: false,
        depth: true
      }
      
      renderer = new THREE.WebGLRenderer(rendererOptions)
      renderer.setSize(width, height)
      
      // Mac-specific pixel ratio handling
      const pixelRatio = isMac ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio
      renderer.setPixelRatio(pixelRatio)
      
      // Mac Safari specific settings
      if (isSafari) {
        renderer.shadowMap.enabled = false // Disable shadows for better performance
        renderer.outputColorSpace = THREE.SRGBColorSpace
      }
      
      // Add context loss handlers
      renderer.domElement.addEventListener('webglcontextlost', handleWebGLContextLoss, false)
      renderer.domElement.addEventListener('webglcontextrestored', handleWebGLContextRestore, false)
      
      mount.appendChild(renderer.domElement)
      rendererRef.current = renderer
    }, 'Failed to initialize WebGL renderer')) {
      return
    }

    // Ensure all required objects are initialized
    if (!scene || !camera || !renderer) {
      console.error('Failed to initialize Three.js objects')
      return
    }

    // Controls with Mac-specific optimizations
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = isMac ? 0.08 : 0.05 // Slightly higher damping for Mac trackpad
    controls.target.set(0, 1, 0)
    
    // Mac trackpad specific settings
    if (isMac) {
      controls.enablePan = true
      controls.enableZoom = true
      controls.enableRotate = true
      
      // Mac-specific mouse button mapping
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }
      
      // Mac trackpad touch mapping
      controls.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
      }
      
      // Mac-specific zoom settings
      controls.zoomSpeed = 1.2  // Increased for better Mac trackpad response
      controls.panSpeed = 1.0
      controls.rotateSpeed = 1.0
      
      // Enable zoom with wheel
      controls.enableZoom = true
      controls.zoomToCursor = true  // Zoom towards cursor position
      
      // Mac trackpad wheel settings
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      
      // Ensure zoom limits are reasonable
      controls.minDistance = 0.1
      controls.maxDistance = 100
      
      // Mac-specific wheel event handling
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
      }
    }
    
    controls.update()
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(5, 10, 5)
    scene.add(directionalLight)

    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3)
    fillLight.position.set(-5, 5, -5)
    scene.add(fillLight)

    // Ground grid - larger to match skeleton scale
    const gridHelper = new THREE.GridHelper(20, 40, 0x444444, 0x222222)
    scene.add(gridHelper)

    // Axes helper - larger
    const axesHelper = new THREE.AxesHelper(2)
    axesHelper.position.set(-8, 0.01, -8)
    scene.add(axesHelper)

    // Animation loop for rendering, not for frame ticking
    const animate = () => {
      requestAnimationFrame(animate)
      if (controlsRef.current) controlsRef.current.update()
      // When dragging, sync bones to current joint positions (transform controls moves the mesh)
      if (isDraggingRef.current && jointsRef.current.length && bonesRef.current.length) {
        const jointPositions = jointPositionsRef.current
        // Copy mesh positions to jointPositions array for bone updates
        for (let i = 0; i < jointsRef.current.length; i++) {
          jointPositions[i].copy(jointsRef.current[i].position)
        }
        // Update bone lines
        for (let i = 0; i < bonesRef.current.length; i++) {
          const [a, b] = edgeIndexPairs[i]
          const pa = jointPositions[a]
          const pb = jointPositions[b]
          const line = bonesRef.current[i]
          const positions = line.geometry.attributes.position.array as Float32Array
          positions[0] = pa.x
          positions[1] = pa.y
          positions[2] = pa.z
          positions[3] = pb.x
          positions[4] = pb.y
          positions[5] = pb.z
          line.geometry.attributes.position.needsUpdate = true
        }
      }
      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }
    animate()
    // Transform controls for interactive calibration
    if (!camera || !renderer || !scene) return
    
    const tControls = new TransformControls(camera, renderer.domElement)
    tControls.setMode('translate')
    tControls.setSize(0.9)
    tControls.visible = false
    scene.add(tControls)
    tControlsRef.current = tControls

    tControls.addEventListener('dragging-changed', (event: any) => {
      isDraggingRef.current = !!event.value
      if (controlsRef.current) controlsRef.current.enabled = !event.value
    })

    const handleTransformChange = () => {
      if (!data || !onCalibrationChange) return
      const selectedJnt = selectedJointRef.current
      if (!selectedJnt) return
      const jointIdx = data.sensorNames.indexOf(selectedJnt)
      if (jointIdx < 0) return
      const obj = jointsRef.current[jointIdx]
      if (!obj) return
      const base = getBasePositionForJoint(jointIdx, currentFrameRef.current)
      const dx = (obj.position.x - base.x) / SCALE_FACTOR
      const dy = (obj.position.y - base.y) / SCALE_FACTOR
      const dz = (obj.position.z - base.z) / SCALE_FACTOR
      onCalibrationChange(selectedJnt, [dx, dy, dz])
    }
    tControls.addEventListener('objectChange', handleTransformChange)
    tControls.addEventListener('change', handleTransformChange)

    // Raycaster for selecting joint by click/touch
    raycasterRef.current = new THREE.Raycaster()
    
    const updatePointer = (e: MouseEvent | TouchEvent | PointerEvent) => {
      if (!renderer) return
      
      const rect = renderer.domElement.getBoundingClientRect()
      let clientX, clientY
      
      // Handle different event types with Mac compatibility
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else if ('changedTouches' in e && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX
        clientY = e.changedTouches[0].clientY
      } else if ('pointerType' in e) {
        // Pointer events (better for Mac trackpad)
        clientX = (e as PointerEvent).clientX
        clientY = (e as PointerEvent).clientY
      } else {
        clientX = (e as MouseEvent).clientX
        clientY = (e as MouseEvent).clientY
      }
      
      // Ensure coordinates are within bounds
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
      
      pointerRef.current.x = (x / rect.width) * 2 - 1
      pointerRef.current.y = -(y / rect.height) * 2 + 1
    }
    
    const onPointerMove = (e: MouseEvent | TouchEvent | PointerEvent) => {
      updatePointer(e)
    }
    
    const onPointerDown = (e: MouseEvent | TouchEvent | PointerEvent) => {
      // Only prevent default for touch events to avoid interfering with Mac trackpad
      if ('touches' in e || 'changedTouches' in e) {
        e.preventDefault()
      }
      updatePointer(e)
      
      if (!data || !camera) return
      const raycaster = raycasterRef.current!
      raycaster.setFromCamera(pointerRef.current as any, camera)
      const intersects = raycaster.intersectObjects(jointsRef.current, false)
      if (intersects.length > 0) {
        const obj = intersects[0].object
        const idx = jointsRef.current.indexOf(obj as any)
        if (idx >= 0) {
          const jointName = data.sensorNames[idx]
          if (onSelectJoint) onSelectJoint(jointName)
        }
      } else {
        if (onSelectJoint) onSelectJoint(null)
      }
    }
    
    // Add comprehensive event listeners for Mac compatibility
    if (renderer) {
      const eventOptions = { passive: false, capture: false }
      
      // Pointer events (preferred for Mac trackpad)
      renderer.domElement.addEventListener('pointermove', onPointerMove, eventOptions)
      renderer.domElement.addEventListener('pointerdown', onPointerDown, eventOptions)
      
      // Mouse events (fallback)
      renderer.domElement.addEventListener('mousemove', onPointerMove, eventOptions)
      renderer.domElement.addEventListener('mousedown', onPointerDown, eventOptions)
      
      // Touch events (mobile and Mac trackpad)
      renderer.domElement.addEventListener('touchmove', onPointerMove, eventOptions)
      renderer.domElement.addEventListener('touchstart', onPointerDown, eventOptions)
      
      // Mac-specific wheel event handling for zoom
      if (isMac && camera) {
        const handleWheel = (event: WheelEvent) => {
          event.preventDefault()
          event.stopPropagation()
          
          // Handle Mac trackpad zoom
          const deltaY = event.deltaY
          const deltaX = event.deltaX
          
          // Mac trackpad sends small deltaY values for zoom
          if (Math.abs(deltaY) > 0 && camera && controls) {
            const zoomFactor = deltaY > 0 ? 0.9 : 1.1
            const currentDistance = camera.position.distanceTo(controls.target)
            const newDistance = currentDistance * zoomFactor
            
            // Clamp to zoom limits
            const clampedDistance = Math.max(0.1, Math.min(100, newDistance))
            
            // Apply zoom
            const direction = camera.position.clone().sub(controls.target).normalize()
            camera.position.copy(controls.target).add(direction.multiplyScalar(clampedDistance))
            camera.lookAt(controls.target)
            controls.update()
          }
        }
        
        renderer.domElement.addEventListener('wheel', handleWheel, { passive: false })
        
        // Store the handler for cleanup
        ;(renderer.domElement as any)._macWheelHandler = handleWheel
      }
    }

    // Handle resize
    const handleResize = () => {
      if (!camera || !renderer) return
      const w = mount.clientWidth
      const h = mount.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      if (tControlsRef.current && scene) {
        scene.remove(tControlsRef.current)
        tControlsRef.current.dispose()
        tControlsRef.current = null
      }
      
      // Remove all event listeners
      if (renderer) {
        renderer.domElement.removeEventListener('pointermove', onPointerMove)
        renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer.domElement.removeEventListener('mousemove', onPointerMove)
        renderer.domElement.removeEventListener('mousedown', onPointerDown)
        renderer.domElement.removeEventListener('touchmove', onPointerMove)
        renderer.domElement.removeEventListener('touchstart', onPointerDown)
        renderer.domElement.removeEventListener('webglcontextlost', handleWebGLContextLoss)
        renderer.domElement.removeEventListener('webglcontextrestored', handleWebGLContextRestore)
        
        // Remove Mac-specific wheel handler
        if ((renderer.domElement as any)._macWheelHandler) {
          renderer.domElement.removeEventListener('wheel', (renderer.domElement as any)._macWheelHandler)
          delete (renderer.domElement as any)._macWheelHandler
        }
        
        if (mount.contains(renderer.domElement)) {
          mount.removeChild(renderer.domElement)
        }
        renderer.dispose()
      }
      
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Create skeleton geometry when data changes
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !data) return

    // Clear existing skeleton
    jointsRef.current.forEach(j => scene.remove(j))
    bonesRef.current.forEach(b => scene.remove(b))
    Object.values(rawDataVizRef.current).forEach(viz => {
      if (viz.orientation) scene.remove(viz.orientation)
      if (viz.gyroscope) scene.remove(viz.gyroscope)
      if (viz.accelerometer) scene.remove(viz.accelerometer)
      if (viz.magnetometer) scene.remove(viz.magnetometer)
    })
    jointsRef.current = []
    bonesRef.current = []
    rawDataVizRef.current = {}
    currentFrameRef.current = 0 // Reset frame on new data

    // Create joints
    const jointGeometry = new THREE.SphereGeometry(JOINT_RADIUS, 16, 12)
    const jointMaterial = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      roughness: 0.4,
      metalness: 0.6,
    })

    jointPositionsRef.current = new Array(data.numSensors)
    for (let i = 0; i < data.numSensors; i++) {
      const joint = new THREE.Mesh(jointGeometry, jointMaterial)
      scene.add(joint)
      jointsRef.current.push(joint)
      jointPositionsRef.current[i] = new THREE.Vector3()
    }

    // Create bones (lines)
    const boneMaterial = new THREE.LineBasicMaterial({ 
      color: 0x10b981,
      linewidth: 3
    })

    for (let i = 0; i < edgeIndexPairs.length; i++) {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(6) // 2 points * 3 coordinates
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const line = new THREE.Line(geometry, boneMaterial)
      scene.add(line)
      bonesRef.current.push(line)
    }

    // Create raw data visualizers
    if (data.rawSensorData) {
      for (const jointName in data.rawSensorData) {
        rawDataVizRef.current[jointName] = {}
        const jointData = data.rawSensorData[jointName]

        if (jointData.orientation) {
          const axes = new THREE.AxesHelper(0.15)
          scene.add(axes)
          rawDataVizRef.current[jointName].orientation = axes
        }
        if (jointData.gyroscope) {
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            0.3,
            0xffd700
          )
          scene.add(arrow)
          rawDataVizRef.current[jointName].gyroscope = arrow
        }
        if (jointData.accelerometer) {
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            0.25,
            0xff1493
          )
          scene.add(arrow)
          rawDataVizRef.current[jointName].accelerometer = arrow
        }
        if (jointData.magnetometer) {
          const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            0.2,
            0x00ced1
          )
          scene.add(arrow)
          rawDataVizRef.current[jointName].magnetometer = arrow
        }
      }
    }
    
    // Reset auto-center flag for new dataset and set initial skeleton pose
    ;(scene as any)['__hasAutoCentered'] = false
    // Initial skeleton pose
    updateSkeleton(0)
    
  }, [data, edgeIndexPairs])

  // Attach/detach transform controls to selected joint
  useEffect(() => {
    if (!data) return
    const tControls = tControlsRef.current
    if (!tControls) return
    if (!selectedJoint) {
      tControls.detach()
      tControls.visible = false
      return
    }
    const idx = data.sensorNames.indexOf(selectedJoint)
    if (idx < 0) {
      tControls.detach()
      tControls.visible = false
      return
    }
    const obj = jointsRef.current[idx]
    if (!obj) return
    tControls.attach(obj)
    tControls.visible = true
  }, [data, selectedJoint])

  // Re-apply skeleton pose immediately when calibration changes (even if paused)
  useEffect(() => {
    if (!data || isDraggingRef.current) return
    updateSkeleton(currentFrameRef.current)
  }, [calibration, data])

  // Update raw data visibility
  useEffect(() => {
    Object.values(rawDataVizRef.current).forEach(viz => {
      if (viz.orientation) viz.orientation.visible = showOrientation
      if (viz.gyroscope) viz.gyroscope.visible = showGyroscope
      if (viz.accelerometer) viz.accelerometer.visible = showAccelerometer
      if (viz.magnetometer) viz.magnetometer.visible = showMagnetometer
    })
  }, [showOrientation, showGyroscope, showAccelerometer, showMagnetometer])

  return (
    <div className="w-full h-full relative">
      {/* Skeleton structure validation warning */}
      {!skeletonValidation.isValid && (
        <div className="absolute top-2 left-2 right-2 z-30 bg-yellow-950 border border-yellow-800 text-yellow-100 p-3 rounded-md">
          <div className="flex items-start gap-2">
            <div className="text-yellow-400 text-sm font-medium">⚠️ Skeleton Structure Warning</div>
          </div>
          <div className="text-xs text-yellow-200 mt-1">
            {skeletonValidation.missingSensors.length > 0 && (
              <div>Missing sensors: {skeletonValidation.missingSensors.join(', ')}</div>
            )}
            {skeletonValidation.missingEdges.length > 0 && (
              <div>Missing connections: {skeletonValidation.missingEdges.map(([a, b]) => `${a}-${b}`).join(', ')}</div>
            )}
            <div className="mt-1">Using standard 15-sensor skeleton structure.</div>
          </div>
        </div>
      )}
      
      <div
        ref={mountRef}
        className="w-full h-full"
        style={{
          background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        }}
      />
    </div>
  )
}
