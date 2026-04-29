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
    videoSrc: '/showcase/videos/1.mov',
    videoPosition: 'object-top',
    workspace: 'builder' as const,
    action: 'Lab 열기',
  },
  {
    title: 'Docs',
    subtitle: '이론을 읽다가 바로 Mina에게 묻습니다',
    description:
      'DNN, CNN 같은 핵심 이론을 PDF로 읽고, 궁금한 부분은 캡처해서 바로 Mina에게 질문하며 학습을 이어갑니다.',
    videoSrc: '/showcase/videos/2.mp4',
    videoPosition: 'object-[center_68%]',
    workspace: 'learning' as const,
    action: 'Docs 보기',
  },
  {
    title: 'Playground',
    subtitle: 'AI가 실제로 뭘 할 수 있는지 먼저 체험합니다',
    description:
      '주식 예측처럼 결과가 바로 보이는 인터랙션으로, 공부 전에 먼저 AI의 출력과 반응을 경험하게 합니다.',
    videoSrc: '/showcase/videos/3.mov',
    videoPosition: 'object-top',
    workspace: 'playground' as const,
    action: 'Playground 열기',
  },
  {
    title: 'Playground Mini Game',
    subtitle: '카메라로 CNN 인식을 바로 체험합니다',
    description:
      '실시간 손 모양 인식 미니 게임으로, CNN이 단순한 이론이 아니라 바로 반응하는 기술이라는 걸 느끼게 합니다.',
    videoSrc: '/showcase/videos/4.mov',
    videoPosition: 'object-[center_72%]',
    workspace: 'playground' as const,
    action: '미니 게임 열기',
  },
];

const platformPillars = [
  {
    title: 'Visual Model Builder',
    description: '레이어 블록을 조립해 CNN, Pooling, Dropout 구조를 빠르게 설계합니다.',
    icon: 'play' as const,
  },
  {
    title: 'Explainable Training',
    description: '학습 지표, 결정 경계, Feature Map을 같은 맥락에서 해석합니다.',
    icon: 'rocket' as const,
  },
  {
    title: 'Guided Learning Ops',
    description: '문서, 튜토리얼, 실험, 경쟁을 하나의 학습 운영 흐름으로 연결합니다.',
    icon: 'file' as const,
  },
];

const learningJourney = [
  {
    step: '01',
    title: 'Playground',
    description: 'AI 출력과 인터랙션을 먼저 경험합니다.',
  },
  {
    step: '02',
    title: 'Tutorial',
    description: '블록 설계 흐름을 단계별로 익힙니다.',
  },
  {
    step: '03',
    title: 'Docs',
    description: '이론과 질문을 같은 화면에서 이어갑니다.',
  },
  {
    step: '04',
    title: 'Lab',
    description: '모델 구조와 하이퍼파라미터를 실험합니다.',
  },
  {
    step: '05',
    title: 'Competition',
    description: '튜닝 결과를 리더보드로 비교합니다.',
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

export function HomeLanding({ onNavigate }: HomeLandingProps) {
  return (
    <section className="grid gap-4">
      <div className="relative isolate min-h-[560px] overflow-hidden rounded-[28px] border border-[#dbe5f1] bg-[#f7fbff] px-6 py-8 shadow-[0_24px_60px_rgba(15,23,42,0.09)] lg:px-9 lg:py-10">
        <Image
          src="/showcase/landing-block-coding-hero.png"
          alt="Block coding AI education platform visual"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1440px"
          className="absolute inset-0 z-0 h-full w-full object-cover object-[62%_center]"
        />
        <div className="absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(248,251,255,0.98)_0%,rgba(248,251,255,0.94)_37%,rgba(248,251,255,0.58)_62%,rgba(248,251,255,0.14)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 z-10 h-36 bg-[linear-gradient(0deg,rgba(247,251,255,0.92),rgba(247,251,255,0))]" />

        <div className="relative z-20 flex min-h-[500px] max-w-[760px] flex-col justify-center">
          <div className="ui-section-title">AI Model Building Platform</div>
          <h1 className="mt-3 font-display text-[clamp(4rem,8vw,7.4rem)] font-black leading-[0.85] text-[#10213b]">
            VisAible
          </h1>
          <p className="mt-4 max-w-[660px] break-keep text-[clamp(1.8rem,2.3vw,3rem)] font-bold leading-[1.08] tracking-[-0.06em] text-[#10213b]">
            블록코딩으로 설계하고,
            <br />
            시각화로 검증하는 AI 교육 플랫폼
          </p>
          <p className="mt-4 max-w-[500px] break-keep text-[15px] leading-7 text-[#53657f]">
            설계부터 해석까지 한 화면에 묶어 실험 결과를 바로 설명하게 합니다.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onNavigate('builder')}
              className="rounded-[18px] bg-primary px-5 py-3 text-[15px] font-bold text-white shadow-[0_14px_28px_rgba(17,81,255,0.2)] transition hover:brightness-105"
            >
              Lab 시작하기
            </button>
            <button
              type="button"
              onClick={() => onNavigate('learning')}
              className="rounded-[18px] border border-[#cfe0ff] bg-white/90 px-5 py-3 text-[15px] font-bold text-primary shadow-[0_10px_24px_rgba(15,23,42,0.04)] backdrop-blur transition hover:bg-white"
            >
              Docs 둘러보기
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatChip label="Block Builder" value="레이어 조립형 설계" />
            <StatChip label="Visual Training" value="실시간 학습 해석" />
            <StatChip label="Learning Ops" value="실험부터 경쟁까지" />
          </div>
        </div>
      </div>

      <div className="ui-surface px-5 py-5">
        <div>
          <div className="ui-section-title">What Makes It Easier</div>
          <h2 className="mt-1.5 text-[28px] font-bold tracking-[-0.05em] text-[#10213b]">
            AI 학습 경험을 설계, 해석, 운영까지 연결합니다
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
                <video
                  src={card.videoSrc}
                  className={`h-[240px] w-full object-cover ${card.videoPosition}`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  aria-label={`${card.title} preview video`}
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
            도입부터 실험까지 이어지는 학습 플로우
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
