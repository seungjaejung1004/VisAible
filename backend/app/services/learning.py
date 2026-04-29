from __future__ import annotations

import os
from functools import lru_cache

import requests

from app.schemas.learning import LearningChapterContent
from app.services.mina import (
    _GEMINI_API_URL,
    _extract_candidate_text,
    _extract_json_block,
    _extract_gateway_text,
    _gateway_api_key,
    _gateway_base_url,
    _gateway_error_detail,
    _gateway_model,
    _gemini_api_key,
    _gemini_model,
)


LEARNING_CHAPTERS: dict[str, dict[str, str]] = {
    "ai-dataset": {
        "title": "Ai Basic",
        "summary": "데이터셋을 모델 성능을 결정하는 설계 자산으로 보고, feature/label, 수집, 분할, 누수, 품질, 운영 드리프트까지 연결해 살펴봅니다.",
        "sourceLabel": "AI Dataset Slides (PDF)",
        "sourceUrl": "/learning-pdfs/ai-dataset-chapter.pdf",
        "chapterLabel": "Dataset",
    },
    "dnn-basics": {
        "title": "DNN Chapter",
        "summary": "완전연결 신경망을 함수 합성으로 읽고, neuron, layer, activation, loss, gradient, regularization의 학습 흐름을 정리합니다.",
        "sourceLabel": "DNN Slides (PDF)",
        "sourceUrl": "/learning-pdfs/dnn-chapter.pdf",
        "chapterLabel": "DNN",
    },
    "cnn-basics": {
        "title": "CNN Chapter",
        "summary": "이미지를 tensor로 유지한 채 local pattern을 찾는 CNN의 구조, convolution, feature map, pooling, classic architecture, transfer learning을 살펴봅니다.",
        "sourceLabel": "CNN Slides (PDF)",
        "sourceUrl": "/learning-pdfs/cnn-chapter.pdf",
        "chapterLabel": "CNN",
    },
}


