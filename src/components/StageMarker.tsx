import { useState, useRef, useEffect } from 'react'
import { Stage, Flow } from '../types'
import { Trash2, Minus, X } from 'lucide-react'
import './StageMarker.css'

interface StageMarkerProps {
  x: number
  y: number
  stage: Stage
  height: number
  onUpdate?: (stage: Stage) => void
  onClick?: (stage: Stage) => void
  onDelete?: (stageId: string) => void
  onDisconnectParent?: (flowId: string) => void
  onDrag?: (stageId: string, newPosition: number, newYPosition: number) => void
  isSelected?: boolean
  incomingFlows?: Flow[] // Flows that end at this marker (parent connections)
  incomingFlowPositions?: { flowId: string; y: number }[] // Vertical positions for each incoming flow
  minX?: number // Minimum x position based on parent nodes
  canvasWidth?: number
  canvasHeight?: number
  hideLabel?: boolean // If true, don't render the label (for separate label rendering)
}

export default function StageMarker({ 
  x, 
  y, 
  stage, 
  height,
  onUpdate,
  onClick,
  onDelete,
  onDisconnectParent,
  onDrag,
  isSelected,
  incomingFlows = [],
  incomingFlowPositions = [],
  minX = 0,
  canvasWidth = 1200,
  canvasHeight = 600,
  hideLabel = false
}: StageMarkerProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(stage.name)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [dragStartY, setDragStartY] = useState(0)
  const [dragStartPosition, setDragStartPosition] = useState(0)
  const [dragStartYPosition, setDragStartYPosition] = useState(0)
  const [hasDragged, setHasDragged] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [labelWidth, setLabelWidth] = useState(100)
  const inputRef = useRef<HTMLInputElement>(null)
  const labelContainerRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<SVGGElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const textMeasureRef = useRef<SVGTextElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Handle Escape key globally when marker is selected
  // Should do the same action as clicking the marker again (deselect)
  useEffect(() => {
    if (!isSelected) return

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault()
        e.stopPropagation()
        // Revert any unsaved changes
        setEditName(stage.name)
        setIsEditing(false)
        if (inputRef.current) {
          inputRef.current.blur()
        }
        // Trigger the same action as clicking the marker again (deselect)
        onClick?.(stage)
      }
    }

    // Use capture phase to catch the event early
    document.addEventListener('keydown', handleEscapeKey, true)
    return () => {
      document.removeEventListener('keydown', handleEscapeKey, true)
    }
  }, [isSelected, stage, onClick])

  // Measure text width to fit label background
  useEffect(() => {
    if (textMeasureRef.current) {
      const bbox = textMeasureRef.current.getBBox()
      // Add padding: 16px on each side for selected (with delete button), 8px for normal
      const padding = isSelected ? 60 : 16 // Extra space for delete button and separator when selected
      setLabelWidth(Math.max(bbox.width + padding, isSelected ? 80 : 40))
    }
  }, [stage.name, isSelected, isEditing, editName])

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(true)
  }

  const handleBlur = () => {
    if (editName.trim() && editName !== stage.name) {
      onUpdate?.({ ...stage, name: editName.trim() })
    } else {
      setEditName(stage.name)
    }
    // Only stop editing if marker is not selected (to keep input visible when selected)
    if (!isSelected) {
      setIsEditing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      // Save changes and exit editing mode
      if (editName.trim() && editName !== stage.name) {
        onUpdate?.({ ...stage, name: editName.trim() })
      } else {
        setEditName(stage.name)
      }
      setIsEditing(false)
      if (inputRef.current) {
        inputRef.current.blur()
      }
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault()
      e.stopPropagation()
      setEditName(stage.name)
      setIsEditing(false)
      // Blur the input to ensure it loses focus
      if (inputRef.current) {
        inputRef.current.blur()
      }
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isDragging && !hasDragged) {
      onClick?.(stage)
      // Don't auto-start editing - user must click input field
    }
  }

  const handleInputClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isEditing) {
      setIsEditing(true)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging && !isEditing && onDelete) {
      // Position menu at click location relative to the marker's transform
      // Since we're inside a transform group, use the click position relative to the marker
      const svg = markerRef.current?.ownerSVGElement
      if (svg) {
        const svgPoint = svg.createSVGPoint()
        svgPoint.x = e.clientX
        svgPoint.y = e.clientY
        const ctm = svg.getScreenCTM()
        if (ctm) {
          const svgPointTransformed = svgPoint.matrixTransform(ctm.inverse())
          setContextMenu({
            x: svgPointTransformed.x,
            y: svgPointTransformed.y,
          })
        }
      }
    }
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setContextMenu(null)
    onDelete?.(stage.id)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return
    e.stopPropagation()
    setIsDragging(true)
    setHasDragged(false)
    setDragStartX(e.clientX)
    setDragStartY(e.clientY)
    setDragStartPosition(stage.position)
    setDragStartYPosition(stage.yPosition ?? y)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX
      const deltaY = e.clientY - dragStartY
      
      // If mouse moved more than 5 pixels, consider it a drag
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        setHasDragged(true)
      }
      
      // Calculate new horizontal position
      const deltaPosition = (deltaX / canvasWidth) * 100
      let newPosition = dragStartPosition + deltaPosition
      
      // Constrain by minimum position (parent nodes)
      const minPosition = (minX / canvasWidth) * 100
      newPosition = Math.max(minPosition, newPosition)
      newPosition = Math.min(100, newPosition)
      
      // Calculate new vertical position
      // Allow markers to be moved anywhere vertically, including below the ticker axis
      let newYPosition = dragStartYPosition + deltaY
      
      onDrag?.(stage.id, newPosition, newYPosition)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Reset hasDragged after a short delay to prevent click from firing
      setTimeout(() => {
        setHasDragged(false)
      }, 100)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStartX, dragStartY, dragStartPosition, dragStartYPosition, stage.id, minX, canvasWidth, canvasHeight, height, y, onDrag])

  const topY = y - height / 2
  const bottomY = y + height / 2

  return (
    <g 
      ref={markerRef}
      className={`stage-marker ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`} 
      transform={`translate(${x}, 0)`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
    >
      {/* Disconnect parent buttons - shown when selected and multiple parents exist (old implementation, now using entry points) */}
      {false && isSelected && incomingFlows.length > 1 && onDisconnectParent && (
        incomingFlows.map((flow, index) => {
          // Calculate vertical position for each parent flow
          // Stack them vertically based on their order
          const flowSpacing = height / (incomingFlows.length + 1)
          const flowY = topY + flowSpacing * (index + 1)
          
          const handleDisconnect = (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (onDisconnectParent) {
              onDisconnectParent(flow.id)
            }
          }
          
          return (
            <g key={`disconnect-${flow.id}`} onClick={handleDisconnect} onMouseDown={(e) => e.stopPropagation()}>
              <circle
                cx={-25}
                cy={flowY}
                r={10}
                fill="#f59e0b"
                className="disconnect-icon-circle"
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
              />
              <g transform={`translate(-30, ${flowY - 6})`}>
                <foreignObject x={0} y={0} width={12} height={12} style={{ pointerEvents: 'none' }}>
                  <div className="disconnect-icon-wrapper">
                    <Minus size={10} color="white" />
                  </div>
                </foreignObject>
              </g>
            </g>
          )
        })
      )}
      
      {/* Rectangular Sankey node */}
      <rect
        x={-5}
        y={topY}
        width={10}
        height={height}
        fill={stage.color || '#667eea'}
        rx={2}
        className="sankey-node"
      />
      
      {/* Entry points (left side - flows end here) - white points when not selected, red with minus when selected (only if multiple parents) - rendered after marker to appear on top */}
      {incomingFlowPositions.map(({ flowId, y: flowY }: { flowId: string; y: number }) => {
        const flow = incomingFlows.find(f => f.id === flowId)
        if (!flow) return null
        
        // Show red dot with minus only if selected AND there are multiple incoming flows
        if (isSelected && onDisconnectParent && incomingFlows.length > 1) {
          // Red dot with minus sign when selected and multiple parents exist
          const handleDisconnect = (e: React.MouseEvent) => {
            e.stopPropagation()
            e.preventDefault()
            if (onDisconnectParent) {
              onDisconnectParent(flowId)
            }
          }
          
          return (
            <g key={`entry-point-${flowId}`} onClick={handleDisconnect} onMouseDown={(e) => e.stopPropagation()}>
              <circle
                cx={-8}
                cy={flowY}
                r={4}
                fill="#ef4444"
                stroke="#dc2626"
                strokeWidth={1.5}
                className="entry-point-disconnect"
                style={{ cursor: 'pointer', pointerEvents: 'all' }}
              />
              <g transform={`translate(-8, ${flowY})`}>
                <foreignObject x={-4} y={-4} width={8} height={8} style={{ pointerEvents: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    <X size={6} color="white" strokeWidth={2.5} />
                  </div>
                </foreignObject>
              </g>
            </g>
          )
        } else {
          // White dot when not selected, or when selected but only one parent
          return (
            <circle
              key={`entry-point-${flowId}`}
              cx={-8}
              cy={flowY}
              r={4}
              fill="white"
              stroke={stage.color || '#667eea'}
              strokeWidth={1.5}
              className="entry-point"
            />
          )
        }
      })}
      
      {/* Context menu */}
      {contextMenu && (
        <foreignObject
          x={contextMenu.x}
          y={contextMenu.y}
          width="120"
          height="40"
          style={{ pointerEvents: 'all' }}
        >
          <div
            ref={contextMenuRef}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <button
              onClick={handleDeleteClick}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                color: '#ef4444',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fef2f2'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </foreignObject>
      )}

      {/* Clickable/draggable area - but not when delete icon is shown */}
      {!isSelected && (
        <rect
          x={-12}
          y={topY}
          width={24}
          height={height}
          fill="transparent"
          className="marker-hitbox"
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        />
      )}

      {/* Hidden text for measuring width */}
      <text
        ref={textMeasureRef}
        x={0}
        y={bottomY + 25}
        textAnchor="middle"
        fill="transparent"
        fontSize="13"
        fontWeight="500"
        style={{ visibility: 'hidden', pointerEvents: 'none' }}
      >
        {isEditing ? editName : stage.name}
      </text>

      {/* Label background - width fits text */}
      {!hideLabel && (
        <rect
          x={-labelWidth / 2}
          y={bottomY + 10}
          width={labelWidth}
          height={isSelected ? 30 : 20}
          fill="white"
          stroke={isSelected ? '#667eea' : '#e2e8f0'}
          strokeWidth={isSelected ? 2 : 1}
          rx={4}
          className="label-background"
        />
      )}

      {/* Editable label with delete icon when selected */}
      {!hideLabel && isSelected ? (
        <foreignObject x={-labelWidth / 2} y={bottomY + 10} width={labelWidth} height={30}>
          <div
            ref={labelContainerRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              height: '100%',
              padding: '0 4px',
              gap: '0',
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="text"
              value={isEditing ? editName : stage.name}
              onChange={(e) => {
                if (isEditing) {
                  setEditName(e.target.value)
                }
              }}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              onClick={handleInputClick}
              onFocus={() => {
                // Ensure we can edit when focused
                if (!isEditing) {
                  setIsEditing(true)
                }
              }}
              readOnly={!isEditing}
              className="stage-name-input"
              style={{
                minWidth: '0',
                width: 'auto',
                flex: '1 1 auto',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: '13px',
                fontWeight: '500',
                textAlign: 'center',
                padding: '0 8px',
                cursor: isEditing ? 'text' : 'pointer',
                color: isEditing ? '#1a202c' : '#1a202c',
              }}
            />
            {/* Visual separator */}
            <div
              style={{
                width: '1px',
                height: '20px',
                background: '#e2e8f0',
                margin: '0 4px',
              }}
            />
            {/* Show delete button only if there's one or no parent (when selected) */}
            {onDelete && (incomingFlows.length <= 1) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(stage.id)
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fef2f2'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
                title="Delete marker"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </foreignObject>
      ) : !hideLabel && isEditing ? (
        <foreignObject x={-labelWidth / 2} y={bottomY + 10} width={labelWidth} height={30}>
          <input
            ref={inputRef}
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="stage-name-input"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%' }}
          />
        </foreignObject>
      ) : !hideLabel ? (
        <text
          x={0}
          y={bottomY + 25}
          textAnchor="middle"
          className="stage-label"
          fill="#1a202c"
          fontSize="13"
          fontWeight="500"
          onDoubleClick={handleDoubleClick}
          style={{ cursor: 'text' }}
        >
          {stage.name}
        </text>
      ) : null}
    </g>
  )
}

