import { useEffect, useRef, useState } from 'react';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from 'd3-zoom';

export interface ZoomState {
  k: number;
  x: number;
  y: number;
}

export const IDENTITY: ZoomState = { k: 1, x: 0, y: 0 };

/** The transform string to hang on the group holding the diagram. */
export function zoomTransform(t: ZoomState): string {
  return `translate(${t.x}, ${t.y}) scale(${t.k})`;
}

/** Apply the current zoom to a point in diagram space — for placing DOM overlays
 * (the node menu) that live outside the transformed group. */
export function applyZoom(t: ZoomState, x: number, y: number): [number, number] {
  return [x * t.k + t.x, y * t.k + t.y];
}

/**
 * Wheel-to-zoom and drag-to-pan on an SVG element. D3 owns the gesture maths and
 * nothing else — the transform is handed back as React state and applied by a
 * React-rendered <g>, so D3 never touches the DOM React owns.
 */
export function useZoom(extent: [number, number] = [0.4, 6], ignoreSelector?: string) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [transform, setTransform] = useState<ZoomState>(IDENTITY);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const behaviour = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent(extent)
      // D3 binds natively to the svg, so its listener runs before React's
      // synthetic handlers can stopPropagation. Dragging a node therefore has
      // to be excluded here, at the gesture filter, or it pans the whole graph.
      .filter((event: MouseEvent & { type: string; button: number }) => {
        if (event.type !== 'wheel' && event.ctrlKey) return false;
        if (event.button) return false;
        if (ignoreSelector && event.type !== 'wheel') {
          const target = event.target as Element | null;
          if (target?.closest?.(ignoreSelector)) return false;
        }
        return true;
      })
      .on('zoom', (event: { transform: ZoomTransform }) => {
        const { k, x, y } = event.transform;
        setTransform({ k, x, y });
      });
    const selection = select(el);
    selection.call(behaviour);
    // The double-click-to-zoom default fights click-to-pin on a node.
    selection.on('dblclick.zoom', null);
    return () => {
      selection.on('.zoom', null);
    };
  }, [extent[0], extent[1], ignoreSelector]);

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    select(el).call(d3zoom<SVGSVGElement, unknown>().transform, zoomIdentity);
    setTransform(IDENTITY);
  };

  return { ref, transform, reset };
}