LEARNING_SECTIONS: dict[str, list[dict[str, list[str] | str]]] = {
    "ai-dataset": [
        {
            "heading": "데이터셋은 모델의 학습 환경입니다",
            "paragraphs": [
                "모델은 데이터셋에 담긴 패턴, 결측, 편향, 라벨 기준까지 함께 배웁니다. 같은 알고리즘이라도 데이터 분포와 라벨 규칙이 바뀌면 성능과 실패 방식이 달라집니다.",
                "데이터셋 설계는 단순히 파일을 모으는 일이 아니라 문제 정의, 수집 기준, 라벨링 규칙, 평가 기준을 함께 고정하는 실험 설계입니다.",
            ],
        },
        {
            "heading": "Feature와 Label은 문제 형식에 따라 달라집니다",
            "paragraphs": [
                "Feature는 모델에게 입력되는 설명 변수이고, label 또는 target은 모델이 맞춰야 하는 정답입니다. 표 데이터에서는 column이 feature가 되고, 이미지는 pixel grid와 channel이 feature가 됩니다.",
                "분류, 회귀, 객체 탐지, 세그멘테이션처럼 문제 유형이 달라지면 label의 형태도 클래스 번호, 연속값, bounding box, pixel mask 등으로 달라집니다.",
            ],
        },
        {
            "heading": "분할, 누수, 품질은 평가 신뢰도를 결정합니다",
            "paragraphs": [
                "train set은 weight를 학습하고, validation set은 모델 후보와 설정을 비교하며, test set은 마지막 일반화 성능 보고에만 사용해야 합니다.",
                "데이터 누수, 중복 샘플, 불균형, 라벨 오류, 대표성 부족은 점수를 실제보다 좋게 보이게 하거나 배포 후 성능 하락을 만듭니다. 운영 중에는 데이터 드리프트도 계속 점검해야 합니다.",
            ],
        },
    ],
    "dnn-basics": [
        {
            "heading": "DNN은 여러 함수의 합성입니다",
            "paragraphs": [
                "한 층은 affine transform과 activation으로 구성되고, 깊은 네트워크는 이런 층을 여러 번 합성한 함수입니다.",
                "선형 모델은 feature의 가중합을 기반으로 판단하지만, DNN은 layer를 거치며 입력을 더 유용한 중간 표현으로 바꿉니다.",
            ],
        },
        {
            "heading": "Neuron과 Layer는 행렬 연산으로 계산됩니다",
            "paragraphs": [
                "뉴런은 입력 vector와 weight의 내적에 bias를 더하고 activation function을 통과시킵니다. bias는 decision boundary의 위치를 이동시키는 역할을 합니다.",
                "실제 DNN은 뉴런을 하나씩 계산하지 않고 batch와 weight matrix의 곱으로 처리합니다. GPU는 이런 큰 행렬 곱을 병렬로 빠르게 계산합니다.",
            ],
        },
        {
            "heading": "Loss, Gradient, Regularization이 학습을 움직입니다",
            "paragraphs": [
                "Loss는 모델 출력이 정답과 얼마나 다른지 수치화하고, backpropagation은 chain rule로 각 parameter가 loss에 준 영향을 계산합니다.",
                "Learning rate는 gradient 반대 방향으로 움직이는 보폭입니다. train loss와 validation loss를 함께 보고 overfitting, underfitting, scale 문제, label 문제를 분리해서 해석해야 합니다.",
            ],
        },
    ],
    "cnn-basics": [
        {
            "heading": "CNN은 이미지의 공간 구조를 유지합니다",
            "paragraphs": [
                "이미지는 H×W×C tensor이며, CNN은 이 위치와 channel 구조를 유지한 채 학습합니다. 이미지를 긴 vector로 펼치는 완전연결망보다 parameter를 훨씬 효율적으로 씁니다.",
                "Local receptive field는 작은 영역을 반복해서 보며, 같은 filter를 모든 위치에서 공유해 edge, texture, part, object를 단계적으로 학습합니다.",
            ],
        },
        {
            "heading": "Convolution과 Feature Map은 패턴 위치를 기록합니다",
            "paragraphs": [
                "Convolution filter는 입력 patch와 내적해 하나의 출력 값을 만들고, 이 값을 위치별로 모으면 feature map이 됩니다.",
                "앞쪽 layer의 filter는 edge, corner, 색 대비처럼 낮은 수준의 패턴에 반응하고, 깊어질수록 receptive field가 넓어져 더 복합적인 구조를 봅니다.",
            ],
        },
        {
            "heading": "Pooling, Augmentation, Transfer Learning은 실전 성능을 좌우합니다",
            "paragraphs": [
                "Pooling은 중요한 activation을 남기면서 공간 크기를 줄이고 작은 위치 변화에 덜 민감하게 만듭니다. Global average pooling은 마지막 feature map을 class score로 연결할 때 자주 사용됩니다.",
                "이미지 모델은 배경 shortcut, 조명, 해상도, 포즈 변화에 취약할 수 있습니다. Data augmentation과 pretrained backbone을 이용한 transfer learning은 작은 데이터셋에서 특히 중요합니다.",
            ],
        },
    ],
}


def list_learning_chapters() -> list[dict[str, str]]:
    return [
        {"id": chapter_id, **chapter}
        for chapter_id, chapter in LEARNING_CHAPTERS.items()
    ]


@lru_cache(maxsize=12)
def get_learning_chapter_content(chapter_id: str) -> dict[str, object]:
    chapter = LEARNING_CHAPTERS.get(chapter_id)
    if not chapter:
        raise ValueError("Unknown learning chapter")

    return LearningChapterContent(
        id=chapter_id,
        title=chapter["title"],
        summary=chapter["summary"],
        sourceLabel=chapter["sourceLabel"],
        sourceUrl=chapter["sourceUrl"],
        chapterLabel=chapter["chapterLabel"],
        sections=LEARNING_SECTIONS.get(chapter_id, []),
    ).model_dump()


def _learning_gemini_models(primary_model: str) -> list[str]:
    configured_fallbacks = os.getenv("LEARNING_GEMINI_FALLBACK_MODELS", "gemini-3.1-flash-lite-preview")
    models: list[str] = []
    for model in [primary_model, *configured_fallbacks.split(",")]:
        model = model.strip()
        if model and model not in models:
            models.append(model)
    return models


def _is_retryable_gemini_status(status_code: int) -> bool:
    return status_code == 429 or 500 <= status_code <= 599


def _gemini_error_detail(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return response.text.strip()

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str):
                return message
        return str(error or payload)

    return str(payload)


