export interface Stage {
  id: string;
  name: string;
  position: number; // x position from left (0-100 or pixel value)
  yPosition?: number; // y position from top (in pixels, optional - defaults to center)
  color?: string;
}

export interface Flow {
  id: string;
  name: string;
  fromStageId: string;
  toStageId: string;
  value: number; // Flow value/quantity for Sankey diagram (determines width)
  branchIndex?: number; // For multiple branches from same stage
  color?: string;
}

