import {ensureDatabase} from './database';
import {authRoute} from './auth';
import {ordersRoute} from './orders';
import {purchasingRoute} from './purchasing';
import {ApiError,json,type Env} from './server-common';
const prepared=new WeakMap<object,Promise<void>>();
export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/')){
      const route=['/','/order','/quick-order','/stats','/login','/my-orders'].includes(url.pathname)||url.pathname.startsWith('/receipt/')||url.pathname.startsWith('/admin');
      const response=await env.ASSETS.fetch(route?new Request(new URL('/',request.url),request):request);
      if(!response.headers.get('Content-Type')?.includes('text/html'))return response;
      let html=await response.text();
      const privatePage=url.pathname.startsWith('/receipt/')||url.pathname.startsWith('/admin')||url.pathname==='/my-orders';
      const trusted=url.hostname.endsWith('.chatgpt.site')||['127.0.0.1','localhost'].includes(url.hostname);
      if(privatePage)html=html.replace(/<meta (?:property="og:image"|name="twitter:image")[^>]*>/g,'').replaceAll('東門市場・食材訂購','東門市場｜私人訂單').replaceAll('下單、列印 PDF、商品數量總表。','請登入後查看。').replace('</head>','<meta name="robots" content="noindex,nofollow"/></head>');
      else if(trusted&&!html.includes('property="og:image"'))html=html.replace('</head>',`<meta property="og:image" content="${url.origin}/og.png"/><meta name="twitter:image" content="${url.origin}/og.png"/></head>`);
      const headers=new Headers(response.headers);headers.set('Cache-Control','no-store');headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');return new Response(html,{status:response.status,headers});
    }
    try{
      if(url.pathname==='/api/health')return json({ok:true,service:'dongmen-portal'});
      if(!env.DB)throw new ApiError(503,'資料庫暫時無法使用');
      if(!prepared.has(env.DB))prepared.set(env.DB,ensureDatabase(env.DB).catch(e=>{prepared.delete(env.DB);throw e;}));await prepared.get(env.DB);
      const path=url.pathname.replace(/^\/api\/portal\//,'');
      return await authRoute(request,env,path)||await ordersRoute(request,env,path)||await purchasingRoute(request,env,path)||json({error:'找不到這個功能'},404);
    }catch(e){
      if(!(e instanceof ApiError))console.error('Portal failure',e instanceof Error?e.message:'unknown');
      return json({error:e instanceof ApiError?e.message:'暫時無法完成，請稍後重試；尚未確認成功的操作不會顯示成功'},e instanceof ApiError?e.status:500);
    }
  },
};
