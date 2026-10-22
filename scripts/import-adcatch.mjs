import {readFile} from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const requestPath = args[args.indexOf('--request')+1];
const responsePath = args[args.indexOf('--file')+1];
if (!args.includes('--request') || !args.includes('--file') || !requestPath || !responsePath) {
  console.error('사용법: node scripts/import-adcatch.mjs --request <search.json> --file <candidate-response.json>');
  process.exit(1);
}
try {
  const job = JSON.parse(await readFile(requestPath,'utf8'));
  const payload = JSON.parse(await readFile(responsePath,'utf8'));
  if (!/^[a-f0-9-]+$/.test(job.id) || !Number.isInteger(job.port) || job.port < 1 || job.port > 65535) throw new Error('검색 요청 파일을 확인해주세요.');
  const token = (await readFile(path.join(path.dirname(requestPath),'import-token'),'utf8').catch(() => '')).trim();
  if (!token) throw new Error('검색 요청의 확인 값을 찾지 못했습니다. 웹앱에서 검색 요청을 새로 만들어주세요.');
  const response = await fetch(`http://127.0.0.1:${job.port}/api/adcatch/searches/${job.id}/candidates`,{
    method:'POST',headers:{'Content-Type':'application/json','X-Creative-Lab-Token':token},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '가져오지 못했습니다.');
  console.log(result.status === 'ready' ? `광고 후보 ${result.candidates.length}개를 가져왔습니다. 웹앱의 참고 광고 단계에서 선택하세요.` : '연결 안내를 웹앱에 전달했습니다.');
} catch (error) {
  console.error(error.message === 'fetch failed' ? '로컬 작업실에 연결하지 못했습니다. npm run dev로 실행한 뒤 다시 가져오세요.' : error.message);
  process.exitCode = 1;
}
