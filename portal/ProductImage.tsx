/* eslint-disable @next/next/no-img-element -- This Vite portal serves bundled static images without a Next.js runtime. */
import { useState } from 'react';
import type { Product } from './types';

// Original AI illustrations for demo records only; never imply supplier photography.
const demoProductImages: Record<string, string> = {
  'demo-mackerel': '/products/demo-mackerel.webp',
  'demo-salmon': '/products/demo-salmon.webp',
  'demo-tilapia': '/products/demo-tilapia.webp',
  'demo-tiger-shrimp': '/products/demo-tiger-shrimp.webp',
  'demo-white-shrimp': '/products/demo-white-shrimp.webp',
  'demo-squid': '/products/demo-squid.webp',
  'demo-fish-belly': '/products/demo-fish-belly.webp',
  'demo-whitebait': '/products/demo-whitebait.webp',
};

export function ProductImage({ product }: { product: Pick<Product, 'id' | 'name' | 'demo'> }) {
  const [failed, setFailed] = useState(false);
  const src = product.demo === 1 ? demoProductImages[product.id] : undefined;

  return <figure className="product-photo">
    {src && !failed ? <>
      <img src={src} alt={`${product.name}食材示意圖，AI 生成，非供應商實拍`}
        width={480} height={360} loading="lazy" decoding="async"
        onError={() => setFailed(true)} />
      <figcaption>AI 示意圖</figcaption>
    </> : <span className="photo-unavailable">圖片待補</span>}
  </figure>;
}
