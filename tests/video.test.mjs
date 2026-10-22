import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { videoType, videoOptionsInput, MAX_VIDEO_BYTES } from '../lib/video.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4xkAAAAASUVORK5CYII=';
function box(type, payload) { const header = Buffer.alloc(8); header.writeUInt32BE(payload.length + 8); header.write(type,4); return Buffer.concat([header,payload]); }
// Minimal container signatures exercise validation and range delivery, not playback or generation.
const mp4 = Buffer.concat([box('ftyp',Buffer.from('isom\x00\x00\x00\x00isommp42')),box('mdat',Buffer.from('local fixture media bytes'))]);
const webm = Buffer.from([0x1a,0x45,0xdf,0xa3,0x8b,0x42,0x82,0x84,0x77,0x65,0x62,0x6d,0x42,0x87,0x81,0x04,0x18,0x53,0x80,0x67,0xff,0,1,2,3,4]);

test('영상 설정과 실제 파일 헤더 검사', () => {
  assert.deepEqual(videoOptionsInput(),{durationSeconds:20,aspectRatio:'9:16',style:'ugc'});
  for (const bad of [null,[],{durationSeconds:'20'},{durationSeconds:60},{aspectRatio:'4:3'},{style:'other'}]) assert.throws(()=>videoOptionsInput(bad));
  assert.deepEqual(videoType(mp4),['mp4','video/mp4']);
  assert.deepEqual(videoType(webm),['webm','video/webm']);
  assert.equal(videoType(Buffer.from('this is not a movie.mp4')),null);
  assert.throws(()=>videoType(Buffer.concat([box('ftyp',Buffer.from('avif\x00\x00\x00\x00avifmif1')),box('mdat',Buffer.from('not a video'))])));
  assert.equal(MAX_VIDEO_BYTES,50*1024*1024);
});

