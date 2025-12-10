/**
 * Token Image Component
 * Handles image loading with automatic fallback chain
 * Falls back to CDN, then to SVG placeholder
 */

import { useState, useEffect } from 'react';
import {
  getTokenImagePath,
  getTokenImageFallback,
  getDefaultTokenImage,
  markImageFailed,
  type Token
} from '../lib/price-utils';

interface TokenImageProps {
  /** Token symbol (BNB, USDT, USDC, USD1, WUSD, XUSD) */
  token: Token | string;
  /** CSS class name for styling */
  className?: string;
  /** Image alt text */
  alt?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** Additional style object */
  style?: React.CSSProperties;
}

/**
 * TokenImage Component
 * Automatically handles image loading failures with fallback chain:
 * 1. Primary local image (e.g., /bnblogo.png)
 * 2. CDN fallback (e.g., CoinGecko)
 * 3. Default SVG placeholder
 */
export function TokenImage({
  token,
  className = '',
  alt,
  width = 32,
  height = 32,
  style,
}: TokenImageProps) {
  const [currentSrc, setCurrentSrc] = useState(() => getTokenImagePath(token));
  const [hasError, setHasError] = useState(false);
  const [fallbackLevel, setFallbackLevel] = useState(0); // 0 = primary, 1 = CDN fallback, 2 = SVG

  // Reset when token changes
  useEffect(() => {
    setCurrentSrc(getTokenImagePath(token));
    setHasError(false);
    setFallbackLevel(0);
  }, [token]);

  // Handle image load error
  const handleError = () => {
    // Mark current source as failed
    markImageFailed(currentSrc);

    if (fallbackLevel === 0) {
      // Try CDN fallback
      const fallback = getTokenImageFallback(token);
      setCurrentSrc(fallback);
      setFallbackLevel(1);
    } else if (fallbackLevel === 1) {
      // Try default SVG
      setCurrentSrc(getDefaultTokenImage());
      setFallbackLevel(2);
      setHasError(true);
    }
  };

  // Handle successful load - cache in browser
  const handleLoad = () => {
    // Image loaded successfully, no action needed
    // Browser will cache it automatically
  };

  return (
    <img
      src={currentSrc}
      alt={alt || `${token} token`}
      className={`${className} ${hasError ? 'token-image-fallback' : ''}`}
      width={width}
      height={height}
      style={{
        ...style,
        // Ensure image is always visible and properly sized
        objectFit: 'contain',
        minWidth: width,
        minHeight: height,
      }}
      onError={handleError}
      onLoad={handleLoad}
      loading="lazy" // Lazy load for performance
      decoding="async" // Non-blocking decode
    />
  );
}

/**
 * TokenImagePreloader Component
 * Invisible component that preloads all token images
 * Place at the top of your app for best performance
 */
export function TokenImagePreloader() {
  const tokens: Token[] = ['BNB', 'USDT', 'USDC', 'USD1', 'WUSD', 'XUSD'];

  useEffect(() => {
    tokens.forEach(token => {
      // Preload primary
      const img1 = new Image();
      img1.src = getTokenImagePath(token);

      // Preload fallback
      const img2 = new Image();
      img2.src = getTokenImageFallback(token);
    });
  }, []);

  // Render nothing - this is just for preloading
  return null;
}

export default TokenImage;
