/**
 * QR Code Display Component
 * Renders a QR code for gift card redemption
 */

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  className?: string;
}

export function QRCodeDisplay({ value, size = 200, className = '' }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      }).catch((err) => {
        console.error('QR Code generation error:', err);
      });
    }
  }, [value, size]);

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export default QRCodeDisplay;
