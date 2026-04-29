'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AugmentationPanel } from '@/features/model-builder/components/augmentation-panel';
import { Canvas } from '@/features/model-builder/components/canvas';
import { CompetitionPanel } from '@/features/model-builder/components/competition-panel';
import { CompetitionRankModal } from '@/features/model-builder/components/competition-rank-modal';
import { CompetitionSidebar } from '@/features/model-builder/components/competition-sidebar';
import { HomeLanding } from '@/features/model-builder/components/home-landing';
import { Icon } from '@/features/model-builder/components/icons';
import { Inspector } from '@/features/model-builder/components/inspector';
import { LearningWorkspace as LearningWorkspacePanel } from '@/features/model-builder/components/learning-workspace';
import { MinaBubbleChat, type MinaMessage } from '@/features/model-builder/components/mina-bubble-chat';
import { MnistElevatorMission } from '@/features/model-builder/components/mnist-elevator-mission';
import { ModelPreviewModal } from '@/features/model-builder/components/model-preview-modal';
import { RockPaperScissorsPlayground } from '@/features/model-builder/components/rock-paper-scissors-playground';
import { Sidebar } from '@/features/model-builder/components/sidebar';
import { StockPlayground } from '@/features/model-builder/components/stock-playground';
import { TopBar } from '@/features/model-builder/components/top-bar';
import { TrainingLiveOverlay } from '@/features/model-builder/components/training-live-overlay';
import { TutorialCoachOverlay } from '@/features/model-builder/components/tutorial-coach-overlay';
import { useBuilderBoard } from '@/features/model-builder/hooks/use-builder-board';
import { chatWithMina } from '@/lib/api/mina';
import {
  tutorialSequence,
  type TutorialStepKey,
} from '@/features/model-builder/lib/tutorial-steps';
import {
  createCompetitionRoom,
  enterCompetitionRoom,
  getCompetitionLeaderboard,
  getCompetitionRoom,
  getTrainingStatus,
  startTraining,
  stopTraining,
  submitCompetitionRun,
  subscribeTrainingStatus,
} from '@/lib/api/model-builder';
import { defaultAugmentationParams } from '@/lib/constants/augmentations';
import { competitionDatasets, datasets, libraryBlocks } from '@/lib/constants/builder-data';
import { stockPlaygroundPresets } from '@/lib/constants/stock-playground';
import {
  batchSizeOptions,
  optimizerConfigs,
  optimizerOrder,
  type OptimizerName,
  type OptimizerParams,
} from '@/lib/constants/training-controls';
import type {
  BlockType,
  CanvasNode,
  CompetitionLeaderboard,
  CompetitionRoomSession,
  CompetitionSubmissionResult,
  TrainingAugmentationId,
  TrainingChallengeSample,
  TrainingJobStatus,
  TrainingAugmentationParams,
  TrainingRunResult,
  StockPreset,
  WorkspaceMode,
  PlaygroundMode,
} from '@/types/builder';

const availableCompetitionDatasets = competitionDatasets;

function formatCompetitionDateLabel(value?: string | null) {
  if (!value) {
    return 'Open';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Open';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getCompetitionTimeline(room: CompetitionRoomSession, now: number) {
  const fallbackStart = room.startsAt ?? room.createdAt;
  const start = fallbackStart ? new Date(fallbackStart) : null;
  const end = room.endsAt ? new Date(room.endsAt) : null;

  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    return null;
  }

  const total = Math.max(end.getTime() - start.getTime(), 1);
  const elapsed = Math.min(Math.max(now - start.getTime(), 0), total);
  const remaining = Math.max(end.getTime() - now, 0);
  const progress = Math.round((elapsed / total) * 100);

  return {
    startLabel: formatCompetitionDateLabel(start.toISOString()),
    endLabel: formatCompetitionDateLabel(end.toISOString()),
    remainingMs: remaining,
    progress,
    isEnded: remaining <= 0,
  };
}

