# 확장 실습 05단계: 우리 제품과 인물로 영상 제작 계획 만들기

이 단계의 결과는 장면 구성, 대사와 생성 문장입니다. 영상을 실제로 만들지는 않으며 크레딧도 쓰지 않습니다. 이 계획으로 영상을 만들고 싶으면 이 단계가 끝난 뒤 대화창에서 따로 요청합니다. 그때 Claude가 [영상 다시 만들기 안내](../docs/video-remake.md)의 ⑥처럼 견적과 남은 크레딧을 보여주고, 승인하면 만듭니다.

```text
확장 실습 05단계를 진행해줘. AGENTS.md를 읽고 영상 제작 계획만 만들어줘.
실습 앱 요청이면 해당 context.json, videoPlanPath의 video-plan.json,
videoPromptsPath의 video-prompts.md와 요청 폴더의 영상 분석 자료를 읽어줘.
수동 실습이면 work/video-analysis.md, work/brand.json,
work/assets.json, work/creative-rules.md를 읽어줘.

실습 앱 요청이면 videoOptions를 목표로 써줘.
durationSeconds는 15/20/30초, aspectRatio는 9:16/1:1/16:9,
style은 ugc/product/custom이야.
수동 실습이고 따로 정하지 않았으면 20초, 9:16, ugc를 쓰고 그렇게 했다고 알려줘.
이 옵션이 생성 모델에서 지원되는지 조회하거나 보장하지 마.

원본의 화면 구성, 카메라, 동작, 장면 길이는 그대로 따라줘.
인물, 제품, 문구, 로고는 우리 자산과 새로 쓴 문구로 바꿔줘.
다른 브랜드의 문구, 로고, 상표, 제품, 인물 얼굴은 쓰지 마.
판매처 추천 배지처럼 사실 근거가 없는 표시도 넣지 마.
원본 전체 길이가 목표 길이와 다르면 장면 길이의 비율을 유지해 맞추고 그렇게 했다고 적어줘.
제안 컷 길이의 합은 목표 전체 길이와 맞춰줘.

우리 제품과 선택한 인물에 맞게 컷별 대사와 장면을 써줘.
각 컷의 역할, 길이, 인물 행동, 제품 위치, 대사, 카메라와 연결 방식을 적어줘.
원본에서 본 내용과 우리 광고에 새로 제안하는 장면을 구분해줘.
가짜 사용 후기, 확인하지 않은 수치와 근거 없는 효능 변화는 넣지 마.

실습 앱 요청이면 기존 video-plan.json의 구조를 유지하며 cuts의 narration,
visualPrompt, referenceObservation과 확인 상태를 보완해줘.
video-prompts.md에는 컷별 영어 영상 생성 문장과 한국어 설명을 써줘.
수동 실습이면 work/storyboard.md와 work/video-prompts.md에 저장하고,
work/storyboard.md 맨 위에 참고한 reference_id를 적어줘.
제품과 인물의 참조 역할, 유지할 외형, 배경, 동작, 구도,
대사와 피해야 할 변형을 포함해줘.
실제로 업로드한 적 없는 파일 번호나 생성 서비스 ID는 만들지 마.

4컷은 이야기 구분이며 생성 호출 수가 아니야.
영상 생성 도구의 연결 확인, 모델 조회, 파일 업로드, 견적과 생성은 하지 마.
실습 앱 요청이면 video-plan.json의 generation.status는 not_started, externalGenerationEnabled는 false 그대로 둬줘.
수동 실습이면 work/video-prompts.md의 생성 상태를 pending으로 적어줘.
저장한 파일, 보완한 내용, 확인하지 못한 것을 알려줘.
영상을 실제로 만들려면 내가 대화창에서 따로 요청해야 한다는 점도 알려줘.
```
