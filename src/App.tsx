import { useState, useRef, useCallback, useEffect } from 'react'
import FlowCanvas from './components/FlowCanvas'
import { Stage, Flow } from './types'
import { Undo2 } from 'lucide-react'
import './App.css'

interface HistoryState {
  stages: Stage[]
  flows: Flow[]
}

function App() {
  console.log('App component rendering')
  const [stages, setStages] = useState<Stage[]>([
    { id: '1', name: 'Start', position: 0 },
  ])

  const [flows, setFlows] = useState<Flow[]>([])

  const historyRef = useRef<HistoryState[]>([])
  const historyIndexRef = useRef<number>(-1)
  const [canUndo, setCanUndo] = useState(false)

  // Save state to history
  const saveToHistory = useCallback((currentStages: Stage[], currentFlows: Flow[]) => {
    const newState: HistoryState = {
      stages: JSON.parse(JSON.stringify(currentStages)),
      flows: JSON.parse(JSON.stringify(currentFlows)),
    }
    
    // Remove any future history if we're not at the end
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    }
    
    // Add new state to history
    historyRef.current.push(newState)
    historyIndexRef.current = historyRef.current.length - 1
    
    // Limit history to last 50 states
    if (historyRef.current.length > 50) {
      historyRef.current.shift()
      historyIndexRef.current = historyRef.current.length - 1
    }
    
    setCanUndo(historyIndexRef.current > 0)
  }, [])

  // Undo functionality
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const previousState = historyRef.current[historyIndexRef.current]
      setStages(JSON.parse(JSON.stringify(previousState.stages)))
      setFlows(JSON.parse(JSON.stringify(previousState.flows)))
      setCanUndo(historyIndexRef.current > 0)
    }
  }, [])

  // Wrapped setters that save to history
  const handleStagesChange = useCallback((newStages: Stage[]) => {
    // Save current state before changing
    saveToHistory(stages, flows)
    setStages(newStages)
  }, [stages, flows, saveToHistory])

  const handleFlowsChange = useCallback((newFlows: Flow[]) => {
    // Save current state before changing
    saveToHistory(stages, flows)
    setFlows(newFlows)
  }, [stages, flows, saveToHistory])

  // Setter for drag operations that don't save to history
  const handleStagesChangeNoHistory = useCallback((newStages: Stage[]) => {
    setStages(newStages)
  }, [])

  // Initialize history with initial state
  useEffect(() => {
    if (historyRef.current.length === 0) {
      const initialState: HistoryState = {
        stages: JSON.parse(JSON.stringify(stages)),
        flows: JSON.parse(JSON.stringify(flows)),
      }
      historyRef.current.push(initialState)
      historyIndexRef.current = 0
      setCanUndo(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut for undo (Ctrl+Z / Cmd+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (historyIndexRef.current > 0) {
          handleUndo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>2D Flow Visualization</h1>
          <button
            className="undo-button"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={18} />
            <span>Undo</span>
          </button>
        </div>
      </header>
      <div className="app-content">
        <FlowCanvas
          stages={stages}
          flows={flows}
          onStagesChange={handleStagesChange}
          onFlowsChange={handleFlowsChange}
          onStagesChangeNoHistory={handleStagesChangeNoHistory}
        />
      </div>
    </div>
  )
}

export default App

