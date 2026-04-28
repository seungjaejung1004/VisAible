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
        "summary": "데이터셋의 역할, 구성 요소, train/validation/test 분리와 품질 기준을 살펴봅니다.",
        "sourceLabel": "AI Dataset Chapter (PDF)",
        "sourceUrl": "/learning-pdfs/ai-dataset-chapter.pdf",
        "chapterLabel": "Dataset",
    },
    "dnn-basics": {
        "title": "DNN Chapter",
        "summary": "DNN의 기본 개념, 층 구조, 표현 학습 흐름을 직접 읽으며 질문할 수 있습니다.",
        "sourceLabel": "DNN Chapter (PDF)",
        "sourceUrl": "/learning-pdfs/dnn-chapter.pdf",
        "chapterLabel": "DNN",
    },
    "cnn-basics": {
        "title": "CNN Chapter",
        "summary": "CNN의 핵심 개념, convolution, feature map, pooling 흐름을 직접 읽으며 질문할 수 있습니다.",
        "sourceLabel": "CNN Chapter (PDF)",
        "sourceUrl": "/learning-pdfs/cnn-chapter.pdf",
        "chapterLabel": "CNN",
    },
}


LEARNING_SECTIONS: dict[str, list[dict[str, list[str] | str]]] = {
    "ai-dataset": [
        {
            "heading": "데이터셋은 모델의 경험입니다",
            "paragraphs": [
                "모델은 데이터셋에 들어 있는 샘플을 통해 패턴을 배웁니다. 그래서 어떤 샘플이 포함되는지, 클래스가 얼마나 균형 잡혀 있는지, 라벨이 정확한지가 성능에 직접 영향을 줍니다.",
                "Learning 탭에서는 PDF의 표, 예시 그림, 설명 문장을 캡처해서 데이터셋 품질이나 분할 방식이 왜 중요한지 바로 질문할 수 있습니다.",
            ],
        },
        {
            "heading": "train / validation / test 분리는 목적이 다릅니다",
            "paragraphs": [
                "train은 파라미터를 학습하는 용도이고, validation은 설정을 비교하는 용도이며, test는 최종 일반화 성능을 확인하는 용도입니다.",
                "이 셋이 섞이면 모델이 실제보다 더 잘하는 것처럼 보일 수 있으므로, PDF에서 관련 설명을 볼 때도 누가 어떤 역할인지 구분해서 읽는 것이 중요합니다.",
            ],
        },
        {
            "heading": "좋은 데이터는 양보다 구조가 중요합니다",
            "paragraphs": [
                "샘플 수가 많아도 중복이 심하거나 편향이 크면 학습이 왜곡될 수 있습니다. 반대로 적절한 클래스 구성과 깨끗한 라벨을 갖춘 데이터는 훨씬 안정적인 학습을 만듭니다.",
                "Builder에서 결과가 이상할 때는 모델 구조만 보지 말고 데이터셋의 대표성과 라벨 품질도 함께 의심해야 합니다.",
            ],
        },
    ],
    "dnn-basics": [
        {
            "heading": "Supervised learning의 기본 루프",
            "paragraphs": [
                "입력 x와 정답 y의 관계를 모델이 함수처럼 근사하도록 만드는 흐름입니다. VisAible Builder에서는 데이터셋 선택, 레이어 구성, loss 계산, optimizer 업데이트가 이 루프를 이룹니다.",
                "처음에는 정확한 수식보다 데이터가 어떤 모양으로 들어오고 어떤 출력으로 나와야 하는지 보는 것이 중요합니다.",
            ],
        },
        {
            "heading": "모델은 표현을 쌓는 구조입니다",
            "paragraphs": [
                "Linear layer나 CNN layer는 입력을 더 유용한 표현으로 바꾸는 단계입니다. 여러 층을 쌓는 이유는 단순 픽셀에서 점점 더 추상적인 패턴을 만들기 위해서입니다.",
                "레이어를 추가할수록 표현력은 커지지만, 데이터와 regularization이 부족하면 과적합도 같이 커질 수 있습니다.",
            ],
        },
        {
            "heading": "Loss는 학습의 방향 신호입니다",
            "paragraphs": [
                "Loss는 현재 예측이 정답과 얼마나 다른지 숫자로 보여줍니다. 학습은 이 숫자를 줄이는 방향으로 파라미터를 조금씩 움직이는 과정입니다.",
                "그래프에서 loss가 내려가는데 validation accuracy가 멈춘다면, 모델이 훈련 데이터에만 익숙해지고 있을 가능성을 같이 봐야 합니다.",
            ],
        },
    ],
    "cnn-basics": [
        {
            "heading": "CNN은 공간 구조를 읽습니다",
            "paragraphs": [
                "CNN은 작은 필터를 이미지 전체에 반복 적용하면서 edge, texture, shape 같은 지역 패턴을 찾아냅니다.",
                "같은 가중치를 위치별로 공유하기 때문에, 완전연결층만 쓰는 구조보다 이미지 분류에 더 자연스럽게 맞습니다.",
            ],
        },
        {
            "heading": "Feature map은 중간 표현입니다",
            "paragraphs": [
                "각 convolution 결과는 입력 이미지에서 어떤 패턴이 어디서 강하게 반응했는지 보여주는 feature map이 됩니다.",
                "층이 깊어질수록 단순 선분보다 더 복잡한 조합을 인식하게 되고, 그 정보가 뒤쪽 분류기로 전달됩니다.",
            ],
        },
        {
            "heading": "Pooling은 정보를 압축합니다",
            "paragraphs": [
                "Pooling은 중요한 반응을 남기면서 feature map 크기를 줄여 계산량을 낮추고 작은 위치 변화에 덜 민감하게 만듭니다.",
                "다만 너무 과하게 줄이면 세부 정보가 사라질 수 있으므로 convolution 층과 균형 있게 사용해야 합니다.",
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
        "답변은 5~8문장으로 하고, 필요하면 짧은 줄바꿈을 써도 된다. "
        "질문이 모호하면 현재 PDF 캡처/챕터 문맥 안에서 가장 자연스러운 해석으로 답해라. "
        '오직 JSON만 출력해. 형식은 {"answer":"..."} 하나만 허용한다.'
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
        "답변은 5~8문장으로 하고, 필요하면 짧은 줄바꿈을 써도 된다. "
        "질문이 모호하면 현재 PDF 캡처/챕터 문맥 안에서 가장 자연스러운 해석으로 답해라. "
        '오직 JSON만 출력해. 형식은 {"answer":"..."} 하나만 허용한다.'
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