test('선택한 광고와 에셋으로 영상 패키지 준비, 미호출, 수동 결과와 재실험', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'creative-lab-video-test-'));
  const socket = net.createServer(); socket.listen(0,'127.0.0.1'); await once(socket,'listening');
  const port = socket.address().port; await new Promise(resolve=>socket.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  const guard = path.join(dir,'deny-outbound.mjs');
  await writeFile(guard, `import net from 'node:net';\nconst deny = () => { throw new Error('OUTBOUND_CALL_FORBIDDEN'); };\nglobalThis.fetch = deny;\nnet.Socket.prototype.connect = deny;\n`);
  const child = spawn(process.execPath,['--import',pathToFileURL(guard).href,'server.mjs'],{cwd:root,env:{...process.env,CREATIVE_LAB_PORT:String(port),CREATIVE_LAB_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',data=>stderr+=data);
  async function api(route,method='GET',body,expected=200,headers={}) {
    const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    const json=await response.json();assert.equal(response.status,expected,JSON.stringify(json));return json;
  }
  try {
    await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('서버 실행 시간 초과')),5000);timer.unref();})]);
    const sample=await api('/api/sample','POST',{});
    const person=await api('/api/assets','POST',{role:'person',name:'person.png',dataBase64:png},201);
    const search=await api('/api/adcatch/searches','POST',{query:'연습 브랜드의 UGC 광고',mediaType:'VIDEO'},201);
    await api(`/api/adcatch/searches/${search.id}/candidates`,'POST',{status:'ready',source:'adcatch_mcp',executedAt:new Date().toISOString(),workspaceId:'fixture-workspace',brandId:'fixture-brand',scopeNotice:'Synthetic test only',candidates:[{adId:'fixture-ad',pageName:'연습 브랜드',mediaType:'VIDEO',platform:'TIKTOK',sourceUrl:'https://example.com/ad/fixture',reason:'영상 형식이 요청에 맞는 테스트 자료입니다.',creativeBody:'연습용 자료입니다.',creativeLinkTitle:'연습 UGC'}]},200,{'X-Creative-Lab-Token':(await readFile(path.join(path.dirname(search.searchPath),'import-token'),'utf8')).trim()});
    const selected=await api(`/api/adcatch/searches/${search.id}/select`,'POST',{adIds:['fixture-ad']});
    const base={brand:sample.sampleBrand,kind:'video',brief:'선택한 참고 광고를 확인하고 제품 중심의 UGC 영상을 준비해줘',preset:'reference',assetIds:[sample.sampleAssetIds[0],person.id],referenceIds:[selected.references[0].id]};
    for (const videoOptions of [{durationSeconds:10},{aspectRatio:'bad'},{style:'bad'}]) await api('/api/requests','POST',{...base,videoOptions},400);
    const first=await api('/api/requests','POST',{...base,videoOptions:{durationSeconds:30,aspectRatio:'9:16',style:'ugc'},externalGenerationEnabled:true},201);
    assert.equal(first.status,'prepared');assert.equal(first.externalGenerationEnabled,false);
    assert.equal(first.generation.status,'not_started');assert.equal(first.generation.externalGenerationEnabled,false);
    assert.equal(first.outputs.length,0);assert.equal(first.references[0].adId,'fixture-ad');
    assert.match(first.handoff,/영상 생성 MCP\/API의 연결, 인증, 업로드, 견적, 생성 호출은 하지 마/);
    assert.doesNotMatch(first.handoff,/견적을 확인하고 내가 요청한 범위에서 생성/);
    const plan=await api(`/api/requests/${first.id}/video-plan`);
    assert.equal(plan.cuts.length,4);assert.equal(plan.cuts.at(-1).endSeconds,30);
    assert.equal(plan.referenceReview.status,'not_reviewed');assert.equal(plan.assets.length,2);assert.equal(plan.references[0].adId,'fixture-ad');
    assert.ok(plan.cuts.every(c=>c.visualPrompt===''&&c.referenceObservation===''));
    assert.equal(JSON.parse(await readFile(first.videoPlanPath,'utf8')).requestId,first.id);
    const prompt=await (await fetch(url+`/api/requests/${first.id}/video-prompts`)).text();
    assert.match(prompt,/Do not reproduce the reference ad/);assert.match(prompt,/생성 호출을 하지 않습니다/);
    await api(`/api/requests/${first.id}/results`,'POST',{name:'fake.mp4',dataBase64:Buffer.from('not really a video').toString('base64')},400);
    const result=await api(`/api/requests/${first.id}/results`,'POST',{name:'result.mp4',dataBase64:mp4.toString('base64')},201);
    assert.equal(result.outputs[0].mime,'video/mp4');assert.equal(result.outputs[0].source,'manual_upload');assert.equal(result.outputs[0].size,mp4.length);
    const outputUrl=url+result.outputs[0].url;
    const range=await fetch(outputUrl,{headers:{Range:'bytes=0-15'}});
    assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),`bytes 0-15/${mp4.length}`);
    assert.equal(range.headers.get('content-type'),'video/mp4');assert.deepEqual(Buffer.from(await range.arrayBuffer()),mp4.subarray(0,16));
    const tail=await fetch(outputUrl,{headers:{Range:'bytes=-10'}});assert.equal(tail.status,206);assert.deepEqual(Buffer.from(await tail.arrayBuffer()),mp4.subarray(-10));
    const badRange=await fetch(outputUrl,{headers:{Range:'bytes=999999-'}});assert.equal(badRange.status,416);
    const head=await fetch(outputUrl,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(mp4.length));
    await api(`/api/requests/${first.id}/results`,'POST',{name:'storyboard.png',dataBase64:png},201);
    const withWebm=await api(`/api/requests/${first.id}/results`,'POST',{name:'result.webm',dataBase64:webm.toString('base64')},201);assert.equal(withWebm.outputs.at(-1).mime,'video/webm');
    const context=await api(`/api/requests/${first.id}/context`);assert.equal(context.generation.status,'not_started');assert.equal(context.outputs.length,3);assert.match(context.note,/실행 여부를 검증하지 않았습니다/);
    await api(`/api/requests/${first.id}/feedback`,'POST',{text:'도입 대사만 더 짧게'});
    const next=await api('/api/requests','POST',{...base,parentRequestId:first.id,parentFeedbackText:'도입 대사만 더 짧게',videoOptions:first.videoOptions},201);
    const nextContext=await api(`/api/requests/${next.id}/context`);assert.equal(nextContext.parent.outputs[0].mime,'video/mp4');assert.equal(nextContext.parent.videoOptions.durationSeconds,30);assert.equal(nextContext.generation.externalGenerationEnabled,false);
    const image=await api('/api/requests','POST',{...base,kind:'image',videoOptions:{durationSeconds:999}},201);assert.equal(image.videoOptions,undefined);assert.match(image.handoff,/실제 이미지가 완성되면/);
    assert.match(image.handoff,/승인한 뒤에만 업로드와 생성/);assert.doesNotMatch(image.handoff,/견적을 확인하고 내가 요청한 범위에서 생성/);
    await api(`/api/requests/${image.id}/results`,'POST',{name:'result.mp4',dataBase64:mp4.toString('base64')},400);
    assert.doesNotMatch(stderr,/OUTBOUND_CALL_FORBIDDEN/);
  } finally { if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;} await rm(dir,{recursive:true,force:true}); }
});