def chat_with_learning_gemini(
    *,
    question: str,
    chapter_id: str,
    chapter_title: str,
    source_label: str,
    source_url: str,
    lecture_context: str,
    selected_excerpt: str | None,
    selected_image_base64: str | None,
    selected_image_mime_type: str | None,
) -> dict[str, str]:
    gateway_api_key = _gateway_api_key()
    if gateway_api_key:
        return _chat_with_learning_gateway(
            question=question,
            chapter_id=chapter_id,
            chapter_title=chapter_title,
            source_label=source_label,
            source_url=source_url,
            lecture_context=lecture_context,
            selected_excerpt=selected_excerpt,
            selected_image_base64=selected_image_base64,
            selected_image_mime_type=selected_image_mime_type,
        )

    api_key = _gemini_api_key()
    model = _gemini_model()

    excerpt_block = selected_excerpt.strip() if selected_excerpt else ""
    context = lecture_context.strip()[:10000]
    has_image = bool(selected_image_base64 and selected_image_mime_type)
    system_instruction = (
        "너는 VisAible Learning 섹터의 Gemini 학습 코치다. "
        "반드시 한국어로 답하고, 사용자가 드롭한 PDF 캡처 내용이나 텍스트를 최우선 근거로 삼아라. "
        "PDF 캡처 내용이 있으면 먼저 그 안에서 보이는 수식, 도표, 축, 레이블, 문장, 시각적 관계를 구체적으로 읽고, "
        "그 다음 이것이 현재 챕터의 개념과 어떻게 연결되는지 설명해라. "
        "캡처 내용이 작거나 일부만 보이면 보이는 범위와 불확실한 범위를 분리해서 말해라. "
        "피상적인 요약으로 끝내지 말고, 학생이 헷갈릴 만한 포인트와 직관을 함께 짚어라. "
        "답변은 읽기 쉬운 GitHub Flavored Markdown으로 작성해라. "
        "필요하면 짧은 소제목, bullet list, 번호 목록, 굵은 글씨, inline code를 사용해도 된다. "
        "표나 긴 코드블록은 꼭 필요할 때만 써라. "
        "답변 길이는 보통 5~8문장 또는 3~6개 bullet 수준으로 유지해라. "
        "질문이 모호하면 현재 PDF 캡처/챕터 문맥 안에서 가장 자연스러운 해석으로 답해라. "
        '오직 JSON만 출력해. 형식은 {"answer":"..."} 하나만 허용한다. answer 문자열 안에는 markdown만 넣고 JSON 바깥 텍스트는 금지한다.'
    )
    user_prompt = "\n".join(
        [
            f"Chapter ID: {chapter_id}",
            f"Chapter Title: {chapter_title}",
            f"Source: {source_label}",
            f"Source URL: {source_url}",
            f"Has PDF Captured Content: {'Yes' if has_image else 'No'}",
            f"Selected Excerpt: {excerpt_block or 'None'}",
            f"Lecture Context: {context or 'No additional context'}",
            f"Question: {question.strip()}",
        ]
    )
    user_parts: list[dict[str, object]] = [{"text": user_prompt}]
    if selected_image_base64 and selected_image_mime_type:
        user_parts.append(
            {
                "inlineData": {
                    "mimeType": selected_image_mime_type,
                    "data": selected_image_base64,
                }
            }
        )

    response: requests.Response | None = None
    errors: list[str] = []

    for candidate_model in _learning_gemini_models(model):
        generation_config: dict[str, object] = {
            "maxOutputTokens": 1400,
            "responseMimeType": "application/json",
        }
        if candidate_model.startswith("gemini-3"):
            generation_config["thinkingConfig"] = {"thinkingLevel": "low"}

        request_payload = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": user_parts}],
            "generationConfig": generation_config,
        }

        try:
            candidate_response = requests.post(
                _GEMINI_API_URL.format(model=candidate_model),
                headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
                json=request_payload,
                timeout=45,
            )
        except requests.RequestException as error:
            errors.append(f"{candidate_model}: {error}")
            continue

        if candidate_response.status_code < 400:
            response = candidate_response
            break

        detail = _gemini_error_detail(candidate_response)
        errors.append(f"{candidate_model}: {candidate_response.status_code} {detail}".strip())
        if not _is_retryable_gemini_status(candidate_response.status_code):
            break

    if response is None:
        raise ValueError(f"Gemini learning request failed: {' | '.join(errors)}")

    try:
        payload = response.json()
    except ValueError as error:
        raise ValueError("Gemini learning response was not JSON") from error

    raw_text = _extract_candidate_text(payload)
    try:
        parsed = _extract_json_block(raw_text)
    except ValueError:
        return {"answer": raw_text.strip()}

    answer = parsed.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Gemini learning response did not include an answer")

    return {"answer": answer.strip()}


