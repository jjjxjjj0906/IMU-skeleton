/**
 * Skeleton constants matching the Python code exactly
 * Based on plot_skeleton_15_sensors.py
 */

export const SENSOR_NAMES = [
  "head",
  "sternum", 
  "upper_arm_left",
  "upper_arm_right",
  "lumbar",
  "wrist_left",
  "wrist_right",
  "hand_left",
  "hand_right",
  "upper_leg_left",
  "upper_leg_right",
  "lower_leg_left",
  "lower_leg_right",
  "foot_left",
  "foot_right",
] as const

export const EDGES: [string, string][] = [
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
  ["lower_leg_right", "foot_right"],
]

/**
 * Example T-pose skeleton positions (matching Python code)
 * @param height_m Height in meters (default 1.75m)
 */
export function exampleTPose(height_m: number = 1.75): Record<string, [number, number, number]> {
  if (height_m <= 0) {
    throw new Error("height_m must be positive")
  }

  const h = height_m
  // Place feet at z=0 and define approximate anthropometric landmarks
  const pelvis_z = 0.0
  const head_z = 0.97 * h + pelvis_z
  const sternum_z = 0.86 * h + pelvis_z
  const lumbar_z = 0.60 * h + pelvis_z
  const thigh_mid_z = 0.50 * h + pelvis_z  // upper leg sensor sits mid-thigh
  const knee_z = 0.36 * h + pelvis_z
  const shank_mid_z = 0.20 * h + pelvis_z  // lower leg sensor closer to ankle
  const ankle_z = 0.06 * h + pelvis_z
  const foot_z = 0.0 + pelvis_z

  const shoulder_x = 0.20 * h
  const hand_x = 0.40 * h
  const wrist_x = 0.36 * h
  const upper_arm_x = 0.28 * h
  const hip_x = 0.12 * h
  const knee_x = 0.12 * h
  const ankle_x = 0.10 * h
  const foot_x = 0.10 * h

  return {
    "head": [0.0, 0.0, head_z],
    "sternum": [0.0, 0.0, sternum_z],
    "upper_arm_left": [-upper_arm_x, 0.0, sternum_z],
    "upper_arm_right": [upper_arm_x, 0.0, sternum_z],
    "lumbar": [0.0, 0.0, lumbar_z],
    "wrist_left": [-wrist_x, 0.0, sternum_z],
    "wrist_right": [wrist_x, 0.0, sternum_z],
    "hand_left": [-hand_x, 0.0, sternum_z],
    "hand_right": [hand_x, 0.0, sternum_z],
    "upper_leg_left": [-hip_x, 0.0, thigh_mid_z],
    "upper_leg_right": [hip_x, 0.0, thigh_mid_z],
    "lower_leg_left": [-knee_x, 0.0, shank_mid_z],
    "lower_leg_right": [knee_x, 0.0, shank_mid_z],
    "foot_left": [-foot_x, 0.0, foot_z],
    "foot_right": [foot_x, 0.0, foot_z],
  }
}

/**
 * Example standing rest skeleton positions (matching Python code)
 * @param height_m Height in meters (default 1.75m)
 */
export function exampleStandingRest(height_m: number = 1.75): Record<string, [number, number, number]> {
  if (height_m <= 0) {
    throw new Error("height_m must be positive")
  }

  const h = height_m
  const pelvis_z = 0.0

  const head_z = 0.97 * h + pelvis_z
  const sternum_z = 0.86 * h + pelvis_z
  const lumbar_z = 0.60 * h + pelvis_z

  const shoulder_z = 0.82 * h + pelvis_z
  const upper_arm_z = 0.75 * h + pelvis_z
  const wrist_z = 0.52 * h + pelvis_z
  const hand_z = 0.45 * h + pelvis_z

  const thigh_mid_z = 0.50 * h + pelvis_z
  const shank_mid_z = 0.20 * h + pelvis_z
  const foot_z = 0.0 + pelvis_z

  const shoulder_x = 0.20 * h
  const upper_arm_x = 0.14 * h
  const wrist_x = 0.15 * h
  const hand_x = 0.16 * h

  const hip_x = 0.12 * h
  const knee_x = 0.12 * h
  const foot_x = 0.10 * h

  return {
    "head": [0.0, 0.0, head_z],
    "sternum": [0.0, 0.0, sternum_z],
    // Arms hanging down along the sides
    "upper_arm_left": [-upper_arm_x, 0.0, upper_arm_z],
    "upper_arm_right": [upper_arm_x, 0.0, upper_arm_z],
    "lumbar": [0.0, 0.0, lumbar_z],
    "wrist_left": [-wrist_x, 0.0, wrist_z],
    "wrist_right": [wrist_x, 0.0, wrist_z],
    "hand_left": [-hand_x, 0.0, hand_z],
    "hand_right": [hand_x, 0.0, hand_z],
    // Legs with sensors at mid-thigh and mid-shank
    "upper_leg_left": [-hip_x, 0.0, thigh_mid_z],
    "upper_leg_right": [hip_x, 0.0, thigh_mid_z],
    "lower_leg_left": [-knee_x, 0.0, shank_mid_z],
    "lower_leg_right": [knee_x, 0.0, shank_mid_z],
    "foot_left": [-foot_x, 0.0, foot_z],
    "foot_right": [foot_x, 0.0, foot_z],
  }
}

/**
 * Validate that a dataset has the correct skeleton structure
 */
export function validateSkeletonStructure(data: {
  sensorNames: string[]
  edges: [string, string][]
}): { isValid: boolean; missingSensors: string[]; missingEdges: [string, string][] } {
  const missingSensors = SENSOR_NAMES.filter(name => !data.sensorNames.includes(name))
  const missingEdges = EDGES.filter(([a, b]) => 
    !data.edges.some(([ea, eb]) => (ea === a && eb === b) || (ea === b && eb === a))
  )
  
  return {
    isValid: missingSensors.length === 0 && missingEdges.length === 0,
    missingSensors,
    missingEdges
  }
}
