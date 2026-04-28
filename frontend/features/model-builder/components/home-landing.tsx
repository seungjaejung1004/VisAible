'use client';

import Image from 'next/image';
import { Icon } from '@/features/model-builder/components/icons';
import type { WorkspaceMode } from '@/types/builder';

type HomeLandingProps = {
  onNavigate: (workspace: Exclude<WorkspaceMode, 'home'>) => void;
};

const showcaseCards = [
  {
    title: 'Lab',
    subtitle: '블록을 쌓고 결과를 바로 시각화합니다',
    description:
      'Linear, CNN, Pooling, Dropout 블록을 직접 쌓고, 학습 지표, 결정 경계, 모델 흐름까지 한 화면에서 같이 확인할 수 있습니다.',
    imageSrc: '/showcase/lab-builder.png',
    workspace: 'builder' as const,
    action: 'Lab 열기',
  },
  {
    title: 'Docs',
    subtitle: '이론을 읽다가 바로 Mina에게 묻습니다',
    description:
      'DNN, CNN 같은 핵심 이론을 PDF로 읽고, 궁금한 부분은 캡처해서 바로 Mina에게 질문하며 학습을 이어갑니다.',
    imageSrc: '/showcase/docs-cnn-chat.png',
    workspace: 'learning' as const,
    action: 'Docs 보기',
  },
  {
    title: 'Playground',
    subtitle: 'AI가 실제로 뭘 할 수 있는지 먼저 체험합니다',
    description:
      '주식 예측처럼 결과가 바로 보이는 인터랙션으로, 공부 전에 먼저 AI의 출력과 반응을 경험하게 합니다.',
    imageSrc: '/showcase/stock-playground.png',
    workspace: 'playground' as const,
    action: 'Playground 열기',
  },
  {
    title: 'Playground Mini Game',
    subtitle: '카메라로 CNN 인식을 바로 체험합니다',
    description:
      '실시간 손 모양 인식 미니 게임으로, CNN이 단순한 이론이 아니라 바로 반응하는 기술이라는 걸 느끼게 합니다.',
    imageSrc: '/showcase/rps-playground.png',
    workspace: 'playground' as const,
    action: '미니 게임 열기',
  },
];

const platformPillars = [
  {
    title: '코딩을 쉽게',
    description:
      '복잡한 코드부터 보지 않아도 됩니다. 블록을 직접 움직이며 모델 구조를 쌓고, AI를 만드는 흐름을 먼저 이해하게 합니다.',
    icon: 'play' as const,
  },
  {
    title: '보이지 않는 것을 보이게',
    description:
      '학습 결과, 구조 변화, 분류 흐름처럼 글로만 보면 어려운 개념을 시각화해서 이해하기 쉽게 보여줍니다.',
    icon: 'rocket' as const,
  },
  {
    title: '배우면서 바로 질문하게',
    description:
      '자료를 읽다가 막히면 Mina에게 바로 묻고, 실험하다가 막히면 가이드를 따라가며 다음 행동을 자연스럽게 이어가게 합니다.',
    icon: 'file' as const,
  },
];

const learningJourney = [
  {
    step: '01',
    title: 'Playground',
    description:
      '막연하게 공부만 시작하지 않고, AI로 실제 무엇을 만들 수 있는지 예시를 먼저 체험합니다.',
  },
  {
    step: '02',
    title: 'Tutorial',
    description:
      '블록을 왜 이렇게 쌓는지 하나씩 따라 하며 사용법을 익히고, 스스로 깨닫는 지점까지 연결합니다.',
  },
  {
    step: '03',
    title: 'Docs',
    description:
      '이론 자료를 읽고, 옆의 Mina에게 실시간으로 질문하면서 DNN과 CNN 개념을 끊기지 않게 학습합니다.',
  },
  {
    step: '04',
    title: 'Lab',
    description:
      '주어진 데이터셋으로 구조, 증강, 하이퍼파라미터를 바꿔 보며 여러 실험을 직접 해볼 수 있습니다.',
  },
  {
    step: '05',
    title: 'Competition',
    description:
      '의존성 설치나 제출 파일 정리 없이, 모델 구조와 증강, 하이퍼파라미터 튜닝만으로 간단히 실력을 겨룹니다.',
  },
];

const visualizationCards = [
  {
    title: 'Feature Map',
    description: 'Conv 레이어가 입력 이미지에서 어떤 특징을 잡아내고 있는지 대표 활성 맵으로 바로 확인할 수 있습니다.',
    imageSrc: '/showcase/feature-map.png',
  },
  {
    title: 'Decision Boundary',
    description: '모델이 각 숫자 클래스를 어떤 경계로 구분하는지 시각화해서, 분류가 어떻게 나뉘는지 감각적으로 이해할 수 있습니다.',
    imageSrc: '/showcase/decision-boundary.png',
  },
  {
    title: 'Model Preview',
    description: '쌓아 둔 블록이 실제로 어떤 아키텍처 흐름을 만드는지 전체 구조로 미리 보고 해석할 수 있습니다.',
    imageSrc: '/showcase/model-preview.png',
  },
];

