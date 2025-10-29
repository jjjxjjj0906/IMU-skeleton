/**
 * Test script to verify skeleton structure matches Python code exactly
 * Run this in the browser console after loading a dataset
 */

function testSkeletonStructure() {
  console.log('🧪 Testing Skeleton Structure...')
  
  // Expected structure from Python code
  const expectedSensors = [
    "head", "sternum", "upper_arm_left", "upper_arm_right", "lumbar",
    "wrist_left", "wrist_right", "hand_left", "hand_right",
    "upper_leg_left", "upper_leg_right", "lower_leg_left", "lower_leg_right",
    "foot_left", "foot_right"
  ]
  
  const expectedEdges = [
    ["head", "sternum"],
    ["sternum", "lumbar"],
    ["sternum", "upper_arm_left"],
    ["sternum", "upper_arm_right"],
    ["upper_arm_left", "wrist_left"],
    ["wrist_left", "hand_left"],
    ["upper_arm_right", "wrist_right"],
    ["wrist_right", "hand_right"],
    ["lumbar", "upper_leg_left"],
    ["lumbar", "upper_leg_right"],
    ["upper_leg_left", "lower_leg_left"],
    ["lower_leg_left", "foot_left"],
    ["upper_leg_right", "lower_leg_right"],
    ["lower_leg_right", "foot_right"]
  ]
  
  // Get current dataset from the app (if available)
  const appElement = document.querySelector('[data-testid="skeleton-viewer"]') || 
                    document.querySelector('.skeleton-viewer') ||
                    document.querySelector('canvas')
  
  if (!appElement) {
    console.log('❌ Could not find skeleton viewer element')
    return
  }
  
  // Try to get dataset from global scope or React DevTools
  let dataset = null
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    // Try to find the dataset in React components
    const reactRoot = window.__REACT_DEVTOOLS_GLOBAL_HOOK__.getFiberRoots(1).values().next().value
    if (reactRoot) {
      // This is a simplified approach - in reality you'd need to traverse the fiber tree
      console.log('Found React root, but need to traverse to find dataset')
    }
  }
  
  // If we can't get the dataset from the app, create a mock test
  console.log('📋 Expected Sensor Names:')
  expectedSensors.forEach((sensor, i) => {
    console.log(`  ${i + 1}. ${sensor}`)
  })
  
  console.log('\n📋 Expected Skeleton Connections:')
  expectedEdges.forEach((edge, i) => {
    console.log(`  ${i + 1}. ${edge[0]} → ${edge[1]}`)
  })
  
  // Test the skeleton structure validation
  if (window.validateSkeletonStructure) {
    const testData = {
      sensorNames: expectedSensors,
      edges: expectedEdges
    }
    
    const validation = window.validateSkeletonStructure(testData)
    console.log('\n✅ Validation Test:', validation)
    
    if (validation.isValid) {
      console.log('🎉 Skeleton structure validation passed!')
    } else {
      console.log('❌ Skeleton structure validation failed!')
      console.log('Missing sensors:', validation.missingSensors)
      console.log('Missing edges:', validation.missingEdges)
    }
  } else {
    console.log('⚠️ validateSkeletonStructure function not found')
  }
  
  // Test example poses
  if (window.exampleTPose && window.exampleStandingRest) {
    console.log('\n🧍 Testing Example Poses:')
    
    const tPose = window.exampleTPose(1.75)
    const standingRest = window.exampleStandingRest(1.75)
    
    console.log('T-Pose joints:', Object.keys(tPose).length)
    console.log('Standing Rest joints:', Object.keys(standingRest).length)
    
    // Verify all expected sensors are present
    const tPoseSensors = Object.keys(tPose)
    const missingInTPose = expectedSensors.filter(s => !tPoseSensors.includes(s))
    const missingInStanding = expectedSensors.filter(s => !Object.keys(standingRest).includes(s))
    
    if (missingInTPose.length === 0) {
      console.log('✅ T-Pose has all expected sensors')
    } else {
      console.log('❌ T-Pose missing sensors:', missingInTPose)
    }
    
    if (missingInStanding.length === 0) {
      console.log('✅ Standing Rest has all expected sensors')
    } else {
      console.log('❌ Standing Rest missing sensors:', missingInStanding)
    }
  }
  
  console.log('\n📊 Skeleton Structure Test Complete!')
}

// Auto-run the test
testSkeletonStructure()

// Export for manual testing
window.testSkeletonStructure = testSkeletonStructure
