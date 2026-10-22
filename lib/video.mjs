import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const RESULT_BODY_LIMIT = Math.ceil(MAX_VIDEO_BYTES * 4 / 3) + 65536;

export function videoOptionsInput(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('영상 설정을 다시 확인해주세요.');
  const options = { durationSeconds: value.durationSeconds ?? 20, aspectRatio: value.aspectRatio ?? '9:16', style: value.style ?? 'ugc' };
  if (![15, 20, 30].includes(options.durationSeconds)) fail('영상 길이는 15초, 20초 또는 30초로 선택해주세요.');
  if (!['9:16', '1:1', '16:9'].includes(options.aspectRatio)) fail('영상 화면 비율을 선택해주세요.');
  if (!['ugc', 'product', 'custom'].includes(options.style)) fail('영상 스타일을 선택해주세요.');
  return options;
}

export function videoType(bytes) {
  // Check the container signature, not the file extension supplied by the browser.
  if (bytes.length >= 24 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    const size = bytes.readUInt32BE(0);
    if (size < 16 || size > bytes.length || size > 4096 || size % 4) fail('MP4 파일의 형식을 확인해주세요.');
    const brands = [bytes.toString('ascii', 8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(bytes.toString('ascii', i, i + 4));
    if (brands.some(brand => ['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash', 'MSNV'].includes(brand))) {
      // Require a recognizable media box after ftyp. HEIF/AVIF images also use ftyp.
      let cursor = size;
      while (cursor + 8 <= bytes.length) {
        const boxSize = bytes.readUInt32BE(cursor), type = bytes.toString('ascii', cursor + 4, cursor + 8);
        if (['moov', 'mdat', 'moof'].includes(type)) return ['mp4', 'video/mp4'];
        if (boxSize < 8 || cursor + boxSize > bytes.length) break;
        cursor += boxSize;
      }
    }
    fail('MP4 영상 컨테이너를 확인할 수 없습니다.');
  }
  if (bytes.length >= 24 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    const header = bytes.subarray(0, Math.min(bytes.length, 4096));
    if (header.includes(Buffer.from([0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])) && header.includes(Buffer.from([0x18, 0x53, 0x80, 0x67]))) return ['webm', 'video/webm'];
    fail('WebM 영상 컨테이너를 확인할 수 없습니다.');
  }
  return null;
}

export function buildVideoPackage({ id, brand, brief, assets, references, videoOptions, parent = null }) {
  const lengths = { 15: [3, 4, 5, 3], 20: [4, 5, 7, 4], 30: [5, 8, 11, 6] }[videoOptions.durationSeconds];
  const roles = ['관심을 끄는 도입', '제품과 사용 상황', '제품을 보여주는 장면', '메시지 정리와 행동 제안'];
  let cursor = 0;
  const cuts = lengths.map((duration, index) => {
    const startSeconds = cursor; cursor += duration;
    return { number: index + 1, startSeconds, endSeconds: cursor, role: roles[index], status: 'needs_review', narration: '', visualPrompt: '', referenceObservation: '', productAssetIds: assets.filter(a => a.role === 'product').map(a => a.id), personAssetIds: assets.filter(a => a.role === 'person').map(a => a.id) };
  });
  const plan = {
    schemaVersion: 1, requestId: id, status: 'prepared', externalGenerationEnabled: false,
    generation: { status: 'not_started', externalGenerationEnabled: false, approvalRequired: true, provider: null, model: null, outputs: [] },
    videoOptions, brand: structuredClone(brand), brief, assets: structuredClone(assets), references: structuredClone(references),
    referenceReview: { status: 'not_reviewed', note: '선택한 광고의 메타데이터만 저장했습니다. 원본 영상을 직접 확인한 뒤 관찰한 장면과 문구만 분석에 사용합니다.' },
    parent: parent ? structuredClone(parent) : null, cuts,
    pendingChecks: ['참고 영상의 실제 장면과 문구 확인', '제품 사실과 인물 사용 범위 확인', '대사와 컷별 영어 프롬프트 작성', '생성 테스트에 대한 별도 사용자 지시 확인'],
    note: '영상 제작을 준비하는 입력 패키지입니다. 컷 구분은 편집 초안이며, 참고 광고의 실제 분석 결과나 생성된 영상이 아닙니다.'
  };
  const promptText = `# 영상 프롬프트 준비\n\n상태: 초안 준비. 영상 생성 호출 없음.\n\n전체 길이 ${videoOptions.durationSeconds}초 / 화면 ${videoOptions.aspectRatio} / 스타일 ${videoOptions.style}\n\n## 전달할 제품 정보\n\n브랜드: ${brand.brandName}\n제품: ${brand.productName}\n제품 설명: ${brand.description || '미입력'}\n톤: ${brand.tone || '미입력'}\n금지 표현: ${brand.avoid || '확인되지 않은 효능, 수치, 후기'}\n\n## 제작 요청\n\n${brief}\n\n## 먼저 확인할 내용\n\n제품 및 인물 이미지는 직접 확인합니다. 참고 광고는 원문을 실제로 본 범위만 분석하고, 확인하지 못한 영상 장면은 비워둡니다. 아래 구분은 우리 영상의 편집 초안입니다. 참고 광고가 이 구조로 되어 있다고 가정하지 않습니다.\n\n${cuts.map(c => `## 컷 ${c.number} (${c.startSeconds}–${c.endSeconds}초): ${c.role}\n\n대사: [브랜드 사실과 목적에 맞춰 작성]\n실제로 확인한 참고 요소: [관찰 내용 또는 미확인]\n제품 레퍼런스: ${c.productAssetIds.join(', ')}\n인물 레퍼런스: ${c.personAssetIds.join(', ') || '[인물 사용 여부 확인]'}\n\n\`\`\`text\nCreate a ${c.endSeconds - c.startSeconds}-second ${videoOptions.aspectRatio} video shot.\nUse the supplied product reference without changing its shape, packaging, or label.\n[If a person reference is selected, describe how to preserve that person's appearance.]\nScene: [Describe only the new scene planned for our brand.]\nAction: [One clear, physically plausible action.]\nCamera and lighting: [Specify the chosen framing and movement.]\nSpoken line: [Approved script only; no invented testimonial or claim.]\nContinuity: [Product, person, wardrobe, and setting to preserve across shots.]\nDo not reproduce the reference ad's brand marks or protected creative details.\n\`\`\`\n`).join('\n')}\n## 실행 경계\n\n이번 단계는 분석, 기획, 대사와 프롬프트 작성까지만 진행합니다. 영상 생성 MCP 또는 API의 연결, 인증, 업로드, 견적, 생성 호출을 하지 않습니다. 사용자가 나중에 별도로 테스트를 지시한 경우에만 해당 연결과 실행 범위를 확인합니다.\n`;
  return { plan, promptText };
}

export async function streamLocalMedia(req, res, file, mime) {
  const { size } = await stat(file);
  const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  let start = 0, end = size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); return res.end();
    }
    if (!match[1]) {
      const suffix = Number(match[2]); start = Math.max(0, size - suffix);
      if (!suffix || !Number.isSafeInteger(suffix)) start = size;
    } else {
      start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }); return res.end();
    }
    status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = end - start + 1;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file, { start, end });
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
