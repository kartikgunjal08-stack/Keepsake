import {useEffect, useRef, useState} from 'react';

interface ScratchCardProps {
  label: string;
  secretText: string;
  accentColor: string;
  isDarkSurface: boolean;
}

export function ScratchCard({label, secretText, accentColor, isDarkSurface}: ScratchCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isScratching, setIsScratching] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const drawFoil = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = 'source-over';

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#D4D4D8');
    grad.addColorStop(0.5, '#A1A1AA');
    grad.addColorStop(1, '#E4E4E7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle diagonal foil grain lines
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    for (let i = -h; i < w + h; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }

    ctx.fillStyle = '#27272A';
    ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RUB HERE TO SCRATCH', w / 2, h / 2);
  };

  useEffect(() => {
    setRevealed(false);
    drawFoil();
  }, [secretText, label]);

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * canvas.width;
    const y = ((clientY - rect.top) / rect.height) * canvas.height;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // Sample pixel alpha periodically to auto-complete reveal after ~45% scratched
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let cleared = 0;
    const step = 32;
    let sampled = 0;
    for (let i = 3; i < imgData.length; i += 4 * step) {
      sampled++;
      if (imgData[i] < 40) cleared++;
    }
    if (sampled > 0 && cleared / sampled > 0.45) {
      setRevealed(true);
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold ${isDarkSurface ? 'text-stone-300' : 'text-stone-700'}`}>
          {label}
        </p>
        {!revealed && (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="text-[11px] font-medium underline underline-offset-2 opacity-75 hover:opacity-100 whitespace-nowrap shrink-0"
          >
            Tap to reveal
          </button>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-xl border p-5 min-h-[132px] flex items-center justify-center text-center ${
          isDarkSurface
            ? 'border-stone-700 bg-stone-900 text-stone-100'
            : 'border-stone-300 bg-white text-stone-900'
        }`}
      >
        <div className="space-y-2 px-2">
          <p
            className="font-mono text-[10px] font-semibold uppercase tracking-widest"
            style={{color: accentColor}}
          >
            Secret Note Unlocked
          </p>
          <p className="font-display text-base leading-relaxed font-semibold">{secretText}</p>
        </div>

        {!revealed && (
          <canvas
            ref={canvasRef}
            width={340}
            height={140}
            onPointerDown={(e) => {
              setIsScratching(true);
              scratchAt(e.clientX, e.clientY);
            }}
            onPointerMove={(e) => {
              if (isScratching) scratchAt(e.clientX, e.clientY);
            }}
            onPointerUp={() => setIsScratching(false)}
            onPointerLeave={() => setIsScratching(false)}
            className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          />
        )}
      </div>
    </div>
  );
}
