import assert from "node:assert/strict";
import test from "node:test";
async function render(){const u=new URL("../dist/server/index.js",import.meta.url);u.searchParams.set("test",`${process.pid}-${Date.now()}`);const{default:worker}=await import(u.href);return worker.fetch(new Request("http://localhost/",{headers:{accept:"text/html"}}),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}})}
test("server-renders the Dozi creator workspace",async()=>{const response=await render();assert.equal(response.status,200);const html=await response.text();assert.match(html,/Dozi Music Studio/i);assert.match(html,/Song Blueprint/i);assert.match(html,/Mock engine/i);assert.doesNotMatch(html,/codex-preview/)});
