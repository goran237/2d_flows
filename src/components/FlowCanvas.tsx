import { useRef, useEffect, useState } from 'react'
import { Stage, Flow } from '../types'
import StageMarker from './StageMarker'
import FlowPath from './FlowPath'
import { Lock, Unlock, RotateCcw, Check, X, Trash2, GitBranch, Link } from 'lucide-react'
import './FlowCanvas.css'

interface FlowCanvasProps {
  stages: Stage[]
  flows: Flow[]
  onStagesChange: (stages: Stage[]) => void
  onFlowsChange: (flows: Flow[]) => void
  onStagesChangeNoHistory?: (stages: Stage[]) => void
}

// Canvas height will be calculated based on viewport
const MIN_MARKER_HEIGHT = 480 // Minimum node height (4x the previous 120)
const HEIGHT_SCALE = 8 // Pixels per unit of flow value (4x the previous 2)
const FLOW_SPACING = 8 // Spacing between flows (4x the previous 2)

export default function FlowCanvas({
  stages,
  flows,
  onStagesChange,
  onFlowsChange,
  onStagesChangeNoHistory,
}: FlowCanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [canvasWidth, setCanvasWidth] = useState(1200)
  const [canvasHeight, setCanvasHeight] = useState(800)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [isCreatingBranch, setIsCreatingBranch] = useState(false)
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null)
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null)
  const [editingStage, setEditingStage] = useState<Stage | null>(null)
  
  // Pan and zoom state
  const [zoom, setZoom] = useState(1)
  // Initialize pan so that 0% is to the left of the canvas
  // We'll calculate this after canvasWidth is set
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [isZoomLocked, setIsZoomLocked] = useState(false) // Unlocked by default

  // Canvas coordinate system: -10% to 110% (0% is not at left edge)
  const CANVAS_MIN_POSITION = -10
  const CANVAS_MAX_POSITION = 110
  const CANVAS_RANGE = CANVAS_MAX_POSITION - CANVAS_MIN_POSITION // 120

  useEffect(() => {
    const updateSize = () => {
      if (canvasRef.current) {
        // Get the container width (parent of canvasRef)
        const container = canvasRef.current.parentElement
        const containerWidth = container ? container.clientWidth - 64 : 1200 // Subtract padding (2rem * 2 = 64px)
        
        // Multiply canvas width by 10 to increase x-axis scale 10x
        const newCanvasWidth = containerWidth * 10
        setCanvasWidth(newCanvasWidth)
        
        // Set the canvas div width to be wider than container to ensure scrollbar is always visible
        canvasRef.current.style.width = `${newCanvasWidth}px`
        
        // Calculate height to fit viewport (accounting for header ~80px and padding)
        const viewportHeight = window.innerHeight
        const headerHeight = 80
        const padding = 40
        const calculatedHeight = viewportHeight - headerHeight - padding - 100
        setCanvasHeight(Math.max(400, calculatedHeight))
        
        // Set initial pan so that -1% is at the left border of the canvas
        // Calculate the SVG x coordinate of -1% position
        const minusOnePercentX = ((-1 - CANVAS_MIN_POSITION) / CANVAS_RANGE) * newCanvasWidth
        // To have -1% at left edge: pan.x = -minusOnePercentX * zoom (for zoom=1)
        setPan({ x: -minusOnePercentX, y: 0 })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Handle horizontal mouse wheel scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Check if horizontal scrolling (shift+wheel or trackpad horizontal scroll)
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault()
      const container = canvasRef.current?.parentElement
      if (container) {
        container.scrollLeft += e.deltaX || e.deltaY
      }
    }
  }

  // Handle pan start
  const handlePanStart = (e: React.MouseEvent<SVGSVGElement>) => {
    // Don't pan if clicking on markers or flows, or if creating a branch
    if (selectedStageId || selectedFlowId || isCreatingBranch) {
      return
    }
    
    // Pan with left mouse button on empty canvas
    if (e.button === 0) {
      e.preventDefault()
      e.stopPropagation()
      setIsPanning(true)
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  // Handle pan move
  useEffect(() => {
    if (!isPanning) return

    const handlePanMove = (e: MouseEvent) => {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      })
    }

    const handlePanEnd = () => {
      setIsPanning(false)
    }

    document.addEventListener('mousemove', handlePanMove)
    document.addEventListener('mouseup', handlePanEnd)
    
    return () => {
      document.removeEventListener('mousemove', handlePanMove)
      document.removeEventListener('mouseup', handlePanEnd)
    }
  }, [isPanning, panStart])

  const getStageX = (position: number) => {
    // Map position from [-10, 110] range to [0, canvasWidth]
    const normalizedPosition = (position - CANVAS_MIN_POSITION) / CANVAS_RANGE
    return normalizedPosition * canvasWidth
  }

  const getPositionFromX = (x: number) => {
    // Map x from [0, canvasWidth] to [-10, 110] range
    const normalizedX = x / canvasWidth
    const position = normalizedX * CANVAS_RANGE + CANVAS_MIN_POSITION
    return Math.max(CANVAS_MIN_POSITION, Math.min(CANVAS_MAX_POSITION, position))
  }

  // Snap position to nearest ticker (0.1% intervals)
  const snapToTicker = (position: number): number => {
    // Round to nearest 0.1%
    const tickerPosition = Math.round(position * 10) / 10
    return Math.max(CANVAS_MIN_POSITION, Math.min(CANVAS_MAX_POSITION, tickerPosition))
  }

  // Generate ticker positions - smaller every 0.1%, larger every 1%, starting from -10%
  const getTickerPositions = (): Array<{ position: number; isMajor: boolean }> => {
    const tickers: Array<{ position: number; isMajor: boolean }> = []
    // Generate tickers every 0.1% from -10% to 110%
    for (let i = -100; i <= 1100; i += 1) {
      const position = i / 10
      // Major tickers every 1% (when position is a whole number)
      const isMajor = i % 10 === 0
      tickers.push({ position, isMajor })
    }
    return tickers
  }

  // Get incoming flow value for a stage (or 100% if it's the first marker)
  const getIncomingFlowValue = (stageId: string, flowsToUse: Flow[] = flows): number => {
    const incomingFlows = flowsToUse.filter(f => f.toStageId === stageId)
    if (incomingFlows.length === 0) {
      // First marker or no incoming flows - default to 100%
      return 100
    }
    // Sum all incoming flow values
    return incomingFlows.reduce((sum, f) => sum + f.value, 0)
  }

  // Generate a similar but different color based on parent color
  // childIndex: 0-based index of the child (0 = first child, 1 = second child, etc.)
  const generateSimilarColor = (parentColor: string, childIndex: number = 0): string => {
    // Default color if parent color is not provided
    const defaultColor = '#667eea'
    if (!parentColor || !parentColor.startsWith('#')) return defaultColor

    // Parse hex color to RGB
    const hex = parentColor.replace('#', '')
    if (hex.length !== 6) return defaultColor
    
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    
    // Validate parsed values
    if (isNaN(r) || isNaN(g) || isNaN(b)) return defaultColor

    // Convert RGB to HSL
    const rNorm = r / 255
    const gNorm = g / 255
    const bNorm = b / 255

    const max = Math.max(rNorm, gNorm, bNorm)
    const min = Math.min(rNorm, gNorm, bNorm)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      switch (max) {
        case rNorm:
          h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
          break
        case gNorm:
          h = ((bNorm - rNorm) / d + 2) / 6
          break
        case bNorm:
          h = ((rNorm - gNorm) / d + 4) / 6
          break
      }
    }

    // Rotate hue by a variable amount based on child index
    // Base shift of 20 degrees, plus 25 degrees per child index
    // This ensures each child has a distinct but similar color
    const baseHueShift = 20 / 360 // Base 20 degrees
    const perChildShift = 25 / 360 // 25 degrees per child
    const hueShift = baseHueShift + (childIndex * perChildShift)
    const newH = (h + hueShift) % 1
    
    // Vary saturation and lightness slightly based on child index for more distinction
    const saturationVariation = 1 - (childIndex * 0.05) // Slightly reduce saturation for later children
    const lightnessVariation = 1 + (childIndex * 0.03) // Slightly increase lightness for later children
    const newS = Math.min(1, Math.max(0.3, s * 0.9 * saturationVariation))
    const newL = Math.min(0.9, Math.max(0.3, l * 1.1 * lightnessVariation))

    // Convert HSL back to RGB
    let newR, newG, newB

    if (newS === 0) {
      newR = newG = newB = newL
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
      }

      const q = newL < 0.5 ? newL * (1 + newS) : newL + newS - newL * newS
      const p = 2 * newL - q

      newR = hue2rgb(p, q, newH + 1 / 3)
      newG = hue2rgb(p, q, newH)
      newB = hue2rgb(p, q, newH - 1 / 3)
    }

    // Convert to hex
    const toHex = (n: number) => {
      const hex = Math.round(n * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
  }

  // Create a new flow with proportional splitting
  const createFlowWithProportionalSplit = (
    fromStageId: string,
    toStageId: string,
    existingFlows: Flow[],
    flowColor?: string
  ): Flow[] => {
    // Get the incoming flow value to the source marker
    const incomingValue = getIncomingFlowValue(fromStageId)
    
    // Get existing outgoing flows from the source marker
    const existingOutgoingFlows = existingFlows.filter(f => f.fromStageId === fromStageId)
    
    // Calculate the number of children (existing + new one)
    const numberOfChildren = existingOutgoingFlows.length + 1
    
    // Calculate the proportional value for each child
    const proportionalValue = incomingValue / numberOfChildren
    
    // Update all existing outgoing flows with the new proportional value
    const updatedFlows = existingFlows.map(flow => {
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
      name: `Flow ${existingFlows.length + 1}`,
      fromStageId,
      toStageId,
      value: proportionalValue,
      branchIndex,
      color: flowColor || '#667eea',
    }
    
    return [...updatedFlows, newFlow]
  }

  const handleFlowClick = (flowId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent canvas click
    
    // Don't handle flow click if modal is already open for this flow
    if (selectedFlowId === flowId && editingFlow?.id === flowId) {
      return
    }
    
    const flow = flows.find(f => f.id === flowId)
    if (flow) {
      if (selectedFlowId === flowId && editingFlow?.id === flowId) {
        // Clicking the same flow while editing - cancel editing
        setEditingFlow(null)
        setSelectedFlowId(null)
      } else {
        // Select flow and start editing
        setSelectedFlowId(flowId)
        // Convert actual flow value to percentage of parent's incoming flow for editing
        const parentIncomingValue = getIncomingFlowValue(flow.fromStageId, flows)
        const percentageValue = parentIncomingValue > 0 
          ? (flow.value / parentIncomingValue) * 100 
          : 0
        setEditingFlow({ ...flow, value: percentageValue })
        // Clear stage selection when selecting flow
        setSelectedStageId(null)
        setIsCreatingBranch(false)
      }
    }
  }

  // Ensure all flows are balanced (outgoing flows = incoming flows for each stage)
  const balanceFlows = (flowsToBalance: Flow[]): Flow[] => {
    const updatedFlows = [...flowsToBalance]
    
    // For each stage, ensure outgoing flows sum equals incoming flows
    stages.forEach(stage => {
      const incomingValue = getIncomingFlowValue(stage.id, updatedFlows)
      const outgoingFlows = updatedFlows.filter(f => f.fromStageId === stage.id)
      
      if (outgoingFlows.length > 0) {
        const currentOutgoingSum = outgoingFlows.reduce((sum, f) => sum + f.value, 0)
        
        // If outgoing flows don't match incoming, recalculate proportionally
        if (Math.abs(currentOutgoingSum - incomingValue) > 0.01) {
          const proportionalValue = incomingValue / outgoingFlows.length
          
          // Update all outgoing flows from this stage
          outgoingFlows.forEach(flow => {
            const index = updatedFlows.findIndex(f => f.id === flow.id)
            if (index !== -1) {
              updatedFlows[index] = { ...updatedFlows[index], value: proportionalValue }
            }
          })
        }
      }
    })
    
    return updatedFlows
  }

  const handleFlowUpdate = () => {
    if (!editingFlow) return
    
    // Get the source stage of the updated flow
    const sourceStageId = editingFlow.fromStageId
    const incomingValue = getIncomingFlowValue(sourceStageId, flows)
    
    // Convert percentage input to actual flow value
    // The editingFlow.value is a percentage (0-100) of the parent's incoming flow
    const actualFlowValue = (editingFlow.value / 100) * incomingValue
    // Clamp to valid range
    const clampedFlowValue = Math.max(0, Math.min(actualFlowValue, incomingValue))
    
    // Update the flow with the converted actual value
    const flowWithActualValue = { ...editingFlow, value: clampedFlowValue }
    let updatedFlows = flows.map(f => f.id === editingFlow.id ? flowWithActualValue : f)
    
    // Get all outgoing flows from the same source
    const outgoingFlows = updatedFlows.filter(f => f.fromStageId === sourceStageId)
    
    if (outgoingFlows.length > 1) {
      // Calculate the sum of all other flows (excluding the one being updated)
      const otherFlows = outgoingFlows.filter(f => f.id !== editingFlow.id)
      const otherFlowsSum = otherFlows.reduce((sum, f) => sum + f.value, 0)
      
      // Calculate remaining value for other flows
      const remainingValue = Math.max(0, incomingValue - clampedFlowValue)
      
      // If there are other flows, adjust them proportionally
      if (otherFlows.length > 0 && remainingValue > 0) {
        // Distribute remaining value proportionally among other flows
        const scaleFactor = remainingValue / otherFlowsSum
        updatedFlows = updatedFlows.map(flow => {
          if (flow.fromStageId === sourceStageId && flow.id !== editingFlow.id) {
            return { ...flow, value: flow.value * scaleFactor }
          }
          return flow
        })
      } else if (otherFlows.length > 0 && remainingValue <= 0) {
        // If the user set a value that's too high, set others to minimum
        updatedFlows = updatedFlows.map(flow => {
          if (flow.fromStageId === sourceStageId && flow.id !== editingFlow.id) {
            return { ...flow, value: 0.01 } // Minimum value
          }
          return flow
        })
      }
    }
    
    // Balance flows for downstream stages (but preserve the user's change)
    updatedFlows = balanceFlows(updatedFlows)
    
    // Re-apply the user's change after balancing (in case balanceFlows reset it)
    updatedFlows = updatedFlows.map(f => f.id === editingFlow.id ? flowWithActualValue : f)
    
    // Re-balance other flows again after preserving user's change
    const finalSourceStageId = editingFlow.fromStageId
    const finalIncomingValue = getIncomingFlowValue(finalSourceStageId, updatedFlows)
    const finalOutgoingFlows = updatedFlows.filter(f => f.fromStageId === finalSourceStageId)
    
    if (finalOutgoingFlows.length > 1) {
      const finalOtherFlows = finalOutgoingFlows.filter(f => f.id !== editingFlow.id)
      const finalOtherFlowsSum = finalOtherFlows.reduce((sum, f) => sum + f.value, 0)
      const finalRemainingValue = Math.max(0, finalIncomingValue - clampedFlowValue)
      
      if (finalOtherFlows.length > 0 && finalRemainingValue > 0 && finalOtherFlowsSum > 0) {
        const finalScaleFactor = finalRemainingValue / finalOtherFlowsSum
        updatedFlows = updatedFlows.map(flow => {
          if (flow.fromStageId === finalSourceStageId && flow.id !== editingFlow.id) {
            return { ...flow, value: flow.value * finalScaleFactor }
          }
          return flow
        })
      }
    }
    
    onFlowsChange(updatedFlows)
    setEditingFlow(null)
    setSelectedFlowId(null)
  }

  const handleStageClick = (stage: Stage) => {
    // Clear flow selection when clicking stage
    setSelectedFlowId(null)
    setEditingFlow(null)
    
    // If already editing this stage, close the modal
    if (editingStage?.id === stage.id) {
      setEditingStage(null)
      return
    }
    
    // If another stage is selected for branch creation, create flow
    if (selectedStageId && selectedStageId !== stage.id) {
      const selectedStage = stages.find(s => s.id === selectedStageId)
      if (selectedStage) {
        // Only create flow if clicked marker is to the right of the selected marker
        if (stage.position > selectedStage.position) {
          // Use the target marker's color for the flow
          const flowColor = stage.color || '#667eea'
          // Create flow from selected marker to clicked marker with proportional splitting
          let updatedFlows = createFlowWithProportionalSplit(selectedStageId, stage.id, flows, flowColor)
          // Balance all flows to ensure outgoing = incoming for each stage
          updatedFlows = balanceFlows(updatedFlows)
          onFlowsChange(updatedFlows)
        }
      }
      // Clear selection after creating flow
      setIsCreatingBranch(false)
      setSelectedStageId(null)
    } else if (!selectedStageId) {
      // No marker selected - open edit modal for this marker
      setEditingStage({ ...stage })
    }
  }
  
  const handleStageModalUpdate = () => {
    if (!editingStage) return
    
    onStagesChange(stages.map(s => s.id === editingStage.id ? editingStage : s))
    setEditingStage(null)
  }
  
  const handleStageModalDelete = () => {
    if (!editingStage) return
    
    handleStageDelete(editingStage.id)
    setEditingStage(null)
  }

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // Don't handle canvas click if we were panning
    if (isPanning) {
      return
    }
    
    // Don't close modals if clicking inside them or if user is selecting text
    const target = e.target as HTMLElement
    if (target.closest('.flow-edit-modal') || target.closest('.stage-edit-modal')) {
      return
    }
    
    // Check if user is selecting text (selection exists)
    const selection = window.getSelection()
    if (selection && selection.toString().length > 0) {
      return
    }
    
    // Clear flow selection when clicking canvas (but not inside modal or during text selection)
    if (selectedFlowId) {
      setSelectedFlowId(null)
      setEditingFlow(null)
    }
    
    // Clear stage edit modal when clicking canvas
    if (editingStage) {
      setEditingStage(null)
    }
    
    if (!isCreatingBranch || !selectedStageId) return

    const svg = svgRef.current
    if (!svg) return

    const svgRect = svg.getBoundingClientRect()
    // Account for pan and zoom when calculating click position
    const clickX = (e.clientX - svgRect.left - pan.x) / zoom

    // Create new stage at click position
    const fromStage = stages.find(s => s.id === selectedStageId)
    if (!fromStage) return
    
    // Get the source marker's x coordinate
    const fromStageX = getStageX(fromStage.position)
    
    // CRITICAL: Only allow creation if click x coordinate is greater than source marker's x coordinate
    // Use a small epsilon to handle floating point precision (1 pixel tolerance)
    const EPSILON_X = 1 // 1 pixel tolerance
    if (clickX <= fromStageX + EPSILON_X) {
      // Clicked at or to the left of the source marker - don't create
      return
    }
    
    // Click is to the right - convert to position and proceed
    let newPosition = getPositionFromX(clickX)
    
    // Snap to nearest ticker
    newPosition = snapToTicker(newPosition)
    
    // Verify the snapped position is still to the right by comparing x coordinates
    const snappedX = getStageX(newPosition)
    if (snappedX <= fromStageX + EPSILON_X) {
      // Snapping moved it back - find the next ticker to the right (0.1% increment)
      const fromPosition = fromStage.position
      const nextTicker = Math.floor(fromPosition * 10) / 10 + 0.1
      newPosition = Math.min(nextTicker, CANVAS_MAX_POSITION)
      
      // Final verification using x coordinates
      const nextTickerX = getStageX(newPosition)
      if (nextTickerX <= fromStageX + EPSILON_X) {
        // Still not to the right - don't create
        return
      }
    }
    
    // Don't create if clicking directly on the source stage itself (very close hitbox)
    // But allow creating near it or at positions with existing markers, as long as x > source x
    // The x coordinate check above already ensures we're to the right
    const distanceToSource = Math.abs(clickX - fromStageX)
    if (distanceToSource < 10 / zoom) {
      // Clicking directly on the source marker itself - don't create
      // This prevents accidental creation when trying to deselect
      return
    }
    
    const clickY = (e.clientY - svgRect.top - pan.y) / zoom
    
    // Allow markers to be created anywhere vertically, including below the ticker axis
    const newYPosition = clickY
    
    // Get parent stage color and generate a similar color for the child
    const parentStage = stages.find(s => s.id === selectedStageId)
    const parentColor = parentStage?.color || '#667eea'
    
    // Count existing children of the parent to determine the child index
    const existingChildren = stages.filter(s => {
      const incomingFlow = flows.find(f => f.toStageId === s.id && f.fromStageId === selectedStageId)
      return incomingFlow !== undefined
    })
    const childIndex = existingChildren.length
    
    const childColor = generateSimilarColor(parentColor, childIndex)
    
    const newStage: Stage = {
      id: Date.now().toString(),
      name: `Stage ${stages.length + 1}`,
      position: newPosition,
      yPosition: newYPosition,
      color: childColor,
    }

    // Create flow from selected stage to new stage with the same color as the child marker
    let updatedFlows = createFlowWithProportionalSplit(selectedStageId, newStage.id, flows, childColor)

    // Balance all flows to ensure outgoing = incoming for each stage
    updatedFlows = balanceFlows(updatedFlows)

    // Add the new stage first, then the flow
    // The node heights will automatically update based on flow values
    onStagesChange([...stages, newStage])
    onFlowsChange(updatedFlows)
    setIsCreatingBranch(false)
    setSelectedStageId(null)
  }

  const handleStageUpdate = (updatedStage: Stage) => {
    onStagesChange(stages.map(s => s.id === updatedStage.id ? updatedStage : s))
  }

  // Recalculate flow values for remaining siblings after deletion
  const recalculateSiblingFlowValues = (
    parentStageId: string,
    remainingFlows: Flow[]
  ): Flow[] => {
    // Get all outgoing flows from the parent
    const siblingFlows = remainingFlows.filter(f => f.fromStageId === parentStageId)
    
    if (siblingFlows.length === 0) {
      return remainingFlows // No siblings to recalculate
    }
    
    // Get the incoming flow value to the parent marker (using remaining flows)
    const incomingValue = getIncomingFlowValue(parentStageId, remainingFlows)
    
    // Calculate the proportional value for each remaining sibling
    const proportionalValue = incomingValue / siblingFlows.length
    
    // Update all sibling flows with the new proportional value
    let updatedFlows = remainingFlows.map(flow => {
      if (flow.fromStageId === parentStageId) {
        return { ...flow, value: proportionalValue }
      }
      return flow
    })
    
    // Recursively recalculate flow values for all children of each sibling
    // This ensures the entire subtree is updated with correct values
    for (const siblingFlow of siblingFlows) {
      updatedFlows = recalculateSiblingFlowValues(siblingFlow.toStageId, updatedFlows)
    }
    
    return updatedFlows
  }

  const handleStageDelete = (stageId: string) => {
    // Prevent deletion of the first marker (root marker with no incoming flows)
    const incomingFlows = flows.filter(f => f.toStageId === stageId)
    if (incomingFlows.length === 0) {
      // This is the root marker - don't allow deletion
      return
    }
    
    // Find the parent marker (if any) that has an outgoing flow to this marker
    const incomingFlow = flows.find(f => f.toStageId === stageId)
    const parentStageId = incomingFlow?.fromStageId
    
    // Delete the stage
    const updatedStages = stages.filter(s => s.id !== stageId)
    
    // Remove flows FROM this marker (outgoing flows) and TO this marker (incoming flows)
    let updatedFlows = flows.filter(f => f.fromStageId !== stageId && f.toStageId !== stageId)
    
    // If this marker had a parent, recalculate flow values for remaining siblings
    if (parentStageId) {
      updatedFlows = recalculateSiblingFlowValues(parentStageId, updatedFlows)
    }
    
    onStagesChange(updatedStages)
    onFlowsChange(updatedFlows)
    
    // Clear selection if deleted stage was selected
    if (selectedStageId === stageId) {
      setSelectedStageId(null)
      setIsCreatingBranch(false)
    }
  }


  const handleStageDrag = (stageId: string, newPosition: number, newYPosition: number) => {
    // Snap horizontal position to nearest ticker
    const snappedPosition = snapToTicker(newPosition)
    // Use no-history setter for drag operations
    const updateFn = onStagesChangeNoHistory || onStagesChange
    updateFn(stages.map(s => s.id === stageId ? { ...s, position: snappedPosition, yPosition: newYPosition } : s))
  }

  const getStageY = (stage: Stage) => {
    return stage.yPosition ?? canvasHeight / 2
  }

  // Calculate node height based on total flow value (proportional to root marker)
  const getNodeHeight = (stageId: string): number => {
    // Get all incoming flows
    const incomingFlows = flows.filter(f => f.toStageId === stageId)
    // Get all outgoing flows
    const outgoingFlows = flows.filter(f => f.fromStageId === stageId)
    
    // Calculate the sum of all incoming flow widths
    // Flow width = flow.value * 8 (4x scaling)
    // Spacing between flows = 8px (4x scaling)
    let incomingHeight = 0
    for (let i = 0; i < incomingFlows.length; i++) {
      const flow = incomingFlows[i]
      const flowWidth = Math.max(20, flow.value * HEIGHT_SCALE) // 4x minimum and scale
      incomingHeight += flowWidth
      // Add spacing between flows (but not after the last one)
      if (i < incomingFlows.length - 1) {
        incomingHeight += FLOW_SPACING
      }
    }
    
    // Calculate the sum of all outgoing flow widths
    let outgoingHeight = 0
    for (let i = 0; i < outgoingFlows.length; i++) {
      const flow = outgoingFlows[i]
      const flowWidth = Math.max(20, flow.value * HEIGHT_SCALE) // 4x minimum and scale
      outgoingHeight += flowWidth
      // Add spacing between flows (but not after the last one)
      if (i < outgoingFlows.length - 1) {
        outgoingHeight += FLOW_SPACING
      }
    }
    
    // For root markers (no incoming flows), use outgoing flow height
    // For other markers, use incoming flow height
    // Use the maximum to ensure marker is tall enough for both directions
    const totalHeight = incomingFlows.length === 0 ? outgoingHeight : incomingHeight
    
    // Ensure minimum height for root markers if they have no flows yet
    if (incomingFlows.length === 0 && outgoingFlows.length === 0) {
      return MIN_MARKER_HEIGHT
    }
    
    return totalHeight
  }

  // Calculate minimum X position for a stage based on parent nodes
  const getMinXForStage = (_stageId: string): number => {
    // No constraints - markers can be positioned anywhere
    // This allows creating child markers to the left or right of other markers
    return 0
  }

  // Sort stages by position
  const sortedStages = [...stages].sort((a, b) => a.position - b.position)

  return (
    <>
      {/* Zoom controls - fixed position above canvas */}
      <div
        style={{
          position: 'fixed',
          top: 'calc(2rem + 1rem + 80px)',
          right: 'calc(2rem + 1rem)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          alignItems: 'flex-end',
          width: '200px',
        }}
      >
          {/* Zoom control pill */}
          <div
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '9999px',
              padding: '0.375rem 0.75rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '200px',
              justifyContent: 'space-between',
            }}
          >
          <button
            onClick={() => setIsZoomLocked(!isZoomLocked)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f7fafc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            title={isZoomLocked ? 'Unlock zoom' : 'Lock zoom'}
          >
            {isZoomLocked ? (
              <Lock size={18} color="#4a5568" />
            ) : (
              <Unlock size={18} color="#4a5568" />
            )}
          </button>
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: '#4a5568',
            }}
          >
            Zoom: {(zoom * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => {
              setZoom(1)
              // Reset to initial view where -1% is at the left border
              if (canvasRef.current) {
                const minusOnePercentX = ((-1 - CANVAS_MIN_POSITION) / CANVAS_RANGE) * canvasRef.current.offsetWidth * 10
                setPan({ x: -minusOnePercentX, y: 0 })
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f7fafc'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
            }}
            title="Reset zoom to 100%"
          >
            <RotateCcw size={18} color="#4a5568" />
          </button>
        </div>
          {/* Zoom slider */}
          <div
            style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              width: '200px',
            }}
          >
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => {
              const newZoom = parseFloat(e.target.value)
              setZoom(newZoom)
            }}
            disabled={isZoomLocked}
            style={{
              width: '100%',
              cursor: isZoomLocked ? 'not-allowed' : 'pointer',
              opacity: isZoomLocked ? 0.5 : 1,
            }}
          />
          </div>
        </div>
      <div className="flow-canvas-container" onWheel={handleWheel}>
        {isCreatingBranch && (
          <div className="branch-creation-hint">
            Click on the canvas to create a new marker, or click an existing marker to connect
          </div>
        )}
        <div ref={canvasRef} className="flow-canvas" style={{ height: canvasHeight, overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          onMouseDown={handlePanStart}
          style={{ cursor: isPanning ? 'grabbing' : (isCreatingBranch ? 'crosshair' : 'grab') }}
          width={canvasWidth}
          height={canvasHeight}
          className={`flow-svg ${isCreatingBranch ? 'branch-mode' : ''}`}
          onClick={handleCanvasClick}
          clipPath="url(#canvas-clip)"
        >
          <defs>
            {/* Clip path to restrict content to canvas boundaries */}
            <clipPath id="canvas-clip" clipPathUnits="userSpaceOnUse">
              <rect x="0" y="0" width={canvasWidth} height={canvasHeight} />
            </clipPath>
            {/* Define arrow markers for different colors */}
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <polygon
                points="0 0, 10 3, 0 6"
                fill="#667eea"
              />
            </marker>
            {flows.map(flow => {
              const flowColor = flow.color || '#667eea'
              if (flowColor === '#667eea') return null // Skip default color
              return (
                <marker
                  key={`arrowhead-${flow.id}`}
                  id={`arrowhead-${flow.id}`}
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <polygon
                    points="0 0, 10 3, 0 6"
                    fill={flowColor}
                  />
                </marker>
              )
            })}
          </defs>
          
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Gray out area to the left of 0% ticker */}
          {(() => {
            const zeroTickerX = getStageX(0)
            return (
              <rect
                x={-100000}
                y={-10000}
                width={zeroTickerX - (-100000)}
                height={canvasHeight + 20000}
                fill="#f1f5f9"
                fillOpacity={0.6}
                className="grayed-out-left"
              />
            )
          })()}
          
          {/* Gray out area to the right of 100% ticker */}
          {(() => {
            const hundredTickerX = getStageX(100)
            return (
              <rect
                x={hundredTickerX}
                y={-10000}
                width={100000 - hundredTickerX}
                height={canvasHeight + 20000}
                fill="#f1f5f9"
                fillOpacity={0.6}
                className="grayed-out-right"
              />
            )
          })()}
          
          {/* Render horizontal tickers with vertical bars - only show tickers >= 0% and <= 100% */}
          {getTickerPositions()
            .filter(({ position }) => position >= 0 && position <= 100)
            .map(({ position, isMajor }) => {
            const tickerX = getStageX(position)
            
            // Determine label interval based on zoom level
            // Higher zoom = show more labels, lower zoom = show fewer labels
            // With 0.1% resolution, adjust intervals accordingly
            let labelInterval = 10 // Default: show labels every 10%
            if (zoom >= 2) {
              labelInterval = 1 // Very zoomed in: show every 1%
            } else if (zoom >= 1.5) {
              labelInterval = 2 // Zoomed in: show every 2%
            } else if (zoom >= 1) {
              labelInterval = 5 // Normal: show every 5%
            } else if (zoom >= 0.5) {
              labelInterval = 10 // Zoomed out: show every 10%
            } else {
              labelInterval = 20 // Very zoomed out: show every 20%
            }
            
            // Show label if position is a multiple of labelInterval (with 0.1% precision)
            const remainder = Math.abs(position % labelInterval)
            const shouldShowLabel = remainder < 0.05 || Math.abs(remainder - labelInterval) < 0.05
            
            return (
              <g key={`ticker-${position}`} className="ticker">
                {/* Vertical bar across entire canvas */}
                <line
                  x1={tickerX}
                  y1={0}
                  x2={tickerX}
                  y2={canvasHeight}
                  stroke="#e2e8f0"
                  strokeWidth={isMajor ? "3" : "2"}
                  strokeDasharray="4,4"
                  className="ticker-bar"
                />
                {/* Ticker axis at vertical center - larger for major tickers */}
                {(() => {
                  const tickerAxisY = canvasHeight / 2
                  const tickerLineHeight = isMajor ? 50 : 30
                  return (
                    <>
                      <line
                        x1={tickerX}
                        y1={tickerAxisY - tickerLineHeight / 2}
                        x2={tickerX}
                        y2={tickerAxisY + tickerLineHeight / 2}
                        stroke="#cbd5e0"
                        strokeWidth={isMajor ? "6" : "3"}
                        className="ticker-line"
                      />
                      {/* Show labels dynamically based on zoom level */}
                      {shouldShowLabel && (
                        <text
                          x={tickerX}
                          y={tickerAxisY + tickerLineHeight / 2 + 15}
                          textAnchor="middle"
                          fill="#718096"
                          fontSize="10"
                          fontWeight="500"
                          className="ticker-label"
                        >
                          {position.toFixed(1)}%
                        </text>
                      )}
                    </>
                  )
                })()}
              </g>
            )
          })}
          
          {/* Visual indicators when marker is selected */}
          {selectedStageId && (() => {
            const selectedStage = stages.find(s => s.id === selectedStageId)
            if (!selectedStage) return null
            
            // Get all ticker positions to the right of the selected marker
            // Branching shouldn't affect locations - only x coordinate matters
            // Show all positions to the right, regardless of existing markers
            const selectedStageX = getStageX(selectedStage.position)
            const validTickerPositions = getTickerPositions()
              .filter(({ position }) => {
                // Must be >= 0 (no negative tickers shown)
                if (position < 0) return false
                // Must be <= 100 (no positions beyond 100% shown)
                if (position > 100) return false
                // Must have x coordinate greater than selected marker's x coordinate
                const tickerX = getStageX(position)
                const EPSILON_X = 1 // 1 pixel tolerance
                return tickerX > selectedStageX + EPSILON_X
              })
            
            // Get markers that can be linked to (to the right of selected marker)
            const linkableMarkers = stages.filter(s => 
              s.id !== selectedStageId && s.position > selectedStage.position
            )
            
            return (
              <>
                {/* Vertical lines at valid positions for new markers */}
                {validTickerPositions.map(({ position, isMajor }) => {
                  const tickerX = getStageX(position)
                  return (
                    <line
                      key={`valid-position-${position}`}
                      x1={tickerX}
                      y1={0}
                      x2={tickerX}
                      y2={canvasHeight}
                      stroke="#3b82f6"
                      strokeWidth={isMajor ? "2" : "1.5"}
                      strokeDasharray="6,4"
                      opacity={0.6}
                      className="valid-position-line"
                    />
                  )
                })}
                
                {/* Highlight linkable markers */}
                {linkableMarkers.map(marker => {
                  const markerX = getStageX(marker.position)
                  const markerY = getStageY(marker)
                  const nodeHeight = getNodeHeight(marker.id)
                  return (
                    <g key={`linkable-${marker.id}`}>
                      {/* Highlight rectangle around marker */}
                      <rect
                        x={markerX - 20}
                        y={markerY - nodeHeight / 2 - 5}
                        width={40}
                        height={nodeHeight + 10}
                        fill="#3b82f6"
                        fillOpacity={0.2}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        strokeDasharray="4,4"
                        rx={4}
                        className="linkable-marker-highlight"
                      />
                    </g>
                  )
                })}
              </>
            )
          })()}
          
          {/* Render flows */}
          {flows.map(flow => {
            const fromStage = stages.find(s => s.id === flow.fromStageId)
            const toStage = stages.find(s => s.id === flow.toStageId)
            // Only render flows where both stages exist, or show hanging flows (toStage missing)
            if (!fromStage) return null
            // If toStage is missing, the flow is "hanging" - render it pointing to where the stage was
            if (!toStage) {
              // Find the last known position of the deleted stage (we can't do this easily)
              // For now, just don't render hanging flows
              return null
            }

            const fromX = getStageX(fromStage.position)
            const toX = getStageX(toStage.position)
            const fromY = getStageY(fromStage)
            const toY = getStageY(toStage)
            
            // Get node heights for proper alignment
            const fromNodeHeight = getNodeHeight(fromStage.id)
            const toNodeHeight = getNodeHeight(toStage.id)
            
            // Calculate node top edges (node center - half height)
            const fromNodeTop = fromY - fromNodeHeight / 2
            const toNodeTop = toY - toNodeHeight / 2

            // Calculate flow width based on value (Sankey diagram)
            const flowWidth = Math.max(20, flow.value * HEIGHT_SCALE) // 4x minimum and scale

            // Calculate vertical position for flows from same source
            // Flows should stack from top to bottom within the source node
            const flowsFromSameSource = flows
              .filter(f => f.fromStageId === flow.fromStageId)
              .sort((a, b) => (a.branchIndex || 0) - (b.branchIndex || 0))
            
            // Calculate cumulative offset from top of node
            let sourceOffset = 0
            const currentIndex = flowsFromSameSource.findIndex(f => f.id === flow.id)
            for (let i = 0; i < currentIndex; i++) {
              sourceOffset += (flowsFromSameSource[i].value * HEIGHT_SCALE) + FLOW_SPACING // Flow width + spacing
            }
            
            // Position flow center relative to node top
            const sourceFlowCenter = fromNodeTop + sourceOffset + flowWidth / 2

            // Calculate vertical position for flows to same target
            // Sort by vertical position of source markers to avoid criss-crossing
            const flowsToSameTarget = flows
              .filter(f => f.toStageId === flow.toStageId)
              .map(f => {
                const fromStage = stages.find(s => s.id === f.fromStageId)
                return { flow: f, fromY: fromStage ? getStageY(fromStage) : 0 }
              })
              .sort((a, b) => a.fromY - b.fromY) // Sort by source marker vertical position
              .map(item => item.flow)
            
            let targetOffset = 0
            const targetIndex = flowsToSameTarget.findIndex(f => f.id === flow.id)
            for (let i = 0; i < targetIndex; i++) {
              targetOffset += (flowsToSameTarget[i].value * HEIGHT_SCALE) + FLOW_SPACING
            }
            
            // Position flow center relative to node top
            const targetFlowCenter = toNodeTop + targetOffset + flowWidth / 2

            // Connect to right side of fromStage and left side of toStage
            const exitPointX = fromX + 5 // Right edge of rectangular node (marker is 10px wide, so +5 from center)
            const entryPointX = toX - 5 // Left edge of rectangular node (marker is 10px wide, so -5 from center)

            const flowColor = flow.color || '#667eea'

            return (
              <g key={flow.id}>
                <FlowPath
                  fromX={exitPointX}
                  fromY={sourceFlowCenter}
                  toX={entryPointX}
                  toY={targetFlowCenter}
                  width={flowWidth}
                  color={flowColor}
                  label={flow.name}
                  value={flow.value}
                  onClick={(e: React.MouseEvent) => handleFlowClick(flow.id, e)}
                  style={{ pointerEvents: selectedFlowId === flow.id && editingFlow?.id === flow.id ? 'none' : 'auto' }}
                />
              </g>
            )
          })}

          {/* Render stage markers */}
          {/* Render markers without labels first */}
          {sortedStages.map(stage => {
            const minX = getMinXForStage(stage.id)
            const stageY = getStageY(stage)
            const nodeHeight = getNodeHeight(stage.id)
            // Get incoming flows (parent connections) for this stage
            const incomingFlows = flows.filter(f => f.toStageId === stage.id)
            
            // Calculate vertical positions for each incoming flow entry point
            const incomingFlowPositions = incomingFlows.map(flow => {
              // Sort flows to same target by vertical position of source markers to avoid criss-crossing
              const flowsToSameTarget = flows
                .filter(f => f.toStageId === stage.id)
                .map(f => {
                  const fromStage = stages.find(s => s.id === f.fromStageId)
                  return { flow: f, fromY: fromStage ? getStageY(fromStage) : 0 }
                })
                .sort((a, b) => a.fromY - b.fromY) // Sort by source marker vertical position
                .map(item => item.flow)
              
              // Calculate cumulative offset from top of node (same as flow rendering)
              let targetOffset = 0
              const targetIndex = flowsToSameTarget.findIndex(f => f.id === flow.id)
              const flowWidth = Math.max(20, flow.value * HEIGHT_SCALE) // 4x minimum and scale
              
              for (let i = 0; i < targetIndex; i++) {
                targetOffset += (flowsToSameTarget[i].value * HEIGHT_SCALE) + FLOW_SPACING // Flow width + spacing (same as flow rendering)
              }
              
              // Calculate node top edge (same as flow rendering)
              const toNodeTop = stageY - nodeHeight / 2
              
              // Position flow center relative to node top (same as targetFlowCenter in flow rendering)
              const flowY = toNodeTop + targetOffset + flowWidth / 2
              
              return { flowId: flow.id, y: flowY }
            })
            
            const handleDisconnectParent = (flowId: string) => {
              // Remove the flow and recalculate sibling values if needed
              const flow = flows.find(f => f.id === flowId)
              if (!flow) {
                console.warn('Flow not found:', flowId)
                return
              }
              
              const parentStageId = flow.fromStageId
              const disconnectedStageId = flow.toStageId
              
              // Remove the disconnected flow
              let updatedFlows = flows.filter(f => f.id !== flowId)
              
              // Recalculate flow values for remaining siblings from the same parent
              if (parentStageId) {
                updatedFlows = recalculateSiblingFlowValues(parentStageId, updatedFlows)
              }
              
              // Also recalculate flow values for children of the disconnected marker
              // This ensures the entire subtree is updated with correct values
              if (disconnectedStageId) {
                updatedFlows = recalculateSiblingFlowValues(disconnectedStageId, updatedFlows)
              }
              
              onFlowsChange(updatedFlows)
              
              // If this was the last parent connection, the marker becomes a root marker
              // No need to delete the marker, just remove the flow
            }
            
            // Check if this is the root marker (no incoming flows)
            const isRootMarker = incomingFlows.length === 0
            
            return (
              <g key={`marker-wrapper-${stage.id}`}>
                <StageMarker
                  key={stage.id}
                  x={getStageX(stage.position)}
                  y={stageY}
                  stage={stage}
                  height={nodeHeight}
                  onUpdate={handleStageUpdate}
                  onClick={handleStageClick}
                  onDelete={isRootMarker ? undefined : handleStageDelete}
                  onDisconnectParent={handleDisconnectParent}
                  onDrag={handleStageDrag}
                  isSelected={selectedStageId === stage.id}
                  incomingFlows={incomingFlows}
                  incomingFlowPositions={incomingFlowPositions}
                  minX={minX}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  hideLabel={selectedStageId !== stage.id}
                />
              </g>
            )
          })}
          
          {/* Render all labels in a separate group after markers so they appear on top (only for non-selected markers) */}
          <g key="marker-labels">
            {sortedStages
              .filter(stage => selectedStageId !== stage.id) // Only render labels for non-selected markers
              .map(stage => {
                const stageY = getStageY(stage)
                const nodeHeight = getNodeHeight(stage.id)
                const bottomY = stageY + nodeHeight / 2
                
                // Calculate label width (approximate based on text length)
                const textLength = stage.name.length
                const labelWidth = Math.max(40, textLength * 8 + 16)
                
                return (
                  <g 
                    key={`label-${stage.id}`} 
                    transform={`translate(${getStageX(stage.position)}, 0)`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStageClick(stage)
                    }}
                  >
                    {/* Label background */}
                    <rect
                      x={-labelWidth / 2}
                      y={bottomY + 10}
                      width={labelWidth}
                      height={20}
                      fill="white"
                      stroke="#e2e8f0"
                      strokeWidth={1}
                      rx={4}
                      style={{ pointerEvents: 'all', cursor: 'pointer' }}
                    />
                    {/* Label text */}
                    <text
                      x={0}
                      y={bottomY + 25}
                      textAnchor="middle"
                      fill="#1a202c"
                      fontSize="13"
                      fontWeight="500"
                      style={{ cursor: 'text', pointerEvents: 'all' }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        handleStageClick(stage)
                      }}
                    >
                      {stage.name}
                    </text>
                  </g>
                )
              })}
          </g>
          
          {/* Render flow edit form after markers so it appears on top */}
          {flows.map(flow => {
            if (selectedFlowId !== flow.id || !editingFlow) return null
            
            const fromStage = stages.find(s => s.id === flow.fromStageId)
            const toStage = stages.find(s => s.id === flow.toStageId)
            if (!fromStage || !toStage) return null

            const fromX = getStageX(fromStage.position)
            const toX = getStageX(toStage.position)
            const fromY = getStageY(fromStage)
            const toY = getStageY(toStage)
            
            const fromNodeHeight = getNodeHeight(fromStage.id)
            const toNodeHeight = getNodeHeight(toStage.id)
            const fromNodeTop = fromY - fromNodeHeight / 2
            const toNodeTop = toY - toNodeHeight / 2
            const flowWidth = Math.max(20, flow.value * HEIGHT_SCALE)
            
            const flowsFromSameSource = flows
              .filter(f => f.fromStageId === flow.fromStageId)
              .sort((a, b) => (a.branchIndex || 0) - (b.branchIndex || 0))
            
            let sourceOffset = 0
            const currentIndex = flowsFromSameSource.findIndex(f => f.id === flow.id)
            for (let i = 0; i < currentIndex; i++) {
              sourceOffset += (flowsFromSameSource[i].value * HEIGHT_SCALE) + FLOW_SPACING
            }
            const sourceFlowCenter = fromNodeTop + sourceOffset + flowWidth / 2

            const flowsToSameTarget = flows
              .filter(f => f.toStageId === flow.toStageId)
              .sort((a, b) => (a.branchIndex || 0) - (b.branchIndex || 0))
            
            let targetOffset = 0
            const targetIndex = flowsToSameTarget.findIndex(f => f.id === flow.id)
            for (let i = 0; i < targetIndex; i++) {
              targetOffset += (flowsToSameTarget[i].value * HEIGHT_SCALE) + FLOW_SPACING
            }
            const targetFlowCenter = toNodeTop + targetOffset + flowWidth / 2

            const exitPointX = fromX + 5 // Right edge of rectangular node (marker is 10px wide, so +5 from center)
            const entryPointX = toX - 5 // Left edge of rectangular node (marker is 10px wide, so -5 from center)
            const midX = (exitPointX + entryPointX) / 2
            const midY = (sourceFlowCenter + targetFlowCenter) / 2

            return (
              <foreignObject
                key={`flow-edit-${flow.id}`}
                x={midX - 160}
                y={midY - 90}
                width="320"
                height="200"
                style={{ pointerEvents: 'all', overflow: 'visible' }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="flow-edit-modal"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onMouseMove={(e) => {
                    // Prevent closing modal during text selection
                    const selection = window.getSelection()
                    if (selection && selection.toString().length > 0) {
                      e.stopPropagation()
                    }
                  }}
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: 'fit-content',
                  }}
                >
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a202c',
                      marginBottom: '4px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Flow
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{
                        fontSize: '14px',
                        color: '#64748b',
                        fontWeight: '500',
                        minWidth: '80px',
                        flexShrink: '0',
                      }}
                    >
                      Name:
                    </label>
                    <input
                      type="text"
                      value={editingFlow.name}
                      onChange={(e) =>
                        setEditingFlow({ ...editingFlow, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.stopPropagation()
                          handleFlowUpdate()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditingFlow(null)
                          setSelectedFlowId(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onMouseMove={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        // Don't close modal on blur if text is being selected
                        const selection = window.getSelection()
                        if (selection && selection.toString().length > 0) {
                          e.preventDefault()
                          e.stopPropagation()
                          // Re-focus to keep selection
                          setTimeout(() => e.target.focus(), 0)
                        }
                        e.target.style.borderColor = '#e2e8f0'
                      }}
                      onSelect={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        e.stopPropagation()
                        e.target.style.borderColor = '#667eea'
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        flex: '1',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      placeholder="Flow name"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{
                        fontSize: '14px',
                        color: '#64748b',
                        fontWeight: '500',
                        minWidth: '80px',
                        flexShrink: '0',
                      }}
                    >
                      Importance:
                    </label>
                    <input
                      type="number"
                      value={editingFlow.value}
                      onChange={(e) =>
                        setEditingFlow({ ...editingFlow, value: Number(e.target.value) })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.stopPropagation()
                          handleFlowUpdate()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditingFlow(null)
                          setSelectedFlowId(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        e.stopPropagation()
                        e.target.style.borderColor = '#667eea'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        flex: '1',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="0-100"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleFlowUpdate()
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Save changes"
                      style={{
                        padding: '8px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#5568d3'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#667eea'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingFlow(null)
                        setSelectedFlowId(null)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Cancel"
                      style={{
                        padding: '8px',
                        background: '#f1f5f9',
                        color: '#64748b',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e2e8f0'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </foreignObject>
            )
          })}
          
          {/* Render stage edit modal after flows so it appears on top */}
          {editingStage && (() => {
            const stage = stages.find(s => s.id === editingStage.id)
            if (!stage) return null
            
            const stageX = getStageX(stage.position)
            const stageY = getStageY(stage)
            
            // Position modal to the right of the marker
            const modalX = stageX + 20
            const modalY = stageY - 100
            
            // Check if this is the root marker (no incoming flows)
            const incomingFlows = flows.filter(f => f.toStageId === stage.id)
            const isRootMarker = incomingFlows.length === 0
            
            // Modal dimensions
            const modalWidth = 320
            const modalHeight = isRootMarker ? 220 : 240
            const modalPadding = 20
            
            // Calculate position ensuring modal stays within canvas bounds
            const visibleMinX = -pan.x / zoom
            const visibleMaxX = (canvasWidth - pan.x) / zoom
            const visibleMinY = -pan.y / zoom
            const visibleMaxY = (canvasHeight - pan.y) / zoom
            
            let finalModalX = modalX
            let finalModalY = modalY
            
            // Adjust X position if modal goes outside visible area
            if (finalModalX < visibleMinX + modalPadding) {
              finalModalX = visibleMinX + modalPadding
            } else if (finalModalX + modalWidth > visibleMaxX - modalPadding) {
              finalModalX = visibleMaxX - modalWidth - modalPadding
            }
            
            // Adjust Y position if modal goes outside visible area
            if (finalModalY < visibleMinY + modalPadding) {
              finalModalY = visibleMinY + modalPadding
            } else if (finalModalY + modalHeight > visibleMaxY - modalPadding) {
              finalModalY = visibleMaxY - modalHeight - modalPadding
            }
            
            return (
              <foreignObject
                key={`stage-edit-${editingStage.id}`}
                x={finalModalX}
                y={finalModalY}
                width={modalWidth}
                height={modalHeight}
                style={{ pointerEvents: 'all', overflow: 'visible' }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="stage-edit-modal"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onMouseMove={(e) => {
                    const selection = window.getSelection()
                    if (selection && selection.toString().length > 0) {
                      e.stopPropagation()
                    }
                  }}
                  style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 10px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: 'fit-content',
                  }}
                >
                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: '#1a202c',
                      marginBottom: '4px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    Stage
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label
                      style={{
                        fontSize: '14px',
                        color: '#64748b',
                        fontWeight: '500',
                        minWidth: '80px',
                        flexShrink: '0',
                      }}
                    >
                      Name:
                    </label>
                    <input
                      type="text"
                      value={editingStage.name}
                      onChange={(e) =>
                        setEditingStage({ ...editingStage, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.stopPropagation()
                          handleStageModalUpdate()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditingStage(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        e.stopPropagation()
                        e.target.style.borderColor = '#667eea'
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        flex: '1',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                      }}
                      placeholder="Marker name"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <label
                      style={{
                        fontSize: '14px',
                        color: '#64748b',
                        fontWeight: '500',
                        minWidth: '80px',
                        flexShrink: '0',
                        paddingTop: '8px',
                      }}
                    >
                      Description:
                    </label>
                    <textarea
                      value={editingStage.description || ''}
                      onChange={(e) =>
                        setEditingStage({ ...editingStage, description: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          e.stopPropagation()
                          setEditingStage(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => {
                        e.stopPropagation()
                        e.target.style.borderColor = '#667eea'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0'
                      }}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        fontSize: '14px',
                        flex: '1',
                        minHeight: '50px',
                        maxHeight: '80px',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      }}
                      placeholder="Description (optional)"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {!isRootMarker && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStageModalDelete()
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="Delete marker"
                        style={{
                          padding: '8px',
                          background: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fecaca'
                          e.currentTarget.style.transform = 'scale(1.05)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = '#fee2e2'
                          e.currentTarget.style.transform = 'scale(1)'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedStageId(editingStage.id)
                        setIsCreatingBranch(true)
                        setEditingStage(null)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Link to another marker"
                      style={{
                        padding: '8px',
                        background: '#dbeafe',
                        color: '#2563eb',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#bfdbfe'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#dbeafe'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <Link size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedStageId(editingStage.id)
                        setIsCreatingBranch(true)
                        setEditingStage(null)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Create branch"
                      style={{
                        padding: '8px',
                        background: '#d1fae5',
                        color: '#059669',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#a7f3d0'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#d1fae5'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <GitBranch size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStageModalUpdate()
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Save changes"
                      style={{
                        padding: '8px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#5568d3'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#667eea'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingStage(null)
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title="Cancel"
                      style={{
                        padding: '8px',
                        background: '#f1f5f9',
                        color: '#64748b',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#e2e8f0'
                        e.currentTarget.style.transform = 'scale(1.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f1f5f9'
                        e.currentTarget.style.transform = 'scale(1)'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </foreignObject>
            )
          })()}
          </g>
        </svg>
        </div>
      </div>
    </>
  )
}

