declare global {
  interface Window {
    SENSOR_NAMES: readonly string[]
    EDGES: readonly [string, string][]
    exampleTPose: (height_m?: number) => Record<string, [number, number, number]>
    exampleStandingRest: (height_m?: number) => Record<string, [number, number, number]>
    validateSkeletonStructure: (data: {
      sensorNames: string[]
      edges: [string, string][]
    }) => {
      isValid: boolean
      missingSensors: string[]
      missingEdges: [string, string][]
    }
  }
}

export {}
