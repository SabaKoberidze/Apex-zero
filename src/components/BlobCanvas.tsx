import { useEffect, useRef } from 'react';
import { BlobRenderer } from '../three/BlobRenderer';
import type { View } from '../three/BlobRenderer';
import type { Traits } from '../three/traits';

export function BlobCanvas({ traits, view }: { traits: Traits; view: View }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BlobRenderer | null>(null);
  const latest = useRef({ traits, view });
  latest.current = { traits, view };

  useEffect(() => {
    if (!canvasRef.current) return;
    const r = new BlobRenderer(canvasRef.current, latest.current.traits);
    r.setView(latest.current.view);
    rendererRef.current = r;
    r.start();
    return () => {
      r.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => { rendererRef.current?.setTraits(traits); }, [traits]);
  useEffect(() => { rendererRef.current?.setView(view); }, [view]);

  return <canvas ref={canvasRef} />;
}
