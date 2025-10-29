/**
 * Mac Compatibility Test Script
 * Run this in the browser console to test Mac-specific functionality
 */

class MacCompatibilityTester {
  constructor() {
    this.results = {
      webgl: false,
      pointerEvents: false,
      touchEvents: false,
      performance: false,
      threejs: false,
      macZoom: false,
      errors: []
    }
  }

  async runAllTests() {
    console.log('🧪 Starting Mac Compatibility Tests...')
    
    try {
      await this.testWebGLSupport()
      await this.testPointerEvents()
      await this.testTouchEvents()
      await this.testPerformance()
      await this.testThreeJS()
      await this.testMacZoom()
      
      this.printResults()
    } catch (error) {
      console.error('❌ Test suite failed:', error)
      this.results.errors.push(error.message)
    }
  }

  testWebGLSupport() {
    console.log('🔍 Testing WebGL support...')
    
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      
      if (gl) {
        this.results.webgl = true
        console.log('✅ WebGL is supported')
        
        // Test WebGL context loss handling
        canvas.addEventListener('webglcontextlost', (e) => {
          console.log('⚠️ WebGL context lost (this is normal for testing)')
          e.preventDefault()
        })
        
        canvas.addEventListener('webglcontextrestored', () => {
          console.log('✅ WebGL context restored')
        })
      } else {
        this.results.webgl = false
        console.log('❌ WebGL is not supported')
        this.results.errors.push('WebGL not supported')
      }
    } catch (error) {
      this.results.webgl = false
      console.log('❌ WebGL test failed:', error)
      this.results.errors.push(`WebGL test failed: ${error.message}`)
    }
  }

  testPointerEvents() {
    console.log('🔍 Testing Pointer Events support...')
    
    try {
      if ('onpointerdown' in window) {
        this.results.pointerEvents = true
        console.log('✅ Pointer Events are supported')
      } else {
        this.results.pointerEvents = false
        console.log('❌ Pointer Events are not supported')
        this.results.errors.push('Pointer Events not supported')
      }
    } catch (error) {
      this.results.pointerEvents = false
      console.log('❌ Pointer Events test failed:', error)
      this.results.errors.push(`Pointer Events test failed: ${error.message}`)
    }
  }

  testTouchEvents() {
    console.log('🔍 Testing Touch Events support...')
    
    try {
      if ('ontouchstart' in window) {
        this.results.touchEvents = true
        console.log('✅ Touch Events are supported')
      } else {
        this.results.touchEvents = false
        console.log('❌ Touch Events are not supported')
        this.results.errors.push('Touch Events not supported')
      }
    } catch (error) {
      this.results.touchEvents = false
      console.log('❌ Touch Events test failed:', error)
      this.results.errors.push(`Touch Events test failed: ${error.message}`)
    }
  }

  testPerformance() {
    console.log('🔍 Testing Performance...')
    
    try {
      const start = performance.now()
      
      // Test requestAnimationFrame
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          const end = performance.now()
          const frameTime = end - start
          
          if (frameTime < 20) { // Less than 20ms is good
            this.results.performance = true
            console.log(`✅ Performance is good (${frameTime.toFixed(2)}ms per frame)`)
          } else {
            this.results.performance = false
            console.log(`⚠️ Performance is slow (${frameTime.toFixed(2)}ms per frame)`)
            this.results.errors.push(`Slow performance: ${frameTime.toFixed(2)}ms per frame`)
          }
          
          resolve()
        })
      })
    } catch (error) {
      this.results.performance = false
      console.log('❌ Performance test failed:', error)
      this.results.errors.push(`Performance test failed: ${error.message}`)
    }
  }

  testThreeJS() {
    console.log('🔍 Testing Three.js compatibility...')
    
    try {
      // Check if Three.js is loaded
      if (typeof THREE === 'undefined') {
        this.results.threejs = false
        console.log('❌ Three.js is not loaded')
        this.results.errors.push('Three.js not loaded')
        return
      }

      // Test basic Three.js functionality
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
      const renderer = new THREE.WebGLRenderer({ antialias: true })
      
      // Test Mac-specific renderer options
      const macOptions = {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: true,
        stencil: false,
        depth: true
      }
      
      const macRenderer = new THREE.WebGLRenderer(macOptions)
      
      // Test OrbitControls for Mac zoom
      if (typeof THREE.OrbitControls !== 'undefined') {
        const controls = new THREE.OrbitControls(camera, renderer.domElement)
        controls.enableZoom = true
        controls.zoomSpeed = 1.2
        controls.zoomToCursor = true
        controls.minDistance = 0.1
        controls.maxDistance = 100
        
        console.log('✅ OrbitControls configured for Mac zoom')
        controls.dispose()
      }
      
      this.results.threejs = true
      console.log('✅ Three.js is working correctly')
      
      // Cleanup
      renderer.dispose()
      macRenderer.dispose()
      
    } catch (error) {
      this.results.threejs = false
      console.log('❌ Three.js test failed:', error)
      this.results.errors.push(`Three.js test failed: ${error.message}`)
    }
  }

  testMacZoom() {
    console.log('🔍 Testing Mac zoom functionality...')
    
    try {
      // Test wheel event support
      const supportsWheel = 'onwheel' in document.createElement('div')
      const supportsPointerEvents = 'onpointerdown' in window
      const supportsTouchEvents = 'ontouchstart' in window
      
      console.log(`Wheel events: ${supportsWheel ? '✅' : '❌'}`)
      console.log(`Pointer events: ${supportsPointerEvents ? '✅' : '❌'}`)
      console.log(`Touch events: ${supportsTouchEvents ? '✅' : '❌'}`)
      
      // Test Mac trackpad detection
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform) || 
                   /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
      
      if (isMac) {
        console.log('🍎 Mac detected - zoom should work with trackpad gestures')
        console.log('💡 Try: Pinch to zoom, scroll wheel, or two-finger scroll')
      }
      
      const zoomSupported = supportsWheel && (supportsPointerEvents || supportsTouchEvents)
      this.results.macZoom = zoomSupported
      
      if (zoomSupported) {
        console.log('✅ Mac zoom functionality is supported')
      } else {
        console.log('❌ Mac zoom functionality is not supported')
        this.results.errors.push('Mac zoom not supported')
      }
      
      return zoomSupported
      
    } catch (error) {
      console.log('❌ Mac zoom test failed:', error)
      this.results.errors.push(`Mac zoom test failed: ${error.message}`)
      this.results.macZoom = false
      return false
    }
  }

  printResults() {
    console.log('\n📊 Mac Compatibility Test Results:')
    console.log('================================')
    
    const tests = [
      { name: 'WebGL Support', result: this.results.webgl },
      { name: 'Pointer Events', result: this.results.pointerEvents },
      { name: 'Touch Events', result: this.results.touchEvents },
      { name: 'Performance', result: this.results.performance },
      { name: 'Three.js', result: this.results.threejs },
      { name: 'Mac Zoom', result: this.results.macZoom }
    ]
    
    tests.forEach(test => {
      const status = test.result ? '✅' : '❌'
      console.log(`${status} ${test.name}`)
    })
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Errors found:')
      this.results.errors.forEach(error => {
        console.log(`  - ${error}`)
      })
    }
    
    const allPassed = tests.every(test => test.result)
    if (allPassed) {
      console.log('\n🎉 All tests passed! Your Mac should work perfectly with this app.')
    } else {
      console.log('\n⚠️ Some tests failed. The app may have issues on your Mac.')
      console.log('💡 Try using Chrome or Firefox instead of Safari for better compatibility.')
    }
    
    return this.results
  }
}

// Auto-run tests when script is loaded
const tester = new MacCompatibilityTester()
tester.runAllTests()

// Export for manual testing
window.MacCompatibilityTester = MacCompatibilityTester
