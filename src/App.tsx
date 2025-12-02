import { useState, useRef, useCallback, useEffect } from 'react'
import FlowCanvas from './components/FlowCanvas'
import { Stage, Flow } from './types'
import { Undo2, Save } from 'lucide-react'
import './App.css'

// Dynamic import to avoid blocking app startup if database fails
let databaseService: any = null
let useLocalStorage = false

async function getDatabaseService() {
  if (!databaseService) {
    try {
      const dbModule = await import('./services/database')
      // Test if database can initialize
      try {
        await dbModule.initDatabase()
        databaseService = dbModule
        console.log('SQL.js database service loaded and initialized successfully')
      } catch (initError) {
        console.warn('SQL.js database initialization failed, falling back to localStorage:', initError)
        // Fallback to localStorage
        useLocalStorage = true
        const localStorageDB = await import('./services/localStorageDB')
        databaseService = {
          initDatabase: async () => { 
            console.log('Using localStorage for persistence')
          },
          loadAll: async () => {
            return await localStorageDB.loadAllLocalStorage()
          },
          saveAll: async (stages: any[], flows: any[]) => {
            await localStorageDB.saveAllLocalStorage(stages, flows)
          },
        }
      }
    } catch (error) {
      console.warn('Database module not available, falling back to localStorage:', error)
      // Fallback to localStorage
      useLocalStorage = true
      const localStorageDB = await import('./services/localStorageDB')
      databaseService = {
        initDatabase: async () => { 
          console.log('Using localStorage for persistence')
        },
        loadAll: async () => {
          return await localStorageDB.loadAllLocalStorage()
        },
        saveAll: async (stages: any[], flows: any[]) => {
          await localStorageDB.saveAllLocalStorage(stages, flows)
        },
      }
    }
  }
  return databaseService
}

interface HistoryState {
  stages: Stage[]
  flows: Flow[]
}

function App() {
  console.log('App component rendering')
  const [stages, setStages] = useState<Stage[]>([
    { id: '1', name: 'Start', position: 0, color: '#667eea' },
  ])

  const [flows, setFlows] = useState<Flow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

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

  // Manual save to database
  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true)
      const db = await getDatabaseService()
      
      // Ensure database is initialized before saving
      if (db.initDatabase) {
        try {
          await db.initDatabase()
        } catch (initError) {
          console.warn('Database initialization failed, but continuing with save:', initError)
        }
      }
      
      console.log('Saving data:', { stages: stages.length, flows: flows.length })
      
      if (!db.saveAll) {
        throw new Error('saveAll function not available in database service')
      }
      
      await db.saveAll(stages, flows)
      console.log('Data saved successfully')
      
      // Show success feedback (you could add a toast notification here)
      alert('Data saved successfully!')
    } catch (error: any) {
      console.error('Failed to save data to database:', error)
      const errorMessage = error?.message || 'Unknown error occurred'
      alert(`Failed to save data: ${errorMessage}\n\nCheck the console for more details.`)
    } finally {
      setIsSaving(false)
    }
  }, [stages, flows])

  // Undo functionality
  const handleUndo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--
      const previousState = historyRef.current[historyIndexRef.current]
      const newStages = JSON.parse(JSON.stringify(previousState.stages))
      const newFlows = JSON.parse(JSON.stringify(previousState.flows))
      setStages(newStages)
      setFlows(newFlows)
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

  // Initialize database and load data on mount
  useEffect(() => {
    let mounted = true
    
    const loadData = async () => {
      try {
        setIsLoading(true)
        
        // Try to initialize database, but don't block if it fails
        try {
          const db = await getDatabaseService()
          
          // Check if we got the mock service
          if (!db.initDatabase || db.initDatabase.toString().includes('Mock database service')) {
            console.warn('Database service not available, using default state')
            throw new Error('Database service not available')
          }
          
          console.log('Initializing database...')
          await db.initDatabase()
          console.log('Loading data from database...')
          const data = await db.loadAll()
          console.log('Loaded data from database:', { stages: data.stages.length, flows: data.flows.length })
          
          if (mounted) {
            // Only load if we have data, otherwise use default
            if (data.stages.length > 0 || data.flows.length > 0) {
              setStages(data.stages)
              setFlows(data.flows)
            }
            
            // Initialize history with loaded or default state
            const initialState: HistoryState = {
              stages: JSON.parse(JSON.stringify(data.stages.length > 0 ? data.stages : stages)),
              flows: JSON.parse(JSON.stringify(data.flows)),
            }
            historyRef.current.push(initialState)
            historyIndexRef.current = 0
            setCanUndo(false)
            setIsLoading(false)
          }
        } catch (dbError) {
          console.warn('Database initialization failed, using default state:', dbError)
          // Continue with default state even if database fails
          if (mounted) {
            const initialState: HistoryState = {
              stages: JSON.parse(JSON.stringify(stages)),
              flows: JSON.parse(JSON.stringify(flows)),
            }
            historyRef.current.push(initialState)
            historyIndexRef.current = 0
            setCanUndo(false)
            setIsLoading(false)
          }
        }
      } catch (error) {
        console.error('Failed to load data:', error)
        if (mounted) {
          setIsLoading(false)
          // Initialize history with default state on error
          const initialState: HistoryState = {
            stages: JSON.parse(JSON.stringify(stages)),
            flows: JSON.parse(JSON.stringify(flows)),
          }
          historyRef.current.push(initialState)
          historyIndexRef.current = 0
          setCanUndo(false)
        }
      }
    }
    
    loadData()
    
    return () => {
      mounted = false
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

  // Keyboard shortcut for save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (isLoading) {
    return (
      <div className="app">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p>Loading data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>2D Flow Visualization</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              className="save-button"
              onClick={handleSave}
              disabled={isSaving}
              title="Save (Ctrl+S)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                opacity: isSaving ? 0.6 : 1,
              }}
            >
              <Save size={18} />
              <span>{isSaving ? 'Saving...' : 'Save'}</span>
            </button>
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

