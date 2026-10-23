'use strict';
const $ = (id) => document.getElementById(id);
const roles = { product: '제품', person: '인물', reference: '참고 자료' };
const fields = ['brandName', 'productName', 'description', 'tone', 'avoid'];
const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const videoAllowed = ['video/mp4', 'video/webm'];
const steps = ['assets', 'reference', 'request', 'ai', 'results'];
const storageKey = 'creative-lab-draft-v2';
let state = { brand: {}, assets: [], requests: [], references: [] };
let role = 'product', currentView = 'assets', lastStep = 'assets', activeRequest = null;
let preset = 'custom', parentRequestId = null, parentFeedbackText = null, selected = new Set(), feedbackDrafts = {};
let uploading = false, resultUploading = false, sampleLoading = false, initialized = false, localEdits = false;
let toastTimer, draftTimer, searchPollTimer;
let searchIntent = 'general', activeSearchExample = null, kindManuallyChosen = false, videoOptionsEdited = false;
let searches = [], activeSearchId = null, selectedReferenceIds = new Set(), referenceSkipped = false;
let searchChoices = {}, searchListLoading = false, searchCreating = false, searchSelecting = false;
const searchFetches = new Set();
let restored = null;
try { const value = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (value && value.version === 2 && value.brand && Array.isArray(value.selectedIds)) restored = value; } catch {}
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function button(text, className, action) { const el = node('button', className, text); el.type = 'button'; el.addEventListener('click', action); return el; }
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000); }
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  let data; try { data = await response.json(); } catch { throw new Error('서버 응답을 읽을 수 없습니다. 잠시 후 다시 시도하세요.'); }
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : data.message || '요청을 처리하지 못했습니다. 다시 시도하세요.');
  return data;
}
function brandInput() { return Object.fromEntries(fields.map((key) => [key, $(key).value.trim()])); }
function chosenAssets() { return state.assets.filter((asset) => selected.has(asset.id)); }
function chosenKind() { return document.querySelector('input[name="kind"]:checked').value; }
function videoOptionsInput() { return { durationSeconds: Number($('video-duration').value), aspectRatio: $('video-ratio').value, style: $('video-style').value }; }
function applyVideoOptions(options = {}) { const value = options || {}; $('video-duration').value = String([15, 20, 30].includes(value.durationSeconds) ? value.durationSeconds : 20); $('video-ratio').value = ['9:16', '1:1', '16:9'].includes(value.aspectRatio) ? value.aspectRatio : '9:16'; $('video-style').value = ['ugc', 'product', 'custom'].includes(value.style) ? value.style : 'ugc'; }
function videoOptionsLabel(options) { return options ? options.durationSeconds + '초 / ' + options.aspectRatio + ' / ' + ({ ugc: 'UGC 사용 장면', product: '제품 중심', custom: '직접 지정' }[options.style] || options.style) : '길이와 형식을 지정하지 않은 이전 요청'; }
function videoBrief(direction = 'reference') {
  const product = brandInput().productName || '제품';
  const opening = { product: product + '을 중심으로', reference: '선택한 참고 광고의 흐름을 우리 ' + product + '에 맞춰', person: '선택한 인물이 ' + product + '을 사용하는 장면을 중심으로' }[direction] || product + '을 중심으로';
  return opening + ' 영상의 제작 패키지를 준비해 주세요. 선택한 영상 길이, 화면 비율과 스타일에 맞춰 대본, 컷별 장면, 자막과 프롬프트를 정리해 주세요. 제품 모양과 로고를 유지하고 확인되지 않은 효능이나 고객 경험은 만들지 마세요. 영상 생성 도구는 연결하거나 호출하지 말고, 실제 생성은 추후 별도 테스트를 위해 남겨 주세요.';
}
function currentRequest() { return state.requests.find((request) => request.id === activeRequest); }
function requestAssets(request) { return state.assets.filter((asset) => (request.assetIds || []).includes(asset.id)); }
function requestOutputs(request) { return Array.isArray(request?.outputs) ? request.outputs.filter((output) => output.url) : []; }
function hasProduct() { return chosenAssets().some((asset) => asset.role === 'product'); }
function materialsReady() { const brand = brandInput(); return !!(brand.brandName && brand.productName && hasProduct()); }
function chosenReferences() { return state.references.filter((reference) => selectedReferenceIds.has(reference.id)); }
function referenceReady() { return chosenReferences().length > 0 || chosenAssets().some((asset) => asset.role === 'reference'); }
function presetReady() { return preset === 'reference' ? referenceReady() : preset !== 'person' || chosenAssets().some((asset) => asset.role === 'person'); }
function persistDraft() {
  clearTimeout(draftTimer);
  if (!initialized && !localEdits) return;
  const draft = { version: 2, step: lastStep, brand: Object.fromEntries(fields.map((key) => [key, $(key).value])), selectedIds: [...selected], brief: $('brief').value, preset, kind: chosenKind(), parentRequestId, parentFeedbackText, activeRequest, feedbackDrafts, selectedReferenceIds: [...selectedReferenceIds], referenceSkipped, activeSearchId, searchChoices, searchQuery: $('ad-search-query').value, searchMediaType: $('ad-media-type').value, searchPlatform: $('ad-platform').value, searchIntent, activeSearchExample, kindManuallyChosen, videoOptionsEdited, videoOptions: videoOptionsInput() };
  try { localStorage.setItem(storageKey, JSON.stringify(draft)); $('draft-status').textContent = '작성 중인 내용은 이 브라우저에 보관 중입니다.'; } catch { $('draft-status').textContent = '브라우저에 임시 보관할 수 없습니다. 요청을 저장해 주세요.'; }
}
function queueDraft() { localEdits = true; clearTimeout(draftTimer); draftTimer = setTimeout(persistDraft, 250); }
function applyDraft(draft) {
  fields.forEach((key) => { $(key).value = typeof draft.brand[key] === 'string' ? draft.brand[key] : ''; });
  selected = new Set(draft.selectedIds); selectedReferenceIds = new Set(Array.isArray(draft.selectedReferenceIds) ? draft.selectedReferenceIds : []); referenceSkipped = draft.referenceSkipped === true; activeSearchId = draft.activeSearchId || null; searchChoices = draft.searchChoices && typeof draft.searchChoices === 'object' ? draft.searchChoices : {}; $('ad-search-query').value = typeof draft.searchQuery === 'string' ? draft.searchQuery : ''; $('ad-media-type').value = ['IMAGE', 'VIDEO', 'ALL'].includes(draft.searchMediaType) ? draft.searchMediaType : 'IMAGE'; $('brief').value = typeof draft.brief === 'string' ? draft.brief : '';
  preset = ['product', 'reference', 'person', 'custom'].includes(draft.preset) ? draft.preset : 'custom';
  parentRequestId = draft.parentRequestId || null; parentFeedbackText = parentRequestId && typeof draft.parentFeedbackText === 'string' ? draft.parentFeedbackText : null; activeRequest = draft.activeRequest || null;
  feedbackDrafts = draft.feedbackDrafts && typeof draft.feedbackDrafts === 'object' ? draft.feedbackDrafts : {};
  document.querySelector('input[name="kind"][value="' + (draft.kind === 'video' ? 'video' : 'image') + '"]').checked = true;
  $('ad-platform').value = ['ALL', 'TIKTOK', 'META'].includes(draft.searchPlatform) ? draft.searchPlatform : 'ALL'; searchIntent = ['brand', 'trending', 'ugc', 'general'].includes(draft.searchIntent) ? draft.searchIntent : 'general'; activeSearchExample = ['brand', 'trending', 'ugc'].includes(draft.activeSearchExample) ? draft.activeSearchExample : null; kindManuallyChosen = draft.kindManuallyChosen === true; videoOptionsEdited = draft.videoOptionsEdited === true; applyVideoOptions(draft.videoOptions); renderSearchExamples();
  lastStep = steps.includes(draft.step) ? draft.step : 'assets'; currentView = lastStep;
}
function changeView(view, focus = true) {
  if (![...steps, 'history'].includes(view)) return;
  stopSearchPolling(); currentView = view; if (steps.includes(view)) lastStep = view;
  [...steps, 'history'].forEach((name) => { $('view-' + name).hidden = name !== view; const tab = $('tab-' + name); tab.classList.toggle('active', name === view); if (name === view) tab.setAttribute('aria-current', name === 'history' ? 'page' : 'step'); else tab.removeAttribute('aria-current'); });
  $('step-guide').hidden = view === 'history';
  updatePreview(); renderGuide();
  if (view === 'reference') { renderReference(); loadSearches(); } if (view === 'ai') renderAI(); if (view === 'results') renderResults(); if (view === 'history') renderHistory();
  persistDraft(); if (focus) (view === 'history' ? $('tab-history') : $('step-title')).focus();
}
function renderGuide() {
  const request = currentRequest(), brand = brandInput(), hasResult = requestOutputs(request).length > 0;
  const ready = materialsReady(), written = !!$('brief').value.trim() && presetReady();
  const content = {
    assets: ['1 / 5', '광고에 쓸 제품과 브랜드를 준비해요', '제품 사진 하나와 브랜드명, 제품명이 있으면 시작할 수 있어요. 인물과 참고 자료는 필요할 때 추가하세요.', ready ? '준비됐어요. 아래의 참고 광고 살펴보기를 눌러 주세요.' : '다음: 제품 사진을 선택하고 브랜드명과 제품명을 채워 주세요.', [[hasProduct(), '제품 사진 1개 이상 선택'], [!!brand.brandName, '브랜드명 입력'], [!!brand.productName, '제품명 입력']]],
    reference: ['2 / 5', '참고할 광고를 골라 방향을 잡아요', '원하는 광고를 말로 적고 검색 요청을 AI에 전달하세요. 전달받은 후보는 최대 3개까지 선택할 수 있습니다. 참고 없이 진행해도 좋아요.', '다음: 선택한 광고 사용 또는 참고 광고 없이 계속을 누르세요.', [[!!activeSearchId, '검색 요청 저장'], [referenceReady() || referenceSkipped, referenceSkipped ? '참고 광고 없이 진행 선택' : '참고 자료 선택']]],
    request: ['3 / 5', chosenKind() === 'video' ? '영상의 흐름과 제작 조건을 정해요' : '이미지에서 보여 줄 장면을 정해요', '시작 방향을 고르거나 직접 적어 주세요. 오른쪽에서 사진과 제품 기준을 확인하면 저장할 준비가 됩니다.', '다음: 요청을 저장하면 AI에 붙여 넣을 요청문이 준비됩니다.', [[ready, '필수 자료 준비'], [written, '만들 내용 입력'], [presetReady(), '선택한 방향에 필요한 사진 준비']]],
    ai: ['4 / 5', request?.kind === 'video' ? '영상 제작 패키지를 준비해요' : '저장한 요청으로 AI 작업을 이어가요', request?.kind === 'video' ? '지금은 선택한 광고와 제품 자료로 대본, 컷별 장면과 프롬프트를 정리합니다. 영상 생성 도구는 연결하거나 호출하지 않습니다.' : '이 앱은 AI를 호출하지 않습니다. Codex 또는 Claude Code에서 자료를 확인하고 이미지를 만든 뒤 파일로 저장하세요.', request?.kind === 'video' ? '다음: 제작 패키지를 검토하세요. 나중에 별도 테스트로 만든 결과는 5단계에 등록할 수 있습니다.' : '다음: 이미지 파일을 저장했다면 5단계에서 직접 등록하세요.', [[!!request, '요청 저장됨'], [hasResult, '결과 파일 등록됨']]],
    results: ['5 / 5', '결과를 보고 한 가지씩 바꿔 봐요', '실제로 만든 이미지나 영상을 등록하고 제품의 모양과 요청한 장면을 확인하세요. 바꿀 점 하나를 적으면 같은 자료로 다음 요청을 만들 수 있어요.', '다음: 다시 실험하면 3단계에 새 초안이 열립니다. 이전 요청과 결과는 기록에 남습니다.', [[!!request, '등록할 요청 선택'], [hasResult, '결과 파일 등록'], [!!feedbackValue(request).trim(), '바꿀 점 하나 기록']]]
  }[lastStep];
  $('step-label').textContent = content[0]; $('step-title').textContent = content[1]; $('step-purpose').textContent = content[2]; $('step-next').textContent = content[3];
  $('step-checks').replaceChildren(...content[4].map(([done, text]) => { const item = node('li', done ? 'complete' : ''); item.append(node('span', 'check-mark', done ? '✓' : '○'), node('span', '', text)); item.setAttribute('aria-label', (done ? '완료: ' : '미완료: ') + text); return item; }));
  [ready, referenceReady() || referenceSkipped, ready && written, !!request, hasResult].forEach((done, index) => $('tab-' + steps[index]).classList.toggle('complete', done));
}
function hasExistingWork() { return fields.some((key) => $(key).value.trim()) || !!$('brief').value.trim() || state.assets.length > 0 || state.requests.length > 0; }
function renderSampleState() {
  const existing = hasExistingWork(); $('use-sample').disabled = existing || sampleLoading || uploading;
  $('sample-note').textContent = existing ? '이미 작업 중인 자료가 있어 샘플 시작을 잠갔습니다. 아래에서 내 자료로 계속하세요.' : '샘플을 선택한 뒤에도 사진과 입력 내용을 살펴보고 직접 수정할 수 있어요.';
}
function renderAssets() {
  $('library-total').textContent = state.assets.length + '개 등록됨';
  Object.keys(roles).forEach((key) => { $('count-' + key).textContent = state.assets.filter((asset) => asset.role === key).length; });
  const filtered = state.assets.filter((asset) => asset.role === role); $('visible-count').textContent = filtered.length + '개';
  $('asset-list-title').textContent = '등록한 ' + roles[role]; $('upload-heading').textContent = roles[role] + ' 이미지를 등록하세요'; $('assets-empty').hidden = filtered.length > 0;
  $('assets-empty').textContent = { product: '제품을 잘 알아볼 수 있는 정면 이미지부터 넣어 보세요.', person: '인물이 나오는 이미지를 만들 때만 추가하세요.', reference: '참고할 구도나 분위기가 있을 때만 추가하세요.' }[role];
  $('asset-grid').replaceChildren(...filtered.map((asset) => {
    const card = node('div', 'asset-card' + (selected.has(asset.id) ? ' selected' : '')), label = node('label', 'asset-choice'), checkbox = node('input'), img = node('img', 'asset-image');
    checkbox.type = 'checkbox'; checkbox.checked = selected.has(asset.id); checkbox.setAttribute('aria-label', asset.name + ' 제작에 사용');
    checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(asset.id) : selected.delete(asset.id); card.classList.toggle('selected', checkbox.checked); queueDraft(); renderSelection(); });
    img.src = asset.url; img.alt = asset.name; img.loading = 'lazy';
    const info = node('div', 'asset-info'), name = node('span', 'asset-name', asset.name); name.title = asset.name;
    info.append(name, node('span', 'asset-meta', roles[asset.role] + ' / ' + formatSize(asset.size)));
    label.append(img, checkbox, info);
    const remove = button('×', 'asset-delete', async () => { remove.disabled = true; try { await api('/api/assets/' + encodeURIComponent(asset.id), 'DELETE'); state.assets = state.assets.filter((item) => item.id !== asset.id); selected.delete(asset.id); renderAssets(); renderSelection(); persistDraft(); notify('사진을 삭제했습니다.'); } catch (error) { notify(error.message); remove.disabled = false; } });
    remove.setAttribute('aria-label', asset.name + ' 삭제'); card.append(label, remove); return card;
  })); renderSampleState();
}
function formatSize(size) { return Number.isFinite(size) ? (size >= 1024 * 1024 ? (size / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(size / 1024)) + ' KB') : '이미지'; }
function assetChip(asset) { const chip = node('div', 'selected-asset'), img = node('img'), text = node('div'); img.src = asset.url; img.alt = asset.name; text.append(node('strong', '', asset.name), node('small', '', roles[asset.role])); chip.append(img, text); return chip; }
function renderSelection() {
  const assets = chosenAssets(); $('selected-count').textContent = '선택한 사진 ' + assets.length + '개';
  $('selection-caption').textContent = assets.length ? Object.keys(roles).filter((key) => assets.some((asset) => asset.role === key)).map((key) => roles[key] + ' ' + assets.filter((asset) => asset.role === key).length + '개').join(', ') : '제작에 쓸 제품 이미지를 선택하세요.';
  $('request-assets').replaceChildren(...assets.map(assetChip)); $('request-assets-empty').hidden = assets.length > 0;
  document.querySelectorAll('[data-preset]').forEach((el) => { const requiredRole = el.dataset.preset; const missing = requiredRole === 'reference' ? !referenceReady() : requiredRole !== 'product' && !assets.some((asset) => asset.role === requiredRole); el.disabled = missing; const hint = el.querySelector('small'); if (requiredRole === 'reference') hint.textContent = missing ? '참고 자료 선택 필요' : '선택한 광고와 사진 활용'; if (requiredRole === 'person') hint.textContent = missing ? '인물 사진 선택 필요' : '선택한 인물 사진 활용'; el.title = missing ? requiredRole === 'reference' ? '2단계에서 참고 광고를 고르거나 1단계에서 참고 사진을 선택하세요.' : '1단계에서 인물 사진을 선택하세요.' : ''; });
  updatePreview();
}
function updatePreview() {
  const brand = brandInput(), assets = chosenAssets(), isVideo = chosenKind() === 'video';
  $('video-options').hidden = !isVideo; $('video-reference-note').hidden = !(isVideo && !kindManuallyChosen && chosenReferences().some((reference) => reference.mediaType === 'VIDEO'));
  const lines = [(chosenKind() === 'image' ? '이미지 한 장' : '영상 제작 요청') + ' 제작 요청', '', '브랜드: ' + (brand.brandName || '브랜드명을 입력하세요'), '제품: ' + (brand.productName || '제품명을 입력하세요')];
  if (isVideo) lines.push('영상 조건: ' + videoOptionsLabel(videoOptionsInput()), '진행 범위: 제작 패키지 준비만. 영상 생성 도구 연결과 호출 금지. 실제 생성은 추후 별도 테스트.');
  if (brand.description) lines.push('제품 설명: ' + brand.description); if (brand.tone) lines.push('분위기: ' + brand.tone); if (brand.avoid) lines.push('피할 표현: ' + brand.avoid);
  lines.push('', '사용할 사진', ...(assets.length ? assets.map((asset) => roles[asset.role] + ': ' + asset.name) : ['선택한 사진이 없습니다.']), '', '만들 내용', $('brief').value.trim() || '원하는 장면과 강조할 내용을 입력하세요.');
  const references = chosenReferences(); if (references.length) lines.push('', '선택한 참고 광고', ...references.map((reference) => referenceName(reference) + '\n선정 이유: ' + (reference.reason || '전달된 이유 없음') + '\n출처: ' + (safeExternalUrl(reference.sourceUrl) || '원문 주소 없음')));
  $('request-references').replaceChildren(...(references.length ? references.map(referenceSummary) : [node('p', 'muted', '선택한 검색 광고가 없습니다. 참고 없이도 제작할 수 있어요.')]));
  $('reference-selected-count').textContent = '이번 제작에 선택한 검색 광고 ' + references.length + '개';
  $('prompt-preview').textContent = lines.join('\n');
  const notes = [];
  if (referenceReady()) notes.push('참고 자료에서는 구도와 분위기, 장면의 흐름을 가져옵니다. 다른 브랜드의 문구나 제품은 복제하지 않습니다.');
  if (assets.some((asset) => asset.role === 'person')) notes.push('인물 사진에서는 인물의 외형을 참고합니다.');
  $('reference-review').textContent = notes.length ? notes.join(' ') : '선택한 제품 사진을 기준으로 만듭니다. 참고 자료나 인물 없이도 시작할 수 있어요.';
  document.querySelectorAll('[data-preset]').forEach((el) => { const active = el.dataset.preset === preset; el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active)); });
  $('parent-note').hidden = !parentRequestId; $('parent-note').textContent = '이전 결과에서 이어지는 새 실험입니다. 이전 요청과 결과는 그대로 보관됩니다.';
  renderGuide(); renderSampleState();
}
async function saveBrand() {
  const snapshot = brandInput(), saved = await api('/api/brand', 'PUT', snapshot); state.brand = saved;
  const unchanged = fields.every((key) => brandInput()[key] === snapshot[key]);
  $('brand-status').textContent = unchanged ? '저장됨' : '추가 입력 중'; $('brand-status').classList.toggle('saved', unchanged); persistDraft(); notify('브랜드 기준을 저장했습니다.');
}
async function load() {
  $('loading').hidden = initialized; $('connection-error').hidden = true; $('retry-load').disabled = true;
  try {
    const fresh = await api('/api/state'); state = { brand: fresh.brand || {}, assets: fresh.assets || [], requests: fresh.requests || [], references: fresh.references || [] };
    if (!initialized && !localEdits) { if (restored) applyDraft(restored); else fields.forEach((key) => { $(key).value = state.brand[key] || ''; }); }
    selected = new Set([...selected].filter((id) => state.assets.some((asset) => asset.id === id))); selectedReferenceIds = new Set([...selectedReferenceIds].filter((id) => state.references.some((reference) => reference.id === id)));
    if (!state.requests.some((request) => request.id === activeRequest)) activeRequest = [...state.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.id || null;
    if (parentRequestId && !state.requests.some((request) => request.id === parentRequestId)) { parentRequestId = null; parentFeedbackText = null; }
    initialized = true; $('brand-status').textContent = restored ? '초안 복원됨' : state.brand.brandName ? '저장됨' : '입력 전';
    renderAssets(); renderSelection(); $('request-count').textContent = state.requests.length; $('workspace').hidden = false; changeView(currentView, false);
  } catch (error) { $('connection-message').textContent = '작업실을 불러오지 못했습니다. 입력한 내용은 유지됩니다. ' + error.message; $('connection-error').hidden = false; }
  finally { $('loading').hidden = true; $('retry-load').disabled = false; }
}
function fileBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.')); reader.readAsDataURL(file); }); }
function validateFile(file) { if (!allowed.includes(file.type)) throw new Error('PNG, JPG, WebP, GIF 파일을 선택하세요.'); if (file.size > 15 * 1024 * 1024) throw new Error('파일 크기는 최대 15MB입니다.'); if (!file.size) throw new Error('빈 파일은 등록할 수 없습니다.'); }
function validateResultFile(file, request) {
  if (allowed.includes(file.type)) { validateFile(file); return; }
  if (request.kind !== 'video' || !videoAllowed.includes(file.type)) throw new Error(request.kind === 'video' ? '이미지 또는 MP4, WebM 영상 파일을 선택하세요.' : 'PNG, JPG, WebP, GIF 파일을 선택하세요.');
  if (!file.size) throw new Error('빈 파일은 등록할 수 없습니다.'); if (file.size > 50 * 1024 * 1024) throw new Error('영상 파일 크기는 최대 50MB입니다.');
}
async function upload(files) {
  if (uploading || !files.length) return; uploading = true; const uploadRole = role;
  $('asset-files').disabled = true; $('dropzone').classList.add('uploading'); $('upload-status').hidden = false; renderSampleState();
  document.querySelectorAll('[data-role]').forEach((el) => { el.disabled = true; }); let count = 0; const errors = [];
  for (const file of files) {
    try { validateFile(file); $('upload-status').textContent = file.name + ' 등록 중'; const asset = await api('/api/assets', 'POST', { name: file.name, role: uploadRole, dataBase64: await fileBase64(file) }); state.assets.push(asset); selected.add(asset.id); count++; }
    catch (error) { errors.push(file.name + ': ' + error.message); }
  }
  uploading = false; $('asset-files').disabled = false; $('asset-files').value = ''; $('dropzone').classList.remove('uploading'); document.querySelectorAll('[data-role]').forEach((el) => { el.disabled = false; });
  renderAssets(); renderSelection(); persistDraft(); $('upload-status').hidden = !errors.length; $('upload-status').textContent = errors.join('\n'); if (count) notify(roles[uploadRole] + ' 사진 ' + count + '개를 등록하고 선택했습니다.');
}
function formatDate(date) { const value = new Date(date); return Number.isNaN(value.getTime()) ? '저장한 요청' : new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value); }
function requestTitle(request) { return (request.brand?.productName || '제품') + ' ' + (request.kind === 'video' ? '영상 제작 요청' : '이미지'); }
function requestSummary(request) {
  const box = node('section', 'saved-summary'), assets = node('div', 'selected-assets'); assets.append(...requestAssets(request).map(assetChip));
  box.append(node('span', 'prepared-tag', requestOutputs(request).length ? '결과 직접 등록됨' : '요청 저장됨'), node('h2', '', requestTitle(request)), node('p', 'detail-meta', formatDate(request.createdAt)), node('p', 'saved-brief', request.brief || ''), assets);
  const references = Array.isArray(request.references) ? request.references : state.references.filter((reference) => (request.referenceIds || []).includes(reference.id)); if (references.length) { const section = node('section', 'saved-reference-section'); section.append(node('h3', '', '선택한 참고 광고'), ...references.map(referenceSummary)); box.append(section); }
  if (request.kind === 'video') box.append(node('p', 'video-saved-options', videoOptionsLabel(request.videoOptions)), node('p', 'video-preparation-note', '영상 제작 패키지를 준비하는 요청입니다. 실제 영상 생성은 나중에 별도로 테스트합니다.'));
  return box;
}
function emptyRequest(target) {
  const empty = node('div', 'history-empty panel'); empty.append(node('h2', '', '먼저 만들 내용을 저장해 주세요'), node('p', '', '3단계에서 요청을 저장하면 이곳에서 이어갈 수 있어요.'), button('만들 내용 정하기', 'primary', () => changeView('request'))); target.replaceChildren(empty);
}
async function copyRequest(request, fallback) {
  const text = request.handoff || request.promptPreview || request.brief || '';
  try { await navigator.clipboard.writeText(text); notify('저장된 요청문을 복사했습니다. Claude 대화창에 붙여 넣으세요.'); }
  catch { fallback.open = true; const textarea = fallback.querySelector('textarea'); textarea.focus(); textarea.select(); notify('요청문을 선택했습니다. 복사 단축키를 눌러 주세요.'); }
}
function technicalDetails(request) {
  const details = node('details', 'technical-details'), textarea = node('textarea', 'handoff'); details.append(node('summary', '', '저장된 요청문과 기술 정보 보기'));
  textarea.value = request.handoff || request.promptPreview || request.brief || ''; textarea.readOnly = true; textarea.rows = 8; textarea.setAttribute('aria-label', '저장된 AI 요청문'); details.append(textarea);
  const download = node('a', '', '입력 파일 내려받기'); download.href = '/api/requests/' + encodeURIComponent(request.id) + '/context'; download.download = request.id + '-context.json';
  details.append(download);
  if (request.kind === 'video' && request.videoPlanPath) { const plan = node('a', '', '영상 구성 계획 내려받기'); plan.href = '/api/requests/' + encodeURIComponent(request.id) + '/video-plan'; plan.download = request.id + '-video-plan.json'; details.append(plan); }
  if (request.kind === 'video' && request.videoPromptsPath) { const prompts = node('a', '', '영상 프롬프트 초안 내려받기'); prompts.href = '/api/requests/' + encodeURIComponent(request.id) + '/video-prompts'; prompts.download = request.id + '-video-prompts.md'; details.append(prompts); }
  details.append(node('p', 'muted', '요청 ID: ' + request.id)); return details;
}
function renderAI() {
  const target = $('ai-content'), request = currentRequest(); if (!request) { emptyRequest(target); return; }
  const grid = node('div', 'request-grid'), summary = node('article', 'panel request-form-panel'); summary.append(requestSummary(request));
  summary.append(node('p', 'integration-note-text', '아래 내용은 저장된 요청입니다. 1~3단계의 작성 중인 내용과 다를 수 있습니다.'));
  const panel = node('section', 'panel ai-instructions'), list = node('ol', 'handoff-steps'), tech = technicalDetails(request);
  (request.kind === 'video' ? [['요청문 복사', '선택한 광고와 제품 자료, 영상 길이와 비율이 담긴 제작 준비 요청입니다.'], ['제작 패키지만 준비', '이 프로젝트 폴더를 연 Codex 또는 Claude Code에 붙여 넣어 대본, 컷별 장면, 자막과 프롬프트를 정리하세요. 영상 생성 도구는 연결하거나 호출하지 않습니다.'], ['나중에 별도 테스트', '준비한 내용을 검토하고 실제 생성은 추후 별도로 테스트하세요. 제작 패키지 저장만으로 영상이 생성되지는 않습니다. 테스트 뒤 실제 결과 파일을 등록할 수 있습니다.']] : [['요청문 복사', '저장한 브랜드 기준과 선택한 사진이 담긴 요청입니다.'], ['Codex 또는 Claude Code에 붙여 넣기', '이 프로젝트 폴더를 연 대화에 붙여 넣으세요. AI에게 사진과 생성 도구 연결을 확인하도록 요청합니다.'], ['결과 이미지 저장', '실제 생성이 끝나면 이미지 파일을 내 컴퓨터에 저장하세요. 연결이 없으면 생성 준비 상태로 남습니다.']]).forEach(([title, text]) => { const item = node('li'); item.append(node('h3', '', title), node('p', '', text)); if (list.children.length === 0) item.append(button('요청문 복사', 'primary', () => copyRequest(request, tech))); list.append(item); });
  panel.append(node('h2', '', request.kind === 'video' ? '영상 제작 패키지 준비' : '세 가지 순서로 진행하세요'), list, button('결과 등록하러 가기', 'secondary full-width', () => changeView('results')), tech); grid.append(summary, panel); target.replaceChildren(grid);
}
function outputGallery(request, label) {
  const section = node('section', 'output-section'), gallery = node('div', 'output-gallery'); section.append(node('h3', '', label));
  const outputs = requestOutputs(request); if (!outputs.length) gallery.append(node('p', 'muted', '등록한 결과가 없습니다.'));
  outputs.forEach((output) => {
    const figure = node('figure', 'output-figure'), link = node('a'); link.href = output.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    if (videoAllowed.includes(output.mime)) { const video = node('video', 'result-video'); video.src = output.url; video.controls = true; video.playsInline = true; video.preload = 'metadata'; video.setAttribute('aria-label', output.name || '직접 등록한 결과 영상'); figure.append(video); link.textContent = '영상 파일 열기'; link.className = 'video-file-link'; figure.append(link); }
    else { const img = node('img'); link.setAttribute('aria-label', output.name + ' 크게 보기'); img.src = output.url; img.alt = output.name || '직접 등록한 결과 이미지'; img.loading = 'lazy'; link.append(img); figure.append(link); }
    figure.append(node('figcaption', '', output.name || '결과 파일')); gallery.append(figure);
  });
  section.append(gallery); return section;
}
function feedbackValue(request) { if (!request) return ''; return Object.hasOwn(feedbackDrafts, request.id) ? String(feedbackDrafts[request.id]) : request.feedback?.text || ''; }
function replaceRequest(updated) { const index = state.requests.findIndex((request) => request.id === updated.id); if (index === -1) state.requests.push(updated); else state.requests[index] = updated; }
async function uploadResult(file, request, status, input) {
  if (!file || resultUploading) return; resultUploading = true; input.disabled = true; status.hidden = false; status.textContent = '결과 파일을 등록하고 있습니다.';
  let errorMessage = '';
  try { validateResultFile(file, request); const updated = await api('/api/requests/' + encodeURIComponent(request.id) + '/results', 'POST', { name: file.name, dataBase64: await fileBase64(file) }); replaceRequest(updated); persistDraft(); renderGuide(); notify('직접 등록한 결과를 저장했습니다.'); }
  catch (error) { errorMessage = error.message; }
  finally {
    resultUploading = false; input.disabled = false; input.value = '';
    if (currentView === 'results') renderResults();
    if (errorMessage) {
      if (currentView === 'results' && activeRequest === request.id) { const currentStatus = $('results-content').querySelector('.result-upload-area .upload-status'); currentStatus.textContent = errorMessage; currentStatus.hidden = false; }
      else notify('결과 파일을 등록하지 못했습니다. ' + errorMessage);
    }
  }
}
function renderResults() {
  const target = $('results-content'), request = currentRequest(); if (!request) { emptyRequest(target); return; }
  const panel = node('article', 'panel results-panel'); panel.append(requestSummary(request));
  const resultArea = node('section', 'result-upload-area'); resultArea.append(node('h3', '', '직접 등록한 결과'), node('p', 'muted', request.kind === 'video' ? '나중에 별도 테스트로 만든 영상이나 스토리보드 이미지를 등록하세요. 제작 패키지 준비만으로 영상이 생성되지는 않습니다. 앱은 파일의 제작 과정을 검증하지 않습니다.' : 'Codex 또는 Claude Code에서 실제로 생성한 이미지 파일을 선택하세요. 앱은 파일의 생성 도구나 제작 과정을 검증하지 않습니다.'));
  const label = node('label', 'file-button', request.kind === 'video' ? '결과 파일 선택' : '결과 이미지 선택'), input = node('input'), status = node('p', 'upload-status'); input.type = 'file'; input.accept = (request.kind === 'video' ? [...allowed, ...videoAllowed] : allowed).join(','); input.setAttribute('aria-label', request.kind === 'video' ? '결과 파일 선택' : '결과 이미지 선택'); input.disabled = resultUploading; status.hidden = true; status.setAttribute('role', 'status');
  input.addEventListener('change', () => uploadResult(input.files[0], request, status, input)); label.append(input); resultArea.append(label, node('p', 'file-hint', request.kind === 'video' ? 'MP4, WebM 최대 50MB / 이미지 최대 15MB. 이전 결과와 함께 보관됩니다.' : 'PNG, JPG, WebP, GIF / 최대 15MB. 추가한 결과는 기존 결과와 함께 보관됩니다.'), status); panel.append(resultArea);
  const compare = node('div', request.parentRequestId ? 'result-comparison' : 'result-single');
  if (request.parentRequestId) { const parent = state.requests.find((item) => item.id === request.parentRequestId); if (parent) compare.append(outputGallery(parent, '이전 실험 결과')); else compare.append(node('p', 'muted', '이전 실험 기록을 찾을 수 없습니다.')); }
  compare.append(outputGallery(request, request.parentRequestId ? '이번 실험 결과' : '이번에 등록한 결과')); panel.append(compare);
  const feedback = node('section', 'feedback-section'), field = node('label', 'field', '바꿀 점 하나'), textarea = node('textarea'); textarea.rows = 3; textarea.maxLength = 3000; textarea.value = feedbackValue(request); textarea.placeholder = '예: 제품은 그대로 두고 배경만 더 밝게 바꿔 주세요.'; textarea.setAttribute('aria-label', '바꿀 점 하나');
  textarea.addEventListener('input', () => { feedbackDrafts[request.id] = textarea.value; queueDraft(); renderGuide(); }); field.append(textarea);
  feedback.append(node('h2', '', '다음에는 무엇을 바꿀까요?'), node('p', 'muted', '제품 모양, 글자, 요청한 장면을 확인한 뒤 한 가지만 적어 주세요.'), field);
  const error = node('p', 'field-error'); error.hidden = true; error.setAttribute('role', 'alert');
  const actions = node('div', 'detail-actions'), save = button('바꿀 점 저장', 'secondary', async () => { save.disabled = true; error.hidden = true; try { await saveFeedback(request, textarea.value); notify('바꿀 점을 저장했습니다.'); } catch (failure) { error.hidden = false; error.textContent = failure.message; } finally { save.disabled = false; } });
  const again = button('같은 자료로 다시 실험', 'primary', async () => {
    error.hidden = true;
    if (!requestOutputs(request).length) { error.hidden = false; error.textContent = '먼저 실제 결과 파일을 등록하세요.'; return; }
    const change = textarea.value.trim(); if (!change) { error.hidden = false; error.textContent = '다음 실험에서 바꿀 점 하나를 적어 주세요.'; textarea.focus(); return; }
    const nextBrief = (request.brief || '') + '\n\n이번 실험에서 바꿀 점 하나:\n' + change;
    if (nextBrief.length > 10000) { error.hidden = false; error.textContent = '이전 요청과 바꿀 점을 합치면 10,000자를 넘습니다. 바꿀 점을 더 짧게 정리해 주세요.'; return; }
    if (!requestAssets(request).some((asset) => asset.role === 'product')) { error.hidden = false; error.textContent = '이전 요청의 제품 사진이 없습니다. 1단계에서 제품 사진을 다시 등록해 주세요.'; return; }
    again.disabled = true; save.disabled = true;
    try { await saveFeedback(request, change); fields.forEach((key) => { $(key).value = request.brand?.[key] || ''; }); selected = new Set(request.assetIds || []); selectedReferenceIds = new Set(request.referenceIds || []); referenceSkipped = !selectedReferenceIds.size; $('brief').value = nextBrief; preset = request.preset || 'custom'; parentRequestId = request.id; parentFeedbackText = change; kindManuallyChosen = true; videoOptionsEdited = true; applyVideoOptions(request.videoOptions); document.querySelector('input[name="kind"][value="' + (request.kind === 'video' ? 'video' : 'image') + '"]').checked = true; renderAssets(); renderSelection(); changeView('request'); notify('같은 자료로 새 실험 초안을 만들었습니다. 내용을 확인한 뒤 저장하세요.'); }
    catch (failure) { error.hidden = false; error.textContent = failure.message; } finally { again.disabled = false; save.disabled = false; }
  });
  again.disabled = !requestOutputs(request).length; actions.append(save, again); feedback.append(actions, error); if (!requestOutputs(request).length) feedback.append(node('p', 'muted', '결과 파일을 등록하면 다시 실험할 수 있습니다.')); panel.append(feedback); target.replaceChildren(panel);
}
async function saveFeedback(request, text) { const updated = await api('/api/requests/' + encodeURIComponent(request.id) + '/feedback', 'POST', { text: text.trim() }); replaceRequest(updated); if (!Object.hasOwn(feedbackDrafts, request.id) || feedbackDrafts[request.id] === text) feedbackDrafts[request.id] = text; persistDraft(); renderGuide(); return updated; }
function renderHistory() {
  $('request-count').textContent = state.requests.length; $('history-empty').hidden = state.requests.length > 0; $('history-content').hidden = !state.requests.length; if (!state.requests.length) return;
  const requests = [...state.requests].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $('history-list').replaceChildren(...requests.map((request) => {
    const item = button('', 'history-item' + (request.id === activeRequest ? ' active' : ''), () => { activeRequest = request.id; persistDraft(); renderHistory(); }); item.setAttribute('aria-pressed', String(request.id === activeRequest));
    item.append(node('span', 'prepared-tag', requestOutputs(request).length ? '결과 직접 등록됨' : '요청 저장됨'), node('strong', '', requestTitle(request)), node('small', '', formatDate(request.createdAt))); return item;
  }));
  const request = currentRequest() || requests[0], detail = $('history-detail'), actions = node('div', 'detail-actions');
  detail.replaceChildren(requestSummary(request)); actions.append(button('AI 작업 열기', 'secondary', () => changeView('ai')), button('결과와 재실험 열기', 'primary', () => changeView('results'))); detail.append(actions);
  if (requestOutputs(request).length) detail.append(outputGallery(request, '직접 등록한 결과')); if (request.feedback?.text) { const feedback = node('section', 'detail-section'); feedback.append(node('h3', '', '저장한 바꿀 점'), node('p', '', request.feedback.text)); detail.append(feedback); } detail.append(technicalDetails(request));
}
function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function referenceName(reference) { return reference.creativeLinkTitle || reference.pageName || '광고 ' + (reference.adId || ''); }
function sourceLink(reference) {
  const url = safeExternalUrl(reference.sourceUrl);
  if (!url) return node('span', 'muted', '원문 주소가 전달되지 않았습니다.');
  const link = node('a', 'ad-source-link', '광고 원문 보기 (' + new URL(url).hostname + ')'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
}
function referenceSummary(reference) {
  const summary = node('article', 'reference-summary'); summary.append(node('strong', '', referenceName(reference)));
  if (reference.pageName) summary.append(node('span', 'reference-page-name', reference.pageName));
  if (typeof reference.formatEvidence === 'string' && reference.formatEvidence) summary.append(node('p', '', '형식 근거: ' + reference.formatEvidence));
  summary.append(node('p', '', '선정 이유: ' + (reference.reason || '전달된 이유가 없습니다. 원문을 보고 참고할 부분을 확인하세요.')), sourceLink(reference)); return summary;
}
function adThumbnail(candidate) {
  const frame = node('div', 'ad-thumbnail'), fallback = node('p', 'thumbnail-fallback', '미리보기가 없습니다. 광고 원문을 확인하세요.');
  frame.append(fallback); const url = safeExternalUrl(candidate.thumbnailUrl);
  if (url) { const image = node('img'); image.src = url; image.alt = referenceName(candidate) + ' 미리보기'; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('load', () => { fallback.hidden = true; }); image.addEventListener('error', () => { image.remove(); fallback.hidden = false; }); frame.append(image); }
  if (candidate.mediaType === 'VIDEO') frame.append(node('span', 'video-thumbnail-tag', '영상 썸네일'));
  return frame;
}
function currentSearch() { return searches.find((search) => search.id === activeSearchId); }
function upsertSearch(search) { const index = searches.findIndex((item) => item.id === search.id); if (index < 0) searches.push(search); else searches[index] = search; }
function candidateChoices(search) {
  const candidateIds = new Set((search.candidates || []).map((candidate) => String(candidate.adId)));
  const saved = Object.hasOwn(searchChoices, search.id) ? searchChoices[search.id] : search.selectedAdIds || [];
  const choices = Array.isArray(saved) ? [...new Set(saved.map(String))].filter((id) => candidateIds.has(id)).slice(0, 3) : [];
  searchChoices[search.id] = choices; return choices;
}
function stopSearchPolling() { clearTimeout(searchPollTimer); searchPollTimer = undefined; }
function scheduleSearchPolling(delay = 8000) {
  stopSearchPolling(); const search = currentSearch();
  if (currentView !== 'reference' || document.visibilityState !== 'visible' || !['awaiting_agent', 'blocked'].includes(search?.status)) return;
  const id = search.id; searchPollTimer = setTimeout(() => { if (currentView === 'reference' && document.visibilityState === 'visible' && activeSearchId === id) refreshSearch(id); }, delay);
}
async function loadSearches() {
  if (searchListLoading) return; searchListLoading = true;
  try {
    const data = await api('/api/adcatch/searches'); (data.searches || []).forEach(upsertSearch);
    if (!searches.some((search) => search.id === activeSearchId)) activeSearchId = [...searches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.id || null;
    if (currentView === 'reference') { $('ad-results-error').hidden = true; renderReference(); persistDraft(); }
  } catch (error) { if (currentView === 'reference') { $('ad-results-error').textContent = '검색 요청 목록을 불러오지 못했습니다. ' + error.message; $('ad-results-error').hidden = false; } }
  finally { searchListLoading = false; }
}
async function refreshSearch(id, manual = false) {
  if (!id || searchFetches.has(id)) return;
  if (!manual && (currentView !== 'reference' || document.visibilityState !== 'visible' || id !== activeSearchId)) return;
  searchFetches.add(id); stopSearchPolling();
  const refreshButton = $('refresh-ad-search'); if (refreshButton && id === activeSearchId) refreshButton.disabled = true;
  try {
    const search = await api('/api/adcatch/searches/' + encodeURIComponent(id)); upsertSearch(search);
    if (currentView === 'reference' && document.visibilityState === 'visible' && activeSearchId === id) { $('ad-results-error').hidden = true; renderReference(); if (manual) notify(search.status === 'ready' ? '전달받은 검색 결과를 확인했습니다.' : search.status === 'blocked' ? (search.message || '검색을 진행하지 못했습니다. AI 대화에서 안내를 확인하세요.') : '아직 후보가 전달되지 않았습니다. AI 대화에서 검색 진행 상태를 확인하세요.'); }
  } catch (error) { if (currentView === 'reference' && activeSearchId === id) { $('ad-results-error').textContent = '검색 결과를 불러오지 못했습니다. ' + error.message; $('ad-results-error').hidden = false; } }
  finally { searchFetches.delete(id); const currentButton = $('refresh-ad-search'); if (currentButton && id === activeSearchId) currentButton.disabled = false; scheduleSearchPolling(); }
}
function renderReference() {
  const history = $('ad-search-history'), options = [...searches].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((search) => { const option = node('option', '', formatDate(search.createdAt) + ' / ' + search.query); option.value = search.id; return option; });
  if (!options.length) { const empty = node('option', '', '저장한 검색 요청이 없습니다'); empty.value = ''; options.push(empty); }
  history.replaceChildren(...options); history.value = activeSearchId || ''; history.disabled = !searches.length || searchCreating || searchSelecting;
  $('create-ad-search').disabled = searchCreating || searchSelecting; $('skip-references').disabled = searchSelecting;
  renderGuide(); const detail = $('ad-search-detail'), search = currentSearch();
  if (!search) { const empty = node('div', 'panel reference-empty'); empty.append(node('h2', '', '어떤 장면을 찾고 싶나요?'), node('p', '', '검색 요청을 만들면 이곳에서 요청문을 복사할 수 있어요. Codex 또는 Claude Code가 후보를 전달하면 선택할 수 있습니다.')); detail.replaceChildren(empty); stopSearchPolling(); return; }
  const panel = node('section', 'panel ad-handoff-panel'), status = node('span', 'prepared-tag', search.status === 'ready' ? '검색 결과 전달됨' : search.status === 'blocked' ? '검색을 진행하지 못했습니다' : 'AI에 전달할 요청 준비됨');
  panel.append(status, node('h2', '', search.query), node('p', 'detail-meta', ({ IMAGE: '이미지 광고', VIDEO: '영상 광고', ALL: '모든 광고' }[search.mediaType] || '광고') + ' / ' + ({ ALL: '전체 플랫폼', TIKTOK: 'TikTok', META: 'Meta' }[search.platform] || '전체 플랫폼') + ' / ' + formatDate(search.createdAt)));
  const handoff = node('details', 'technical-details'), text = node('textarea', 'handoff'); handoff.append(node('summary', '', '검색 요청문 확인')); text.value = search.handoff || ''; text.readOnly = true; text.rows = 7; text.setAttribute('aria-label', '저장된 광고 검색 요청문'); handoff.append(text);
  const actions = node('div', 'detail-actions');
  actions.append(button('검색 요청문 복사', 'primary', async () => { try { await navigator.clipboard.writeText(search.handoff || ''); notify('검색 요청문을 복사했습니다. Adcatch에 연결된 Codex 또는 Claude Code에 붙여 넣으세요.'); } catch { handoff.open = true; text.focus(); text.select(); notify('검색 요청문을 선택했습니다. 복사 단축키를 눌러 주세요.'); } }));
  const refresh = button('검색 결과 새로고침', 'secondary', () => refreshSearch(search.id, true)); refresh.id = 'refresh-ad-search'; refresh.disabled = searchFetches.has(search.id); actions.append(refresh);
  panel.append(node('p', 'ad-agent-instruction', search.status === 'ready' ? '전달받은 후보에서 참고할 광고를 최대 3개 선택하세요.' : search.status === 'blocked' ? (search.message || 'AI 대화에서 검색 연결 상태와 실패 안내를 확인하세요.') : 'AI에 요청문을 전달하세요. 이 프로젝트 폴더를 연 Codex 또는 Claude Code에 붙여 넣으면 연결된 Adcatch에서 검색하고 후보를 돌려줍니다.'), actions, handoff);
  const notices = node('div', 'ad-notices'); notices.append(node('p', '', '검색 범위는 Adcatch 설정에 따릅니다. 관찰 기간은 성과를 뜻하지 않습니다.')); if (search.intent === 'trending') notices.append(node('p', '', 'Adcatch 관찰 신호 기반 후보입니다. 틱톡 전체의 현재 인기 순위는 확인되지 않았습니다.')); if (search.intent === 'ugc') notices.append(node('p', '', 'UGC 여부는 실제 광고와 분석으로 확인하세요. 검색어만으로 UGC 형식을 확정하지 않습니다.')); const noticeDetails = node('details'); noticeDetails.append(node('summary', '', '검색 범위와 출처 안내')); if (search.scopeNotice) noticeDetails.append(node('p', '', search.scopeNotice)); if (search.signalNotice) noticeDetails.append(node('p', '', search.signalNotice)); if (search.scopeNotice || search.signalNotice) notices.append(noticeDetails); panel.append(notices);
  const result = node('section', 'ad-candidates-section');
  if (search.status === 'ready') {
    const candidates = Array.isArray(search.candidates) ? search.candidates : [], choices = new Set(candidateChoices(search));
    result.append(node('h3', '', '전달받은 광고 후보 ' + candidates.length + '개')); if (search.resultSummary) result.append(node('p', 'ad-result-summary', search.resultSummary));
    if (!candidates.length) result.append(node('p', 'muted', search.message || '조건에 맞는 후보가 전달되지 않았습니다. 검색어를 바꿔 새 요청을 만들거나 참고 없이 계속하세요.'));
    const grid = node('div', 'ad-candidate-grid'), selection = node('p', 'candidate-selection-count', choices.size + ' / 3개 선택'); selection.setAttribute('aria-live', 'polite');
    const use = button('선택한 광고 사용', 'primary', async () => {
      if (searchSelecting || searchCreating) return; const adIds = [...choices]; if (!adIds.length) return; searchSelecting = true; renderReference(); $('ad-results-error').hidden = true;
      try {
        const result = await api('/api/adcatch/searches/' + encodeURIComponent(search.id) + '/select', 'POST', { adIds });
        const references = Array.isArray(result.references) ? result.references : []; references.forEach((reference) => { const index = state.references.findIndex((item) => item.id === reference.id); if (index < 0) state.references.push(reference); else state.references[index] = reference; });
        selectedReferenceIds = new Set(references.map((reference) => reference.id)); referenceSkipped = false; search.selectedAdIds = adIds; upsertSearch(search); if (!kindManuallyChosen && references.some((reference) => reference.mediaType === 'VIDEO')) { document.querySelector('input[name="kind"][value="video"]').checked = true; if (!videoOptionsEdited) $('video-style').value = search.intent === 'ugc' ? 'ugc' : 'product'; if (!$('brief').value.trim()) { $('brief').value = videoBrief('reference'); preset = 'reference'; } } renderSelection(); persistDraft();
        if (currentView === 'reference' && activeSearchId === search.id) changeView('request'); notify('선택한 참고 광고 ' + references.length + '개를 이번 제작에 연결했습니다.');
      } catch (error) { if (currentView === 'reference' && activeSearchId === search.id) { $('ad-results-error').textContent = error.message; $('ad-results-error').hidden = false; } else notify(error.message); }
      finally { searchSelecting = false; if (currentView === 'reference') renderReference(); }
    }); use.disabled = !choices.size || searchSelecting || searchCreating;
    candidates.forEach((candidate) => {
      const id = String(candidate.adId), card = node('article', 'ad-candidate' + (choices.has(id) ? ' selected' : '')), label = node('label', 'ad-candidate-choice'), check = node('input'); check.type = 'checkbox'; check.checked = choices.has(id); check.disabled = searchSelecting || searchCreating; check.setAttribute('aria-label', referenceName(candidate) + ' 참고 광고로 선택');
      check.addEventListener('change', () => { if (check.checked && choices.size >= 3) { check.checked = false; notify('참고 광고는 최대 3개까지 선택할 수 있습니다.'); return; } check.checked ? choices.add(id) : choices.delete(id); searchChoices[search.id] = [...choices]; card.classList.toggle('selected', check.checked); selection.textContent = choices.size + ' / 3개 선택'; use.disabled = !choices.size; queueDraft(); });
      label.append(check, node('span', '', '참고 광고로 선택')); card.append(adThumbnail(candidate), label);
      const body = node('div', 'ad-candidate-body'); body.append(node('h4', '', referenceName(candidate))); if (candidate.pageName) body.append(node('p', 'ad-page-name', candidate.pageName));
      if (candidate.productionStyle === 'ugc_like') body.append(node('p', 'ad-format-classification', 'Adcatch 저장 분류: UGC 유사 형식')); if (typeof candidate.formatEvidence === 'string' && candidate.formatEvidence) body.append(node('p', 'ad-format-evidence', '형식 근거: ' + candidate.formatEvidence));
      if (candidate.creativeBody) body.append(node('p', 'ad-creative-body', candidate.creativeBody));
      body.append(node('p', 'ad-reason', '선정 이유: ' + (candidate.reason || '전달된 이유가 없습니다. 원문에서 참고할 부분을 확인하세요.')));
      const metadata = []; if (candidate.platform) metadata.push(Array.isArray(candidate.platform) ? candidate.platform.join(', ') : String(candidate.platform)); if (Number.isFinite(candidate.observedDays)) metadata.push('관찰 기간 ' + (candidate.observedDays + 1) + '일');
      if (metadata.length) body.append(node('p', 'ad-observation', metadata.join(' / ')));
      if (candidate.firstSeenAt || candidate.lastSeenAt) body.append(node('p', 'ad-observation', '처음 관찰: ' + (candidate.firstSeenAt ? formatDate(candidate.firstSeenAt) : '정보 없음') + ' / 최근 관찰: ' + (candidate.lastSeenAt ? formatDate(candidate.lastSeenAt) : '정보 없음')));
      body.append(sourceLink(candidate)); card.append(body); grid.append(card);
    });
    result.append(grid); if (candidates.length) { const actions = node('div', 'ad-selection-actions'); actions.append(selection, use); result.append(actions); }
  } else result.append(node('p', 'candidate-waiting', search.status === 'blocked' ? '연결이나 권한 문제를 AI 대화에서 해결한 뒤 요청문을 다시 전달하세요. 참고 없이도 계속할 수 있습니다.' : '아직 후보를 받지 않았습니다. 요청문을 AI에 전달한 뒤 이 화면에서 확인하세요.'));
  detail.replaceChildren(panel, result); scheduleSearchPolling();
}
function renderSearchExamples() {
  document.querySelectorAll('[data-search-example]').forEach((item) => { const active = item.dataset.searchExample === activeSearchExample; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
  $('ad-intent-hint').textContent = { brand: '브랜드명을 기준으로 참고할 광고를 찾습니다.', trending: 'Adcatch 관찰 신호를 참고해 후보를 찾습니다. 틱톡 전체의 실시간 인기 순위를 검증하는 기능은 아닙니다.', ugc: '사람이 제품을 소개하거나 사용하는 광고를 찾습니다. UGC 여부는 검색어만으로 확정하지 않고 실제 광고와 분석 내용으로 확인합니다.', general: '원하는 브랜드나 장면을 자유롭게 적어 주세요.' }[searchIntent];
}
document.querySelectorAll('[data-search-example]').forEach((item) => item.addEventListener('click', () => {
  const examples = { brand: { query: '마미케어 광고', mediaType: 'ALL', platform: 'ALL' }, trending: { query: '틱톡에서 지금 핫한 광고', mediaType: 'VIDEO', platform: 'TIKTOK' }, ugc: { query: '틱톡 UGC', mediaType: 'VIDEO', platform: 'TIKTOK' } };
  const selectedExample = examples[item.dataset.searchExample]; activeSearchExample = item.dataset.searchExample; searchIntent = activeSearchExample; $('ad-search-query').value = selectedExample.query; $('ad-media-type').value = selectedExample.mediaType; $('ad-platform').value = selectedExample.platform; renderSearchExamples(); queueDraft(); $('ad-search-query').focus();
}));
$('ad-search-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (searchCreating || searchSelecting) return; const query = $('ad-search-query').value.trim(); if (!query) return;
  searchCreating = true; $('ad-search-error').hidden = true; $('create-ad-search').textContent = '검색 요청 저장 중'; renderReference();
  try { const search = await api('/api/adcatch/searches', 'POST', { query, mediaType: $('ad-media-type').value, platform: $('ad-platform').value, intent: searchIntent }); upsertSearch(search); activeSearchId = search.id; searchChoices[search.id] = []; persistDraft(); if (currentView === 'reference') renderReference(); notify('검색 요청을 저장했습니다. 요청문을 복사해 AI에 전달하세요.'); }
  catch (error) { $('ad-search-error').textContent = error.message; $('ad-search-error').hidden = false; }
  finally { searchCreating = false; $('create-ad-search').textContent = '검색 요청 만들기'; if (currentView === 'reference') renderReference(); }
});
$('ad-search-query').addEventListener('input', () => { searchIntent = 'general'; activeSearchExample = null; renderSearchExamples(); queueDraft(); }); $('ad-media-type').addEventListener('change', queueDraft); $('ad-platform').addEventListener('change', queueDraft);
$('ad-search-history').addEventListener('change', () => { stopSearchPolling(); activeSearchId = $('ad-search-history').value || null; $('ad-results-error').hidden = true; renderReference(); renderGuide(); persistDraft(); });
$('skip-references').addEventListener('click', () => { if (searchSelecting) return; selectedReferenceIds.clear(); referenceSkipped = true; renderSelection(); changeView('request'); notify('검색 광고 선택을 해제하고 만들 내용으로 이동했습니다.'); });

document.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', () => changeView(el.dataset.view)));
$('history-back').addEventListener('click', () => changeView(lastStep));
document.querySelectorAll('[data-role]').forEach((el) => el.addEventListener('click', () => { role = el.dataset.role; document.querySelectorAll('[data-role]').forEach((item) => { item.classList.toggle('active', item === el); item.setAttribute('aria-pressed', String(item === el)); }); renderAssets(); }));
fields.forEach((key) => $(key).addEventListener('input', () => { $('brand-status').textContent = '초안 작성 중'; $('brand-status').classList.remove('saved'); queueDraft(); updatePreview(); }));
$('brand-form').addEventListener('submit', async (event) => { event.preventDefault(); $('save-brand').disabled = true; try { await saveBrand(); } catch (error) { notify(error.message); } finally { $('save-brand').disabled = false; } });
$('go-request').addEventListener('click', () => { $('assets-error').hidden = true; if (!$('brand-form').reportValidity()) return; if (!hasProduct()) { $('assets-error').textContent = '광고에 쓸 제품 사진을 하나 이상 선택하세요.'; $('assets-error').hidden = false; $('asset-files').focus(); return; } changeView('reference'); });
$('use-own').addEventListener('click', () => { $('brandName').focus(); document.querySelector('.brand-panel').scrollIntoView({ block: 'nearest' }); notify('아래에서 제품 사진과 브랜드 정보를 준비하세요.'); });
$('use-sample').addEventListener('click', async () => {
  if (hasExistingWork() || sampleLoading) return; sampleLoading = true; renderSampleState();
  try { const fresh = await api('/api/sample', 'POST', {}); const editedDuringLoad = hasExistingWork(); state = { brand: fresh.brand || {}, assets: fresh.assets || [], requests: fresh.requests || [], references: fresh.references || [] }; if (!editedDuringLoad) { const sampleBrand = fresh.sampleBrand || state.brand; fields.forEach((key) => { $(key).value = sampleBrand[key] || ''; }); selected = new Set(fresh.sampleAssetIds || state.assets.filter((asset) => asset.role === 'product').map((asset) => asset.id)); } renderAssets(); renderSelection(); persistDraft(); notify(editedDuringLoad ? '작성 중인 내용은 유지했습니다. 샘플 그림은 사진 목록에서 확인할 수 있습니다.' : '가상 브랜드와 제품 그림을 준비했습니다. 내용을 확인하고 2단계로 가세요.'); }
  catch (error) { notify(error.message); } finally { sampleLoading = false; renderSampleState(); }
});
$('asset-files').addEventListener('change', (event) => upload([...event.target.files]));
['dragenter', 'dragover'].forEach((event) => $('dropzone').addEventListener(event, (e) => { e.preventDefault(); if (!uploading) $('dropzone').classList.add('dragging'); }));
$('dropzone').addEventListener('dragleave', (event) => { if (!$('dropzone').contains(event.relatedTarget)) $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); upload([...event.dataTransfer.files]); });
document.querySelectorAll('[data-preset]').forEach((el) => el.addEventListener('click', () => {
  const next = el.dataset.preset; if (next === 'reference' ? !referenceReady() : next !== 'product' && !chosenAssets().some((asset) => asset.role === next)) return;
  preset = next;
  const product = brandInput().productName || '제품';
  $('brief').value = chosenKind() === 'video' ? videoBrief(next) : { product: product + '을 중심으로 광고 이미지 한 장을 만들어 주세요. 제품을 가운데 크게 놓고 밝고 단정한 배경으로 구성해 주세요. 제품의 모양, 색과 로고는 유지하고 확인되지 않은 효능이나 문구는 넣지 마세요.', reference: '선택한 참고 자료의 구도와 분위기를 활용해 ' + product + ' 광고 이미지 한 장을 만들어 주세요. 참고 자료의 문구와 다른 브랜드 제품을 복제하지 말고, 우리 제품의 모양, 색과 로고를 유지해 주세요.', person: '선택한 인물과 ' + product + '이 자연스럽게 함께 보이는 광고 이미지 한 장을 만들어 주세요. 인물 사진의 외형과 제품의 모양, 색과 로고를 유지하고 제품이 잘 보이도록 구성해 주세요.' }[next];
  queueDraft(); updatePreview(); $('brief').focus();
}));
$('brief').addEventListener('input', () => { queueDraft(); updatePreview(); }); document.querySelectorAll('input[name="kind"]').forEach((el) => el.addEventListener('change', () => { kindManuallyChosen = true; queueDraft(); updatePreview(); }));
['video-duration', 'video-ratio', 'video-style'].forEach((id) => $(id).addEventListener('change', () => { videoOptionsEdited = true; queueDraft(); updatePreview(); }));
$('request-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('request-error').hidden = true;
  const fail = (message) => { $('request-error').textContent = message; $('request-error').hidden = false; };
  if (!materialsReady()) { fail('1단계에서 브랜드명, 제품명과 선택한 제품 사진을 확인하세요.'); return; }
  if (!presetReady()) { fail(preset === 'reference' ? '2단계에서 참고 광고를 고르거나 1단계에서 참고 사진을 선택하세요.' : '1단계에서 인물 사진을 선택하세요.'); return; }
  if (!$('brief').value.trim()) { fail('만들 내용을 입력하세요.'); $('brief').focus(); return; }
  const submit = $('prepare-request'); submit.disabled = true; submit.textContent = '요청 저장 중';
  const snapshot = { brand: brandInput(), kind: chosenKind(), brief: $('brief').value.trim(), assetIds: chosenAssets().map((asset) => asset.id), referenceIds: chosenReferences().map((reference) => reference.id), preset, ...(chosenKind() === 'video' ? { videoOptions: videoOptionsInput() } : {}), ...(parentRequestId ? { parentRequestId, ...(typeof parentFeedbackText === 'string' ? { parentFeedbackText } : {}) } : {}) };
  try { const request = await api('/api/requests', 'POST', snapshot); replaceRequest(request); state.brand = request.brand || snapshot.brand; activeRequest = request.id; parentRequestId = null; parentFeedbackText = null; $('request-count').textContent = state.requests.length; persistDraft(); changeView('ai'); notify('요청을 저장했습니다. 복사해서 AI 작업을 이어 가세요.'); }
  catch (error) { fail(error.message); } finally { submit.disabled = false; submit.textContent = '요청 저장하고 AI 작업으로'; }
});
$('retry-load').addEventListener('click', load); window.addEventListener('pagehide', persistDraft); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { persistDraft(); stopSearchPolling(); } else if (currentView === 'reference') scheduleSearchPolling(0); });
load();
