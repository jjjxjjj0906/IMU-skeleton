import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Simple in-memory JSON dataset cache with prefetch support
const datasetCache: Map<string, Promise<any>> = new Map()

export function getCachedJson(url: string, init?: RequestInit): Promise<any> {
  const key = url
  const existing = datasetCache.get(key)
  if (existing) return existing

  const controller = (init?.signal as AbortSignal | undefined) ?? undefined
  const promise = fetch(url, { 
    ...init, 
    cache: 'default', // Changed from 'force-cache' for better mobile compatibility
    signal: controller 
  })
    .then(res => {
      if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`)
      return res.json()
    })
    .catch(err => {
      datasetCache.delete(key)
      throw err
    })

  datasetCache.set(key, promise)
  return promise
}

export function prefetchJson(urls: string[]) {
  for (const u of urls) {
    if (!datasetCache.has(u)) getCachedJson(u).catch(() => {})
  }
}