def _chat_with_learning_gateway(
    *,
    question: str,
    chapter_id: str,
    chapter_title: str,
    source_label: str,
    source_url: str,
    lecture_context: str,
    selected_excerpt: str | None,
    selected_image_base64: str | None,
    selected_image_mime_type: str | None,
) -> dict[str, str]:
    api_key = _gateway_api_key(required=True)
    model = _gateway_model()

    excerpt_block = selected_excerpt.strip() if selected_excerpt else ""
    context = lecture_context.strip()[:10000]
    has_image = bool(selected_image_base64 and selected_image_mime_type)
    system_instruction = (
        "너는 VisAible Learning 섹터의 Gemini 학습 코치다. "
        "반드시 한국어로 답하고, 사용자가 드롭한 PDF 캡처 내용이나 텍스트를 최우선 근거로 삼아라. "
        "PDF 캡처 내용이 있으면 먼저 그 안에서 보이는 수식, 도표, 축, 레이블, 문장, 시각적 관계를 구체적으로 읽고, "
        "그 다음 이것이 현재 챕터의 개념과 어떻게 연결되는지 설명해라. "
        "캡처 내용이 작거나 일부만 보이면 보이는 범위와 불확실한 범위를 분리해서 말해라. "
        "피상적인 요약으로 끝내지 말고, 학생이 헷갈릴 만한 포인트와 직관을 함께 짚어라. "
        "답변은 읽기 쉬운 GitHub Flavored Markdown으로 작성해라. "
        "필요하면 짧은 소제목, bullet list, 번호 목록, 굵은 글씨, inline code를 사용해도 된다. "
        "표나 긴 코드블록은 꼭 필요할 때만 써라. "
        "답변 길이는 보통 5~8문장 또는 3~6개 bullet 수준으로 유지해라. "
        "질문이 모호하면 현재 PDF 캡처/챕터 문맥 안에서 가장 자연스러운 해석으로 답해라. "
        '오직 JSON만 출력해. 형식은 {"answer":"..."} 하나만 허용한다. answer 문자열 안에는 markdown만 넣고 JSON 바깥 텍스트는 금지한다.'
    )
    user_prompt = "\n".join(
        [
            f"Chapter ID: {chapter_id}",
            f"Chapter Title: {chapter_title}",
            f"Source: {source_label}",
            f"Source URL: {source_url}",
            f"Has PDF Captured Content: {'Yes' if has_image else 'No'}",
            f"Selected Excerpt: {excerpt_block or 'None'}",
            f"Lecture Context: {context or 'No additional context'}",
            f"Question: {question.strip()}",
        ]
    )

    user_content: list[dict[str, object]] = [{"type": "text", "text": user_prompt}]
    if selected_image_base64 and selected_image_mime_type:
        user_content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{selected_image_mime_type};base64,{selected_image_base64}",
                },
            }
        )

    request_payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": 1400,
        "temperature": 0.2,
    }

    try:
        response = requests.post(
            f"{_gateway_base_url()}/chat/completions/",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json=request_payload,
            timeout=45,
        )
    except requests.RequestException as error:
        raise ValueError(f"Gateway learning request failed: {error}") from error

    if response.status_code >= 400:
        raise ValueError(
            f"Gateway learning request failed: {response.status_code} {_gateway_error_detail(response)}"
        )

    try:
        payload = response.json()
    except ValueError as error:
        raise ValueError("Gateway learning response was not JSON") from error

    raw_text = _extract_gateway_text(payload)
    try:
        parsed = _extract_json_block(raw_text)
    except ValueError:
        return {"answer": raw_text.strip()}

    answer = parsed.get("answer")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("Gateway learning response did not include an answer")

    return {"answer": answer.strip()}
