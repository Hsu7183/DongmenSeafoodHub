/* eslint-disable @next/next/no-img-element -- This Vite portal serves bundled static images without a Next.js runtime. */
import { useState } from 'react';
import type { Product } from './types';

// Original AI illustrations for demo records only; never imply supplier photography.
const demoProductImages: Record<string, string> = {
  'demo-mackerel': '/products/demo-mackerel.png',
  'demo-salmon': '/products/demo-salmon.png',
  'demo-tilapia': '/products/demo-tilapia.png',
  'demo-tiger-shrimp': '/products/demo-tiger-shrimp.png',
  'demo-white-shrimp': '/products/demo-white-shrimp.png',
  'demo-squid': '/products/demo-squid.png',
  'demo-fish-belly': '/products/demo-fish-belly.png',
  'demo-whitebait': '/products/demo-whitebait.png',
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
