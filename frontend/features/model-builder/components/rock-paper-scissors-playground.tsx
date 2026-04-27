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

export function RockPaperScissorsPlayground() {
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

  const choices = [
    { id: 'rock', label: '바위', icon: '✊' },
    { id: 'scissors', label: '가위', icon: '✌️' },
    { id: 'paper', label: '보', icon: '✋' },
  ] as const;

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

  return (
    <div className="grid gap-6">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"
        strategy="afterInteractive"
      />

      <div className="ui-subtle-surface px-6 py-8 text-center">
        <div className="ui-section-title">Playground</div>
        <div className="mt-2 font-display text-[32px] font-bold tracking-[-0.04em] text-[#10213b]">
          Mina랑 가위바위보 (실시간 캠)
        </div>
        <p className="mx-auto mt-3 max-w-[600px] text-[15px] leading-7 text-[#54657f]">
          미나(Mina)와 가위바위보 대결을 펼쳐보세요! 카메라를 향해 손을 내밀면 3초 후 
          미나가 당신의 손 모양을 인식하여 승패를 겨룹니다.
        </p>
        
        {!isCameraReady ? (
          <button
            onClick={startCamera}
            className="mt-6 rounded-[20px] bg-primary px-8 py-4 text-[16px] font-bold text-white shadow-[0_12px_24px_rgba(17,81,255,0.2)] transition hover:scale-105 active:scale-95"
          >
            카메라 연결 및 게임 시작하기
          </button>
        ) : gameState === 'idle' || gameState === 'result' ? (
          <button
            onClick={startGame}
            className="mt-6 rounded-[20px] bg-primary px-10 py-4 text-[18px] font-bold text-white shadow-[0_12px_24px_rgba(17,81,255,0.2)] transition hover:scale-105 active:scale-95"
          >
            {gameState === 'result' ? '다시 시작하기' : '대결 시작!'}
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Camera Section */}
        <div className="ui-surface relative overflow-hidden bg-black flex items-center justify-center min-h-[400px]">
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
              <div className="text-[120px] font-black text-white drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] animate-ping">
                {countdown === 0 ? 'GO!' : countdown}
              </div>
            </div>
          )}

          {!isCameraReady && (
            <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white gap-4">
              <Icon name="rocket" className="h-12 w-12 text-primary" />
              <div className="text-[14px] font-semibold text-white/70">카메라 권한을 허용해주세요</div>
            </div>
          )}

          <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between pointer-events-none">
            <div className="rounded-full bg-black/40 backdrop-blur-md px-4 py-2 border border-white/20 text-[13px] font-bold text-white">
              인식된 모양: <span className="text-primary ml-1">{
                detectedGesture === 'rock' ? '바위' : 
                detectedGesture === 'paper' ? '보' : 
                detectedGesture === 'scissors' ? '가위' : '준비...'
              }</span>
            </div>
            <div className="rounded-full bg-white/20 backdrop-blur-md px-4 py-2 text-[12px] font-extrabold text-white uppercase tracking-widest">
              PLAYER
            </div>
          </div>
        </div>

        {/* Mina Choice Section */}
        <div className="ui-surface flex flex-col items-center justify-center gap-8 py-12 bg-[linear-gradient(135deg,#f8fbff,#ffffff)]">
          <div className="text-center w-full px-8">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#70819a]">
              Mina's Choice
            </div>
            
            <div className="mt-8 flex flex-col items-center gap-8">
              {/* Mina Portrait */}
              <div className="relative h-48 w-48 overflow-hidden rounded-[32px] border-4 border-white bg-[linear-gradient(180deg,#f0f7ff,#e0ebff)] shadow-[0_20px_40px_rgba(17,81,255,0.12)]">
                <Image
                  src={
                    gameState === 'countdown' ? '/images/mnist-quest-mina-focused.svg' :
                    result === 'win' ? '/images/mnist-quest-mina-worried.svg' : // Mina loses
                    result === 'lose' ? '/images/mnist-quest-mina-happy.svg' : // Mina wins
                    '/images/mnist-quest-mina-focused.svg'
                  }
                  alt="Mina"
                  fill
                  className="object-contain p-4 transition-transform duration-500 scale-110"
                />
              </div>

              <div className={`text-[100px] transition-all duration-500 ${gameState === 'countdown' ? 'animate-bounce opacity-40 grayscale' : 'scale-110'}`}>
                {gameState === 'countdown' ? '?' : (
                  aiChoice === 'rock' ? '✊' : 
                  aiChoice === 'paper' ? '✋' : 
                  aiChoice === 'scissors' ? '✌️' : '?'
                )}
              </div>
              
              {gameState === 'countdown' && (
                <div className="text-[14px] font-bold text-primary animate-pulse">
                  미나는 어떤걸 낼까요?
                </div>
              )}
            </div>
          </div>

          <div className="min-h-[80px] flex items-center justify-center">
            {gameState === 'result' && (
              <div className="flex flex-col items-center gap-4">
                {result === 'win' && (
                  <div className="rounded-[24px] bg-[#e8faf4] border border-[#a7f3d0] px-8 py-4 text-[24px] font-black text-[#059669] shadow-[0_12px_24px_rgba(16,185,129,0.15)] animate-bounce">
                    🎉 당신의 승리!
                  </div>
                )}
                {result === 'lose' && (
                  <div className="rounded-[24px] bg-[#fff1f2] border border-[#fecaca] px-8 py-4 text-[24px] font-black text-[#dc2626] shadow-[0_12px_24px_rgba(239,68,68,0.15)]">
                    😢 미나의 승리!
                  </div>
                )}
                {result === 'draw' && (
                  <div className="rounded-[24px] bg-[#f3f6fb] border border-[#d9e2ef] px-8 py-4 text-[24px] font-black text-[#475569] shadow-[0_12px_24px_rgba(71,85,105,0.1)]">
                    🤝 비겼습니다!
                  </div>
                )}
                <div className="text-[14px] font-semibold text-[#64748b]">
                  {userChoice === 'rock' ? '바위' : userChoice === 'scissors' ? '가위' : '보'} vs {aiChoice === 'rock' ? '바위' : aiChoice === 'scissors' ? '가위' : '보'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Instructions */}
      <div className="ui-surface p-6">
        <h3 className="text-[18px] font-bold text-[#10213b] flex items-center gap-2">
          <Icon name="help" className="h-5 w-5 text-primary" />
          게임 방법
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InstructionCard 
            step="1" 
            title="카메라 허용" 
            desc="웹캠 접근 권한을 허용하고 손을 화면에 비춰주세요." 
          />
          <InstructionCard 
            step="2" 
            title="3초 대기" 
            desc="시작 버튼을 누르면 3초의 카운트다운이 시작됩니다." 
          />
          <InstructionCard 
            step="3" 
            title="승부!" 
            desc="카운트다운이 끝날 때 손을 내밀면 AI가 인식하여 판정합니다." 
          />
        </div>
      </div>
    </div>
  );
}

function InstructionCard({ step, title, desc }: { step: string; title: string; desc: string }) {
  return (
    <div className="rounded-[18px] bg-[#f8fbff] p-4 border border-[#e2e8f0]">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-black text-white">
          {step}
        </span>
        <h4 className="text-[14px] font-bold text-[#10213b]">{title}</h4>
      </div>
      <p className="text-[12px] leading-5 text-[#64748b]">{desc}</p>
    </div>
  );
}
