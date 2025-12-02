import { useState } from 'react'
import { Stage, Flow } from '../types'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import './ControlPanel.css'

interface ControlPanelProps {
  stages: Stage[]
  flows: Flow[]
  onStagesChange: (stages: Stage[]) => void
  onFlowsChange: (flows: Flow[]) => void
}

export default function ControlPanel({
  stages,
  flows,
  onStagesChange,
  onFlowsChange,
}: ControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'stages' | 'flows'>('stages')
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)

  // Stage CRUD
  const createStage = () => {
    const newStage: Stage = {
      id: Date.now().toString(),
      name: `Stage ${stages.length + 1}`,
      position: stages.length > 0 ? Math.min(...stages.map(s => s.position)) + 20 : 50,
      color: '#667eea',
    }
    onStagesChange([...stages, newStage])
  }

  const updateStage = (id: string, updates: Partial<Stage>) => {
    onStagesChange(stages.map(s => s.id === id ? { ...s, ...updates } : s))
    setEditingStage(null)
  }

  const deleteStage = (id: string) => {
    onStagesChange(stages.filter(s => s.id !== id))
    onFlowsChange(flows.filter(f => f.fromStageId !== id && f.toStageId !== id))
  }

  // Get incoming flow value for a stage (or 100% if it's the first marker)
  const getIncomingFlowValue = (stageId: string): number => {
    const incomingFlows = flows.filter(f => f.toStageId === stageId)
    if (incomingFlows.length === 0) {
      // First marker or no incoming flows - default to 100%
      return 100
    }
    // Sum all incoming flow values
    return incomingFlows.reduce((sum, f) => sum + f.value, 0)
  }

  // Flow CRUD
  const createFlow = () => {
    if (stages.length < 2) {
      alert('Need at least 2 stages to create a flow')
      return
    }
    
    // Calculate branch index for flows from the same stage
    const sortedStages = [...stages].sort((a, b) => a.position - b.position)
    const fromStageId = sortedStages[0].id
    const toStageId = sortedStages[1].id
    
    // Get the incoming flow value to the source marker
    const incomingValue = getIncomingFlowValue(fromStageId)
    
    // Get existing outgoing flows from the source marker
    const existingOutgoingFlows = flows.filter(f => f.fromStageId === fromStageId)
    
    // Calculate the number of children (existing + new one)
    const numberOfChildren = existingOutgoingFlows.length + 1
    
    // Calculate the proportional value for each child
    const proportionalValue = incomingValue / numberOfChildren
    
    // Update all existing outgoing flows with the new proportional value
    const updatedFlows = flows.map(flow => {
      if (flow.fromStageId === fromStageId) {
        return { ...flow, value: proportionalValue }
      }
      return flow
    })
    
    // Create the new flow with proportional value
    const flowsFromSameStage = existingOutgoingFlows
    const branchIndex = flowsFromSameStage.length
    
    const newFlow: Flow = {
      id: Date.now().toString(),
      name: `Flow ${flows.length + 1}`,
      fromStageId,
      toStageId,
      value: proportionalValue,
      branchIndex,
      color: '#667eea',
    }
    
    onFlowsChange([...updatedFlows, newFlow])
  }

  const updateFlow = (id: string, updates: Partial<Flow>) => {
    onFlowsChange(flows.map(f => f.id === id ? { ...f, ...updates } : f))
    setEditingFlow(null)
  }

  const deleteFlow = (id: string) => {
    onFlowsChange(flows.filter(f => f.id !== id))
  }

  const getStageName = (id: string) => {
    return stages.find(s => s.id === id)?.name || id
  }

  return (
    <div className="control-panel">
      <div className="panel-header">
        <h2>Controls</h2>
      </div>
      <div className="panel-tabs">
        <button
          className={`tab ${activeTab === 'stages' ? 'active' : ''}`}
          onClick={() => setActiveTab('stages')}
        >
          Stages
        </button>
        <button
          className={`tab ${activeTab === 'flows' ? 'active' : ''}`}
          onClick={() => setActiveTab('flows')}
        >
          Flows
        </button>
      </div>

      <div className="panel-content">
        {activeTab === 'stages' && (
          <div className="tab-panel">
            <button className="create-button" onClick={createStage}>
              <Plus size={16} />
              Create Stage
            </button>
            <div className="items-list">
              {stages.map(stage => (
                <div key={stage.id} className="item-card">
                  {editingStage?.id === stage.id ? (
                    <div className="edit-form">
                      <input
                        type="text"
                        value={editingStage.name}
                        onChange={(e) =>
                          setEditingStage({ ...editingStage, name: e.target.value })
                        }
                        className="edit-input"
                        autoFocus
                      />
                      <input
                        type="number"
                        value={editingStage.position}
                        onChange={(e) =>
                          setEditingStage({
                            ...editingStage,
                            position: Number(e.target.value),
                          })
                        }
                        className="edit-input"
                        min="0"
                        max="100"
                      />
                      <input
                        type="color"
                        value={editingStage.color || '#667eea'}
                        onChange={(e) =>
                          setEditingStage({ ...editingStage, color: e.target.value })
                        }
                        className="color-input"
                      />
                      <div className="edit-actions">
                        <button
                          className="save-button"
                          onClick={() => updateStage(stage.id, editingStage)}
                        >
                          Save
                        </button>
                        <button
                          className="cancel-button"
                          onClick={() => setEditingStage(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="item-info">
                        <div className="item-name">{stage.name}</div>
                        <div className="item-meta">Position: {stage.position}%</div>
                      </div>
                      <div className="item-actions">
                        <button
                          className="icon-button"
                          onClick={() => setEditingStage(stage)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="icon-button delete"
                          onClick={() => deleteStage(stage.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'flows' && (
          <div className="tab-panel">
            <button className="create-button" onClick={createFlow}>
              <Plus size={16} />
              Create Flow
            </button>
            <div className="items-list">
              {flows.map(flow => (
                <div key={flow.id} className="item-card">
                  {editingFlow?.id === flow.id ? (
                    <div className="edit-form">
                      <input
                        type="text"
                        value={editingFlow.name}
                        onChange={(e) =>
                          setEditingFlow({ ...editingFlow, name: e.target.value })
                        }
                        className="edit-input"
                        autoFocus
                      />
                      <select
                        value={editingFlow.fromStageId}
                        onChange={(e) =>
                          setEditingFlow({ ...editingFlow, fromStageId: e.target.value })
                        }
                        className="edit-input"
                      >
                        {stages.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <select
                        value={editingFlow.toStageId}
                        onChange={(e) =>
                          setEditingFlow({ ...editingFlow, toStageId: e.target.value })
                        }
                        className="edit-input"
                      >
                        {stages.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={editingFlow.value}
                        onChange={(e) =>
                          setEditingFlow({ ...editingFlow, value: Number(e.target.value) })
                        }
                        className="edit-input"
                        min="1"
                        placeholder="Flow value"
                      />
                      <input
                        type="color"
                        value={editingFlow.color || '#667eea'}
                        onChange={(e) =>
                          setEditingFlow({ ...editingFlow, color: e.target.value })
                        }
                        className="color-input"
                      />
                      <div className="edit-actions">
                        <button
                          className="save-button"
                          onClick={() => updateFlow(flow.id, editingFlow)}
                        >
                          Save
                        </button>
                        <button
                          className="cancel-button"
                          onClick={() => setEditingFlow(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="item-info">
                        <div className="item-name">{flow.name}</div>
                        <div className="item-meta">
                          {getStageName(flow.fromStageId)} → {getStageName(flow.toStageId)}
                        </div>
                        <div className="item-meta">Value: {flow.value}</div>
                      </div>
                      <div className="item-actions">
                        <button
                          className="icon-button"
                          onClick={() => setEditingFlow(flow)}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="icon-button delete"
                          onClick={() => deleteFlow(flow.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

