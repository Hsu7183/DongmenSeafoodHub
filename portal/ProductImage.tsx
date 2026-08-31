/* eslint-disable @next/next/no-img-element -- This Vite portal serves bundled static images without a Next.js runtime. */
import { useState } from 'react';
import type { Product } from './types';
import { productImages } from './product-images';

export function ProductImage({ product }: { product: Pick<Product, 'id' | 'name' | 'demo'> }) {
  const [failed, setFailed] = useState(false);
  const source = product.demo === 1 ? productImages[product.id] : undefined;

  return <figure className="product-photo">
    {source ? <>
      <a className="product-photo-link" href={source.sourceUrl} target="_blank" rel="noopener noreferrer"
        aria-label={`${source.sourceTitle}：開啟昊鼎官網商品頁（另開視窗）`}>
        {failed ? <span className="photo-unavailable">圖片暫時無法載入</span> :
          <img src={source.src} alt={`昊鼎官網商品圖片：${source.sourceTitle}`}
            width={source.width} height={source.height} loading="lazy" decoding="async"
            onError={() => setFailed(true)} />}
      </a>
      <figcaption>昊鼎官網 ↗</figcaption>
    </> : <span className="photo-unavailable">官網圖片待補</span>}
  </figure>;
}
