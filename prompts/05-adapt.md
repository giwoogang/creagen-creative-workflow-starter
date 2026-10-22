# 우리 제품과 인물로 영상 패키지 준비

이번 단계의 산출물은 컷 구성, 대사와 프롬프트입니다. 실제 영상 생성은 별도 실행 시험이며 지금은 생성 서비스의 연결, 조회, 업로드, 견적과 생성을 호출하지 않습니다.

```text
AGENTS.md를 읽고 영상 제작 준비만 진행해줘.
웹앱 요청이면 해당 context.json, videoPlanPath의 video-plan.json,
videoPromptsPath의 video-prompts.md와 요청 폴더의 영상 분석 자료를 읽어줘.
수동 실습이면 work/video-analysis.md, work/brand.json,
work/assets.json, work/creative-rules.md를 읽어줘.

웹앱의 videoOptions를 목표로 사용해줘.
durationSeconds는 15/20/30초, aspectRatio는 9:16/1:1/16:9,
style은 ugc/product/custom이야. 기본값은 20초, 9:16, ugc야.
이 옵션이 생성 모델에서 지원되는지 조회하거나 보장하지 마.

우리 제품과 선택한 인물에 맞게 컷별 대사와 장면을 작성해줘.
제안 컷 길이의 합은 선택한 전체 길이와 맞춰줘.
각 컷의 역할, 인물 행동, 제품 위치, 대사, 카메라와 연결 방식을 적어줘.
원본에서 관찰한 내용과 우리 광고에 새로 제안하는 장면을 구분해줘.
가짜 사용 후기, 확인하지 않은 수치와 근거 없는 효능 변화는 넣지 마.

웹앱은 기존 video-plan.json의 구조를 유지하며 cuts의 narration,
visualPrompt, referenceObservation과 확인 상태를 보완해줘.
video-prompts.md에는 컷별 영어 영상 프롬프트와 한국어 설명을 작성해줘.
수동 실습이면 work/storyboard.md와 work/video-prompts.md에 저장해줘.
제품과 인물의 참조 역할, 유지할 외형, 배경, 동작, 구도,
대사와 피해야 할 변형을 포함해줘.
실제로 업로드한 적 없는 파일 번호나 생성 서비스 ID는 만들지 마.

4컷은 이야기 구분이며 생성 호출 수가 아니야.
영상 생성 MCP/API의 연결 확인, 모델 조회, 파일 업로드,
견적과 생성 호출은 하지 마. 실제 영상 생성 시험도 진행하지 마.
generation.status는 not_started, externalGenerationEnabled는 false로 남겨줘.
저장한 파일, 보완한 내용, 미확인 항목과 이후 별도 시험이 필요하다는 점을 알려줘.
```
