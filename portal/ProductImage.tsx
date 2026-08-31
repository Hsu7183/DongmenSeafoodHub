/* eslint-disable @next/next/no-img-element -- This Vite portal serves bundled static images without a Next.js runtime. */
import { useState } from 'react';
import type { Product } from './types';
import { productImages } from './product-images';

export function ProductImage({ product }: { product: Pick<Product, 'id' | 'name' | 'demo'> }) {
  const [failed, setFailed] = useState(false);
  const source = product.demo === 1 ? productImages[product.id] : undefined;

  return <figure className="product-photo">
    {source ? <>
      <div className="product-photo-frame">
        {failed ? <span className="photo-unavailable">圖片暫時無法載入</span> :
          <img src={source.src} alt={`昊鼎官網商品圖片：${source.sourceTitle}`}
            width={source.width} height={source.height} loading="lazy" decoding="async"
            onError={() => setFailed(true)} />}
      </div>
    </> : <span className="photo-unavailable">圖片待補</span>}
  </figure>;
}