const workspaceCards = [
  {
    title: 'Playground',
    description: 'AI가 실제로 무엇을 할 수 있는지 결과부터 체험하는 공간',
    workspace: 'playground' as const,
    accent: 'from-[#ecf3ff] to-[#dfe9ff]',
  },
  {
    title: 'Docs',
    description: '이론 PDF와 Mina 질문을 붙여서 학습하는 공간',
    workspace: 'learning' as const,
    accent: 'from-[#eefbf7] to-[#ddf5ea]',
  },
  {
    title: 'Tutorial',
    description: '블록을 하나씩 따라 쌓으며 이해를 만드는 수업형 공간',
    workspace: 'tutorial' as const,
    accent: 'from-[#fff7e8] to-[#ffedd0]',
  },
  {
    title: 'Lab',
    description: '주어진 데이터셋으로 구조와 파라미터를 실험하는 공간',
    workspace: 'builder' as const,
    accent: 'from-[#f5f1ff] to-[#e8dcff]',
  },
  {
    title: 'Competition',
    description: '복잡한 제출 과정 없이 튜닝 실력으로 승부하는 공간',
    workspace: 'competition' as const,
    accent: 'from-[#fff0f2] to-[#ffe2e8]',
  },
];

export function HomeLanding({ onNavigate }: HomeLandingProps) {
  return (
    <section className="grid gap-4">
      <div className="ui-subtle-surface relative overflow-hidden px-6 py-7 lg:px-8 lg:py-8">
        <div className="absolute right-[-80px] top-[-60px] h-52 w-52 rounded-full bg-[radial-gradient(circle,#bcd1ff_0%,rgba(188,209,255,0)_72%)]" />
        <div className="absolute bottom-[-80px] left-[-40px] h-56 w-56 rounded-full bg-[radial-gradient(circle,#d5f0e6_0%,rgba(213,240,230,0)_72%)]" />

        <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.04fr)_minmax(420px,0.96fr)] xl:items-center">
          <div>
            <div className="ui-section-title">Beginner Deep Learning Education Platform</div>
            <h1 className="mt-3 max-w-[780px] font-display text-[clamp(2.2rem,4vw,4.6rem)] font-bold leading-[0.94] tracking-[-0.07em] text-[#10213b]">
              딥러닝 입문자를 위한
              <br />
              블록코딩 교육 플랫폼
            </h1>
            <p className="mt-4 max-w-[780px] text-[15px] leading-7 text-[#53657f]">
              VisAible은 어려운 코드부터 보여주는 대신, 블록을 움직이며 모델을 직접 쌓고 시각화로 결과를 이해하게 만드는 학습 플랫폼입니다.
              처음엔 Playground로 흥미를 만들고, Tutorial과 Docs로 원리를 익힌 뒤, Lab과 Competition에서 직접 실험하고 비교하는 흐름으로 설계했습니다.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('builder')}
                className="rounded-[18px] bg-primary px-5 py-3 text-[15px] font-bold text-white shadow-[0_14px_28px_rgba(17,81,255,0.18)] transition hover:brightness-105"
              >
                Lab 시작하기
              </button>
              <button
                type="button"
                onClick={() => onNavigate('learning')}
                className="rounded-[18px] border border-[#cfe0ff] bg-white px-5 py-3 text-[15px] font-bold text-primary transition hover:bg-[#f8fbff]"
              >
                Docs 둘러보기
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <StatChip label="Easy Coding" value="블록으로 쉽게 설계" />
              <StatChip label="Visible Learning" value="시각화로 바로 이해" />
              <StatChip label="AI Assistant" value="Mina와 함께 학습" />
            </div>
          </div>

          <div className="grid gap-3">
            <div className="overflow-hidden rounded-[28px] border border-[#dbe5f1] bg-white p-3 shadow-[0_24px_52px_rgba(15,23,42,0.08)]">
              <div className="overflow-hidden rounded-[22px] border border-[#e6edf7] bg-[#f8fbff]">
                <Image
                  src="/showcase/lab-builder.png"
                  alt="VisAible Lab screenshot"
                  width={1400}
                  height={900}
                  className="h-auto w-full object-cover"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FloatingHighlight
                title="블록과 시각화가 같이 움직입니다"
                description="모델 구조를 바꾸면 지표와 시각화가 같이 바뀌어, 결과를 감으로 넘기지 않게 합니다."
                icon="rocket"
              />
              <FloatingHighlight
                title="읽고 묻고 실험하는 흐름"
                description="Docs, Tutorial, Lab, Competition이 분절되지 않고 하나의 학습 루프로 이어집니다."
                icon="file"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div>
          <div className="ui-section-title">What Makes It Easier</div>
          <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
            입문자가 막히는 지점을 플랫폼 구조로 줄였습니다
          </h2>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {platformPillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-[22px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]"
            >
              <div className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#eef4ff] text-primary">
                <Icon name={pillar.icon} className="h-5 w-5" />
              </div>
              <div className="mt-4 text-[18px] font-bold text-[#10213b]">{pillar.title}</div>
              <div className="mt-2 text-[13px] leading-6 text-[#5a6c86]">{pillar.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div>
          <div className="ui-section-title">Product Preview</div>
          <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
            실제 화면으로 보는 VisAible
          </h2>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {showcaseCards.map((card) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[24px] border border-[#dbe5f1] bg-white px-4 py-4 shadow-[0_18px_36px_rgba(15,23,42,0.05)]"
            >
              <div className="overflow-hidden rounded-[18px] border border-[#e4ebf6] bg-[#f8fbff]">
                <Image
                  src={card.imageSrc}
                  alt={`${card.title} screenshot`}
                  width={1200}
                  height={760}
                  className="h-[240px] w-full object-cover object-top"
                />
              </div>
              <div className="mt-4">
                <div className="ui-section-title">{card.title}</div>
                <h3 className="mt-1.5 text-[20px] font-bold text-[#10213b]">{card.subtitle}</h3>
                <p className="mt-2 text-[13px] leading-6 text-[#5a6c86]">{card.description}</p>
                <button
                  type="button"
                  onClick={() => onNavigate(card.workspace)}
                  className="mt-4 inline-flex items-center gap-2 rounded-[16px] border border-[#d6e2f4] bg-white px-4 py-2.5 text-[13px] font-bold text-primary transition hover:bg-[#f8fbff]"
                >
                  {card.action}
                  <Icon name="chevron" className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div>
          <div className="ui-section-title">Visible Outputs</div>
          <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
            블록만 쌓는 게 아니라, 내부 변화를 같이 보여줍니다
          </h2>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {visualizationCards.map((card) => (
            <article
              key={card.title}
              className="overflow-hidden rounded-[24px] border border-[#dbe5f1] bg-white px-4 py-4 shadow-[0_18px_36px_rgba(15,23,42,0.05)]"
            >
              <div className="overflow-hidden rounded-[18px] border border-[#e4ebf6] bg-[#f8fbff]">
                <Image
                  src={card.imageSrc}
                  alt={`${card.title} screenshot`}
                  width={1200}
                  height={760}
                  className="h-[260px] w-full object-cover object-top"
                />
              </div>
              <div className="mt-4">
                <div className="ui-section-title">{card.title}</div>
                <p className="mt-2 text-[13px] leading-6 text-[#5a6c86]">{card.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div>
          <div className="ui-section-title">Learning Journey</div>
          <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
            VisAible은 이렇게 배우게 합니다
          </h2>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-5">
          {learningJourney.map((item) => (
            <div
              key={item.step}
              className="rounded-[22px] border border-[#dbe5f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
            >
              <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#7b8da8]">
                Step {item.step}
              </div>
              <div className="mt-2 text-[20px] font-bold text-[#10213b]">{item.title}</div>
              <div className="mt-2 text-[13px] leading-6 text-[#5a6c86]">{item.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="ui-section-title">Workspace Map</div>
            <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
              각 공간은 다른 학습 역할을 맡고 있습니다
            </h2>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {workspaceCards.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => onNavigate(card.workspace)}
              className={`rounded-[22px] border border-[#dbe5f1] bg-gradient-to-br ${card.accent} px-4 py-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5`}
            >
              <div className="text-[18px] font-bold text-[#10213b]">{card.title}</div>
              <div className="mt-2 text-[13px] leading-6 text-[#54657f]">{card.description}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#dbe5f1] bg-white/88 px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7b8da8]">{label}</div>
      <div className="mt-1 text-[14px] font-bold text-[#10213b]">{value}</div>
    </div>
  );
}

function FloatingHighlight({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: 'rocket' | 'file';
}) {
  return (
    <div className="rounded-[20px] border border-[#dbe5f1] bg-white/92 px-4 py-4 shadow-[0_14px_28px_rgba(15,23,42,0.05)]">
      <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[#eef4ff] text-primary">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </div>
      <div className="mt-3 text-[16px] font-bold text-[#10213b]">{title}</div>
      <div className="mt-1.5 text-[12px] leading-5 text-[#5a6c86]">{description}</div>
    </div>
  );
}
