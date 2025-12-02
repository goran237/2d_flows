import React from 'react'
import './FlowPath.css'

interface FlowPathProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
  width: number // Width of the flow band (proportional to value)
  color: string
  label?: string
  value?: number
  onClick?: (e: React.MouseEvent) => void
  style?: React.CSSProperties
}

export default function FlowPath({
  fromX,
  fromY,
  toX,
  toY,
  width,
  color,
  label,
  value,
  onClick,
  style,
}: FlowPathProps) {
  const midX = (fromX + toX) / 2
  const midY = (fromY + toY) / 2
  const halfWidth = width / 2

  // Create control points for smooth curves
  const controlPoint1X = fromX + (toX - fromX) * 0.4
  const controlPoint2X = fromX + (toX - fromX) * 0.6

  // Create the Sankey flow band as a filled path (ribbon shape)
  // Top edge: curve from start to end
  const topStartY = fromY - halfWidth
  const topEndY = toY - halfWidth
  const topPath = `M ${fromX} ${topStartY} C ${controlPoint1X} ${topStartY}, ${controlPoint2X} ${topEndY}, ${toX} ${topEndY}`
  
  // Bottom edge: curve from end to start (reversed)
  const bottomStartY = toY + halfWidth
  const bottomEndY = fromY + halfWidth
  const bottomPath = `L ${toX} ${bottomStartY} C ${controlPoint2X} ${bottomStartY}, ${controlPoint1X} ${bottomEndY}, ${fromX} ${bottomEndY} Z`
  
  const bandPath = `${topPath} ${bottomPath}`

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClick?.(e)
  }

  return (
    <g className="flow-path" onClick={handleClick} style={{ cursor: onClick ? 'pointer' : 'default', ...style }}>
      <path
        d={bandPath}
        fill={color}
        fillOpacity={0.6}
        stroke={color}
        strokeWidth="1"
        className="sankey-flow"
      />
      {label && (
        <text
          x={midX}
          y={midY - halfWidth - 5}
          textAnchor="middle"
          className="flow-label"
          fill="#4a5568"
          fontSize="11"
          fontWeight="500"
          pointerEvents="none"
        >
          {label}
        </text>
      )}
      {value !== undefined && (
        <text
          x={midX}
          y={midY}
          textAnchor="middle"
          className="flow-value"
          fill="#2d3748"
          fontSize="10"
          fontWeight="600"
          pointerEvents="none"
        >
          {value.toFixed(2)}%
        </text>
      )}
    </g>
  )
}

