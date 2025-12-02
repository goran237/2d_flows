// Lazy load sql.js to avoid blocking app startup
let initSqlJs: any = null
let Database: any = null

async function loadSqlJs() {
  if (initSqlJs) return { initSqlJs }
  
  try {
    const sqlJsModule = await import('sql.js')
    // sql.js only exports initSqlJs as default
    // Database class is returned after calling initSqlJs()
    initSqlJs = sqlJsModule.default
    
    if (!initSqlJs || typeof initSqlJs !== 'function') {
      throw new Error('initSqlJs not found or not a function in sql.js module')
    }
    
    console.log('SQL.js module loaded successfully')
    return { initSqlJs }
  } catch (error) {
    console.error('Failed to load sql.js:', error)
    throw error
  }
}

// Database instance
let db: any = null
let dbInitialized = false

// Initialize the database
export async function initDatabase(): Promise<void> {
  if (dbInitialized && db) {
    return
  }

  // Reset initialization flag if we're retrying
  dbInitialized = false
  db = null

  try {
    // Load SQL.js module first
    const sqlJsModule = await loadSqlJs()
    const initSqlJsFn = sqlJsModule.initSqlJs
    
    if (typeof initSqlJsFn !== 'function') {
      throw new Error('initSqlJs is not a function. Got: ' + typeof initSqlJsFn)
    }
    
    // Load SQL.js with proper WASM file location
    // initSqlJs() returns an object with Database class and other utilities
    let SQL
    try {
      // Try with CDN first
      SQL = await initSqlJsFn({
        locateFile: (file: string) => {
          console.log('SQL.js requesting file:', file)
          // Use CDN for sql-wasm.wasm
          if (file.endsWith('.wasm')) {
            const cdnUrl = `https://sql.js.org/dist/${file}`
            console.log('Loading WASM from CDN:', cdnUrl)
            return cdnUrl
          }
          return file
        },
      })
      console.log('SQL.js loaded successfully from CDN')
    } catch (error) {
      console.warn('Failed to load SQL.js from CDN, trying alternative:', error)
      try {
        // Fallback: try with jsdelivr CDN
        SQL = await initSqlJsFn({
          locateFile: (file: string) => {
            if (file.endsWith('.wasm')) {
              const cdnUrl = `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
              console.log('Loading WASM from jsdelivr CDN:', cdnUrl)
              return cdnUrl
            }
            return file
          },
        })
        console.log('SQL.js loaded successfully from jsdelivr CDN')
      } catch (fallbackError) {
        console.warn('Failed to load SQL.js from jsdelivr, trying without locateFile:', fallbackError)
        try {
          // Last fallback: try without locateFile (will use default paths from node_modules)
          SQL = await initSqlJsFn()
          console.log('SQL.js loaded successfully without locateFile')
        } catch (finalError) {
          console.error('Failed to load SQL.js completely:', finalError)
          throw new Error(`SQL.js initialization failed: ${finalError}. Database features will be unavailable.`)
        }
      }
    }

    // SQL object contains the Database class
    const DatabaseClass = SQL.Database
    if (!DatabaseClass) {
      throw new Error('Database class not found in SQL.js result')
    }
    
    // Store Database class for later use
    Database = DatabaseClass

    // Try to load existing database from IndexedDB
    const savedDb = await loadDatabaseFromIndexedDB()
    
    if (savedDb) {
      db = new DatabaseClass(savedDb)
    } else {
      // Create new database
      db = new DatabaseClass()
      await createSchema()
      await saveDatabaseToIndexedDB()
    }

    dbInitialized = true
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}

// Create database schema
async function createSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  // Create stages table
  db.run(`
    CREATE TABLE IF NOT EXISTS stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position REAL NOT NULL,
      yPosition REAL,
      color TEXT
    )
  `)

  // Create flows table
  db.run(`
    CREATE TABLE IF NOT EXISTS flows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      fromStageId TEXT NOT NULL,
      toStageId TEXT NOT NULL,
      value REAL NOT NULL,
      branchIndex INTEGER,
      color TEXT,
      FOREIGN KEY (fromStageId) REFERENCES stages(id) ON DELETE CASCADE,
      FOREIGN KEY (toStageId) REFERENCES stages(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for better performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_flows_from ON flows(fromStageId)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_flows_to ON flows(toStageId)`)
}

// Save database to IndexedDB
async function saveDatabaseToIndexedDB(): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  try {
    const data = db.export()
    const buffer = new Uint8Array(data)
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('FlowDatabase', 1)
      
      request.onerror = () => reject(request.error)
      
      request.onupgradeneeded = (event) => {
        const dbStore = (event.target as IDBOpenDBRequest).result
        if (!dbStore.objectStoreNames.contains('database')) {
          dbStore.createObjectStore('database')
        }
      }
      
      request.onsuccess = () => {
        const dbStore = request.result
        const transaction = dbStore.transaction(['database'], 'readwrite')
        const store = transaction.objectStore('database')
        const putRequest = store.put(buffer, 'db')
        
        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      }
    })
  } catch (error) {
    console.error('Failed to save database to IndexedDB:', error)
    throw error
  }
}

// Load database from IndexedDB
async function loadDatabaseFromIndexedDB(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open('FlowDatabase', 1)
    
    request.onerror = () => {
      // IndexedDB not available or error - return null to create new DB
      resolve(null)
    }
    
    request.onupgradeneeded = (event) => {
      const dbStore = (event.target as IDBOpenDBRequest).result
      if (!dbStore.objectStoreNames.contains('database')) {
        dbStore.createObjectStore('database')
      }
      // New database, nothing to load
      resolve(null)
    }
    
    request.onsuccess = () => {
      const dbStore = request.result
      const transaction = dbStore.transaction(['database'], 'readonly')
      const store = transaction.objectStore('database')
      const getRequest = store.get('db')
      
      getRequest.onsuccess = () => {
        resolve(getRequest.result || null)
      }
      
      getRequest.onerror = () => {
        resolve(null)
      }
    }
  })
}

// Save all stages to database
export async function saveStages(stages: Array<{ id: string; name: string; position: number; yPosition?: number; color?: string }>): Promise<void> {
  // Always try to initialize if not already done
  if (!dbInitialized || !db) {
    try {
      await initDatabase()
    } catch (error) {
      console.error('Database initialization failed during save:', error)
      throw new Error(`Database initialization failed: ${error}`)
    }
  }
  
  if (!db) {
    console.error('Database not initialized after initDatabase call')
    throw new Error('Database not initialized')
  }

  // Use transaction for atomicity
  db.run('BEGIN TRANSACTION')
  
  try {
    // Clear existing stages
    db.run('DELETE FROM stages')
    
    // Insert all stages
    const stmt = db.prepare('INSERT INTO stages (id, name, position, yPosition, color) VALUES (?, ?, ?, ?, ?)')
    
    for (const stage of stages) {
      stmt.run([
        stage.id,
        stage.name,
        stage.position,
        stage.yPosition ?? null,
        stage.color ?? null,
      ])
    }
    
    stmt.free()
    db.run('COMMIT')
    
    // Save to IndexedDB
    try {
      await saveDatabaseToIndexedDB()
    } catch (saveError) {
      console.warn('Failed to persist database to IndexedDB:', saveError)
      // Don't throw - in-memory DB is still updated
    }
  } catch (error) {
    if (db) {
      try {
        db.run('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to rollback transaction:', rollbackError)
      }
    }
    console.error('Failed to save stages:', error)
    throw error // Re-throw to let caller know save failed
  }
}

// Save all flows to database
export async function saveFlows(flows: Array<{ id: string; name: string; fromStageId: string; toStageId: string; value: number; branchIndex?: number; color?: string }>): Promise<void> {
  // Always try to initialize if not already done
  if (!dbInitialized || !db) {
    try {
      await initDatabase()
    } catch (error) {
      console.error('Database initialization failed during save:', error)
      throw new Error(`Database initialization failed: ${error}`)
    }
  }
  
  if (!db) {
    console.error('Database not initialized after initDatabase call')
    throw new Error('Database not initialized')
  }

  // Use transaction for atomicity
  db.run('BEGIN TRANSACTION')
  
  try {
    // Clear existing flows
    db.run('DELETE FROM flows')
    
    // Insert all flows
    const stmt = db.prepare('INSERT INTO flows (id, name, fromStageId, toStageId, value, branchIndex, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    
    for (const flow of flows) {
      stmt.run([
        flow.id,
        flow.name,
        flow.fromStageId,
        flow.toStageId,
        flow.value,
        flow.branchIndex ?? null,
        flow.color ?? null,
      ])
    }
    
    stmt.free()
    db.run('COMMIT')
    
    // Save to IndexedDB
    try {
      await saveDatabaseToIndexedDB()
    } catch (saveError) {
      console.warn('Failed to persist database to IndexedDB:', saveError)
      // Don't throw - in-memory DB is still updated
    }
  } catch (error) {
    if (db) {
      try {
        db.run('ROLLBACK')
      } catch (rollbackError) {
        console.error('Failed to rollback transaction:', rollbackError)
      }
    }
    console.error('Failed to save flows:', error)
    throw error // Re-throw to let caller know save failed
  }
}

// Load all stages from database
export async function loadStages(): Promise<Array<{ id: string; name: string; position: number; yPosition?: number; color?: string }>> {
  if (!db) {
    try {
      await initDatabase()
    } catch (error) {
      console.warn('Database not available, returning empty array:', error)
      return []
    }
  }
  if (!db) {
    return []
  }

  try {
    const result = db.exec('SELECT * FROM stages ORDER BY position')
    
    if (result.length === 0) {
      return []
    }

    const rows = result[0].values
    return rows.map((row: any[]) => ({
      id: row[0] as string,
      name: row[1] as string,
      position: row[2] as number,
      yPosition: row[3] !== null ? (row[3] as number) : undefined,
      color: row[4] !== null ? (row[4] as string) : undefined,
    }))
  } catch (error) {
    console.error('Failed to load stages from database:', error)
    return []
  }
}

// Load all flows from database
export async function loadFlows(): Promise<Array<{ id: string; name: string; fromStageId: string; toStageId: string; value: number; branchIndex?: number; color?: string }>> {
  if (!db) {
    try {
      await initDatabase()
    } catch (error) {
      console.warn('Database not available, returning empty array:', error)
      return []
    }
  }
  if (!db) {
    return []
  }

  try {
    const result = db.exec('SELECT * FROM flows')
    
    if (result.length === 0) {
      return []
    }

    const rows = result[0].values
    return rows.map((row: any[]) => ({
      id: row[0] as string,
      name: row[1] as string,
      fromStageId: row[2] as string,
      toStageId: row[3] as string,
      value: row[4] as number,
      branchIndex: row[5] !== null ? (row[5] as number) : undefined,
      color: row[6] !== null ? (row[6] as string) : undefined,
    }))
  } catch (error) {
    console.error('Failed to load flows from database:', error)
    return []
  }
}

// Save both stages and flows in a single transaction
export async function saveAll(stages: Array<{ id: string; name: string; position: number; yPosition?: number; color?: string }>, flows: Array<{ id: string; name: string; fromStageId: string; toStageId: string; value: number; branchIndex?: number; color?: string }>): Promise<void> {
  await saveStages(stages)
  await saveFlows(flows)
}

// Load both stages and flows
export async function loadAll(): Promise<{ stages: Array<{ id: string; name: string; position: number; yPosition?: number; color?: string }>, flows: Array<{ id: string; name: string; fromStageId: string; toStageId: string; value: number; branchIndex?: number; color?: string }> }> {
  const stages = await loadStages()
  const flows = await loadFlows()
  return { stages, flows }
}

// Clear all data
export async function clearDatabase(): Promise<void> {
  if (!db) {
    await initDatabase()
  }
  if (!db) throw new Error('Database not initialized')

  db.run('BEGIN TRANSACTION')
  try {
    db.run('DELETE FROM flows')
    db.run('DELETE FROM stages')
    db.run('COMMIT')
    await saveDatabaseToIndexedDB()
  } catch (error) {
    db.run('ROLLBACK')
    console.error('Failed to clear database:', error)
    throw error
  }
}

