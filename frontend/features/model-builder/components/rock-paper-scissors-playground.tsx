'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/features/model-builder/components/icons';
import Script from 'next/script';
import Image from 'next/image';

// MediaPipe types (simplified)
type HandLandmark = { x: number; y: number; z: number };
type HandsResults = {
  multiHandLandmarks: HandLandmark[][];
};

type RockPaperScissorsPlaygroundProps = {
  onGoToCnnDocs?: () => void;
};

export function RockPaperScissorsPlayground({ onGoToCnnDocs }: RockPaperScissorsPlaygroundProps) {
  const [gameState, setGameState] = useState<'idle' | 'countdown' | 'result'>('idle');
  const [countdown, setCountdown] = useState<number>(3);
  const [userChoice, setUserChoice] = useState<'rock' | 'paper' | 'scissors' | null>(null);
  const [aiChoice, setAiChoice] = useState<'rock' | 'paper' | 'scissors' | null>(null);
  const [result, setResult] = useState<'win' | 'lose' | 'draw' | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [detectedGesture, setDetectedGesture] = useState<'rock' | 'paper' | 'scissors' | 'none'>('none');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);

  // Initialize MediaPipe Hands
  const onResults = (results: HandsResults) => {
    if (!canvasRef.current || !videoRef.current) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // We don't necessarily need to draw the video here if it's already visible as a video element
    // but drawing landmarks is helpful for feedback.
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      // Draw landmarks
      // (Using simple dots since we don't have drawing_utils easily)
      canvasCtx.fillStyle = '#1151ff';
      landmarks.forEach(point => {
        canvasCtx.beginPath();
        canvasCtx.arc(point.x * canvasRef.current!.width, point.y * canvasRef.current!.height, 4, 0, 2 * Math.PI);
        canvasCtx.fill();
      });

      // Helper to calculate Euclidean distance
      const getDist = (p1: HandLandmark, p2: HandLandmark) => {
        return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
      };

      const palm = landmarks[0];
      
      // Calculate distances from palm to tips and joints
      const dists = {
        index: { tip: getDist(landmarks[8], palm), pip: getDist(landmarks[6], palm) },
        middle: { tip: getDist(landmarks[12], palm), pip: getDist(landmarks[10], palm) },
        ring: { tip: getDist(landmarks[16], palm), pip: getDist(landmarks[14], palm) },
        pinky: { tip: getDist(landmarks[20], palm), pip: getDist(landmarks[18], palm) },
        thumb: { tip: getDist(landmarks[4], palm), mcp: getDist(landmarks[2], palm) },
      };

      // A finger is extended if the tip is significantly further from the palm than the joint
      const isIndexExtended = dists.index.tip > dists.index.pip * 1.1;
      const isMiddleExtended = dists.middle.tip > dists.middle.pip * 1.1;
      const isRingExtended = dists.ring.tip > dists.ring.pip * 1.1;
      const isPinkyExtended = dists.pinky.tip > dists.pinky.pip * 1.1;
      // Thumb is a bit different, but distance works okay for simple RPS
      const isThumbExtended = dists.thumb.tip > dists.thumb.mcp * 1.1;

      // Logic for RPS (Count-based for more robustness)
      const extendedCount = [isIndexExtended, isMiddleExtended, isRingExtended, isPinkyExtended].filter(Boolean).length;

      // Paper: 4 fingers extended
      if (extendedCount >= 4) {
        setDetectedGesture('paper');
      } 
      // Scissors: Index and Middle extended, and at least the Ring finger is folded
      else if (isIndexExtended && isMiddleExtended && !isRingExtended) {
        setDetectedGesture('scissors');
      } 
      // Rock: 0 or 1 finger extended (allows for a loose thumb or one slightly jittery finger)
      else if (extendedCount <= 1) {
        setDetectedGesture('rock');
      } else {
        setDetectedGesture('none');
      }
    } else {
      setDetectedGesture('none');
    }
    canvasCtx.restore();
  };

  const startCamera = async () => {
    if (typeof window === 'undefined') return;
    
    // @ts-ignore
    if (!window.Hands || !window.Camera) {
      console.error('MediaPipe not loaded');
      return;
    }

    try {
      if (!handsRef.current) {
        // @ts-ignore
        handsRef.current = new window.Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        handsRef.current.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        handsRef.current.onResults(onResults);
      }

      if (!cameraRef.current && videoRef.current) {
        // @ts-ignore
        cameraRef.current = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480
        });
      }

      await cameraRef.current?.start();
      setIsCameraReady(true);
    } catch (err) {
      console.error('Camera access failed:', err);
    }
  };

  const startGame = () => {
    setGameState('countdown');
    setCountdown(3);
    setUserChoice(null);
    setAiChoice(null);
    setResult(null);
  };

  useEffect(() => {
    if (gameState === 'countdown') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        return () => clearTimeout(timer);
      } else {
        // Time is up! Capture choice
        const userMove = detectedGesture === 'none' ? 'rock' : detectedGesture as 'rock' | 'paper' | 'scissors';
        const aiMove = (['rock', 'paper', 'scissors'] as const)[Math.floor(Math.random() * 3)];
        
        setUserChoice(userMove);
        setAiChoice(aiMove);
        
        // Determine result
        if (userMove === aiMove) {
          setResult('draw');
        } else if (
          (userMove === 'rock' && aiMove === 'scissors') ||
          (userMove === 'paper' && aiMove === 'rock') ||
          (userMove === 'scissors' && aiMove === 'paper')
        ) {
          setResult('win');
        } else {
          setResult('lose');
        }
        
        setGameState('result');
      }
    }
  }, [gameState, countdown, detectedGesture]);

  const detectedLabel =
    detectedGesture === 'rock' ? '바위' :
    detectedGesture === 'paper' ? '보' :
    detectedGesture === 'scissors' ? '가위' : '준비 중';
  const choiceLabel = (choice: 'rock' | 'paper' | 'scissors' | null) =>
    choice === 'rock' ? '바위' : choice === 'paper' ? '보' : choice === 'scissors' ? '가위' : '?';
  const choiceEmoji = (choice: 'rock' | 'paper' | 'scissors' | null) =>
    choice === 'rock' ? '✊' : choice === 'paper' ? '✋' : choice === 'scissors' ? '✌️' : '?';
  const actionLabel =
    !isCameraReady
      ? '카메라 연결하기'
      : '게임 시작';
  const resultTone =
    result === 'win'
      ? 'border-[#a7f3d0] bg-[#e8faf4] text-[#059669]'
      : result === 'lose'
        ? 'border-[#fecaca] bg-[#fff1f2] text-[#dc2626]'
        : 'border-[#d9e2ef] bg-[#f3f6fb] text-[#475569]';
  const resultTitle =
    result === 'win' ? '🎉 당신의 승리!' : result === 'lose' ? '😢 미나의 승리!' : '🤝 비겼습니다!';

  return (
    <div className="grid h-[calc(100vh-132px)] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
        strategy="afterInteractive"
      />

      <div className="ui-subtle-surface px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="ui-section-title">Playground</div>
            <div className="mt-1 font-display text-[24px] font-bold tracking-[-0.04em] text-[#10213b]">
              Mina랑 가위바위보
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="rounded-full border border-[#dbe5f1] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#60718a]">
              {isCameraReady ? '카메라 연결됨' : '카메라 필요'}
            </div>
            {gameState === 'countdown' ? (
              <div className="rounded-full bg-[#eef4ff] px-4 py-2 text-[12px] font-bold text-primary">
                {countdown}초 후 판정
              </div>
            ) : gameState !== 'result' ? (
              <button
                onClick={!isCameraReady ? startCamera : startGame}
                className="rounded-[18px] bg-primary px-5 py-3 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(17,81,255,0.2)] transition hover:scale-[1.02] active:scale-[0.98]"
              >
                {actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid min-h-0 gap-3 xl:grid-cols-[minmax(0,1.28fr)_minmax(300px,0.72fr)]">
        {/* User Camera Section */}
        <div className="ui-surface relative flex min-h-0 items-center justify-center overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover mirror"
            autoPlay
            playsInline
            muted
            style={{ transform: 'scaleX(-1)' }}
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={480}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
          
          {gameState === 'countdown' && (
            <div className="relative z-10 text-center">
              <div className="text-[96px] font-black text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] animate-ping">
                {countdown === 0 ? 'GO!' : countdown}
              </div>
            </div>
          )}

          {!isCameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-900/80 text-white">
              <Icon name="rocket" className="h-10 w-10 text-primary" />
              <div className="text-[14px] font-semibold text-white/72">카메라 권한을 허용하면 바로 시작할 수 있습니다.</div>
            </div>
          )}

          <div className="absolute left-5 top-5 rounded-full bg-black/44 px-3.5 py-2 text-[12px] font-bold text-white backdrop-blur-md">
            내 화면
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2.5">
            <div className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-[13px] font-bold text-white backdrop-blur-md">
              인식된 손모양 <span className="ml-1 text-primary">{detectedLabel}</span>
            </div>
            <div className="rounded-full bg-white/20 px-4 py-2 text-[12px] font-extrabold text-white backdrop-blur-md">
              {gameState === 'countdown' ? '손 모양 유지' : 'PLAYER'}
            </div>
          </div>
        </div>

        {/* Mina Choice Section */}
        <div className="grid min-h-0 grid-rows-[minmax(0,0.92fr)_auto] gap-3">
          <div className="ui-surface flex min-h-0 flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#f8fbff,#ffffff)] px-5 py-5 text-center">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#70819a]">
              Mina의 선택
            </div>

            <div className="relative h-24 w-24 overflow-hidden rounded-[22px] border-4 border-white bg-[linear-gradient(180deg,#f0f7ff,#e0ebff)] shadow-[0_16px_34px_rgba(17,81,255,0.12)]">
              <Image
                src={
                  gameState === 'countdown' ? '/images/mnist-quest-mina-focused.svg' :
                  result === 'win' ? '/images/mnist-quest-mina-worried.svg' :
                  result === 'lose' ? '/images/mnist-quest-mina-happy.svg' :
                  '/images/mnist-quest-mina-focused.svg'
                }
                alt="Mina"
                fill
                className="object-contain p-3 transition-transform duration-500 scale-110"
              />
            </div>

            <div className={`text-[64px] leading-none transition-all duration-500 ${gameState === 'countdown' ? 'animate-bounce opacity-40 grayscale' : 'scale-105'}`}>
              {gameState === 'countdown' ? '?' : choiceEmoji(aiChoice)}
            </div>

            <div className="text-[12px] font-semibold text-[#60718a]">
              {gameState === 'countdown' ? '미나도 동시에 손을 고르는 중입니다.' : `현재 선택: ${choiceLabel(aiChoice)}`}
            </div>
          </div>

          <div className="ui-surface px-4 py-4">
            <div className="ui-section-title">{gameState === 'result' ? '대결 결과' : '한눈에 보기'}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1.5 text-[11px] font-bold text-[#60718a]">
                1. 카메라 연결
              </span>
              <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1.5 text-[11px] font-bold text-[#60718a]">
                2. 손 모양 유지
              </span>
              <span className="rounded-full border border-[#dbe5f1] bg-[#f8fbff] px-3 py-1.5 text-[11px] font-bold text-[#60718a]">
                3. 즉시 판정
              </span>
            </div>

            <div className="mt-3 min-h-[92px] rounded-[18px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#fbfdff,#f7faff)] px-4 py-3.5">
              {gameState === 'result' ? (
                <div className="grid gap-3">
                  <div className={`rounded-[16px] border px-4 py-3 text-[18px] font-black ${resultTone}`}>
                    {resultTitle}
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center gap-2.5">
                    <ResultChoiceCard label="나" emoji={choiceEmoji(userChoice)} choice={choiceLabel(userChoice)} accent="blue" />
                    <div className="grid h-11 w-11 place-items-center rounded-full border border-[#dbe5f1] bg-white text-[13px] font-black text-[#6b7f9a]">
                      VS
                    </div>
                    <ResultChoiceCard label="Mina" emoji={choiceEmoji(aiChoice)} choice={choiceLabel(aiChoice)} accent="amber" />
                  </div>

                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={startGame}
                      className="w-full rounded-[16px] bg-primary px-4 py-3 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(17,81,255,0.18)] transition hover:brightness-105"
                    >
                      한 판 더 하기
                    </button>
                    <button
                      type="button"
                      onClick={onGoToCnnDocs}
                      className="w-full rounded-[16px] border border-[#cfe0ff] bg-white px-4 py-3 text-[14px] font-bold text-primary transition hover:bg-[#f8fbff]"
                    >
                      CNN 배우러가기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-center">
                  <div className="text-[15px] font-bold text-[#10213b]">
                    {gameState === 'countdown' ? '카운트다운 중' : '대기 중'}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-6 text-[#60718a]">
                    {gameState === 'countdown'
                      ? '손을 바꾸지 말고 그대로 유지하면 3초 뒤 바로 결과가 나옵니다.'
                      : '시작 버튼을 누르면 Mina와 바로 한 판 대결할 수 있습니다.'}
                  </div>
                  <button
                    type="button"
                    onClick={onGoToCnnDocs}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-[16px] border border-[#cfe0ff] bg-white px-4 py-3 text-[14px] font-bold text-primary transition hover:bg-[#f8fbff]"
                  >
                    CNN 배우러가기
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultChoiceCard({
  label,
  emoji,
  choice,
  accent,
}: {
  label: string;
  emoji: string;
  choice: string;
  accent: 'blue' | 'amber';
}) {
  return (
    <div
      className={[
        'rounded-[16px] border px-3 py-3 text-center',
        accent === 'blue'
          ? 'border-[#cfe0ff] bg-[#f8fbff]'
          : 'border-[#f6dfb7] bg-[#fffaf2]',
      ].join(' ')}
    >
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#70819a]">{label}</div>
      <div className="mt-1.5 text-[34px] leading-none">{emoji}</div>
      <div className="mt-2 text-[13px] font-bold text-[#10213b]">{choice}</div>
    </div>
  );
}
