# 2D Flow Visualization

A modern web application for visualizing application flows from left to right with interactive CRUD operations for stages, flows, and sections.

## Features

- **Stages (Markers)**: Create, read, update, and delete stages positioned from left to right
- **Flows (Paths)**: Create, read, update, and delete flows between stages with branching support
- **Multiple Branches**: Support for multiple flows branching from the same stage
- **Horizontal Accordions**: Expandable/collapsible sections between markers
- **Modern UI**: Beautiful, responsive interface with smooth animations

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Usage

### Managing Stages

1. Click on the "Stages" tab in the control panel
2. Click "Create Stage" to add a new stage marker
3. Click the edit icon to modify stage name, position (0-100%), or color
4. Click the delete icon to remove a stage

### Managing Flows

1. Click on the "Flows" tab in the control panel
2. Click "Create Flow" to add a new flow path between stages
3. Edit flows to change source/target stages, name, or color
4. Multiple flows from the same stage will automatically branch

### Managing Sections

1. Click on the "Sections" tab in the control panel
2. Click "Create Section" to add an accordion between stages
3. Click on a section in the canvas to expand/collapse it
4. When expanded, you can add content to the section

## Project Structure

```
src/
  components/
    FlowCanvas.tsx      # Main visualization canvas
    StageMarker.tsx     # Stage marker component
    FlowPath.tsx        # Flow path component
    SectionAccordion.tsx # Horizontal accordion component
    ControlPanel.tsx    # CRUD operations panel
  types.ts              # TypeScript type definitions
  App.tsx               # Main application component
```

## Technologies

- React 18
- TypeScript
- Vite
- Lucide React (icons)
- CSS3 (styling)


