// Simple localStorage-based persistence as fallback when SQL.js fails
import { Stage, Flow } from '../types'

const STORAGE_KEY_STAGES = 'flow_app_stages'
const STORAGE_KEY_FLOWS = 'flow_app_flows'

export async function saveStagesLocalStorage(stages: Stage[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_STAGES, JSON.stringify(stages))
    console.log('Stages saved to localStorage')
  } catch (error) {
    console.error('Failed to save stages to localStorage:', error)
    throw error
  }
}

export async function saveFlowsLocalStorage(flows: Flow[]): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY_FLOWS, JSON.stringify(flows))
    console.log('Flows saved to localStorage')
  } catch (error) {
    console.error('Failed to save flows to localStorage:', error)
    throw error
  }
}

export async function saveAllLocalStorage(stages: Stage[], flows: Flow[]): Promise<void> {
  await saveStagesLocalStorage(stages)
  await saveFlowsLocalStorage(flows)
}

export async function loadStagesLocalStorage(): Promise<Stage[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY_STAGES)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load stages from localStorage:', error)
    return []
  }
}

export async function loadFlowsLocalStorage(): Promise<Flow[]> {
  try {
    const data = localStorage.getItem(STORAGE_KEY_FLOWS)
    if (!data) return []
    return JSON.parse(data)
  } catch (error) {
    console.error('Failed to load flows from localStorage:', error)
    return []
  }
}

export async function loadAllLocalStorage(): Promise<{ stages: Stage[]; flows: Flow[] }> {
  const stages = await loadStagesLocalStorage()
  const flows = await loadFlowsLocalStorage()
  return { stages, flows }
}

