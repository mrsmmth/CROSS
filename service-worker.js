const CACHE = "three-pitch-v31";
const ASSETS = ["./","./index.html","./style.css?v=31","./app.js?v=31","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim();});
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;}).catch(async()=>{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==="navigate")return caches.match("./index.html");throw new Error("Offline asset unavailable");}));});
