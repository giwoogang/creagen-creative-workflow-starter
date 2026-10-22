import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const brand = { brandName:'테스트 브랜드', productName:'테스트 세럼', description:'30mL', tone:'담백하게', avoid:'과장' };
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4xkAAAAASUVORK5CYII=';

test('초보자 흐름과 입력 보존, 제품 정보 분리, 결과 재실험', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'creative-lab-test-'));
  const socket = net.createServer();
  socket.listen(0,'127.0.0.1'); await once(socket,'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,CREATIVE_LAB_PORT:String(port),CREATIVE_LAB_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('서버 실행 시간 초과')),5000);t.unref();})]);
  }
  async function stop() { if(child?.exitCode===null) { const done=once(child,'exit');child.kill();await done; } }
  async function api(route,method='GET',body,expected=200,headers={}) {
    const res=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await res.json(); assert.equal(res.status,expected,JSON.stringify(data)); return data;
  }
  try {
    await start();
    const initial=await api('/api/state');assert.equal(initial.assets.length,0);
    const sample=await api('/api/sample','POST',{});
    assert.equal(sample.sampleAssetIds.length,1);assert.equal(sample.brand.brandName,'');
    const duplicate=await api('/api/sample','POST',{});assert.equal(duplicate.assets.length,1);
    const id=sample.sampleAssetIds[0];
    const longDescription='가'.repeat(5000);
    const saved=await api('/api/brand','PUT',{...brand,description:longDescription});
    assert.equal(saved.description,longDescription);
    await api('/api/brand','PUT',{...brand,description:longDescription+'가'},400);
    assert.equal((await api('/api/state')).brand.description,longDescription);
    assert.equal((await api('/api/sample','POST',{})).brand.brandName,brand.brandName);
    const base={brand,kind:'image',assetIds:[id],brief:'제품이 잘 보이는 사진',preset:'product'};
    await api('/api/requests','POST',{...base,brand:null},400);
    await api('/api/requests','POST',{...base,preset:'reference'},400);
    await api('/api/requests','POST',{...base,assetIds:[]},400);
    const first=await api('/api/requests','POST',{...base,brief:'나'.repeat(10000)},201);
    assert.equal(first.brief.length,10000);
    await api('/api/requests','POST',{...base,brief:'나'.repeat(10001)},400);
    const concurrent=await Promise.all(['A','B','C'].map(label=>api('/api/requests','POST',{...base,brand:{...brand,productName:label},brief:label},201)));
    concurrent.forEach(r=>assert.equal(r.brand.productName,r.brief));
    await api(`/api/requests/${first.id}/feedback`,'POST',{text:'제품을 크게'},400);
    const result=await api(`/api/requests/${first.id}/results`,'POST',{name:'실제 결과.png',dataBase64:png},201);
    assert.equal(result.status,'results_added');assert.equal(result.outputs.length,1);
    assert.equal(result.outputs[0].source,'manual_upload');
    assert.equal((await fetch(url+result.outputs[0].url)).status,200);
    const context=await api(`/api/requests/${first.id}/context`);
    assert.equal(context.outputs.length,1);assert.equal(context.generation.status,'not_started');
    await api(`/api/requests/${first.id}/feedback`,'POST',{text:'제품 크기만 더 크게'});
    const draftFeedback='제품 크기만 더 크게';
    await api(`/api/requests/${first.id}/feedback`,'POST',{text:'배경만 수정'});
    const next=await api('/api/requests','POST',{...base,parentRequestId:first.id,parentFeedbackText:draftFeedback,brief:draftFeedback},201);
    const nextContext=await api(`/api/requests/${next.id}/context`);
    assert.equal(nextContext.parent.requestId,first.id);
    assert.equal(nextContext.parent.outputs.length,1);
    assert.equal(nextContext.parent.feedback.text,'제품 크기만 더 크게');
    assert.equal(next.outputs.length,0);assert.equal(next.status,'prepared');
    await api('/api/assets/'+id,'DELETE',undefined,409);
    await api('/api/brand','PUT',brand,403,{Origin:'https://example.com'});
    const state=await api('/api/state');
    await stop(); await start();
    const recovered=await api('/api/state');
    assert.equal(recovered.requests.length,state.requests.length);
    assert.equal(recovered.requests.find(r=>r.id===first.id).outputs.length,1);
    const stored=JSON.parse(await readFile(next.contextPath,'utf8'));
    assert.equal(stored.parent.feedback.text,'제품 크기만 더 크게');
  } finally { await stop(); await rm(dir,{recursive:true,force:true}); }
});