function formatRemainingTime(ms: number) {
  if (ms <= 0) {
    return '종료됨';
  }

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}일 ${hours}시간 남음`;
  }

  if (hours > 0) {
    return `${hours}시간 ${minutes}분 남음`;
  }

  return `${minutes}분 남음`;
}

function LearningWorkspace() {
  return <LearningWorkspacePanel />;
}

type CompetitionRunRecord = {
  jobId: string;
  trainAccuracy: number;
  validationAccuracy: number;
  submitted: boolean;
  submission?: CompetitionSubmissionResult | null;
  completedAt?: string | null;
};

type DatasetTeachingConfig = {
  allowedBlocks: BlockType[];
};

type WorkspaceSnapshot = {
  datasetId: string;
  nodes: CanvasNode[];
};

type MinaCanvasHighlight = {
  blockIndex: number;
  fieldLabel: string;
  suggestedValue?: string | null;
  reason?: string | null;
};

function summarizeBlocks(nodes: CanvasNode[]) {
  if (nodes.length === 0) {
    return 'No blocks added yet.';
  }

  return nodes
    .map((node, index) => {
      const primaryFields = node.fields
        .slice(0, 4)
        .map((field) => `${field.label}=${field.value}`)
        .join(', ');
      return `${index + 1}:${node.type}(${primaryFields}${node.activation !== 'None' ? `, act=${node.activation}` : ''})`;
    })
    .join(' | ');
}

function summarizeArchitecture(nodes: CanvasNode[]) {
  if (nodes.length === 0) {
    return 'nn.Sequential()';
  }

  const layers: string[] = [];
  let hasFlatten = false;

  nodes.forEach((node, index) => {
    const fieldValue = (label: string, fallback: string) =>
      node.fields.find((field) => field.label === label)?.value ?? fallback;

    if (node.type === 'cnn') {
      layers.push(
        `nn.Conv2d(${fieldValue('Channel In', '1')},${fieldValue('Channel Out', '16')},k=${fieldValue('Kernel Size', '3x3')},s=${fieldValue('Stride', '1')},p=${fieldValue('Padding', '1')})`,
      );
      if (node.activation !== 'None') {
        layers.push(`act=${node.activation}`);
      }
      return;
    }

    if (node.type === 'pooling') {
      const poolType = fieldValue('Pool Type', 'MaxPool');
      if (poolType === 'AdaptiveAvgPool') {
        layers.push('nn.AdaptiveAvgPool2d((1,1))');
        return;
      }
      layers.push(
        `${poolType}(k=${fieldValue('Kernel Size', '2x2')},s=${fieldValue('Stride', 'auto') || 'auto'},p=${fieldValue('Padding', '0')})`,
      );
      return;
    }

    if (node.type === 'dropout') {
      layers.push(`nn.Dropout(p=${fieldValue('Probability', '0.30')})`);
      return;
    }

    if (!hasFlatten) {
      layers.push('nn.Flatten()');
      hasFlatten = true;
    }

    layers.push(`nn.Linear(${fieldValue('Input', '?')},${fieldValue('Output', '?')})`);
    if (node.activation !== 'None' && index !== nodes.length - 1) {
      layers.push(`act=${node.activation}`);
    }
  });

  return `nn.Sequential(${layers.join(' -> ')})`;
}

function summarizeMetrics(trainingStatus: TrainingJobStatus | null) {
  const metrics = trainingStatus?.metrics ?? [];
  const latest = metrics.at(-1);
  if (!latest) {
    return 'No completed training metrics yet.';
  }

  const bestValidation =
    trainingStatus?.bestValidationAccuracy != null
      ? `${(trainingStatus.bestValidationAccuracy * 100).toFixed(2)}%`
      : 'unknown';

  return [
    `Epoch ${latest.epoch}`,
    `train loss ${latest.trainLoss}`,
    `train acc ${(latest.trainAccuracy * 100).toFixed(2)}%`,
    `validation loss ${latest.validationLoss}`,
    `validation acc ${(latest.validationAccuracy * 100).toFixed(2)}%`,
    `best validation acc ${bestValidation}`,
  ].join(', ');
}

function summarizeNodeDetails(nodes: CanvasNode[]) {
  return nodes.map((node, index) => ({
    index: index + 1,
    type: node.type,
    title: node.title,
    activation: node.activation,
    fields: node.fields.map((field) => ({
      label: field.label,
      value: field.value,
    })),
  }));
}

function detectMinaRequestKind(question: string): 'general' | 'improvement' {
  const normalized = question.toLowerCase().trim();
  const improvementSignals = [
    '개선',
    '수정',
    '바꾸',
    '올리',
    '향상',
    '튜닝',
    '고치',
    '어디를',
    '어떤 블럭',
    '어떤 블록',
    '성능',
    'improve',
    'better',
    'tune',
    'change',
    'fix',
    'optimize',
    'performance',
  ];

  return improvementSignals.some((signal) => normalized.includes(signal))
    ? 'improvement'
    : 'general';
}

type LessonCoachStep =
  | 'mlp12-intro'
  | 'mlp12-add-layer'
  | 'mlp12-match-input'
  | 'mlp12-retrain'
  | 'mlp12-success'
  | 'cnn11-stack-linear'
  | 'cnn11-train-linear'
  | 'cnn11-place-first-cnn'
  | 'cnn11-set-first-cnn-in'
  | 'cnn11-set-first-cnn-out'
  | 'cnn11-add-linear'
  | 'cnn11-place-first-pool'
  | 'cnn11-match-linear'
  | 'cnn11-place-second-cnn'
  | 'cnn11-set-second-cnn-in'
  | 'cnn11-set-second-cnn-out'
  | 'cnn11-add-third-cnn'
  | 'cnn11-place-third-cnn'
  | 'cnn11-set-third-cnn-in'
  | 'cnn11-set-third-cnn-out'
  | 'cnn11-add-fourth-cnn'
  | 'cnn11-place-fourth-cnn'
  | 'cnn11-set-fourth-cnn-in'
  | 'cnn11-set-fourth-cnn-out'
  | 'cnn11-add-second-pool'
  | 'cnn11-place-second-pool'
  | 'cnn11-add-head-linear'
  | 'cnn11-place-head-linear'
  | 'cnn11-set-head-linear-input'
  | 'cnn11-set-head-linear-output'
  | 'cnn11-add-output-linear'
  | 'cnn11-place-output-linear'
  | 'cnn11-set-output-linear-input'
  | 'cnn11-set-output-linear-output'
  | 'cnn11-set-output-linear-activation'
  | 'cnn11-linear-limit'
  | 'cnn11-upgrade-cnn'
  | 'cnn11-retrain-cnn'
  | 'cnn11-success'
  | 'cnn12-intro'
  | 'cnn12-add-third-cnn'
  | 'cnn12-place-third-cnn'
  | 'cnn12-set-third-cnn-in'
  | 'cnn12-set-third-cnn-out'
  | 'cnn12-match-head-input'
  | 'cnn12-retrain'
  | 'cnn12-success'
  | 'cnn13-intro'
  | 'cnn13-select-mixup'
  | 'cnn13-tune-mixup'
  | 'cnn13-select-cutmix'
  | 'cnn13-retrain'
  | 'cnn13-success';

function cloneNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.map((node) => ({
    ...node,
    fields: node.fields.map((field) => ({ ...field })),
    activationOptions: [...node.activationOptions],
  }));
}

function getTutorialLessonDatasetId(lessonId: string | null) {
  if (lessonId === 'cnn-1-3') {
    return 'cifar10';
  }

  if (lessonId?.startsWith('cnn-')) {
    return 'fashion_mnist';
  }

  return 'mnist';
}

function getWorkspaceSnapshotKey(
  workspace: WorkspaceMode,
  tutorialLessonId: string | null,
) {
  return workspace === 'tutorial' ? `tutorial:${tutorialLessonId ?? 'unselected'}` : workspace;
}

function getDatasetTeachingConfig(
  datasetId: string,
  tutorialLessonId: string | null = null,
): DatasetTeachingConfig {
  if (datasetId === 'mnist') {
    return {
      allowedBlocks: tutorialLessonId === 'mlp-1-1' || tutorialLessonId === 'mlp-1-2' ? ['linear'] : ['linear'],
    };
  }

  if (datasetId === 'fashion_mnist' || datasetId === 'cifar10') {
    return {
      allowedBlocks: ['linear', 'cnn', 'pooling', 'dropout'],
    };
  }

  return {
    allowedBlocks: ['linear', 'cnn', 'pooling', 'dropout'],
  };
}

function createLessonNode(
  type: BlockType,
  index: number,
  overrides?: {
    fields?: Record<string, string>;
    activation?: string;
  },
): CanvasNode {
  const block = libraryBlocks.find((item) => item.id === type);

  if (!block) {
    throw new Error(`Unknown lesson block type: ${type}`);
  }

  return {
    id: `${type}-lesson-${index}`,
    type: block.id,
    title: block.title,
    accent: block.accent,
    fields: block.defaults.fields.map((field) => ({
      ...field,
      value: overrides?.fields?.[field.label] ?? field.value,
    })),
    activation: overrides?.activation ?? block.defaults.activation,
    activationOptions: [...block.defaults.activationOptions],
  };
}

function getTutorialLessonPresetNodes(tutorialLessonId: string | null): CanvasNode[] {
  switch (tutorialLessonId) {
    case 'mlp-1-2':
      return [
        createLessonNode('linear', 1, {
          fields: { Input: '784', Output: '10' },
          activation: 'None',
        }),
      ];
    case 'cnn-1-1':
      return [];
    case 'cnn-1-2':
    case 'cnn-1-3':
      return [];
    default:
      return [];
  }
}

function getInitialLessonCoachStep(lessonId: string | null): LessonCoachStep | null {
  switch (lessonId) {
    case 'mlp-1-2':
      return 'mlp12-intro';
    case 'cnn-1-3':
      return null;
    default:
      return null;
  }
}

export function BuilderShell() {
  const {
    nodes,
    draggingBlock,
    setDraggingBlock,
    addNode,
    removeNode,
    updateNodeField,
    updateNodeActivation,
    moveNode,
    resetBoard,
    replaceNodes,
    filterNodes,
  } = useBuilderBoard();
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasets[0]?.id ?? 'mnist');
  const [selectedStock, setSelectedStock] = useState<StockPreset | null>(stockPlaygroundPresets[0] ?? null);
  const [selectedLearningChapterId, setSelectedLearningChapterId] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMode>('home');
  const [playgroundMode, setPlaygroundMode] = useState<PlaygroundMode>('stock');
  const [optimizer, setOptimizer] = useState<OptimizerName>('AdamW');
  const [learningRate, setLearningRate] = useState(optimizerConfigs.AdamW.defaultLearningRate);
  const [epochs, setEpochs] = useState('10');
  const [batchSize, setBatchSize] = useState(128);
  const [optimizerParams, setOptimizerParams] = useState<OptimizerParams>({
    momentum: optimizerConfigs.SGD.parameter!.defaultValue,
    rho: optimizerConfigs['RMS Prop'].parameter!.defaultValue,
  });
  const [selectedAugmentations, setSelectedAugmentations] = useState<TrainingAugmentationId[]>([]);
  const [augmentationParams, setAugmentationParams] =
    useState<TrainingAugmentationParams>(defaultAugmentationParams);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isTrainingOverlayOpen, setIsTrainingOverlayOpen] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [latestTrainingResult, setLatestTrainingResult] = useState<TrainingRunResult | null>(null);
  const [trainingStatus, setTrainingStatus] = useState<TrainingJobStatus | null>(null);
  const [liveHistory, setLiveHistory] = useState<{
    loss: number[];
    accuracy: number[];
    validationLoss: number[];
    validationAccuracy: number[];
  }>({
    loss: [],
    accuracy: [],
    validationLoss: [],
    validationAccuracy: [],
  });
  const [inspectorMetricMode, setInspectorMetricMode] = useState<'loss' | 'accuracy'>('loss');
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [competitionRoom, setCompetitionRoom] = useState<CompetitionRoomSession | null>(null);
  const [competitionLeaderboard, setCompetitionLeaderboard] = useState<CompetitionLeaderboard | null>(
    null,
  );
  const [competitionError, setCompetitionError] = useState<string | null>(null);
  const [competitionBusy, setCompetitionBusy] = useState(false);
  const [competitionSubmitBusy, setCompetitionSubmitBusy] = useState(false);
  const [competitionRuns, setCompetitionRuns] = useState<CompetitionRunRecord[]>([]);
  const [selectedCompetitionRunJobId, setSelectedCompetitionRunJobId] = useState<string | null>(
    null,
  );
  const [isCompetitionRankOpen, setIsCompetitionRankOpen] = useState(false);
  const [competitionCopyFeedback, setCompetitionCopyFeedback] = useState<string | null>(null);
  const [isCompetitionInfoOpen, setIsCompetitionInfoOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isHomeGuideOpen, setIsHomeGuideOpen] = useState(false);
  const [isMinaChatOpen, setIsMinaChatOpen] = useState(false);
  const [minaBusy, setMinaBusy] = useState(false);
  const [minaMessages, setMinaMessages] = useState<MinaMessage[]>([
    {
      id: 'mina-intro',
      role: 'assistant',
      content:
        '안녕, 나는 Mina야. 지금 만든 블록 구조를 보고 어떤 블록과 파라미터를 먼저 바꾸면 좋을지 같이 짚어줄게. 궁금한 걸 바로 물어봐!',
    },
  ]);
  const [minaCanvasHighlight, setMinaCanvasHighlight] = useState<MinaCanvasHighlight | null>(null);
  const [minaLibraryHighlightBlockType, setMinaLibraryHighlightBlockType] = useState<BlockType | null>(null);
  const [tutorialGuideOpen, setTutorialGuideOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStepKey>('story-intro');
  const [tutorialPredictionDone, setTutorialPredictionDone] = useState(false);
  const [isMnistMissionMinimized, setIsMnistMissionMinimized] = useState(false);
  const [selectedTutorialLessonId, setSelectedTutorialLessonId] = useState<string | null>(null);
  const [lessonCoachStep, setLessonCoachStep] = useState<LessonCoachStep | null>(null);
  const [cnn11MissionRetryPending, setCnn11MissionRetryPending] = useState(false);
  const [cnn11BaselineChallengeSamples, setCnn11BaselineChallengeSamples] = useState<
    TrainingChallengeSample[] | null
  >(null);
  const workspaceSnapshotsRef = useRef<Record<string, WorkspaceSnapshot>>({
    builder: {
      datasetId: datasets[0]?.id ?? 'mnist',
      nodes: [],
    },
  });
  const lastLessonHandledJobIdRef = useRef<string | null>(null);
  const lastStoryQuestOpenedJobIdRef = useRef<string | null>(null);
  const lastDismissedLessonCoachStepRef = useRef<LessonCoachStep>('mlp12-intro');
  const lastDismissedTutorialStepRef = useRef<TutorialStepKey>('build-model');
  const blockDropCompletedRef = useRef(false);
  const pollingRef = useRef<number | null>(null);
  const streamRef = useRef<EventSource | null>(null);
  const liveBatchKeyRef = useRef<string | null>(null);
  const lastConsoleStatusRef = useRef<string | null>(null);
  const lastConsoleStageRef = useRef<string | null>(null);
  const lastConsoleBatchRef = useRef<string | null>(null);
  const competitionDatasetId = competitionRoom?.datasetId ?? 'imagenet';
  const selectedDataset =
    activeWorkspace === 'competition'
      ? (availableCompetitionDatasets.find((dataset) => dataset.id === competitionDatasetId) ??
        availableCompetitionDatasets.find((dataset) => dataset.id === 'imagenet') ??
        availableCompetitionDatasets[0])
      : (datasets.find((dataset) => dataset.id === selectedDatasetId) ?? datasets[0]);
  const runtimeDatasetId = activeWorkspace === 'competition' ? competitionDatasetId : selectedDatasetId;
  const showAugmentationPanel =
    activeWorkspace === 'builder' ||
    (activeWorkspace === 'tutorial' && runtimeDatasetId === 'cifar10');
  const shouldShowLabMina = activeWorkspace === 'builder';
  const activeAugmentations = showAugmentationPanel ? selectedAugmentations : [];
  const activeAugmentationParams = showAugmentationPanel
    ? Object.fromEntries(
        activeAugmentations.map((augmentationId) => [
          augmentationId,
          augmentationParams[augmentationId] ?? defaultAugmentationParams[augmentationId],
        ]),
      )
    : {};
  const teachingConfig =
    activeWorkspace === 'tutorial'
      ? getDatasetTeachingConfig(runtimeDatasetId, selectedTutorialLessonId)
      : { allowedBlocks: ['linear', 'cnn', 'pooling', 'dropout'] as BlockType[] };
  const linearNodeExists = nodes.some((node) => node.type === 'linear');
  const hasLiveTrainingVisualization = nodes.some((node) => node.type === 'cnn');
  const lastLinearNode = [...nodes].reverse().find((node) => node.type === 'linear') ?? null;
  const mnistTutorialOutputValue =
    lastLinearNode?.fields.find((field) => field.label === 'Output')?.value ?? '';
  const mnistTutorialInputValue =
    lastLinearNode?.fields.find((field) => field.label === 'Input')?.value ?? '';
  const isMnistTutorialInputReady =
    lastLinearNode?.type === 'linear' && mnistTutorialInputValue === '784';
  const isMnistTutorialOutputReady =
    lastLinearNode?.type === 'linear' && mnistTutorialOutputValue === '10';
  const isMnistTutorialActivationReady =
    lastLinearNode?.type === 'linear' && lastLinearNode.activation === 'None';
  const showTutorialMnistMission =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'mlp-1-1' &&
    runtimeDatasetId === 'mnist' &&
    trainingStatus?.status === 'completed' &&
    trainingStatus.datasetId === 'mnist' &&
    !!trainingStatus.jobId;
  const isMnistTutorialActive =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'mlp-1-1' &&
    runtimeDatasetId === 'mnist';
  const isCnn11TutorialActive =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'cnn-1-1' &&
    runtimeDatasetId === 'fashion_mnist';
  const isMlp12TutorialActive =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'mlp-1-2' &&
    runtimeDatasetId === 'mnist';
  const isCnn12TutorialActive =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'cnn-1-2' &&
    runtimeDatasetId === 'fashion_mnist';
  const isCnn13TutorialActive =
    activeWorkspace === 'tutorial' &&
    selectedTutorialLessonId === 'cnn-1-3' &&
    runtimeDatasetId === 'cifar10';
  const isStoryTutorialActive =
    isMnistTutorialActive || isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive;
  const isGuidedLessonActive =
    isMlp12TutorialActive || isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive;
  const linearNodes = nodes.filter((node) => node.type === 'linear');
  const poolingNodeCount = nodes.filter((node) => node.type === 'pooling').length;
  const cnnNodeCount = nodes.filter((node) => node.type === 'cnn').length;
  const linearNodeCount = linearNodes.length;
  const cnnNodes = nodes.filter((node) => node.type === 'cnn');
  const firstCnnNode = cnnNodes[0] ?? null;
  const secondCnnNode = cnnNodes[1] ?? null;
  const thirdCnnNode = cnnNodes[2] ?? null;
  const fourthCnnNode = cnnNodes[3] ?? null;
  const fifthCnnNode = cnnNodes[4] ?? null;
  const previousLinearNode = linearNodes[linearNodes.length - 2] ?? null;
  const outputLinearNode = linearNodes[linearNodes.length - 1] ?? null;
  const previousLinearOutputValue =
    previousLinearNode?.fields.find((field) => field.label === 'Output')?.value ?? '';
  const outputLinearInputValue =
    outputLinearNode?.fields.find((field) => field.label === 'Input')?.value ?? '';
  const isMlp12OutputInputReady =
    linearNodeCount >= 2 &&
    previousLinearOutputValue !== '' &&
    outputLinearInputValue === previousLinearOutputValue;
  const firstCnnInValue = firstCnnNode?.fields.find((field) => field.label === 'Channel In')?.value ?? '';
  const firstCnnOutValue =
    firstCnnNode?.fields.find((field) => field.label === 'Channel Out')?.value ?? '';
  const secondCnnInValue =
    secondCnnNode?.fields.find((field) => field.label === 'Channel In')?.value ?? '';
  const secondCnnOutValue =
    secondCnnNode?.fields.find((field) => field.label === 'Channel Out')?.value ?? '';
  const thirdCnnInValue =
    thirdCnnNode?.fields.find((field) => field.label === 'Channel In')?.value ?? '';
  const thirdCnnOutValue =
    thirdCnnNode?.fields.find((field) => field.label === 'Channel Out')?.value ?? '';
  const fourthCnnInValue =
    fourthCnnNode?.fields.find((field) => field.label === 'Channel In')?.value ?? '';
  const fourthCnnOutValue =
    fourthCnnNode?.fields.find((field) => field.label === 'Channel Out')?.value ?? '';
  const fifthCnnInValue =
    fifthCnnNode?.fields.find((field) => field.label === 'Channel In')?.value ?? '';
  const fifthCnnOutValue =
    fifthCnnNode?.fields.find((field) => field.label === 'Channel Out')?.value ?? '';
  const cnnHeadInputValue =
    linearNodes[0]?.fields.find((field) => field.label === 'Input')?.value ?? '';
  const cnnHeadOutputValue =
    linearNodes[0]?.fields.find((field) => field.label === 'Output')?.value ?? '';
  const cnnOutputInputValue =
    linearNodes[1]?.fields.find((field) => field.label === 'Input')?.value ?? '';
  const cnnOutputValue =
    linearNodes[1]?.fields.find((field) => field.label === 'Output')?.value ?? '';
  const baseCnnInputChannelsTarget = isCnn13TutorialActive ? '3' : '1';
  const baseCnnHeadInputTarget = isCnn13TutorialActive ? '4096' : '3136';
  const isBaseCnnArchitectureReady =
    cnnNodeCount >= 4 &&
    poolingNodeCount >= 2 &&
    linearNodeCount >= 2 &&
    firstCnnInValue === baseCnnInputChannelsTarget &&
    firstCnnOutValue === '32' &&
    secondCnnInValue === '32' &&
    secondCnnOutValue === '32' &&
    thirdCnnInValue === '32' &&
    thirdCnnOutValue === '64' &&
    fourthCnnInValue === '64' &&
    fourthCnnOutValue === '64' &&
    cnnHeadInputValue === baseCnnHeadInputTarget &&
    cnnHeadOutputValue === '128' &&
    cnnOutputInputValue === '128' &&
    cnnOutputValue === '10' &&
    (linearNodes[1]?.activation ?? '') === 'None';
  const isCnn11ArchitectureReady =
    isCnn11TutorialActive && isBaseCnnArchitectureReady;
  const isCnn12ArchitectureReady =
    cnnNodeCount >= 5 &&
    poolingNodeCount >= 2 &&
    linearNodeCount >= 2 &&
    firstCnnInValue === '1' &&
    firstCnnOutValue === '32' &&
    secondCnnInValue === '32' &&
    secondCnnOutValue === '32' &&
    thirdCnnInValue === '32' &&
    thirdCnnOutValue === '64' &&
    fourthCnnInValue === '64' &&
    fourthCnnOutValue === '64' &&
    fifthCnnInValue === '64' &&
    fifthCnnOutValue === '128' &&
    cnnHeadInputValue === '6272' &&
    cnnHeadOutputValue === '128' &&
    cnnOutputInputValue === '128' &&
    cnnOutputValue === '10' &&
    (linearNodes[1]?.activation ?? '') === 'None';
  const isCnn13ArchitectureReady = isCnn13TutorialActive && isBaseCnnArchitectureReady;
  const hasCifarAugmentationPair =
    selectedAugmentations.includes('mixup') && selectedAugmentations.includes('cutmix');
  const storyMissionDatasetId = isCnn13TutorialActive
    ? 'cifar10'
    : isCnn11TutorialActive || isCnn12TutorialActive
      ? 'fashion_mnist'
      : 'mnist';
  const isStoryMissionBuildReady =
    isMnistTutorialActive ||
    isCnn11TutorialActive ||
    isCnn13TutorialActive ||
    (isCnn12TutorialActive && isCnn12ArchitectureReady);
  const showTutorialMetricsSidebar =
    (isMnistTutorialActive ||
      isMlp12TutorialActive ||
      isCnn11TutorialActive ||
      isCnn12TutorialActive ||
      isCnn13TutorialActive) &&
    (isTraining ||
      trainingStatus !== null ||
      latestTrainingResult !== null ||
      lessonCoachStep !== null ||
      tutorialStep === 'training-metrics-loss' ||
      tutorialStep === 'training-metrics-accuracy');
  const logTrainingStatusToConsole = (result: TrainingJobStatus, source: 'stream' | 'poll') => {
    const currentStatus = result.status ?? 'unknown';
    const currentStage = result.stage ?? 'idle';
    const currentBatch =
      result.currentEpoch != null && result.currentBatch != null
        ? `${result.currentEpoch}:${result.currentBatch}/${result.totalBatches ?? '?'}`
        : null;

    if (
      lastConsoleStatusRef.current !== currentStatus ||
      lastConsoleStageRef.current !== currentStage
    ) {
      console.info('[training]', {
        source,
        status: currentStatus,
        stage: currentStage,
        datasetId: result.datasetId ?? null,
        epoch: result.currentEpoch ?? null,
        batch: result.currentBatch ?? null,
        totalBatches: result.totalBatches ?? null,
      });
      lastConsoleStatusRef.current = currentStatus;
      lastConsoleStageRef.current = currentStage;
    }

    if (
      currentStatus === 'running' &&
      currentBatch &&
      currentBatch !== lastConsoleBatchRef.current &&
      result.currentBatch != null &&
      (result.currentBatch === 1 ||
        result.currentBatch === result.totalBatches ||
        result.currentBatch % 10 === 0)
    ) {
      console.info('[training-batch]', {
        source,
        datasetId: result.datasetId ?? null,
        epoch: result.currentEpoch ?? null,
        batch: result.currentBatch,
        totalBatches: result.totalBatches ?? null,
        liveTrainLoss: result.liveTrainLoss ?? null,
        liveTrainAccuracy: result.liveTrainAccuracy ?? null,
        liveValidationLoss: result.liveValidationLoss ?? null,
        liveValidationAccuracy: result.liveValidationAccuracy ?? null,
      });
      lastConsoleBatchRef.current = currentBatch;
    }

    if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'stopped') {
      console.info('[training-finished]', {
        source,
        status: currentStatus,
        datasetId: result.datasetId ?? null,
        bestValidationAccuracy: result.bestValidationAccuracy ?? null,
        error: result.error ?? null,
      });
      lastConsoleBatchRef.current = null;
    }
  };
  const isCompetitionSetupVisible = activeWorkspace === 'competition' && !competitionRoom;
  const shouldResumeCnn11Mission =
    isCnn11TutorialActive &&
    cnn11MissionRetryPending &&
    trainingStatus?.status === 'completed' &&
    trainingStatus.datasetId === 'fashion_mnist' &&
    !!trainingStatus.jobId;
  const isStoryTutorialMissionReady =
    isStoryTutorialActive &&
    isStoryMissionBuildReady &&
    !tutorialPredictionDone &&
    tutorialStep !== 'complete' &&
    trainingStatus?.status === 'completed' &&
    trainingStatus.datasetId === storyMissionDatasetId &&
    !!trainingStatus.jobId;
  const mnistQuestPhase =
    tutorialStep === 'story-intro'
      ? 'intro'
      : tutorialStep === 'play-mission' || shouldResumeCnn11Mission
        ? 'mission'
        : tutorialStep === 'complete'
          ? 'complete'
          : null;
  const isMnistGuideStep =
    tutorialStep === 'build-model' ||
    tutorialStep === 'stack-block' ||
    tutorialStep === 'match-input-dimension' ||
    tutorialStep === 'edit-dimensions' ||
    tutorialStep === 'set-activation' ||
    tutorialStep === 'choose-optimizer' ||
    tutorialStep === 'set-learning-rate' ||
    tutorialStep === 'set-batch-size' ||
    tutorialStep === 'set-epochs' ||
    tutorialStep === 'train-model' ||
    tutorialStep === 'training-metrics-loss' ||
    tutorialStep === 'training-metrics-accuracy';
  const shouldShowMnistQuestOrb =
    isStoryTutorialActive &&
    ((isMnistTutorialActive && isMnistGuideStep && !tutorialGuideOpen) ||
      (isCnn11TutorialActive && tutorialStep === 'build-model' && !lessonCoachStep) ||
      (isCnn12TutorialActive && tutorialStep === 'build-model' && !lessonCoachStep && !tutorialPredictionDone) ||
      (isCnn13TutorialActive && tutorialStep === 'build-model' && !lessonCoachStep && !tutorialPredictionDone) ||
      (isCnn11TutorialActive && shouldResumeCnn11Mission) ||
      (mnistQuestPhase && mnistQuestPhase !== 'intro' && isMnistMissionMinimized));
  const shellGridClassName = isCompetitionSetupVisible
    ? 'mt-3 grid min-h-0 items-start gap-3'
    : activeWorkspace === 'home'
      ? 'mt-3 grid min-h-0 items-start gap-3'
    : activeWorkspace === 'playground'
      ? 'mt-3 grid min-h-0 items-start gap-3 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:gap-4'
      : activeWorkspace === 'learning'
        ? 'mt-3 grid min-h-0 items-start gap-3 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)] xl:gap-4'
      : activeWorkspace === 'competition' && competitionRoom !== null
        ? 'mt-3 grid min-h-0 items-start gap-3 lg:items-stretch lg:grid-cols-[minmax(272px,0.72fr)_minmax(0,1.74fr)_clamp(240px,24vw,320px)] xl:gap-4 xl:grid-cols-[clamp(276px,15.5vw,320px)_minmax(0,1fr)_clamp(260px,22vw,360px)]'
      : activeWorkspace === 'tutorial'
        ? 'mt-3 grid min-h-0 items-start gap-3 lg:items-stretch lg:justify-center lg:grid-cols-[minmax(272px,0.72fr)_minmax(0,1.74fr)_minmax(280px,0.82fr)] xl:gap-4 xl:grid-cols-[clamp(276px,15.5vw,320px)_minmax(0,1fr)_clamp(320px,21vw,448px)]'
      : 'mt-3 grid min-h-0 items-start gap-3 lg:items-stretch lg:justify-center lg:grid-cols-[minmax(272px,0.72fr)_minmax(0,1.74fr)_minmax(280px,0.82fr)] xl:gap-4 xl:grid-cols-[clamp(276px,15.5vw,320px)_minmax(0,1fr)_clamp(320px,21vw,448px)]';
  const handleWorkspaceSelect = (workspace: WorkspaceMode) => {
    if (workspace === activeWorkspace) {
      return;
    }

    saveWorkspaceSnapshot(activeWorkspace, selectedTutorialLessonId, selectedDatasetId);
    clearTrainingUiState();
    setActiveWorkspace(workspace);
    setIsCompetitionInfoOpen(false);
    setIsCompetitionRankOpen(false);
    if (workspace !== 'tutorial') {
      setTutorialGuideOpen(false);
      setTutorialStep('story-intro');
      setTutorialPredictionDone(false);
      setIsMnistMissionMinimized(false);
      setLessonCoachStep(null);
      setCnn11BaselineChallengeSamples(null);
    }

    if (workspace === 'home') {
      return;
    }

    if (workspace === 'builder') {
      restoreWorkspaceSnapshot('builder', null, datasets[0]?.id ?? 'mnist');
      return;
    }

    if (workspace === 'tutorial') {
      setSelectedTutorialLessonId(null);
      setTutorialGuideOpen(false);
      setTutorialStep('story-intro');
      setTutorialPredictionDone(false);
      setIsMnistMissionMinimized(false);
      setCnn11BaselineChallengeSamples(null);
      setLessonCoachStep(null);
      return;
    }

    if (workspace === 'playground' || workspace === 'learning') {
      return;
    }
  };

  const tutorialOverlayCopy = useMemo(
    () =>
      ({
        'story-intro': {
          title: '버튼 없는 엘리베이터',
          description:
            '이번 미션은 버튼이 없는 엘리베이터예요. 승객이 층수를 손글씨로 적으면, 모델이 그 숫자를 읽고 해당 층으로 엘리베이터를 보내야 합니다.',
          targetName: null,
          canAdvance: true,
          advanceLabel: '미션 시작',
        },
        'build-model': {
          title: '먼저 숫자 판별기를 만들자',
          description:
            '왼쪽 Block Library에서 Linear 블록을 잡아 끌어주세요. 먼저 드래그를 시작하면, 그다음 어디에 쌓을지 바로 보여줄게요.',
          targetName: 'tutorial-linear-block',
          canAdvance: false,
        },
        'stack-block': {
          title: '이제 블록을 캔버스에 쌓자',
          description:
            '지금 잡은 Linear 블록을 Builder Canvas 안에 내려놓아 데이터 블록 아래에 쌓아주세요. 이 레이어가 숫자 판별기의 시작점이 됩니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'match-input-dimension': {
          title: '먼저 Input을 데이터셋 차원에 맞추자',
          description:
            'Linear 블록의 Input 값을 먼저 데이터셋 입력 차원과 맞춰주세요. MNIST 입력은 `1 x 28 x 28` 이미지라서 펼치면 `784`가 됩니다. 그래서 첫 Linear의 Input은 784로 맞추는 게 맞습니다.',
          targetName: 'tutorial-linear-input-field',
          canAdvance: true,
          advanceLabel: '확인했어요',
        },
        'edit-dimensions': {
          title: '이제 출력 차원을 10으로 맞추자',
          description:
            '방금 쌓은 Linear 블록의 Output 값을 10으로 바꿔주세요. MNIST는 0부터 9까지 총 10개의 숫자를 구분해야 하므로 마지막 출력 차원도 10이어야 합니다.',
          targetName: 'tutorial-linear-output-field',
          canAdvance: false,
        },
        'set-activation': {
          title: 'Activation도 확인해보자',
          description:
            '이제 Activation Function을 `None`으로 바꿔주세요. 마지막 출력층은 숫자 10개에 대한 점수를 그대로 내보내야 해서, 이 단계에서는 활성화 함수를 끄고 다음으로 넘어갑니다.',
          targetName: 'tutorial-linear-activation-field',
          canAdvance: false,
        },
        'choose-optimizer': {
          title: 'Optimizer를 골라보자',
          description:
            'Optimizer는 모델이 정답 쪽으로 파라미터를 어떻게 조정할지 정하는 학습 전략입니다. 지금은 AdamW를 그대로 써도 괜찮고, 다른 옵션을 눌러보며 방식 차이를 볼 수도 있습니다.',
          targetName: 'tutorial-optimizer-control',
          canAdvance: true,
          advanceLabel: '다음으로',
        },
        'set-learning-rate': {
          title: 'Learning Rate는 학습의 보폭이에요',
          description:
            'Learning Rate는 한 번 업데이트할 때 얼마나 크게 움직일지 정하는 값입니다. 너무 크면 지나치고, 너무 작으면 매우 천천히 배웁니다. 슬라이더를 보며 학습의 발걸음 크기라고 생각하면 됩니다.',
          targetName: 'tutorial-learning-rate-control',
          canAdvance: true,
          advanceLabel: '이해했어요',
        },
        'set-batch-size': {
          title: 'Batch Size는 한 번에 학습할 데이터 양이에요',
          description:
            'Batch Size는 한 번의 학습 단계에서 몇 개의 데이터를 묶어서 볼지 정합니다. 크면 안정적일 수 있지만 무거워지고, 작으면 자주 업데이트하지만 흔들릴 수 있습니다.',
          targetName: 'tutorial-batch-size-control',
          canAdvance: true,
          advanceLabel: '다음으로',
        },
        'set-epochs': {
          title: 'Epoch은 전체 데이터를 반복할 횟수예요',
          description:
            'Epoch은 학습 데이터를 처음부터 끝까지 몇 번 반복해서 볼지 정하는 값입니다. 너무 적으면 덜 배우고, 너무 많으면 과하게 외울 수 있습니다.',
          targetName: 'tutorial-epochs-control',
          canAdvance: true,
          advanceLabel: '이제 Start로',
        },
        'train-model': {
          title: '이제 엘리베이터의 두뇌를 학습시켜보자',
          description:
            '좋아요. 블록을 쌓았으니 이제 상단의 Start 버튼으로 엘리베이터 두뇌를 학습시켜주세요. 학습이 끝나면 손글씨 층수 요청을 읽을 수 있습니다.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'training-metrics-loss': {
          title: '먼저 Loss 그래프를 보자',
          description:
            '오른쪽 Training Metrics가 움직이기 시작했어요. Loss는 모델이 얼마나 틀리고 있는지를 나타내는 값이라, 보통 학습이 잘 되면 점점 내려갑니다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: 'Val Acc 보기',
        },
        'training-metrics-accuracy': {
          title: '이제 Val Acc를 읽자',
          description:
            'Val Acc는 처음 보는 검증 데이터에서 얼마나 잘 일반화하는지 보여주는 지표입니다. Train accuracy만 높고 Val Acc가 흔들리면 과하게 외우는 중일 수 있습니다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: false,
          advanceLabel: '미션으로',
        },
        'play-mission': {
          title: '손글씨 층수를 읽어 엘리베이터를 보내자',
          description:
            '오른쪽 미션 패널이 열렸어요. 목표 층수를 손글씨로 적고 Predict Floor를 눌러, 승객을 정확한 층에 도착시켜보세요.',
          targetName: 'tutorial-mnist-story',
          canAdvance: false,
        },
        complete: {
          title: '엘리베이터 미션 완료',
          description:
            '성공입니다. 손글씨 층수를 읽어 버튼 없는 엘리베이터를 작동시켰어요. 다음에는 Fashion MNIST나 CIFAR 스토리도 같은 방식으로 확장할 수 있습니다.',
          targetName: null,
          canAdvance: true,
          advanceLabel: '닫기',
        },
      }) satisfies Record<
        TutorialStepKey,
        {
          title: string;
          description: string;
          targetName: string | null;
          canAdvance: boolean;
          advanceLabel?: string;
        }
      >,
    [],
  );
  const activeTutorialOverlayStep = tutorialOverlayCopy[tutorialStep];
  const lessonCoachCopy = useMemo(
    () =>
      ({
        'mlp12-intro': {
          title: 'Val Acc 목표 실습',
          description:
            '이번에는 10 epoch 안에 Val Acc 94.5%를 넘겨보는 실습입니다. 먼저 지금 구조 그대로 Start를 눌러 성능을 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'mlp12-add-layer': {
          title: 'Val Acc가 아직 부족해요',
          description:
            '지금 모델은 표현력이 조금 부족합니다. Block Library에서 Linear Layer를 하나 더 추가해 hidden layer를 만들어보세요. Output 레이어 바로 앞에 끼워 넣는다고 생각하면 됩니다.',
          targetName: 'tutorial-linear-block',
          canAdvance: true,
          advanceLabel: 'Layer 추가할게요',
        },
        'mlp12-match-input': {
          title: '이제 다음 레이어 Input을 맞춰보자',
          description:
            '새 레이어를 하나 넣었으면, 그 다음 Output 레이어의 Input도 앞 레이어 Output과 연결되어야 합니다. 마지막 Linear 블록의 Input 값을 앞 레이어 Output과 같은 값으로 직접 맞춰주세요.',
          targetName: 'tutorial-linear-input-field',
          canAdvance: true,
          advanceLabel: 'Input 맞췄어요',
        },
        'mlp12-retrain': {
          title: '한 층 더 쌓았으니 다시 학습해보자',
          description:
            '좋아요. 층을 하나 더 쌓아 표현력을 늘렸습니다. 이제 다시 Start를 눌러 10 epoch 기준 Val Acc가 얼마나 올라가는지 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'mlp12-success': {
          title: '목표 Val Acc 달성',
          description:
            '좋습니다. 얕은 모델보다 더 깊은 구조가 숫자 특징을 더 잘 분리해내면서 Val Acc가 올라갔어요.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: '확인했어요',
        },
        'cnn11-stack-linear': {
          title: '먼저 Linear 기준선을 직접 만들어보자',
          description:
            'MLP에서 배운 것처럼 Linear Layer를 직접 쌓아보며 기준선을 만들어봅시다. 한 층으로 시작해도 되고, 더 쌓아보며 수정해도 괜찮아요. 준비가 되면 그때 Start를 눌러 성능을 확인해보세요.',
          targetName: null,
          canAdvance: true,
          advanceLabel: '직접 해볼게요',
        },
        'cnn11-train-linear': {
          title: '일단 한 번 달성해보자',
          description:
            '지금은 가이드 없이 먼저 해보세요. 이 Linear 구조만으로 세탁물 분류 정확도를 90% 이상까지 끌어올릴 수 있는지 직접 확인해봅시다.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn11-place-first-cnn': {
          title: '첫 번째 Conv를 Canvas에 놓자',
          description:
            '선택한 CNN Layer를 Builder Canvas에 올려주세요. 데이터셋 바로 아래에 첫 번째 합성곱 블록이 들어가야 합니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-first-cnn-in': {
          title: '첫 번째 Conv의 입력 채널부터 맞추자',
          description: isCnn13TutorialActive
            ? 'CIFAR-10 사진은 RGB 컬러 이미지라 입력 채널이 3입니다. 첫 번째 CNN Layer의 `Channel In`을 `3`으로 맞춰주세요.'
            : 'Fashion-MNIST는 흑백 이미지라 입력 채널이 1입니다. 첫 번째 CNN Layer의 `Channel In`을 `1`로 맞춰주세요.',
          targetName: 'tutorial-cnn-channel-in-field',
          canAdvance: false,
        },
        'cnn11-set-first-cnn-out': {
          title: '첫 번째 Conv의 출력 채널을 정하자',
          description:
            '이제 첫 번째 CNN Layer의 `Channel Out`을 `32`로 설정해 특징 맵을 충분히 뽑아보겠습니다.',
          targetName: 'tutorial-cnn-channel-out-field',
          canAdvance: false,
        },
        'cnn11-add-linear': {
          title: '이제 첫 Pooling을 추가하자',
          description:
            '좋아요. 첫 번째 묶음은 `Conv → Conv`로 충분히 특징을 만든 다음 줄입니다. 이제 Block Library에서 Pooling Layer를 선택해 두 번째 Conv 뒤에 이어붙일 준비를 해봅시다.',
          targetName: 'tutorial-pooling-block',
          canAdvance: false,
        },
        'cnn11-place-first-pool': {
          title: '첫 번째 Pooling을 Canvas에 놓자',
          description:
            'Pooling Layer를 Builder Canvas에 두어 두 번째 Conv 뒤에 연결해주세요. 첫 번째 특징 묶음을 읽은 뒤 feature map 크기를 줄이는 단계입니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-match-linear': {
          title: '이제 두 번째 Conv를 쌓자',
          description:
            'Pooling으로 줄이기 전에 같은 해상도에서 한 번 더 패턴을 읽어야 합니다. Block Library에서 CNN Layer를 다시 선택해 `Conv → Conv` 묶음을 만들어주세요.',
          targetName: 'tutorial-cnn-block',
          canAdvance: false,
        },
        'cnn11-place-second-cnn': {
          title: '두 번째 Conv를 Canvas에 놓자',
          description:
            '두 번째 CNN Layer를 첫 번째 Conv 바로 뒤에 놓아주세요. 아직 Pooling으로 줄이지 않고 같은 28x28 해상도에서 특징을 한 번 더 뽑습니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-second-cnn-in': {
          title: '두 번째 Conv의 입력 채널을 맞추자',
          description:
            '첫 번째 Conv에서 32채널 특징 맵이 나오므로, 두 번째 CNN Layer의 `Channel In`은 `32`여야 합니다.',
          targetName: 'tutorial-cnn2-channel-in-field',
          canAdvance: false,
        },
        'cnn11-set-second-cnn-out': {
          title: '두 번째 Conv도 32채널로 유지',
          description:
            '첫 번째 묶음은 32채널에서 두 번 특징을 읽습니다. 두 번째 CNN Layer의 `Channel Out`을 `32`로 맞춰주세요.',
          targetName: 'tutorial-cnn2-channel-out-field',
          canAdvance: false,
        },
        'cnn11-add-third-cnn': {
          title: '이제 두 번째 Conv 묶음을 시작하자',
          description:
            '첫 번째 Pooling 뒤에는 더 추상적인 패턴을 읽습니다. Block Library에서 CNN Layer를 선택해 세 번째 Conv를 추가해주세요.',
          targetName: 'tutorial-cnn-block',
          canAdvance: false,
        },
        'cnn11-place-third-cnn': {
          title: '세 번째 Conv를 Pooling 뒤에 놓자',
          description:
            '세 번째 CNN Layer를 첫 번째 Pooling 뒤에 놓아주세요. 이제 채널을 64로 올려 더 넓은 특징 조합을 만들겠습니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-third-cnn-in': {
          title: '세 번째 Conv 입력 채널 맞추기',
          description:
            '앞 Conv 묶음은 32채널을 만들고 Pooling은 크기만 줄입니다. 세 번째 CNN Layer의 `Channel In`은 `32`여야 합니다.',
          targetName: 'tutorial-cnn3-channel-in-field',
          canAdvance: false,
        },
        'cnn11-set-third-cnn-out': {
          title: '세 번째 Conv 출력은 64채널',
          description:
            '두 번째 묶음에서는 더 많은 특징 조합을 보도록 `Channel Out`을 `64`로 올려주세요.',
          targetName: 'tutorial-cnn3-channel-out-field',
          canAdvance: false,
        },
        'cnn11-add-fourth-cnn': {
          title: '64채널에서 한 번 더 Conv',
          description:
            '두 번째 묶음도 `Conv → Conv`로 갑니다. Pooling 전에 CNN Layer를 하나 더 추가해서 64채널 특징을 한 번 더 정리해주세요.',
          targetName: 'tutorial-cnn-block',
          canAdvance: false,
        },
        'cnn11-place-fourth-cnn': {
          title: '네 번째 Conv를 세 번째 Conv 뒤에 놓자',
          description:
            '네 번째 CNN Layer를 세 번째 Conv 바로 뒤에 놓아주세요. 이 다음에 두 번째 Pooling으로 feature map을 줄입니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-fourth-cnn-in': {
          title: '네 번째 Conv 입력은 64채널',
          description:
            '세 번째 Conv가 64채널을 만들었으므로 네 번째 CNN Layer의 `Channel In`을 `64`로 맞춰주세요.',
          targetName: 'tutorial-cnn4-channel-in-field',
          canAdvance: false,
        },
        'cnn11-set-fourth-cnn-out': {
          title: '네 번째 Conv도 64채널 유지',
          description:
            '두 번째 묶음은 64채널에서 두 번 패턴을 정리합니다. 네 번째 CNN Layer의 `Channel Out`을 `64`로 설정해주세요.',
          targetName: 'tutorial-cnn4-channel-out-field',
          canAdvance: false,
        },
        'cnn11-add-second-pool': {
          title: '이제 두 번째 Pooling을 추가하자',
          description:
            '좋아요. `Conv → Conv → Pool → Conv → Conv`까지 만들었습니다. 다시 Pooling Layer를 선택해 특징 맵을 한 번 더 줄여주세요.',
          targetName: 'tutorial-pooling-block',
          canAdvance: false,
        },
        'cnn11-place-second-pool': {
          title: '두 번째 Pooling을 Canvas에 놓자',
          description:
            '방금 선택한 Pooling Layer를 Builder Canvas에 놓아 두 번째 Conv 바로 뒤에 연결해주세요.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-add-head-linear': {
          title: '이제 첫 번째 Linear를 추가하자',
          description:
            '특징 맵을 두 번 줄였으니 이제 분류용 Linear Layer가 필요합니다. Block Library에서 Linear Layer를 선택해주세요.',
          targetName: 'tutorial-linear-block',
          canAdvance: false,
        },
        'cnn11-place-head-linear': {
          title: '첫 번째 Linear를 Canvas에 놓자',
          description:
            '선택한 Linear Layer를 Builder Canvas에 놓아 두 번째 Pooling 뒤에 연결해주세요.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-head-linear-input': {
          title: '첫 번째 Linear 입력 크기를 맞추자',
          description: isCnn13TutorialActive
            ? 'CIFAR-10은 32x32 RGB 이미지라 두 번 Pooling 뒤에 `64 x 8 x 8 = 4096`개의 특징이 남습니다. 첫 번째 Linear의 `Input`을 `4096`으로 맞춰주세요.'
            : '두 번째 Pooling 뒤에는 `64 x 7 x 7 = 3136`개의 특징이 남습니다. 첫 번째 Linear의 `Input`을 `3136`으로 맞춰주세요.',
          targetName: 'tutorial-linear-input-field',
          canAdvance: false,
        },
        'cnn11-set-head-linear-output': {
          title: '첫 번째 Linear 출력 크기를 정하자',
          description:
            '분류 전 중간 표현을 만들기 위해 첫 번째 Linear의 `Output`을 `128`로 설정해주세요.',
          targetName: 'tutorial-linear-output-field',
          canAdvance: false,
        },
        'cnn11-add-output-linear': {
          title: '마지막 Output Linear를 추가하자',
          description:
            '이제 클래스 10개로 보내는 마지막 Linear Layer가 하나 더 필요합니다. 다시 Linear Layer를 선택해주세요.',
          targetName: 'tutorial-linear-block',
          canAdvance: false,
        },
        'cnn11-place-output-linear': {
          title: '마지막 Output Linear를 Canvas에 놓자',
          description:
            '두 번째 Linear Layer를 Builder Canvas에 놓아 첫 번째 Linear 뒤에 연결해주세요.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn11-set-output-linear-input': {
          title: '마지막 Linear 입력을 맞추자',
          description:
            '바로 앞 Linear에서 `128`차원 표현이 나오므로, 마지막 Linear의 `Input`은 `128`이어야 합니다.',
          targetName: 'tutorial-linear-input-field',
          canAdvance: false,
        },
        'cnn11-set-output-linear-output': {
          title: '마지막 Linear 출력은 10개 클래스다',
          description:
            '현재 실습 데이터셋은 10개 클래스를 분류하므로 마지막 Linear의 `Output`을 `10`으로 맞춰주세요.',
          targetName: 'tutorial-linear-output-field',
          canAdvance: false,
        },
        'cnn11-set-output-linear-activation': {
          title: '마지막 Activation을 None으로 바꾸자',
          description:
            '출력층은 클래스 점수를 그대로 내야 하므로 마지막 Output Linear의 Activation을 `None`으로 설정해주세요.',
          targetName: 'tutorial-linear-activation-field',
          canAdvance: false,
        },
        'cnn11-upgrade-cnn': {
          title: '첫 번째 Conv부터 다시 시작하자',
          description:
            '먼저 Block Library에서 CNN Layer를 선택해봅시다. 이제부터는 이미지 패턴을 읽는 구조를 직접 쌓아갈 거예요.',
          targetName: 'tutorial-cnn-block',
          canAdvance: false,
        },
        'cnn11-linear-limit': {
          title: 'Linear만으로는 여기서 막혀요',
          description:
            '방금 세탁물 평가에서 비슷한 종류를 안정적으로 구분하지 못했어요. 특히 `T-shirt/top`과 `Shirt`, `Sandal`과 `Sneaker` 같은 조합에서 흔들립니다. 이제 이미지 패턴을 읽는 CNN 구조로 바꿔봅시다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: 'CNN으로 바꿔보자',
        },
        'cnn11-retrain-cnn': {
          title: isCnn13TutorialActive ? '앨범 분류 기준 CNN 학습' : 'CNN으로 다시 학습해보자',
          description: isCnn13TutorialActive
            ? '좋아요. 이제 `3→32 Conv → 32→32 Conv → Pool → 32→64 Conv → 64→64 Conv → Pool → Linear → Linear` 구조가 준비됐습니다. Start를 눌러 증강 없는 앨범 분류 기준선을 먼저 확인해보세요.'
            : '좋아요. 이제 `1→32 Conv → 32→32 Conv → Pool → 32→64 Conv → 64→64 Conv → Pool → Linear → Linear` 구조가 준비됐습니다. Start를 눌러 다시 학습하고, 세탁물 분류가 얼마나 안정적으로 올라가는지 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn11-success': {
          title: '이제 CNN이 필요한 이유가 보여요',
          description:
            '좋습니다. 단순히 Linear를 더 쌓는 것보다, CNN이 세탁물의 윤곽과 지역 패턴을 읽으면서 분류 성능을 더 안정적으로 끌어올렸습니다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: '미션으로 갈게요',
        },
        'cnn12-intro': {
          title: '기준 CNN부터 한 번 돌려보자',
          description:
            '이번 실습은 CNN 표현력을 올리는 흐름입니다. 먼저 `Conv → Conv → Pool → Conv → Conv → Pool → Linear` 기준 모델을 Start로 학습해보고, 이 구조가 어디서 더 커질 수 있는지 확인합니다.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn12-add-third-cnn': {
          title: 'Feature Builder: 128채널 Conv 추가',
          description:
            '기준 구조는 두 번씩 묶어 특징을 읽었습니다. 이제 Linear 앞에 128채널 Conv를 하나 더 추가해 더 깊은 feature map을 만들어보겠습니다. Block Library에서 CNN Layer를 선택해주세요.',
          targetName: 'tutorial-cnn-block',
          canAdvance: false,
        },
        'cnn12-place-third-cnn': {
          title: '128채널 Conv를 Linear 앞에 연결',
          description:
            '새 CNN Layer를 Builder Canvas에 올려주세요. 두 번째 Pooling 뒤, 첫 번째 Linear 앞에 들어가면 기존 64채널 feature map을 더 풍부한 128채널 표현으로 바꿀 수 있습니다.',
          targetName: 'tutorial-builder-canvas',
          canAdvance: false,
        },
        'cnn12-set-third-cnn-in': {
          title: '추가 Conv 입력 채널 맞추기',
          description:
            '기준 CNN의 마지막 Conv 묶음은 64채널 feature map을 만듭니다. 추가 CNN Layer의 `Channel In`은 `64`가 되어야 합니다.',
          targetName: 'tutorial-cnn5-channel-in-field',
          canAdvance: false,
        },
        'cnn12-set-third-cnn-out': {
          title: '출력 채널을 128로 확장',
          description:
            '이번 층은 더 많은 패턴 조합을 만들기 위한 feature builder입니다. 세 번째 CNN Layer의 `Channel Out`을 `128`로 설정해주세요.',
          targetName: 'tutorial-cnn5-channel-out-field',
          canAdvance: false,
        },
        'cnn12-match-head-input': {
          title: 'Linear 입력 크기도 다시 계산',
          description:
            '채널이 128로 늘었으니 Flatten 뒤 feature 수가 `128 x 7 x 7 = 6272`가 됩니다. 첫 번째 Linear Layer의 `Input`을 `6272`로 맞춰주세요.',
          targetName: 'tutorial-linear-input-field',
          canAdvance: true,
          advanceLabel: '6272로 맞췄어요',
        },
        'cnn12-retrain': {
          title: '깊어진 CNN으로 다시 학습',
          description:
            '이제 `32 → 64 → 128` 채널 흐름이 만들어졌습니다. Start를 눌러 더 깊어진 feature map이 Val Acc에 어떤 차이를 만드는지 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn12-success': {
          title: 'Feature Builder 흐름 완료',
          description:
            '좋아요. CNN은 단순히 레이어 수를 늘리는 게 아니라, 낮은 단계의 edge/texture를 더 높은 단계의 shape 조합으로 쌓아가는 구조라는 점이 핵심입니다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: '확인했어요',
        },
        'cnn13-intro': {
          title: '자동 앨범 분류기 기준선 만들기',
          description:
            '이번에는 업로드된 사진을 동물, 탈것, 야외 장면 같은 앨범으로 자동 정리하는 CNN을 만든다고 생각하면 됩니다. 먼저 현재 구조 그대로 Start해서 증강 없는 앨범 분류기의 기준 성능을 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn13-select-mixup': {
          title: 'MixUp으로 비슷한 사진 사이를 부드럽게',
          description:
            '앨범 분류기는 고양이와 개, 자동차와 트럭처럼 비슷한 사진 사이에서 자주 흔들립니다. Augmentation 패널에서 MixUp을 켜서 두 사진과 라벨을 섞고, 클래스 경계를 더 부드럽게 만들어주세요.',
          targetName: 'tutorial-augmentation-mixup',
          canAdvance: false,
        },
        'cnn13-tune-mixup': {
          title: 'Mix ratio를 확인',
          description:
            'Mix Ratio는 섞는 강도입니다. 너무 약하면 효과가 작고, 너무 강하면 원본 신호가 흐려집니다. 기본 45% 근처에서 시작하고 나중에 실험으로 조절하면 됩니다.',
          targetName: 'tutorial-augmentation-mixup-strength',
          canAdvance: true,
          advanceLabel: '다음 증강 볼게요',
        },
        'cnn13-select-cutmix': {
          title: 'CutMix로 가려진 사진에도 강하게',
          description:
            '실제 앨범 사진은 물체가 잘리거나 배경에 가려지는 경우가 많습니다. CutMix를 켜서 일부 패치가 바뀌어도 모델이 전체 맥락과 부분 특징을 함께 보게 만들어주세요.',
          targetName: 'tutorial-augmentation-cutmix',
          canAdvance: false,
        },
        'cnn13-retrain': {
          title: '앨범 분류기를 증강 데이터로 재학습',
          description:
            'MixUp과 CutMix가 켜졌습니다. Start를 눌러 같은 CNN 구조라도 사진 분포를 더 다양하게 보여주면 검증 성능과 안정성이 어떻게 달라지는지 확인해보세요.',
          targetName: 'tutorial-start-button',
          canAdvance: false,
        },
        'cnn13-success': {
          title: '자동 앨범 분류기 튜닝 완료',
          description:
            '좋습니다. 자동 앨범 분류기는 단순히 학습 사진을 외우면 새 사진에서 금방 흔들립니다. 데이터 증강은 모델 구조를 바꾸지 않고도 더 넓은 사진 분포를 보게 해서 일반화 성능을 끌어올리는 핵심 튜닝입니다.',
          targetName: 'tutorial-training-metrics',
          canAdvance: true,
          advanceLabel: '확인했어요',
        },
      }) satisfies Record<
        LessonCoachStep,
        {
          title: string;
          description: string;
          targetName: string | null;
          canAdvance: boolean;
          advanceLabel?: string;
        }
      >,
    [isCnn13TutorialActive],
  );
  const activeLessonCoachStep = lessonCoachStep ? lessonCoachCopy[lessonCoachStep] : null;
  const reopenLessonGuide = () => {
    setLessonCoachStep(lastDismissedLessonCoachStepRef.current);
  };
  const handleLibraryBlockDragStart = (type: BlockType) => {
    blockDropCompletedRef.current = false;
    setDraggingBlock(type);
  };
  const handleLibraryBlockDragEnd = () => {
    if (!blockDropCompletedRef.current) {
      setLessonCoachStep((current) => {
        const rewindMap: Partial<Record<LessonCoachStep, LessonCoachStep>> = {
          'cnn11-place-first-cnn': 'cnn11-upgrade-cnn',
          'cnn11-place-second-cnn': 'cnn11-match-linear',
          'cnn11-place-first-pool': 'cnn11-add-linear',
          'cnn11-place-third-cnn': 'cnn11-add-third-cnn',
          'cnn11-place-fourth-cnn': 'cnn11-add-fourth-cnn',
          'cnn11-place-second-pool': 'cnn11-add-second-pool',
          'cnn11-place-head-linear': 'cnn11-add-head-linear',
          'cnn11-place-output-linear': 'cnn11-add-output-linear',
          'cnn12-place-third-cnn': 'cnn12-add-third-cnn',
        };
        return current ? (rewindMap[current] ?? current) : current;
      });

      if (isMnistTutorialActive && tutorialStep === 'stack-block' && !linearNodeExists) {
        setTutorialStep('build-model');
      }
    }

    blockDropCompletedRef.current = false;
    setDraggingBlock(null);
  };
  useEffect(() => {
    if (!draggingBlock) {
      return;
    }

    let frameId: number | null = null;
    let pendingScroll = 0;
    const edgeSize = 140;
    const maxStep = 42;

    const handleDragAutoScroll = (event: DragEvent) => {
      const bottomDistance = window.innerHeight - event.clientY;
      const topDistance = event.clientY;
      let nextScroll = 0;

      if (bottomDistance < edgeSize) {
        nextScroll = Math.ceil(((edgeSize - bottomDistance) / edgeSize) * maxStep);
      } else if (topDistance < edgeSize) {
        nextScroll = -Math.ceil(((edgeSize - topDistance) / edgeSize) * maxStep);
      }

      if (nextScroll === 0) {
        pendingScroll = 0;
        return;
      }

      event.preventDefault();
      pendingScroll = nextScroll;

      if (frameId !== null) {
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        window.scrollBy({ top: pendingScroll, behavior: 'auto' });
      });
    };

    window.addEventListener('dragover', handleDragAutoScroll);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('dragover', handleDragAutoScroll);
    };
  }, [draggingBlock]);
  const resolveCurrentCnn11GuideStep = (): LessonCoachStep => {
    if (isBaseCnnArchitectureReady) {
      return 'cnn11-retrain-cnn';
    }
    if (linearNodeCount >= 2 && cnnOutputValue === '10') {
      return 'cnn11-set-output-linear-activation';
    }
    if (linearNodeCount >= 2 && cnnOutputInputValue === '128') {
      return 'cnn11-set-output-linear-output';
    }
    if (linearNodeCount >= 2) {
      return 'cnn11-set-output-linear-input';
    }
    if (linearNodeCount >= 1 && cnnHeadOutputValue === '128') {
      return 'cnn11-add-output-linear';
    }
    if (linearNodeCount >= 1 && cnnHeadInputValue === baseCnnHeadInputTarget) {
      return 'cnn11-set-head-linear-output';
    }
    if (linearNodeCount >= 1) {
      return 'cnn11-set-head-linear-input';
    }
    if (poolingNodeCount >= 2) {
      return 'cnn11-add-head-linear';
    }
    if (cnnNodeCount >= 4 && fourthCnnOutValue === '64') {
      return 'cnn11-add-second-pool';
    }
    if (cnnNodeCount >= 4 && fourthCnnInValue === '64') {
      return 'cnn11-set-fourth-cnn-out';
    }
    if (cnnNodeCount >= 4) {
      return 'cnn11-set-fourth-cnn-in';
    }
    if (cnnNodeCount >= 3 && thirdCnnOutValue === '64') {
      return 'cnn11-add-fourth-cnn';
    }
    if (cnnNodeCount >= 3 && thirdCnnInValue === '32') {
      return 'cnn11-set-third-cnn-out';
    }
    if (cnnNodeCount >= 3) {
      return 'cnn11-set-third-cnn-in';
    }
    if (poolingNodeCount >= 1) {
      return 'cnn11-add-third-cnn';
    }
    if (cnnNodeCount >= 2 && secondCnnOutValue === '32') {
      return 'cnn11-add-linear';
    }
    if (cnnNodeCount >= 2 && secondCnnInValue === '32') {
      return 'cnn11-set-second-cnn-out';
    }
    if (cnnNodeCount >= 2) {
      return 'cnn11-set-second-cnn-in';
    }
    if (cnnNodeCount >= 1 && firstCnnOutValue === '32') {
      return 'cnn11-match-linear';
    }
    if (cnnNodeCount >= 1 && firstCnnInValue === baseCnnInputChannelsTarget) {
      return 'cnn11-set-first-cnn-out';
    }
    if (cnnNodeCount >= 1) {
      return 'cnn11-set-first-cnn-in';
    }
    return 'cnn11-stack-linear';
  };
  const resolveCurrentCnn12GuideStep = (): LessonCoachStep => {
    if (isCnn12ArchitectureReady) {
      return 'cnn12-retrain';
    }
    if (cnnNodeCount >= 5 && fifthCnnOutValue === '128') {
      return cnnHeadInputValue === '6272' ? 'cnn12-retrain' : 'cnn12-match-head-input';
    }
    if (cnnNodeCount >= 5 && fifthCnnInValue === '64') {
      return 'cnn12-set-third-cnn-out';
    }
    if (cnnNodeCount >= 5) {
      return 'cnn12-set-third-cnn-in';
    }
    if (isBaseCnnArchitectureReady) {
      return trainingStatus?.status === 'completed' && trainingStatus.datasetId === 'fashion_mnist'
        ? 'cnn12-add-third-cnn'
        : 'cnn11-retrain-cnn';
    }
    return resolveCurrentCnn11GuideStep();
  };
  const openStoryQuest = () => {
    if (isStoryTutorialMissionReady) {
      if (isMnistTutorialActive) {
        lastDismissedTutorialStepRef.current = tutorialStep;
      }
      if ((isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && lessonCoachStep) {
        lastDismissedLessonCoachStepRef.current = lessonCoachStep;
        setLessonCoachStep(null);
      }
      setTutorialGuideOpen(false);
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
      return;
    }

    if (shouldResumeCnn11Mission) {
      setTutorialGuideOpen(false);
      setLessonCoachStep(null);
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
      return;
    }

    if (isMnistTutorialActive && isMnistGuideStep) {
      setTutorialGuideOpen(true);
      return;
    }

    if (mnistQuestPhase && mnistQuestPhase !== 'intro') {
      setIsMnistMissionMinimized(false);
      return;
    }

    if (
      isCnn11TutorialActive &&
      tutorialStep === 'build-model' &&
      cnn11MissionRetryPending &&
      trainingStatus?.status === 'completed' &&
      trainingStatus.datasetId === 'fashion_mnist' &&
      !!trainingStatus.jobId
    ) {
      setTutorialGuideOpen(false);
      setLessonCoachStep(null);
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
      return;
    }

    if ((isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && tutorialStep === 'build-model') {
      const resolvedGuideStep = isCnn12TutorialActive
        ? resolveCurrentCnn12GuideStep()
        : resolveCurrentCnn11GuideStep();
      const fallbackStep = lessonCoachStep ?? lastDismissedLessonCoachStepRef.current ?? resolvedGuideStep;
      const inferredStep =
        fallbackStep === 'cnn11-stack-linear' || fallbackStep === 'cnn11-linear-limit' || fallbackStep === 'cnn11-success'
          ? fallbackStep
          : resolvedGuideStep;
      setTutorialGuideOpen(false);
      setIsMnistMissionMinimized(false);
      lastDismissedLessonCoachStepRef.current = inferredStep;
      setLessonCoachStep(inferredStep);
      return;
    }
  };
  const reopenMnistGuide = () => {
    setTutorialGuideOpen(true);
    setTutorialStep(lastDismissedTutorialStepRef.current);
  };
  const closeHomeGuide = () => {
    setIsHomeGuideOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('visaible-home-guide-seen', 'true');
    }
  };

  const handleMinaSend = async (question: string) => {
    const userMessage: MinaMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };
    setMinaMessages((current) => [...current, userMessage]);
    setMinaBusy(true);
    setMinaCanvasHighlight(null);
    setMinaLibraryHighlightBlockType(null);
    const requestKind = detectMinaRequestKind(question);

    try {
      const response = await chatWithMina({
        question,
        requestKind,
        datasetId: selectedDataset.id,
        datasetLabel: selectedDataset.label,
        blocksSummary: summarizeBlocks(nodes),
        architectureSummary: summarizeArchitecture(nodes),
        metricsSummary: summarizeMetrics(trainingStatus ?? (latestTrainingResult as TrainingJobStatus | null)),
        nodeDetails: summarizeNodeDetails(nodes),
      });

      if (requestKind === 'improvement' && response.highlight) {
        if (
          response.highlight.action === 'add_block' &&
          response.highlight.blockType
        ) {
          setMinaLibraryHighlightBlockType(response.highlight.blockType);
        } else if (
          response.highlight.blockIndex != null &&
          response.highlight.fieldLabel
        ) {
          setMinaCanvasHighlight({
            blockIndex: response.highlight.blockIndex,
            fieldLabel: response.highlight.fieldLabel,
            suggestedValue: response.highlight.suggestedValue ?? null,
            reason: response.highlight.reason ?? null,
          });
        }
      }

      setMinaMessages((current) => [
        ...current,
        {
          id: `mina-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
        },
      ]);
    } catch (error) {
      setMinaCanvasHighlight(null);
      setMinaLibraryHighlightBlockType(null);
      const errorMessage =
        error instanceof Error ? error.message : '미안, 지금은 답을 가져오지 못했어. 잠시 후 다시 시도해줘.';
      const minaErrorMessage = errorMessage.includes('Gemini API key is not configured')
        ? '미안, 지금은 Gemini API 키가 설정되지 않아서 답할 수 없어. 백엔드 환경변수나 `backend/.env.local`에 `GOOGLE_API_KEY` 또는 `GEMINI_API_KEY`를 넣어주면 바로 사용할 수 있어.'
        : errorMessage;

      setMinaMessages((current) => [
        ...current,
        {
          id: `mina-error-${Date.now()}`,
          role: 'assistant',
          content: `미안, 지금은 답을 가져오지 못했어. ${minaErrorMessage}`,
        },
      ]);
    } finally {
      setMinaBusy(false);
    }
  };

  const clearMinaCanvasHighlight = () => {
    setMinaCanvasHighlight(null);
    setMinaLibraryHighlightBlockType(null);
  };

  const handleRemoveNode = (id: string) => {
    clearMinaCanvasHighlight();
    removeNode(id);
  };

  const handleUpdateNodeField = (id: string, fieldLabel: string, value: string) => {
    clearMinaCanvasHighlight();
    updateNodeField(id, fieldLabel, value);
  };

  const handleUpdateNodeActivation = (id: string, activation: string) => {
    clearMinaCanvasHighlight();
    updateNodeActivation(id, activation);
  };

  const handleMoveNode = (id: string, index: number) => {
    clearMinaCanvasHighlight();
    moveNode(id, index);
  };

  const handleDropBlock = (type: BlockType, index?: number) => {
    clearMinaCanvasHighlight();
    addNode(type, index);
  };

  const exitMnistQuest = () => {
    if (isCnn13TutorialActive) {
      const currentLessonId = 'cnn-1-3';
      saveWorkspaceSnapshot('tutorial', currentLessonId, getTutorialLessonDatasetId(currentLessonId));
      setTutorialGuideOpen(false);
      setTutorialStep('build-model');
      setTutorialPredictionDone(true);
      setCnn11MissionRetryPending(false);
      setIsMnistMissionMinimized(false);
      setLessonCoachStep(null);
      return;
    }

    const currentLessonId = isCnn12TutorialActive
      ? 'cnn-1-2'
      : isCnn11TutorialActive
        ? 'cnn-1-1'
        : 'mlp-1-1';
    const nextLessonId = isCnn12TutorialActive
      ? 'cnn-1-3'
      : isCnn11TutorialActive
        ? 'cnn-1-2'
        : 'mlp-1-2';
    saveWorkspaceSnapshot('tutorial', currentLessonId, getTutorialLessonDatasetId(currentLessonId));
    setTutorialGuideOpen(false);
    setTutorialStep('story-intro');
    setTutorialPredictionDone(false);
    setCnn11MissionRetryPending(false);
    setIsMnistMissionMinimized(false);
    setActiveWorkspace('tutorial');
    setSelectedTutorialLessonId(nextLessonId);
    const hasSnapshot = restoreWorkspaceSnapshot(
      'tutorial',
      nextLessonId,
      getTutorialLessonDatasetId(nextLessonId),
    );
    applyLessonTrainingDefaults(nextLessonId);
    const nextCoachStep = hasSnapshot ? null : getInitialLessonCoachStep(nextLessonId);
    if (nextCoachStep) {
      lastDismissedLessonCoachStepRef.current = nextCoachStep;
    }
    setLessonCoachStep(nextCoachStep);
  };

  const saveWorkspaceSnapshot = (
    workspace: WorkspaceMode,
    tutorialLessonId: string | null,
    datasetId: string,
    nextNodes: CanvasNode[] = nodes,
  ) => {
    const key = getWorkspaceSnapshotKey(workspace, tutorialLessonId);
    workspaceSnapshotsRef.current[key] = {
      datasetId,
      nodes: cloneNodes(nextNodes),
    };
  };

  const restoreWorkspaceSnapshot = (
    workspace: WorkspaceMode,
    tutorialLessonId: string | null,
    fallbackDatasetId: string,
  ) => {
    const key = getWorkspaceSnapshotKey(workspace, tutorialLessonId);
    const snapshot = workspaceSnapshotsRef.current[key];
    const hasSnapshot = snapshot != null;
    const fallbackNodes =
      workspace === 'tutorial' ? getTutorialLessonPresetNodes(tutorialLessonId) : [];
    const resolvedSnapshot = snapshot ?? {
      datasetId: fallbackDatasetId,
      nodes: fallbackNodes,
    };

    setSelectedDatasetId(resolvedSnapshot.datasetId);
    replaceNodes(cloneNodes(resolvedSnapshot.nodes));
    return hasSnapshot;
  };

  const clearTrainingUiState = () => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    streamRef.current?.close();
    streamRef.current = null;
    liveBatchKeyRef.current = null;
    setIsTraining(false);
    setIsTrainingOverlayOpen(false);
    setTrainingStatus(null);
    setLatestTrainingResult(null);
    setLiveHistory({ loss: [], accuracy: [], validationLoss: [], validationAccuracy: [] });
    setCurrentJobId(null);
    lastLessonHandledJobIdRef.current = null;
    lastStoryQuestOpenedJobIdRef.current = null;
  };

  const applyLessonTrainingDefaults = (lessonId: string | null) => {
    if (lessonId === 'mlp-1-2') {
      setOptimizer('AdamW');
      setLearningRate(optimizerConfigs.AdamW.defaultLearningRate);
      setEpochs('10');
      setBatchSize(128);
      return;
    }

    if (lessonId === 'cnn-1-1' || lessonId === 'cnn-1-2' || lessonId === 'cnn-1-3') {
      setOptimizer('AdamW');
      setLearningRate(optimizerConfigs.AdamW.defaultLearningRate);
      setEpochs('10');
      setBatchSize(128);
    }
  };

  const openTutorialLesson = (lessonId: string) => {
    saveWorkspaceSnapshot(activeWorkspace, selectedTutorialLessonId, selectedDatasetId);
    clearTrainingUiState();
    resetBoard();
    setActiveWorkspace('tutorial');
    setSelectedTutorialLessonId(lessonId);
    setTutorialGuideOpen(lessonId === 'mlp-1-1');
    setTutorialStep('story-intro');
    setTutorialPredictionDone(false);
    setIsMnistMissionMinimized(false);
    setCnn11BaselineChallengeSamples(null);
    if (lessonId === 'cnn-1-3') {
      setSelectedAugmentations([]);
      setAugmentationParams(defaultAugmentationParams);
    }
    restoreWorkspaceSnapshot('tutorial', lessonId, getTutorialLessonDatasetId(lessonId));
    applyLessonTrainingDefaults(lessonId);
    const initialCoachStep = getInitialLessonCoachStep(lessonId);
    if (initialCoachStep) {
      lastDismissedLessonCoachStepRef.current = initialCoachStep;
    }
    setLessonCoachStep(initialCoachStep);
  };

  const surfaceTrainingError = (message: string, jobId: string | null = currentJobId) => {
    console.error('Training error:', message, { jobId: jobId ?? currentJobId ?? 'local-error' });
    setIsTraining(false);
    setTrainingStatus((current) => ({
      jobId: jobId ?? current?.jobId ?? 'local-error',
      status: 'failed',
      architecture: current?.architecture ?? [],
      metrics: current?.metrics ?? [],
      datasetId: current?.datasetId ?? runtimeDatasetId,
      epochs: current?.epochs ?? Number(epochs),
      learningRate: current?.learningRate ?? Number(learningRate),
      batchSize: current?.batchSize ?? batchSize,
      optimizer: current?.optimizer ?? optimizer,
      trainSize: current?.trainSize ?? null,
      validationSize: current?.validationSize ?? null,
      numClasses: current?.numClasses ?? null,
      device: current?.device ?? null,
      bestValidationAccuracy: current?.bestValidationAccuracy ?? null,
      currentEpoch: current?.currentEpoch ?? null,
      currentBatch: current?.currentBatch ?? null,
      totalBatches: current?.totalBatches ?? null,
      stage: current?.stage ?? 'error',
      liveTrainLoss: current?.liveTrainLoss ?? null,
      liveTrainAccuracy: current?.liveTrainAccuracy ?? null,
      liveValidationLoss: current?.liveValidationLoss ?? null,
      liveValidationAccuracy: current?.liveValidationAccuracy ?? null,
      error: message,
    }));
    setCurrentJobId(null);
  };

  const applyTutorialPreset = (datasetId: string, tutorialLessonId: string | null = selectedTutorialLessonId) => {
    const nextConfig = getDatasetTeachingConfig(datasetId, tutorialLessonId);
    filterNodes(nextConfig.allowedBlocks);
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
      }
      streamRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const seen = window.localStorage.getItem('visaible-home-guide-seen');
    if (!seen) {
      setIsHomeGuideOpen(true);
    }
  }, []);

  useEffect(() => {
    if (activeWorkspace === 'tutorial') {
      applyTutorialPreset(runtimeDatasetId, selectedTutorialLessonId);
    }
  }, [activeWorkspace, runtimeDatasetId, selectedTutorialLessonId]);

  useEffect(() => {
    if (activeWorkspace === 'tutorial' && selectedTutorialLessonId !== 'mlp-1-1' && selectedTutorialLessonId !== 'cnn-1-1') {
      return;
    }

    if (isCnn11TutorialActive) {
      return;
    }

    if (!isMnistTutorialActive) {
      setTutorialGuideOpen(false);
      setTutorialStep('story-intro');
      setTutorialPredictionDone(false);
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
      return;
    }

    if (selectedDatasetId === 'mnist' && nodes.length === 0 && currentJobId === null) {
      setTutorialGuideOpen(true);
      setTutorialStep('story-intro');
      setTutorialPredictionDone(false);
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
    }
  }, [
    activeWorkspace,
    currentJobId,
    isCnn11TutorialActive,
    isMnistTutorialActive,
    nodes.length,
    selectedDatasetId,
    selectedTutorialLessonId,
  ]);

  useEffect(() => {
    if (!isMnistTutorialActive) {
      return;
    }

    if (tutorialStep === 'build-model') {
      if (linearNodeExists) {
        setTutorialStep('match-input-dimension');
        return;
      }

      if (draggingBlock === 'linear') {
        setTutorialStep('stack-block');
      }
      return;
    }

    if (tutorialStep === 'stack-block' && linearNodeExists) {
      setTutorialStep('match-input-dimension');
      return;
    }

    if (tutorialStep === 'edit-dimensions' && isMnistTutorialOutputReady) {
      setTutorialStep('set-activation');
      return;
    }

    if (tutorialStep === 'set-activation' && isMnistTutorialActivationReady) {
      setTutorialStep('choose-optimizer');
      return;
    }

    if (
      tutorialStep === 'train-model' &&
      (trainingStatus?.status === 'running' || showTutorialMnistMission)
    ) {
      setTutorialStep('training-metrics-loss');
      return;
    }

    if (tutorialStep === 'play-mission' && tutorialPredictionDone) {
      setTutorialStep('complete');
    }
  }, [
    isMnistTutorialActive,
    draggingBlock,
    isMnistTutorialActivationReady,
    isMnistTutorialOutputReady,
    linearNodeExists,
    trainingStatus?.status,
    showTutorialMnistMission,
    tutorialPredictionDone,
    tutorialStep,
  ]);

  useEffect(() => {
    if (!isCnn11TutorialActive && !isCnn12TutorialActive && !isCnn13TutorialActive) {
      return;
    }

    if (tutorialStep === 'play-mission' && tutorialPredictionDone) {
      setTutorialStep('complete');
    }
  }, [isCnn11TutorialActive, isCnn12TutorialActive, isCnn13TutorialActive, tutorialPredictionDone, tutorialStep]);

  useEffect(() => {
    if ((isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && tutorialGuideOpen) {
      setTutorialGuideOpen(false);
    }
  }, [isCnn11TutorialActive, isCnn12TutorialActive, isCnn13TutorialActive, tutorialGuideOpen]);

  useEffect(() => {
    if (!isMnistTutorialActive) {
      return;
    }

    if (
      tutorialStep === 'story-intro' ||
      tutorialStep === 'training-metrics-loss' ||
      tutorialStep === 'training-metrics-accuracy' ||
      tutorialStep === 'play-mission' ||
      tutorialStep === 'complete'
    ) {
      setIsMnistMissionMinimized(false);
      return;
    }

    setIsMnistMissionMinimized(true);
  }, [isMnistTutorialActive, tutorialStep]);

  useEffect(() => {
    if (lessonCoachStep === 'mlp12-add-layer' && linearNodeCount >= 2) {
      setLessonCoachStep('mlp12-match-input');
    }
    if (lessonCoachStep === 'cnn11-upgrade-cnn' && draggingBlock === 'cnn') {
      setLessonCoachStep('cnn11-place-first-cnn');
    }
    if (
      (lessonCoachStep === 'cnn11-upgrade-cnn' || lessonCoachStep === 'cnn11-place-first-cnn') &&
      cnnNodeCount >= 1
    ) {
      setLessonCoachStep('cnn11-set-first-cnn-in');
    }
    if (lessonCoachStep === 'cnn11-set-first-cnn-in' && firstCnnInValue === baseCnnInputChannelsTarget) {
      setLessonCoachStep('cnn11-set-first-cnn-out');
    }
    if (lessonCoachStep === 'cnn11-set-first-cnn-out' && firstCnnOutValue === '32') {
      setLessonCoachStep('cnn11-match-linear');
    }
    if (lessonCoachStep === 'cnn11-match-linear' && draggingBlock === 'cnn') {
      setLessonCoachStep('cnn11-place-second-cnn');
    }
    if (
      (lessonCoachStep === 'cnn11-match-linear' || lessonCoachStep === 'cnn11-place-second-cnn') &&
      cnnNodeCount >= 2
    ) {
      setLessonCoachStep('cnn11-set-second-cnn-in');
    }
    if (lessonCoachStep === 'cnn11-set-second-cnn-in' && secondCnnInValue === '32') {
      setLessonCoachStep('cnn11-set-second-cnn-out');
    }
    if (lessonCoachStep === 'cnn11-set-second-cnn-out' && secondCnnOutValue === '32') {
      setLessonCoachStep('cnn11-add-linear');
    }
    if (lessonCoachStep === 'cnn11-add-linear' && draggingBlock === 'pooling') {
      setLessonCoachStep('cnn11-place-first-pool');
    }
    if (
      (lessonCoachStep === 'cnn11-add-linear' || lessonCoachStep === 'cnn11-place-first-pool') &&
      poolingNodeCount >= 1
    ) {
      setLessonCoachStep('cnn11-add-third-cnn');
    }
    if (lessonCoachStep === 'cnn11-add-third-cnn' && draggingBlock === 'cnn') {
      setLessonCoachStep('cnn11-place-third-cnn');
    }
    if (
      (lessonCoachStep === 'cnn11-add-third-cnn' || lessonCoachStep === 'cnn11-place-third-cnn') &&
      cnnNodeCount >= 3
    ) {
      setLessonCoachStep('cnn11-set-third-cnn-in');
    }
    if (lessonCoachStep === 'cnn11-set-third-cnn-in' && thirdCnnInValue === '32') {
      setLessonCoachStep('cnn11-set-third-cnn-out');
    }
    if (lessonCoachStep === 'cnn11-set-third-cnn-out' && thirdCnnOutValue === '64') {
      setLessonCoachStep('cnn11-add-fourth-cnn');
    }
    if (lessonCoachStep === 'cnn11-add-fourth-cnn' && draggingBlock === 'cnn') {
      setLessonCoachStep('cnn11-place-fourth-cnn');
    }
    if (
      (lessonCoachStep === 'cnn11-add-fourth-cnn' || lessonCoachStep === 'cnn11-place-fourth-cnn') &&
      cnnNodeCount >= 4
    ) {
      setLessonCoachStep('cnn11-set-fourth-cnn-in');
    }
    if (lessonCoachStep === 'cnn11-set-fourth-cnn-in' && fourthCnnInValue === '64') {
      setLessonCoachStep('cnn11-set-fourth-cnn-out');
    }
    if (lessonCoachStep === 'cnn11-set-fourth-cnn-out' && fourthCnnOutValue === '64') {
      setLessonCoachStep('cnn11-add-second-pool');
    }
    if (lessonCoachStep === 'cnn11-add-second-pool' && draggingBlock === 'pooling') {
      setLessonCoachStep('cnn11-place-second-pool');
    }
    if (
      (lessonCoachStep === 'cnn11-add-second-pool' || lessonCoachStep === 'cnn11-place-second-pool') &&
      poolingNodeCount >= 2
    ) {
      setLessonCoachStep('cnn11-add-head-linear');
    }
    if (lessonCoachStep === 'cnn11-add-head-linear' && draggingBlock === 'linear') {
      setLessonCoachStep('cnn11-place-head-linear');
    }
    if (
      (lessonCoachStep === 'cnn11-add-head-linear' || lessonCoachStep === 'cnn11-place-head-linear') &&
      linearNodeCount >= 1
    ) {
      setLessonCoachStep('cnn11-set-head-linear-input');
    }
    if (lessonCoachStep === 'cnn11-set-head-linear-input' && cnnHeadInputValue === baseCnnHeadInputTarget) {
      setLessonCoachStep('cnn11-set-head-linear-output');
    }
    if (lessonCoachStep === 'cnn11-set-head-linear-output' && cnnHeadOutputValue === '128') {
      setLessonCoachStep('cnn11-add-output-linear');
    }
    if (lessonCoachStep === 'cnn11-add-output-linear' && draggingBlock === 'linear') {
      setLessonCoachStep('cnn11-place-output-linear');
    }
    if (
      (lessonCoachStep === 'cnn11-add-output-linear' || lessonCoachStep === 'cnn11-place-output-linear') &&
      linearNodeCount >= 2
    ) {
      setLessonCoachStep('cnn11-set-output-linear-input');
    }
    if (lessonCoachStep === 'cnn11-set-output-linear-input' && cnnOutputInputValue === '128') {
      setLessonCoachStep('cnn11-set-output-linear-output');
    }
    if (lessonCoachStep === 'cnn11-set-output-linear-output' && cnnOutputValue === '10') {
      setLessonCoachStep('cnn11-set-output-linear-activation');
    }
    if (
      lessonCoachStep === 'cnn11-set-output-linear-activation' &&
      outputLinearNode?.activation === 'None'
    ) {
      setLessonCoachStep('cnn11-retrain-cnn');
    }
    if (
      (lessonCoachStep === 'cnn12-add-third-cnn' || lessonCoachStep === 'cnn12-place-third-cnn') &&
      cnnNodeCount >= 5
    ) {
      setLessonCoachStep('cnn12-set-third-cnn-in');
    }
    if (lessonCoachStep === 'cnn12-add-third-cnn' && draggingBlock === 'cnn') {
      setLessonCoachStep('cnn12-place-third-cnn');
    }
    if (lessonCoachStep === 'cnn12-set-third-cnn-in' && fifthCnnInValue === '64') {
      setLessonCoachStep('cnn12-set-third-cnn-out');
    }
    if (lessonCoachStep === 'cnn12-set-third-cnn-out' && fifthCnnOutValue === '128') {
      setLessonCoachStep('cnn12-match-head-input');
    }
    if (lessonCoachStep === 'cnn13-select-mixup' && selectedAugmentations.includes('mixup')) {
      setLessonCoachStep('cnn13-tune-mixup');
    }
    if (lessonCoachStep === 'cnn13-select-cutmix' && selectedAugmentations.includes('cutmix')) {
      setLessonCoachStep('cnn13-retrain');
    }
  }, [
    cnnHeadInputValue,
    cnnHeadOutputValue,
    cnnNodeCount,
    baseCnnHeadInputTarget,
    baseCnnInputChannelsTarget,
    firstCnnInValue,
    firstCnnOutValue,
    isCnn11ArchitectureReady,
    lessonCoachStep,
    linearNodeCount,
    outputLinearNode?.activation,
    poolingNodeCount,
    cnnOutputInputValue,
    cnnOutputValue,
    secondCnnInValue,
    secondCnnOutValue,
    selectedAugmentations,
    thirdCnnInValue,
    thirdCnnOutValue,
    fourthCnnInValue,
    fourthCnnOutValue,
    fifthCnnInValue,
    fifthCnnOutValue,
    draggingBlock,
  ]);

  useEffect(() => {
    if (!isMlp12TutorialActive || trainingStatus?.status !== 'completed' || !trainingStatus.jobId) {
      return;
    }

    if (lastLessonHandledJobIdRef.current === trainingStatus.jobId) {
      return;
    }
    lastLessonHandledJobIdRef.current = trainingStatus.jobId;

    const latestMetric = trainingStatus.metrics.at(-1);
    if (!latestMetric) {
      return;
    }

    const validationAccuracy =
      trainingStatus.bestValidationAccuracy ?? latestMetric.validationAccuracy ?? 0;
    const accuracyTarget = 0.945;

    if (validationAccuracy >= accuracyTarget) {
      setLessonCoachStep('mlp12-success');
      return;
    }

    setLessonCoachStep(linearNodeCount >= 2 ? 'mlp12-retrain' : 'mlp12-add-layer');
  }, [isMlp12TutorialActive, linearNodeCount, trainingStatus]);

  useEffect(() => {
    if (!isCnn11TutorialActive || trainingStatus?.status !== 'completed' || !trainingStatus.jobId) {
      return;
    }

    if (lastLessonHandledJobIdRef.current === trainingStatus.jobId) {
      return;
    }
    lastLessonHandledJobIdRef.current = trainingStatus.jobId;

    if (cnn11MissionRetryPending) {
      setTutorialGuideOpen(false);
      setLessonCoachStep(null);
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
      setCnn11MissionRetryPending(false);
      return;
    }

    if (isCnn11ArchitectureReady) {
      setLessonCoachStep('cnn11-success');
      return;
    }
  }, [cnn11MissionRetryPending, isCnn11ArchitectureReady, isCnn11TutorialActive, trainingStatus]);

  useEffect(() => {
    if (!isCnn12TutorialActive || trainingStatus?.status !== 'completed' || !trainingStatus.jobId) {
      return;
    }

    if (lastLessonHandledJobIdRef.current === trainingStatus.jobId) {
      return;
    }
    lastLessonHandledJobIdRef.current = trainingStatus.jobId;

    if (isCnn12ArchitectureReady) {
      setLessonCoachStep('cnn12-success');
      return;
    }

    if (cnnNodeCount >= 5 && fifthCnnInValue === '64' && fifthCnnOutValue === '128') {
      setLessonCoachStep(cnnHeadInputValue === '6272' ? 'cnn12-retrain' : 'cnn12-match-head-input');
      return;
    }

    setLessonCoachStep(cnnNodeCount >= 5 ? 'cnn12-set-third-cnn-in' : 'cnn12-add-third-cnn');
  }, [
    cnnHeadInputValue,
    cnnNodeCount,
    isCnn12ArchitectureReady,
    isCnn12TutorialActive,
    fifthCnnInValue,
    fifthCnnOutValue,
    trainingStatus,
  ]);

  useEffect(() => {
    if (!isCnn13TutorialActive || trainingStatus?.status !== 'completed' || !trainingStatus.jobId) {
      return;
    }

    if (lastLessonHandledJobIdRef.current === trainingStatus.jobId) {
      return;
    }
    lastLessonHandledJobIdRef.current = trainingStatus.jobId;

    if (hasCifarAugmentationPair) {
      setLessonCoachStep('cnn13-success');
      return;
    }

    if (selectedAugmentations.includes('mixup')) {
      setLessonCoachStep('cnn13-select-cutmix');
      return;
    }

    if (isCnn13ArchitectureReady) {
      setTutorialGuideOpen(false);
      setLessonCoachStep(null);
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
      return;
    }

    setLessonCoachStep(resolveCurrentCnn11GuideStep());
  }, [
    hasCifarAugmentationPair,
    isCnn13ArchitectureReady,
    isCnn13TutorialActive,
    selectedAugmentations,
    trainingStatus,
  ]);

  useEffect(() => {
    if (!isStoryTutorialMissionReady || !trainingStatus?.jobId || tutorialPredictionDone) {
      return;
    }

    if (isCnn13TutorialActive && hasCifarAugmentationPair) {
      return;
    }

    const storyQuestRunKey = `${selectedTutorialLessonId ?? 'story'}:${trainingStatus.jobId}`;
    if (lastStoryQuestOpenedJobIdRef.current === storyQuestRunKey) {
      return;
    }
    lastStoryQuestOpenedJobIdRef.current = storyQuestRunKey;

    if (isMnistTutorialActive) {
      lastDismissedTutorialStepRef.current = tutorialStep;
    }
    if ((isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && lessonCoachStep) {
      lastDismissedLessonCoachStepRef.current = lessonCoachStep;
      setLessonCoachStep(null);
    }

    setTutorialGuideOpen(false);
    setTutorialStep('play-mission');
    setIsMnistMissionMinimized(false);
    setCnn11MissionRetryPending(false);
  }, [
    isCnn11TutorialActive,
    isCnn12TutorialActive,
    isCnn13TutorialActive,
    hasCifarAugmentationPair,
    isMnistTutorialActive,
    isStoryTutorialMissionReady,
    lessonCoachStep,
    selectedTutorialLessonId,
    trainingStatus?.jobId,
    tutorialPredictionDone,
    tutorialStep,
  ]);

  useEffect(() => {
    if (!isCnn11TutorialActive) {
      return;
    }

    if (
      trainingStatus?.status === 'completed' &&
      trainingStatus.datasetId === 'fashion_mnist' &&
      cnnNodeCount === 0 &&
      linearNodeCount >= 1 &&
      (trainingStatus.challengeSamples?.length ?? 0) >= 10
    ) {
      const nextBaselineSamples = trainingStatus.challengeSamples?.slice(0, 10) ?? null;
      const nextBaselineKey = nextBaselineSamples
        ?.map((sample) => `${sample.targetIndex}:${sample.predictedIndex}:${sample.confidence.toFixed(4)}`)
        .join('|') ?? '';
      const currentBaselineKey = cnn11BaselineChallengeSamples
        ?.map((sample) => `${sample.targetIndex}:${sample.predictedIndex}:${sample.confidence.toFixed(4)}`)
        .join('|') ?? '';

      if (nextBaselineKey !== currentBaselineKey) {
        setCnn11BaselineChallengeSamples(nextBaselineSamples);
      }
    }

    if (
      trainingStatus?.status === 'completed' &&
      trainingStatus.datasetId === 'fashion_mnist' &&
      lessonCoachStep === null &&
      cnnNodeCount === 0 &&
      linearNodeCount >= 1 &&
      tutorialStep !== 'play-mission' &&
      tutorialStep !== 'complete'
    ) {
      setTutorialStep('play-mission');
      setIsMnistMissionMinimized(false);
    }
  }, [
    cnn11BaselineChallengeSamples,
    cnnNodeCount,
    isCnn11TutorialActive,
    lessonCoachStep,
    linearNodeCount,
    trainingStatus,
    tutorialStep,
  ]);

  useEffect(() => {
    if (!competitionRoom) {
      setCompetitionLeaderboard(null);
      return;
    }

    void (async () => {
      try {
        const [room, leaderboard] = await Promise.all([
          getCompetitionRoom(competitionRoom.roomCode, competitionRoom.participantId),
          getCompetitionLeaderboard(competitionRoom.roomCode, competitionRoom.participantId),
        ]);
        setCompetitionRoom((current) =>
          current == null
            ? room
            : {
                ...room,
                generatedPassword:
                  room.generatedPassword ??
                  (current.participantRole === 'host' ? current.generatedPassword : null),
              },
        );
        setCompetitionLeaderboard(leaderboard);
      } catch (error) {
        setCompetitionError(
          error instanceof Error ? error.message : 'Competition room sync failed unexpectedly',
        );
      }
    })();
  }, [competitionRoom?.roomCode, competitionRoom?.participantId]);

  useEffect(() => {
    if (!hasLiveTrainingVisualization && isTrainingOverlayOpen) {
      setIsTrainingOverlayOpen(false);
    }
  }, [hasLiveTrainingVisualization, isTrainingOverlayOpen]);

  const competitionActive = activeWorkspace === 'competition' && competitionRoom !== null;
  const competitionInfoText = competitionRoom
    ? [
        `Title: ${competitionRoom.title}`,
        `Dataset: ${selectedDataset.label}`,
        `Code: ${competitionRoom.roomCode}`,
        competitionRoom.generatedPassword ? `Password: ${competitionRoom.generatedPassword}` : null,
      ]
        .filter((item): item is string => item !== null)
        .join('\n')
    : '';
  const competitionTimeline =
    competitionActive && competitionRoom
      ? getCompetitionTimeline(competitionRoom, currentTime)
      : null;

  const handleCopyCompetitionText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCompetitionCopyFeedback(`${label} copied`);
      window.setTimeout(() => {
        setCompetitionCopyFeedback((current) => (current === `${label} copied` ? null : current));
      }, 1800);
    } catch {
      setCompetitionCopyFeedback('Copy failed');
      window.setTimeout(() => {
        setCompetitionCopyFeedback((current) => (current === 'Copy failed' ? null : current));
      }, 1800);
    }
  };

  const handleCreateCompetitionRoom = async (payload: {
    hostName: string;
    title: string;
    datasetId: string;
    roomCode?: string;
    password?: string;
    startsAt?: string;
    endsAt?: string;
  }) => {
    setCompetitionBusy(true);
    setCompetitionError(null);
    try {
      const room = await createCompetitionRoom(payload);
      setCompetitionRoom(room);
      setCompetitionLeaderboard(await getCompetitionLeaderboard(room.roomCode, room.participantId));
      setActiveWorkspace('competition');
      setBatchSize(128);
      setCompetitionRuns([]);
      setSelectedCompetitionRunJobId(null);
    } catch (error) {
      setCompetitionError(
        error instanceof Error ? error.message : 'Competition room creation failed unexpectedly',
      );
    } finally {
      setCompetitionBusy(false);
    }
  };

  const handleEnterCompetitionRoom = async (payload: {
    roomCode: string;
    password: string;
    participantName: string;
  }) => {
    setCompetitionBusy(true);
    setCompetitionError(null);
    try {
      const room = await enterCompetitionRoom(payload);
      setCompetitionRoom({
        ...room,
        generatedPassword: room.participantRole === 'host' ? payload.password : null,
      });
      setCompetitionLeaderboard(await getCompetitionLeaderboard(room.roomCode, room.participantId));
      setActiveWorkspace('competition');
      setBatchSize(128);
      setCompetitionRuns([]);
      setSelectedCompetitionRunJobId(null);
    } catch (error) {
      setCompetitionError(
        error instanceof Error ? error.message : 'Competition room entry failed unexpectedly',
      );
    } finally {
      setCompetitionBusy(false);
    }
  };

  const handleSubmitCompetitionRun = async (jobId: string) => {
    if (!competitionRoom) {
      return;
    }

    setCompetitionSubmitBusy(true);
    setCompetitionError(null);
    try {
      const submission = await submitCompetitionRun({
        roomCode: competitionRoom.roomCode,
        participantId: competitionRoom.participantId,
        jobId,
        optimizer,
        batchSize,
      });
      setCompetitionRuns((current) =>
        current.map((run) =>
          run.jobId === jobId
            ? { ...run, submitted: true, submission }
            : run,
        ),
      );
      setCompetitionLeaderboard(
        await getCompetitionLeaderboard(competitionRoom.roomCode, competitionRoom.participantId),
      );
      setIsCompetitionRankOpen(true);
    } catch (error) {
      setCompetitionError(
        error instanceof Error ? error.message : 'Competition submission failed unexpectedly',
      );
    } finally {
      setCompetitionSubmitBusy(false);
    }
  };

  const handleLeaveCompetitionRoom = () => {
    setCompetitionRoom(null);
    setCompetitionLeaderboard(null);
    setCompetitionRuns([]);
    setSelectedCompetitionRunJobId(null);
    setCompetitionError(null);
    setCompetitionCopyFeedback(null);
    setIsCompetitionInfoOpen(false);
    setIsCompetitionRankOpen(false);
    setActiveWorkspace('builder');
  };

  const handleTrainingStart = () => {
    void (async () => {
      if (
        isMlp12TutorialActive ||
        isCnn12TutorialActive ||
        isCnn13TutorialActive ||
        lessonCoachStep === 'cnn11-stack-linear' ||
        lessonCoachStep === 'cnn11-train-linear' ||
        lessonCoachStep === 'cnn11-retrain-cnn'
      ) {
        setLessonCoachStep(null);
      }
      if (activeWorkspace === 'builder' || activeWorkspace === 'competition') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setInspectorMetricMode('loss');
      setIsTraining(true);
      setIsTrainingOverlayOpen(activeWorkspace !== 'competition' && hasLiveTrainingVisualization);
      setTrainingStatus(null);
      setLatestTrainingResult(null);
      setLiveHistory({ loss: [], accuracy: [], validationLoss: [], validationAccuracy: [] });
      liveBatchKeyRef.current = null;
      lastConsoleStatusRef.current = null;
      lastConsoleStageRef.current = null;
      lastConsoleBatchRef.current = null;
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      streamRef.current?.close();
      streamRef.current = null;

      try {
        const { jobId } = await startTraining({
          datasetId: runtimeDatasetId,
          learningRate: Number(learningRate),
          epochs: Number(epochs),
          batchSize,
          optimizer,
          optimizerParams,
          augmentations: activeAugmentations,
          augmentationParams: activeAugmentationParams,
          nodes,
        });
        setCurrentJobId(jobId);
        console.info('[training]', {
          source: 'client',
          status: 'start-requested',
          datasetId: runtimeDatasetId,
          jobId,
          epochs: Number(epochs),
          batchSize,
          optimizer,
        });

        let missingStatusRetries = 0;
        let usingPollingFallback = false;
        const stopPolling = () => {
          if (pollingRef.current !== null) {
            window.clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        };
        const stopStreaming = () => {
          streamRef.current?.close();
          streamRef.current = null;
        };
        const finishTraining = (result: TrainingJobStatus) => {
          setTrainingStatus(result);
          if (result.status === 'completed') {
            setLatestTrainingResult(result as TrainingRunResult);
            if (activeWorkspace === 'competition' && result.jobId) {
              const completedMetric = result.metrics.at(-1);
              if (completedMetric) {
                setCompetitionRuns((current) => {
                  const existing = current.find((run) => run.jobId === result.jobId);
                  const nextRun: CompetitionRunRecord = {
                    jobId: result.jobId,
                    trainAccuracy: completedMetric.trainAccuracy,
                    validationAccuracy: completedMetric.validationAccuracy,
                    submitted: existing?.submitted ?? false,
                    submission: existing?.submission ?? null,
                    completedAt: new Date().toISOString(),
                  };

                  return [nextRun, ...current.filter((run) => run.jobId !== result.jobId)];
                });
              }
            }
          }
          if (result.status === 'failed') {
            console.error('Training failed:', result.error ?? 'Training failed unexpectedly', {
              jobId: result.jobId,
              stage: result.stage ?? null,
            });
          }
          setIsTraining(false);
          if (result.status === 'completed' || result.status === 'failed' || result.status === 'stopped') {
            setCurrentJobId(null);
            liveBatchKeyRef.current = null;
            setLiveHistory({
              loss: [],
              accuracy: [],
              validationLoss: [],
              validationAccuracy: [],
            });
          }
          stopPolling();
          stopStreaming();
        };
        const syncLiveHistory = (result: TrainingJobStatus) => {
          if (result.status !== 'running' || result.stage !== 'train') {
            return;
          }
          if (result.currentEpoch == null || result.currentBatch == null) {
            return;
          }

          const batchKey = `${result.currentEpoch}:${result.currentBatch}`;
          if (liveBatchKeyRef.current === batchKey) {
            return;
          }
          liveBatchKeyRef.current = batchKey;

          setLiveHistory((current) => ({
            loss:
              result.liveTrainLoss != null
                ? [...current.loss, result.liveTrainLoss]
                : current.loss,
            accuracy:
              result.liveTrainAccuracy != null
                ? [...current.accuracy, result.liveTrainAccuracy]
                : current.accuracy,
            validationLoss:
              result.liveValidationLoss != null
                ? [...current.validationLoss, result.liveValidationLoss]
                : current.validationLoss,
            validationAccuracy:
              result.liveValidationAccuracy != null
                ? [...current.validationAccuracy, result.liveValidationAccuracy]
                : current.validationAccuracy,
          }));
        };
        const pollStatus = async () => {
          try {
            const result = await getTrainingStatus(jobId);
            missingStatusRetries = 0;
            setTrainingStatus(result);
            syncLiveHistory(result);
            logTrainingStatusToConsole(result, 'poll');

            if (result.status === 'completed' || result.status === 'failed' || result.status === 'stopped') {
              finishTraining(result);
              return result;
            }

            return result;
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Training status fetch failed';
            if (message.includes('Training job not found') && missingStatusRetries < 20) {
              missingStatusRetries += 1;
              return null;
            }
            surfaceTrainingError(message, jobId);
            stopPolling();
            stopStreaming();
            return null;
          }
        };

        const initialStatus = await pollStatus();
        if (initialStatus?.status === 'completed' || initialStatus?.status === 'failed') {
          return;
        }
        streamRef.current = subscribeTrainingStatus(jobId, {
          onMessage: (result) => {
            setTrainingStatus(result);
            syncLiveHistory(result);
            logTrainingStatusToConsole(result, 'stream');
            if (result.status === 'running') {
              setIsTraining(true);
            }
            if (result.status === 'completed' || result.status === 'failed' || result.status === 'stopped') {
              finishTraining(result);
            }
          },
          onError: () => {
            if (usingPollingFallback) {
              return;
            }
            console.warn('[training]', {
              source: 'stream',
              status: 'stream-error',
              jobId,
            });
            usingPollingFallback = true;
            stopStreaming();
            void pollStatus();
            pollingRef.current = window.setInterval(() => {
              void pollStatus();
            }, 250);
          },
        });
      } catch (error) {
        surfaceTrainingError(
          error instanceof Error ? error.message : 'Training failed unexpectedly',
        );
      }
    })();
  };

  const handleTrainingStop = () => {
    void (async () => {
      if (!currentJobId) {
        return;
      }
      try {
        await stopTraining(currentJobId);
        setIsTraining(false);
        setCurrentJobId(null);
        streamRef.current?.close();
        streamRef.current = null;
        if (pollingRef.current !== null) {
          window.clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        setTrainingStatus((current) =>
          current
            ? {
                ...current,
                status: 'stopped',
                currentBatch: null,
              }
            : null,
        );
        setLatestTrainingResult(null);
        setLiveHistory({
          loss: [],
          accuracy: [],
          validationLoss: [],
          validationAccuracy: [],
        });
        liveBatchKeyRef.current = null;
      } catch (error) {
        surfaceTrainingError(
          error instanceof Error ? error.message : 'Stop failed unexpectedly',
        );
      }
    })();
  };

  const handlePreviewOpen = () => {
    if (activeWorkspace === 'competition') {
      return;
    }
    setIsPreviewOpen(true);
  };

  const isTutorialSceneVisible =
    isStoryTutorialActive &&
    (isHomeGuideOpen ||
      tutorialGuideOpen ||
      Boolean(mnistQuestPhase && !(mnistQuestPhase !== 'intro' && isMnistMissionMinimized)));
  const shouldForceTutorialBottomAction =
    (isMnistTutorialActive &&
      tutorialGuideOpen &&
      (
        tutorialStep === 'choose-optimizer' ||
        tutorialStep === 'set-learning-rate' ||
        tutorialStep === 'set-batch-size' ||
        tutorialStep === 'set-epochs' ||
        tutorialStep === 'train-model'
      )) ||
    (isCnn11TutorialActive &&
      tutorialStep === 'build-model');
  const shouldHideBottomActionForLessonCoach =
    activeWorkspace === 'tutorial' &&
    lessonCoachStep !== null &&
    activeLessonCoachStep?.targetName !== 'tutorial-start-button';
  const isBottomActionVisible =
    !isCompetitionRankOpen &&
    !shouldHideBottomActionForLessonCoach &&
    (activeWorkspace === 'builder' ||
      (activeWorkspace === 'competition' && competitionRoom !== null) ||
      (activeWorkspace === 'tutorial' &&
        (!isStoryTutorialActive || !isTutorialSceneVisible || shouldForceTutorialBottomAction)));
  const isTrainButtonRunning = isTraining && currentJobId !== null;
  const optimizerConfig = optimizerConfigs[optimizer];
  const learningRates = optimizerConfig.learningRates;
  const optimizerField = optimizerConfig.parameter;
  const learningRateIndex = Math.max(0, learningRates.indexOf(learningRate));
  const batchSizeIndex = Math.max(0, batchSizeOptions.indexOf(batchSize as (typeof batchSizeOptions)[number]));
  const optimizerParamIndex =
    optimizerField == null
      ? 0
      : Math.max(0, optimizerField.values.indexOf(optimizerParams[optimizerField.key]));
  const shellPaddingBottomClassName = isBottomActionVisible
    ? 'pb-[15.5rem] xl:pb-[16.5rem]'
    : 'pb-3 xl:pb-4';

  return (
    <div className={`min-h-screen px-3 py-3 xl:px-4 xl:py-4 ${shellPaddingBottomClassName}`}>
      <div className="mx-auto w-full max-w-[min(2320px,calc(100vw-8px))]">
        <TopBar
          activeWorkspace={activeWorkspace}
          trainingStatus={trainingStatus}
          isTraining={isTraining}
          onWorkspaceSelect={handleWorkspaceSelect}
          onLogoClick={() => {
            saveWorkspaceSnapshot(activeWorkspace, selectedTutorialLessonId, selectedDatasetId);
            clearTrainingUiState();
            setActiveWorkspace('home');
            setIsCompetitionInfoOpen(false);
            setIsCompetitionRankOpen(false);
            setTutorialGuideOpen(false);
            setTutorialStep('story-intro');
            setTutorialPredictionDone(false);
            setIsMnistMissionMinimized(false);
            setLessonCoachStep(null);
            setCnn11BaselineChallengeSamples(null);
          }}
        />

        <div className={shellGridClassName}>
          {isCompetitionSetupVisible || activeWorkspace === 'learning' || activeWorkspace === 'home' ? null : (
            <Sidebar
              selectedDatasetId={selectedDatasetId}
              activeWorkspace={activeWorkspace}
              hasCompetitionRoom={competitionRoom !== null}
              selectedDataset={selectedDataset}
              availableBlockTypes={teachingConfig.allowedBlocks}
              minaHighlightBlockType={activeWorkspace === 'builder' ? minaLibraryHighlightBlockType : null}
              selectedTutorialLessonId={selectedTutorialLessonId}
              selectedStock={selectedStock}
              playgroundMode={playgroundMode}
              reserveBottomActionSpace={isBottomActionVisible}
              onDatasetSelect={(datasetId) => {
                if (activeWorkspace === 'competition') {
                  return;
                }
                if (activeWorkspace === 'tutorial') {
                  return;
                }
                if (currentJobId) {
                  void stopTraining(currentJobId).catch(() => {});
                }
                clearTrainingUiState();
                resetBoard();
                setSelectedDatasetId(datasetId);
              }}
              onTutorialLessonSelect={openTutorialLesson}
              onStockSelect={setSelectedStock}
              onPlaygroundModeSelect={setPlaygroundMode}
              onBlockDragStart={handleLibraryBlockDragStart}
              onBlockDragEnd={handleLibraryBlockDragEnd}
            />
          )}
          {activeWorkspace === 'home' ? (
            <div className="min-w-0">
              <HomeLanding onNavigate={handleWorkspaceSelect} />
            </div>
          ) : activeWorkspace === 'playground' ? (
            <div className="min-w-0">
              {playgroundMode === 'stock' ? (
                <StockPlayground
                  selectedStock={selectedStock ?? stockPlaygroundPresets[0]}
                  onGoToDocs={() => {
                    setSelectedLearningChapterId('dnn-basics');
                    setActiveWorkspace('learning');
                  }}
                />
              ) : (
                <RockPaperScissorsPlayground
                  onGoToCnnDocs={() => {
                    setSelectedLearningChapterId('cnn-basics');
                    setActiveWorkspace('learning');
                  }}
                />
              )}
            </div>
          ) : activeWorkspace === 'learning' ? (
            <div className="min-w-0 lg:col-span-2">
              <LearningWorkspacePanel
                requestedChapterId={selectedLearningChapterId}
                onRequestedChapterHandled={() => setSelectedLearningChapterId(null)}
                onGoToTutorial={openTutorialLesson}
              />
            </div>
          ) : activeWorkspace === 'competition' && !competitionRoom ? (
            <CompetitionPanel
              isLoading={competitionBusy}
              error={competitionError}
              onCreateRoom={handleCreateCompetitionRoom}
              onEnterRoom={handleEnterCompetitionRoom}
            />
          ) : (
            <>
              <div className="relative min-h-0 min-w-0">
                {competitionActive ? (
                  <div className="mb-2.5 overflow-hidden rounded-[28px] border border-[#dbe5f1] bg-[#f8fbff] shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
                    <div className="border-b border-[#dbe5f1] bg-[linear-gradient(135deg,#0f172a,#173968_48%,#2563eb)] px-5 py-5 text-white">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/65">
                            VisAible Competition
                          </div>
                          <div className="mt-1 font-display text-[28px] font-bold tracking-[-0.04em]">
                            {competitionRoom.title}
                          </div>
                          <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/90">
                            <div className="rounded-full border border-white/15 bg-white/12 px-3 py-1.5">
                              Code {competitionRoom.roomCode}
                            </div>
                            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-white/82">
                              Host {competitionRoom.hostName}
                            </div>
                            <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-white/82">
                              Invite Only
                            </div>
                            {competitionRoom.participantRole === 'host' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsCompetitionInfoOpen((current) => !current);
                                  void handleCopyCompetitionText('Info', competitionInfoText);
                                }}
                                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-white"
                              >
                                <Icon name="copy" className="h-4 w-4" />
                                Info
                              </button>
                            ) : null}
                            {competitionCopyFeedback ? (
                              <div className="rounded-full bg-white/14 px-3 py-1.5 text-white">
                                {competitionCopyFeedback}
                              </div>
                            ) : null}
                            {competitionRoom.participantRole === 'host' && isCompetitionInfoOpen ? (
                              <div className="absolute left-0 top-full z-20 mt-3 w-[min(320px,80vw)] rounded-[18px] border border-white/15 bg-[rgba(15,23,42,0.88)] p-4 text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/70">
                                    Room Info
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setIsCompetitionInfoOpen(false)}
                                    className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/75"
                                  >
                                    Close
                                  </button>
                                </div>
                                <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-white/90">
                                  {competitionInfoText}
                                </pre>
                                <div className="mt-3 text-[11px] font-semibold text-white/65">
                                  {competitionCopyFeedback ?? '클릭하면 정보가 복사됩니다.'}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIsCompetitionRankOpen(true)}
                            className="rounded-[14px] border border-white/15 bg-white/16 px-4 py-2 text-[12px] font-extrabold tracking-[0.06em] text-white"
                          >
                            리더보드 보기
                          </button>
                          <button
                            type="button"
                            onClick={handleLeaveCompetitionRoom}
                            className="rounded-[14px] border border-[#fecaca] bg-[rgba(127,29,29,0.18)] px-4 py-2 text-[12px] font-extrabold tracking-[0.06em] text-white"
                          >
                            방 나가기
                          </button>
                        </div>
                      </div>
                      <div className="mt-5 rounded-[22px] border border-white/18 bg-[rgba(255,255,255,0.14)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/65">
                              Competition Progress
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <div className="rounded-full bg-white/18 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                                {competitionTimeline?.isEnded ? 'Ended' : 'Running'}
                              </div>
                              <div className="rounded-full bg-[#dbeafe] px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1d4ed8]">
                                {competitionTimeline ? `${competitionTimeline.progress}%` : 'Live'}
                              </div>
                            </div>
                            <div className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-white">
                              {competitionTimeline
                                ? competitionTimeline.isEnded
                                  ? '대회가 종료되었습니다'
                                  : formatRemainingTime(competitionTimeline.remainingMs)
                                : '진행 중'}
                            </div>
                          </div>
                        </div>
                        <div className="relative mt-3">
                          <div className="h-2.5 overflow-hidden rounded-full bg-white/18">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,#bfdbfe,#ffffff)] transition-all duration-500"
                              style={{ width: `${Math.max(competitionTimeline?.progress ?? 0, competitionTimeline?.isEnded ? 100 : 6)}%` }}
                            />
                          </div>
                          <div className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/45 bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.08)]" />
                        </div>
                        <div className="mt-3 flex flex-col gap-2 text-[12px] font-semibold text-white/82 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <span className="uppercase tracking-[0.14em] text-white/55">Start</span>{' '}
                            <span className="text-white">
                              {competitionTimeline ? competitionTimeline.startLabel : '-'}
                            </span>
                          </div>
                          <div className="min-w-0 sm:text-right">
                            <span className="uppercase tracking-[0.14em] text-white/55">Deadline</span>{' '}
                            <span className="text-white">
                              {competitionTimeline ? competitionTimeline.endLabel : '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {competitionError ? (
                      <div className="px-5 pb-5">
                        <div className="rounded-[16px] border border-[#f5c2c7] bg-[#fff5f5] px-4 py-3 text-[13px] font-semibold text-[#b42318]">
                          {competitionError}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {showAugmentationPanel ? (
                  <AugmentationPanel
                    selectedAugmentations={selectedAugmentations}
                    augmentationParams={augmentationParams}
                    onToggle={(augmentationId) =>
                      setSelectedAugmentations((current) =>
                        current.includes(augmentationId)
                          ? current.filter((id) => id !== augmentationId)
                          : [...current, augmentationId],
                      )
                    }
                    onChangeParam={(augmentationId, value) =>
                      setAugmentationParams((current) => ({
                        ...current,
                        [augmentationId]: value,
                      }))
                    }
                  />
                ) : null}
                <Canvas
                  selectedDataset={selectedDataset}
                  nodes={nodes}
                  draggingBlock={draggingBlock}
                  zoom={1}
                  minaHighlightNodeIndex={activeWorkspace === 'builder' ? minaCanvasHighlight?.blockIndex ?? null : null}
                  minaHighlightFieldLabel={activeWorkspace === 'builder' ? minaCanvasHighlight?.fieldLabel ?? null : null}
                  minaHighlightSuggestedValue={activeWorkspace === 'builder' ? minaCanvasHighlight?.suggestedValue ?? null : null}
                  minaHighlightReason={activeWorkspace === 'builder' ? minaCanvasHighlight?.reason ?? null : null}
                  tutorialTargetNodeType={
                    lessonCoachStep === 'cnn11-set-first-cnn-in' ||
                    lessonCoachStep === 'cnn11-set-first-cnn-out'
                      ? 'cnn'
                      : lessonCoachStep === 'cnn11-set-second-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-second-cnn-out' ||
                          lessonCoachStep === 'cnn11-set-third-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-third-cnn-out' ||
                          lessonCoachStep === 'cnn11-set-fourth-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-fourth-cnn-out' ||
                          lessonCoachStep === 'cnn12-set-third-cnn-in' ||
                          lessonCoachStep === 'cnn12-set-third-cnn-out'
                        ? 'cnn'
                        : lessonCoachStep === 'cnn11-set-head-linear-input' ||
                            lessonCoachStep === 'cnn11-set-head-linear-output' ||
                            lessonCoachStep === 'cnn11-set-output-linear-input' ||
                            lessonCoachStep === 'cnn11-set-output-linear-output' ||
                            lessonCoachStep === 'cnn11-set-output-linear-activation' ||
                            lessonCoachStep === 'cnn12-match-head-input'
                          ? 'linear'
                        : null
                  }
                  tutorialTargetNodeOccurrence={
                    lessonCoachStep === 'cnn11-set-first-cnn-in' ||
                    lessonCoachStep === 'cnn11-set-first-cnn-out'
                      ? 0
                      : lessonCoachStep === 'cnn11-set-second-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-second-cnn-out'
                        ? 1
                        : lessonCoachStep === 'cnn11-set-third-cnn-in' ||
                            lessonCoachStep === 'cnn11-set-third-cnn-out'
                          ? 2
                          : lessonCoachStep === 'cnn11-set-fourth-cnn-in' ||
                              lessonCoachStep === 'cnn11-set-fourth-cnn-out'
                            ? 3
                            : lessonCoachStep === 'cnn12-set-third-cnn-in' ||
                                lessonCoachStep === 'cnn12-set-third-cnn-out'
                              ? 4
                        : lessonCoachStep === 'cnn11-set-head-linear-input' ||
                            lessonCoachStep === 'cnn11-set-head-linear-output' ||
                            lessonCoachStep === 'cnn12-match-head-input'
                          ? 0
                          : lessonCoachStep === 'cnn11-set-output-linear-input' ||
                              lessonCoachStep === 'cnn11-set-output-linear-output' ||
                              lessonCoachStep === 'cnn11-set-output-linear-activation'
                            ? 1
                        : null
                  }
                  tutorialTargetFieldLabel={
                    (isMnistTutorialActive && tutorialStep === 'match-input-dimension') ||
                    (isMlp12TutorialActive && lessonCoachStep === 'mlp12-match-input')
                      ? 'Input'
                      : lessonCoachStep === 'cnn11-set-first-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-second-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-third-cnn-in' ||
                          lessonCoachStep === 'cnn11-set-fourth-cnn-in' ||
                          lessonCoachStep === 'cnn12-set-third-cnn-in'
                        ? 'Channel In'
                        : lessonCoachStep === 'cnn11-set-head-linear-input' ||
                            lessonCoachStep === 'cnn11-set-output-linear-input' ||
                            lessonCoachStep === 'cnn12-match-head-input'
                          ? 'Input'
                        : lessonCoachStep === 'cnn11-set-first-cnn-out' ||
                            lessonCoachStep === 'cnn11-set-second-cnn-out' ||
                            lessonCoachStep === 'cnn11-set-third-cnn-out' ||
                            lessonCoachStep === 'cnn11-set-fourth-cnn-out' ||
                            lessonCoachStep === 'cnn12-set-third-cnn-out'
                          ? 'Channel Out'
                        : isMnistTutorialActive && tutorialStep === 'edit-dimensions'
                          ? 'Output'
                        : lessonCoachStep === 'cnn11-set-head-linear-output' ||
                            lessonCoachStep === 'cnn11-set-output-linear-output'
                        ? 'Output'
                        : null
                  }
                  tutorialTargetFieldName={
                    (isMnistTutorialActive && tutorialStep === 'match-input-dimension') ||
                    (isMlp12TutorialActive && lessonCoachStep === 'mlp12-match-input')
                      ? 'tutorial-linear-input-field'
                      : lessonCoachStep === 'cnn11-set-first-cnn-in'
                        ? 'tutorial-cnn-channel-in-field'
                        : lessonCoachStep === 'cnn11-set-first-cnn-out'
                          ? 'tutorial-cnn-channel-out-field'
                        : lessonCoachStep === 'cnn11-set-second-cnn-in'
                            ? 'tutorial-cnn2-channel-in-field'
                            : lessonCoachStep === 'cnn11-set-second-cnn-out'
                              ? 'tutorial-cnn2-channel-out-field'
                              : lessonCoachStep === 'cnn11-set-third-cnn-in'
                                ? 'tutorial-cnn3-channel-in-field'
                                : lessonCoachStep === 'cnn11-set-third-cnn-out'
                                  ? 'tutorial-cnn3-channel-out-field'
                                  : lessonCoachStep === 'cnn11-set-fourth-cnn-in'
                                    ? 'tutorial-cnn4-channel-in-field'
                                    : lessonCoachStep === 'cnn11-set-fourth-cnn-out'
                                      ? 'tutorial-cnn4-channel-out-field'
                                      : lessonCoachStep === 'cnn12-set-third-cnn-in'
                                        ? 'tutorial-cnn5-channel-in-field'
                                        : lessonCoachStep === 'cnn12-set-third-cnn-out'
                                          ? 'tutorial-cnn5-channel-out-field'
                                          : lessonCoachStep === 'cnn11-set-head-linear-input' ||
                                              lessonCoachStep === 'cnn12-match-head-input'
                                ? 'tutorial-linear-input-field'
                                : lessonCoachStep === 'cnn11-set-head-linear-output'
                                  ? 'tutorial-linear-output-field'
                                  : lessonCoachStep === 'cnn11-set-output-linear-input'
                                    ? 'tutorial-linear-input-field'
                                    : lessonCoachStep === 'cnn11-set-output-linear-output'
                                      ? 'tutorial-linear-output-field'
                      : isMnistTutorialActive && tutorialStep === 'edit-dimensions'
                        ? 'tutorial-linear-output-field'
                        : null
                  }
                  tutorialSecondaryTargetFieldLabel={
                    isMlp12TutorialActive && lessonCoachStep === 'mlp12-match-input'
                      ? 'Output'
                      : null
                  }
                  tutorialSecondaryTargetFieldName={
                    isMlp12TutorialActive && lessonCoachStep === 'mlp12-match-input'
                      ? 'tutorial-linear-output-field'
                      : null
                  }
                  tutorialTargetActivationName={
                    isMnistTutorialActive && tutorialStep === 'set-activation'
                      ? 'tutorial-linear-activation-field'
                      : lessonCoachStep === 'cnn11-set-output-linear-activation'
                        ? 'tutorial-linear-activation-field'
                      : null
                  }
                  onRemoveNode={handleRemoveNode}
                  isNodeRemovable={() => true}
                  onUpdateNodeField={handleUpdateNodeField}
                  onUpdateNodeActivation={handleUpdateNodeActivation}
                  onMoveNode={handleMoveNode}
                  onDropBlock={(type, index) => {
                    clearMinaCanvasHighlight();
                    if (activeWorkspace === 'tutorial' && !teachingConfig.allowedBlocks.includes(type)) {
                      setDraggingBlock(null);
                      return;
                    }
                    blockDropCompletedRef.current = true;
                    let nextInsertionIndex = index;
                    if (isMlp12TutorialActive && type === 'linear' && linearNodeCount >= 1) {
                      nextInsertionIndex = Math.max(0, linearNodeCount - 1);
                    }
                    if (isCnn12TutorialActive && type === 'cnn' && cnnNodeCount >= 4) {
                      const firstLinearIndex = nodes.findIndex((node) => node.type === 'linear');
                      nextInsertionIndex = firstLinearIndex >= 0 ? firstLinearIndex : nodes.length;
                    }
                    handleDropBlock(type, nextInsertionIndex);
                    setDraggingBlock(null);
                  }}
                  reserveBottomActionSpace={isBottomActionVisible}
                />
                {activeWorkspace !== 'competition' ? (
                  <TrainingLiveOverlay
                    dataset={selectedDataset}
                    nodes={nodes}
                    trainingStatus={trainingStatus ?? (latestTrainingResult as TrainingJobStatus | null)}
                    isAvailable={
                      hasLiveTrainingVisualization &&
                      (isTraining ||
                        currentJobId !== null ||
                        trainingStatus !== null ||
                        latestTrainingResult !== null)
                    }
                    isOpen={isTrainingOverlayOpen}
                    onClose={() => setIsTrainingOverlayOpen(false)}
                    onOpen={() => setIsTrainingOverlayOpen(true)}
                  />
                ) : null}
              </div>
              {competitionActive && competitionRoom ? (
                <div className="min-w-0">
                  <CompetitionSidebar
                    room={competitionRoom}
                    trainingStatus={trainingStatus ?? (latestTrainingResult as TrainingJobStatus | null)}
                    liveHistory={liveHistory}
                    runs={competitionRuns}
                    selectedRunJobId={selectedCompetitionRunJobId}
                    submitBusy={competitionSubmitBusy}
                    onSelectRun={setSelectedCompetitionRunJobId}
                    onSubmitRun={(jobId) => void handleSubmitCompetitionRun(jobId)}
                  />
                </div>
              ) : !isMnistTutorialActive || tutorialStep !== 'story-intro' || showTutorialMetricsSidebar ? (
                <Inspector
                  trainingStatus={trainingStatus ?? (latestTrainingResult as TrainingJobStatus | null)}
                  selectedDataset={selectedDataset}
                  liveHistory={liveHistory}
                  showMnistCanvas={activeWorkspace !== 'competition' && activeWorkspace !== 'tutorial'}
                  onDigitPredictionComplete={() => setTutorialPredictionDone(true)}
                  metricModeOverride={inspectorMetricMode}
                  onMetricModeChange={setInspectorMetricMode}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {isBottomActionVisible ? (
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '12px',
            zIndex: 9999,
            width: 'min(1420px, calc(100vw - 24px))',
            transform: 'translateX(-50%)',
          }}
        >
          <div
            className="pointer-events-none"
            style={{
              position: 'absolute',
              insetInline: 0,
              bottom: '-12px',
              height: '96px',
              background:
                'linear-gradient(180deg, rgba(244,247,251,0), rgba(244,247,251,0.94) 44%, rgba(244,247,251,1))',
            }}
          />
          <div className="pointer-events-auto relative rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(251,253,255,0.97),rgba(239,245,255,0.94))] px-3 py-2.5 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.95fr)_minmax(400px,0.95fr)]">
              <div className="rounded-[24px] border border-[#d7e2f2] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,248,255,0.88))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_24px_rgba(15,23,42,0.05)]">
                <div className="grid items-stretch gap-2.5 lg:grid-cols-[0.95fr_1.05fr_1.05fr_0.56fr]">
                  <div
                    className="h-[72px] rounded-[18px] border border-white/80 bg-white/96 px-4 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                    data-tutorial-target="tutorial-optimizer-control"
                  >
                    <div className="ui-section-title">Optimizer</div>
                    <div className="relative mt-1.5">
                      <select value={optimizer} onChange={(event) => {
                        const value = event.target.value as OptimizerName;
                        const config = optimizerConfigs[value];
                        setOptimizer(value);
                        setLearningRate(config.defaultLearningRate);
                        if (config.parameter) {
                          const parameter = config.parameter;
                          setOptimizerParams((current) => ({ ...current, [parameter.key]: parameter.defaultValue }));
                        }
                      }} className="h-9 w-full appearance-none rounded-[13px] border border-[#d5deeb] bg-[#f8fbff] px-3 pr-9 font-display text-[15px] font-bold text-[#153ea8] outline-none transition-colors focus:border-primary">
                        {optimizerOrder.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <Icon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
                    </div>
                  </div>
                  <div
                    className="h-[72px] rounded-[18px] border border-white/80 bg-white/96 px-4 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                    data-tutorial-target="tutorial-learning-rate-control"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="ui-section-title">Learning Rate</div>
                      <code className="block min-w-[78px] text-right font-display text-[13px] font-bold tabular-nums text-[#153ea8]">{learningRate}</code>
                    </div>
                    <div className="mt-2.5">
                      <input type="range" min={0} max={learningRates.length - 1} step={1} value={learningRateIndex} onChange={(event) => setLearningRate(learningRates[Number(event.target.value)] ?? learningRates[0])} className="h-1.5 w-full accent-primary" />
                    </div>
                  </div>
                  <div
                    className="h-[72px] rounded-[18px] border border-white/80 bg-white/96 px-4 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                    data-tutorial-target="tutorial-batch-size-control"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="ui-section-title">Batch Size</div>
                      <code className="block min-w-[56px] text-right font-display text-[13px] font-bold tabular-nums text-[#153ea8]">{batchSize}</code>
                    </div>
                    <div className="mt-2.5">
                      <input type="range" min={0} max={batchSizeOptions.length - 1} step={1} value={batchSizeIndex} onChange={(event) => setBatchSize(batchSizeOptions[Number(event.target.value)] ?? batchSizeOptions[0])} className="h-1.5 w-full accent-primary" />
                    </div>
                  </div>
                  <div
                    className="h-[72px] rounded-[18px] border border-white/80 bg-white/96 px-4 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]"
                    data-tutorial-target="tutorial-epochs-control"
                  >
                    <div className="ui-section-title">Epochs</div>
                    <input type="number" min={1} max={500} value={epochs} onChange={(event) => setEpochs(event.target.value)} className="mt-1.5 h-9 w-full rounded-[13px] border border-[#d5deeb] bg-[#f8fbff] px-3 font-display text-[15px] font-bold text-[#153ea8] outline-none transition-colors focus:border-primary" />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-[#d7e2f2] bg-[linear-gradient(180deg,rgba(238,244,255,0.92),rgba(229,238,255,0.88))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_10px_24px_rgba(15,23,42,0.05)]">
                <div className="grid items-stretch gap-2.5 lg:grid-cols-[1.18fr_1fr_1fr]">
                  <button type="button" onClick={isTrainButtonRunning ? handleTrainingStop : handleTrainingStart} data-tutorial-target="tutorial-start-button" className={['flex h-[72px] min-w-0 items-center gap-3 rounded-[20px] px-4 text-left transition-all', isTrainButtonRunning ? 'bg-[linear-gradient(135deg,#ff7a59,#f97316)] text-white shadow-[0_16px_36px_rgba(249,115,22,0.28)]' : 'bg-[linear-gradient(135deg,#1151ff,#2f6cff)] text-white shadow-[0_16px_36px_rgba(17,81,255,0.24)]'].join(' ')}>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white/16"><Icon name={isTrainButtonRunning ? 'stop' : 'play'} className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-display text-[16px] font-bold leading-none">{isTrainButtonRunning ? 'Running' : 'Start'}</span>
                      <span className="mt-1 block text-[12px] font-semibold leading-none text-white/80">{isTrainButtonRunning ? 'Stop training' : 'Run training'}</span>
                    </span>
                  </button>
                  <button type="button" onClick={handlePreviewOpen} className="flex h-[72px] min-w-0 items-center gap-3 rounded-[20px] border border-white/80 bg-white/96 px-4 text-left text-primary shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:bg-[#f8fbff]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#edf3ff]"><Icon name="architecture" className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-display text-[15px] font-bold leading-none">Preview</span>
                      <span className="mt-1 block text-[12px] font-semibold leading-none text-[#6d7f99]">Model code</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const initialCoachStep = getInitialLessonCoachStep(selectedTutorialLessonId);
                      if (activeWorkspace === 'tutorial' && initialCoachStep) {
                        replaceNodes(getTutorialLessonPresetNodes(selectedTutorialLessonId));
                        applyLessonTrainingDefaults(selectedTutorialLessonId);
                        if (selectedTutorialLessonId === 'cnn-1-3') {
                          setSelectedAugmentations([]);
                          setAugmentationParams(defaultAugmentationParams);
                        }
                        lastDismissedLessonCoachStepRef.current = initialCoachStep;
                        setLessonCoachStep(initialCoachStep);
                        clearTrainingUiState();
                        return;
                      }
                      resetBoard();
                    }}
                    className="flex h-[72px] min-w-0 items-center gap-3 rounded-[20px] border border-white/80 bg-white/82 px-4 text-left text-[#28405f] shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:bg-white"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-white"><Icon name="reset" className="h-5 w-5" /></span>
                    <span className="min-w-0">
                      <span className="block font-display text-[15px] font-bold leading-none">Reset</span>
                      <span className="mt-1 block text-[12px] font-semibold leading-none text-[#61758f]">Clear board</span>
                    </span>
                  </button>
                </div>
                {optimizerField && optimizer !== 'SGD' ? (
                  <div className="mt-2.5 rounded-[20px] border border-white/80 bg-white/96 px-4 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
                    <div className="ui-section-title">{optimizerField.label}</div>
                    <div className="mt-2.5 flex items-center gap-3">
                      <input type="range" min={0} max={optimizerField.values.length - 1} step={1} value={optimizerParamIndex} onChange={(event) => setOptimizerParams((current) => ({ ...current, [optimizerField.key]: optimizerField.values[Number(event.target.value)] ?? optimizerField.values[0] }))} className="h-1 w-full accent-primary" />
                      <code className="block min-w-[78px] text-right font-display text-[13px] font-bold tabular-nums text-[#153ea8]">{optimizerParams[optimizerField.key]}</code>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowLabMina && !isMinaChatOpen ? (
        <button
          type="button"
          onClick={() => setIsMinaChatOpen(true)}
          className="ui-electric-cyan-border fixed bottom-[156px] right-[28px] z-[92] flex items-center gap-3 rounded-[20px] px-3.5 py-3 text-left shadow-[0_18px_36px_rgba(15,23,42,0.12)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:shadow-[0_22px_42px_rgba(17,81,255,0.14)]"
          aria-label="Mina chat 열기"
        >
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[18px] border border-white/80 bg-[linear-gradient(180deg,#eef4ff,#e4ecff)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
            <Image
              src="/images/mnist-quest-mina-focused.svg"
              alt="Mina"
              fill
              sizes="56px"
              className="object-contain p-1.5"
            />
          </div>
          <div className="min-w-0 pr-1">
            <div className="font-display text-[15px] font-bold tracking-[-0.03em] text-[#10213b]">
              Mina에게 물어보기
            </div>
            <div className="mt-1 text-[11px] font-semibold text-[#6d7f99]">
              막히면 바로 도움을 열 수 있어요
            </div>
          </div>
          <div className="ui-lime-action grid h-9 w-9 shrink-0 place-items-center rounded-[14px]">
            <Icon name="help" className="h-4.5 w-4.5" />
          </div>
        </button>
      ) : null}

      {shouldShowLabMina ? (
        <MinaBubbleChat
          open={isMinaChatOpen}
          busy={minaBusy}
          messages={minaMessages}
          onClose={() => setIsMinaChatOpen(false)}
          onSend={handleMinaSend}
        />
      ) : null}

      {isGuidedLessonActive && lessonCoachStep && activeLessonCoachStep ? (
        <TutorialCoachOverlay
          open
          stepKey={lessonCoachStep}
          stepIndex={0}
          totalSteps={1}
          title={activeLessonCoachStep.title}
          description={activeLessonCoachStep.description}
          targetName={activeLessonCoachStep.targetName}
          targetNames={
            lessonCoachStep === 'mlp12-match-input'
              ? ['tutorial-linear-output-field', 'tutorial-linear-input-field']
              : undefined
          }
          backdropMode={lessonCoachStep === 'cnn11-stack-linear' ? 'none' : 'spotlight'}
          cardPlacement={lessonCoachStep === 'cnn11-stack-linear' ? 'top-right' : 'auto'}
          canAdvance={activeLessonCoachStep.canAdvance}
          advanceLabel={
            'advanceLabel' in activeLessonCoachStep ? activeLessonCoachStep.advanceLabel : undefined
          }
          onAdvance={() => {
            if (lessonCoachStep === 'mlp12-match-input') {
              if (!isMlp12OutputInputReady) {
                return;
              }
              lastDismissedLessonCoachStepRef.current = 'mlp12-retrain';
              setLessonCoachStep('mlp12-retrain');
              return;
            }
            if (lessonCoachStep === 'cnn12-match-head-input') {
              if (cnnHeadInputValue !== '6272') {
                return;
              }
              lastDismissedLessonCoachStepRef.current = 'cnn12-retrain';
              setLessonCoachStep('cnn12-retrain');
              return;
            }
            if (lessonCoachStep === 'cnn13-tune-mixup') {
              lastDismissedLessonCoachStepRef.current = 'cnn13-select-cutmix';
              setLessonCoachStep('cnn13-select-cutmix');
              return;
            }
            if (lessonCoachStep === 'cnn11-linear-limit') {
              clearTrainingUiState();
              resetBoard();
              setTutorialPredictionDone(false);
              setIsMnistMissionMinimized(false);
              lastDismissedLessonCoachStepRef.current = 'cnn11-upgrade-cnn';
              setLessonCoachStep('cnn11-upgrade-cnn');
              return;
            }
            if (lessonCoachStep === 'cnn11-add-second-pool') {
              lastDismissedLessonCoachStepRef.current = 'cnn11-place-second-pool';
              setLessonCoachStep('cnn11-place-second-pool');
              return;
            }
            if (lessonCoachStep === 'cnn11-success') {
              setLessonCoachStep(null);
              setTutorialStep('play-mission');
              setIsMnistMissionMinimized(false);
              return;
            }
            if (lessonCoachStep === 'cnn13-success') {
              setLessonCoachStep(null);
              setTutorialStep('play-mission');
              setIsMnistMissionMinimized(false);
              return;
            }
            if (lessonCoachStep === 'cnn12-success') {
              setLessonCoachStep(null);
              setTutorialStep('play-mission');
              setIsMnistMissionMinimized(false);
              return;
            }
            lastDismissedLessonCoachStepRef.current = lessonCoachStep;
            setLessonCoachStep(null);
          }}
          onSkip={() => {
            lastDismissedLessonCoachStepRef.current = lessonCoachStep;
            setLessonCoachStep(null);
          }}
        />
      ) : null}

      {(isMlp12TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && !lessonCoachStep ? (
        <button
          type="button"
          onClick={reopenLessonGuide}
          className="fixed bottom-28 right-5 z-[84] rounded-full border border-[#cfe0ff] bg-white/94 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary shadow-[0_14px_28px_rgba(17,81,255,0.12)] backdrop-blur transition hover:bg-white"
        >
          Open Guide
        </button>
      ) : null}

      {isPreviewOpen ? (
        <ModelPreviewModal
          dataset={selectedDataset}
          nodes={nodes}
          optimizer={optimizer}
          learningRate={learningRate}
          epochs={epochs}
          optimizerParams={optimizerParams}
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}

      {competitionActive && competitionRoom && isCompetitionRankOpen ? (
        <CompetitionRankModal
          roomTitle={competitionRoom.title}
          leaderboard={competitionLeaderboard}
          isHost={competitionRoom.participantRole === 'host'}
          onClose={() => setIsCompetitionRankOpen(false)}
        />
      ) : null}

      {isHomeGuideOpen ? (
        <TutorialCoachOverlay
          open={isHomeGuideOpen}
          stepKey="home-intro"
          stepIndex={0}
          totalSteps={1}
          title="VisAible에 온 걸 환영해요"
          description="처음 접속한 사용자를 위해 한 번만 보여드리는 안내예요. 왼쪽 Workspace에서 Tutorial을 고르면 데이터셋별 스토리형 미션을 시작할 수 있습니다."
          canAdvance
          advanceLabel="둘러보기"
          onAdvance={closeHomeGuide}
          onSkip={closeHomeGuide}
        />
      ) : null}

      {isMnistTutorialActive &&
      tutorialGuideOpen &&
      (tutorialStep === 'build-model' ||
        tutorialStep === 'stack-block' ||
        tutorialStep === 'match-input-dimension' ||
        tutorialStep === 'edit-dimensions' ||
        tutorialStep === 'set-activation' ||
        tutorialStep === 'choose-optimizer' ||
        tutorialStep === 'set-learning-rate' ||
        tutorialStep === 'set-batch-size' ||
        tutorialStep === 'set-epochs' ||
        tutorialStep === 'train-model' ||
        tutorialStep === 'training-metrics-loss' ||
        tutorialStep === 'training-metrics-accuracy') ? (
        <TutorialCoachOverlay
          open={tutorialGuideOpen}
          stepKey={tutorialStep}
          stepIndex={tutorialSequence.indexOf(tutorialStep)}
          totalSteps={tutorialSequence.length}
          title={activeTutorialOverlayStep.title}
          description={activeTutorialOverlayStep.description}
          targetName={activeTutorialOverlayStep.targetName}
          canAdvance={
            tutorialStep === 'training-metrics-accuracy'
              ? true
              : activeTutorialOverlayStep.canAdvance
          }
          advanceLabel={
            tutorialStep === 'training-metrics-accuracy'
              ? showTutorialMnistMission
                ? '미션 완수하러 가기'
                : '학습 끝나면 계속'
              : 'advanceLabel' in activeTutorialOverlayStep
                ? activeTutorialOverlayStep.advanceLabel
                : undefined
          }
          onAdvance={() => {
            if (tutorialStep === 'match-input-dimension') {
              if (!isMnistTutorialInputReady) {
                return;
              }
              setTutorialStep('edit-dimensions');
              return;
            }
            if (tutorialStep === 'choose-optimizer') {
              setTutorialStep('set-learning-rate');
              return;
            }
            if (tutorialStep === 'set-learning-rate') {
              setTutorialStep('set-batch-size');
              return;
            }
            if (tutorialStep === 'set-batch-size') {
              setTutorialStep('set-epochs');
              return;
            }
            if (tutorialStep === 'set-epochs') {
              setTutorialStep('train-model');
              return;
            }
            if (tutorialStep === 'training-metrics-loss') {
              setInspectorMetricMode('accuracy');
              setTutorialStep('training-metrics-accuracy');
              return;
            }
            if (tutorialStep === 'training-metrics-accuracy' && showTutorialMnistMission) {
              setTutorialStep('play-mission');
              return;
            }
          }}
          onSkip={() => {
            lastDismissedTutorialStepRef.current = tutorialStep;
            setTutorialGuideOpen(false);
          }}
        />
      ) : null}

      {isMnistTutorialActive &&
      !tutorialGuideOpen &&
      isMnistGuideStep ? (
        <button
          type="button"
          onClick={reopenMnistGuide}
          className="fixed bottom-28 right-5 z-[84] rounded-full border border-[#cfe0ff] bg-white/94 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary shadow-[0_14px_28px_rgba(17,81,255,0.12)] backdrop-blur transition hover:bg-white"
        >
          Open Guide
        </button>
      ) : null}

      {isStoryTutorialActive &&
      mnistQuestPhase &&
      !(mnistQuestPhase !== 'intro' && isMnistMissionMinimized) ? (
        <MnistElevatorMission
          variant={isCnn13TutorialActive ? 'album' : isCnn11TutorialActive || isCnn12TutorialActive ? 'laundry' : 'elevator'}
          dataset={selectedDataset}
          phase={mnistQuestPhase}
          trainingStatus={trainingStatus ?? (latestTrainingResult as TrainingJobStatus | null)}
          challengeSamplesOverride={null}
          isMissionComplete={tutorialPredictionDone}
          onMissionComplete={() => {
            setTutorialPredictionDone(true);
            setCnn11MissionRetryPending(false);
          }}
          onMissionFail={(summary) => {
            if (!isCnn11TutorialActive && !isCnn12TutorialActive && !isCnn13TutorialActive) {
              return;
            }
            setCnn11MissionRetryPending(isCnn11TutorialActive);
            const retryStep = isCnn13TutorialActive
              ? 'cnn13-select-mixup'
              : isCnn12TutorialActive
                ? resolveCurrentCnn12GuideStep()
                : 'cnn11-linear-limit';
            lastDismissedLessonCoachStepRef.current = retryStep;
            setTutorialStep('build-model');
            setLessonCoachStep(retryStep);
            setIsMnistMissionMinimized(false);
          }}
          onMinimize={() => setIsMnistMissionMinimized(true)}
          onExitQuest={exitMnistQuest}
          onStartQuest={() => {
            setTutorialGuideOpen(isMnistTutorialActive);
            setTutorialStep('build-model');
            setIsMnistMissionMinimized(false);
            if (isCnn11TutorialActive) {
              lastDismissedLessonCoachStepRef.current = 'cnn11-stack-linear';
              setLessonCoachStep('cnn11-stack-linear');
            }
            if (isCnn12TutorialActive) {
              lastDismissedLessonCoachStepRef.current = 'cnn11-upgrade-cnn';
              setLessonCoachStep('cnn11-upgrade-cnn');
            }
            if (isCnn13TutorialActive) {
              lastDismissedLessonCoachStepRef.current = 'cnn11-upgrade-cnn';
              setLessonCoachStep('cnn11-upgrade-cnn');
            }
          }}
        />
      ) : null}

      {isStoryTutorialActive &&
      (mnistQuestPhase ||
        ((isCnn11TutorialActive || isCnn12TutorialActive || isCnn13TutorialActive) && tutorialStep === 'build-model')) &&
      tutorialStep !== 'complete' ? (
        <button
          type="button"
          onClick={openStoryQuest}
          className="fixed bottom-52 right-24 z-[84] rounded-full border border-[#cfe0ff] bg-white/92 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary shadow-[0_14px_28px_rgba(17,81,255,0.12)] backdrop-blur transition hover:bg-white"
        >
          Quest
        </button>
      ) : null}

      {shouldShowMnistQuestOrb ? (
        <button
          type="button"
          onClick={openStoryQuest}
          className="animate-quest-orb fixed bottom-52 right-5 z-[85] grid h-[74px] w-[74px] place-items-center rounded-full border-4 border-white/24 bg-[radial-gradient(circle_at_35%_30%,#60a5fa,#2563eb_58%,#172554_100%)] text-[32px] font-black text-white shadow-[0_26px_60px_rgba(37,99,235,0.44)] transition hover:scale-105 hover:brightness-105"
          aria-label="미션 창 다시 열기"
        >
          <span className="relative text-[28px] leading-none">
            !
            <span className="absolute -right-2.5 -top-2 rounded-full bg-[#ef4444] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-[0_8px_16px_rgba(239,68,68,0.3)]">
              quest
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
