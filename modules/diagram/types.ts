/**
 * Shared diagram report types used by the browser viewer and headless render.
 */
export type DiagramNodeReport = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: string;
};

export type DiagramEdgeReport = {
  id: string;
  label: string;
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  style: string;
};

export type DiagramReport = {
  generatedAt: string;
  vertexCount: number;
  edgeCount: number;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  labels: string[];
  nodes: DiagramNodeReport[];
  edges: DiagramEdgeReport[];
};
