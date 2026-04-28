'use client';

import { useEffect, useMemo, useState } from 'react';
import { getStockPrediction } from '@/lib/api/stocks';
import { stockPlaygroundPresets } from '@/lib/constants/stock-playground';
import type { StockPredictionPoint, StockPredictionResult, StockPreset } from '@/types/builder';

type StockPlaygroundProps = {
  selectedStock: StockPreset;
  onGoToDocs?: () => void;
};

const CHART_WIDTH = 960;
const CHART_HEIGHT = 440;
const CHART_PADDING = 28;

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '방금 계산';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function predictionTone(direction: StockPredictionResult['direction']) {
  if (direction === 'up') {
    return {
      badge: 'bg-[#e8faf4] text-[#0b7d6f]',
      accent: 'text-[#0b7d6f]',
      label: 'UP SIGNAL',
    };
  }
  if (direction === 'down') {
    return {
      badge: 'bg-[#fff1f1] text-[#b42318]',
      accent: 'text-[#b42318]',
      label: 'DOWN SIGNAL',
    };
  }
  return {
    badge: 'bg-[#eef4ff] text-primary',
    accent: 'text-primary',
    label: 'HOLD SIGNAL',
  };
}

export function StockPlayground({ selectedStock, onGoToDocs }: StockPlaygroundProps) {
  const [prediction, setPrediction] = useState<StockPredictionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setError(null);

    void getStockPrediction(selectedStock.ticker)
      .then((result) => {
        if (!cancelled) {
          setPrediction(result);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setPrediction(null);
          setError(nextError instanceof Error ? nextError.message : '주식 예측을 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStock.ticker]);

  const tone = prediction ? predictionTone(prediction.direction) : predictionTone('flat');
  const displayName = prediction?.companyName || selectedStock.label;
  const validationSignal = prediction?.signals.find((signal) => signal.label === '검증 방향성')?.value ?? '-';

  return (
    <section className="grid h-full min-h-[760px] items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="ui-surface flex h-full min-h-[760px] flex-col px-4 py-4">
        {isLoading ? (
          <LoadingPanel />
        ) : error ? (
          <ErrorPanel message={error} />
        ) : prediction ? (
          <div className="grid h-full gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-[32px] font-bold tracking-[-0.05em] text-[#10213b]">
                    {selectedStock.ticker}
                  </h3>
                  <div className="text-[17px] font-bold text-[#425777]">{displayName}</div>
                </div>
                <div className="mt-2 max-w-[820px] text-[13px] leading-6 text-[#5f718d]">
                  {prediction.summary}
                </div>
              </div>
            </div>

            <div className="flex min-h-[560px] flex-1 flex-col rounded-[22px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#fbfdff,#f5f8fd)] px-4 py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="ui-section-title">Price Flow</div>
                  <div className="mt-0.5 text-[14px] font-bold text-[#10213b]">
                    최근 30거래일 흐름과 다음 거래일 예측값
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-[#71839d]">
                  계산 시각 {formatGeneratedAt(prediction.generatedAt)}
                </div>
              </div>
              <PredictionChart history={prediction.history} forecast={prediction.forecast[0] ?? null} />
            </div>
          </div>
        ) : null}
      </div>

      <aside className="grid content-start gap-3 xl:sticky xl:top-4">
        <div className="ui-surface px-4 py-4">
          <div className="ui-section-title">핵심 수치</div>
          <div className="mt-3 grid gap-2.5">
            <MetricCard label="최근 종가" value={prediction ? formatPrice(prediction.metrics.latestClose) : '-'} sublabel={prediction?.latestDate ?? '-'} />
            <MetricCard
              label="AI 예측 종가"
              value={prediction ? formatPrice(prediction.metrics.predictedClose) : '-'}
              sublabel={prediction?.predictedDate ?? '-'}
              accentClassName={prediction ? tone.accent : undefined}
            />
            <MetricCard
              label="예상 변동폭"
              value={prediction ? formatPercent(prediction.metrics.predictedChangePct) : '-'}
              sublabel={
                prediction
                  ? `${formatPrice(prediction.metrics.rangeLow)} ~ ${formatPrice(prediction.metrics.rangeHigh)}`
                  : '-'
              }
              accentClassName={prediction ? tone.accent : undefined}
            />
            <MetricCard
              label="신뢰도"
              value={prediction ? `${prediction.metrics.confidence}%` : '-'}
              sublabel={prediction ? `검증 방향성 ${validationSignal}` : '-'}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onGoToDocs}
          className="flex items-center justify-between gap-4 rounded-[24px] border border-[#2f63ff] bg-[linear-gradient(135deg,#2f63ff,#4b7cff)] px-5 py-5 text-left text-white shadow-[0_16px_34px_rgba(17,81,255,0.24)] transition hover:translate-y-[-1px] hover:shadow-[0_20px_40px_rgba(17,81,255,0.28)]"
        >
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-white/70">DNN으로 이어보기</div>
            <div className="mt-2 text-[18px] font-bold text-white">배우러 가기</div>
            <div className="mt-1.5 text-[12px] leading-5 text-white/82">
              Docs의 DNN Chapter로 바로 이동합니다.
            </div>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-[16px] bg-white/14 text-white">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
      </aside>
    </section>
  );
}

function MetricCard({
  label,
  value,
  sublabel,
  accentClassName,
}: {
  label: string;
  value: string;
  sublabel: string;
  accentClassName?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] px-4 py-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
      <div className="text-[12px] font-bold text-[#70819a]">{label}</div>
      <div className={['mt-1.5 font-display text-[22px] font-bold tracking-[-0.04em] text-[#10213b]', accentClassName ?? ''].join(' ')}>
        {value}
      </div>
      <div className="mt-1 text-[12px] font-semibold text-[#71839d]">{sublabel}</div>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="grid gap-3 animate-pulse">
      <div className="h-7 w-36 rounded-full bg-[#edf3ff]" />
      <div className="h-12 rounded-[20px] bg-[#f3f6fb]" />
      <div className="h-[560px] rounded-[22px] bg-[#f3f6fb]" />
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-[#fecaca] bg-[#fff5f5] px-5 py-5 text-[#b42318]">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.16em]">Prediction Error</div>
      <div className="mt-2 text-[14px] font-semibold leading-6">{message}</div>
    </div>
  );
}

function PredictionChart({
  history,
  forecast,
}: {
  history: StockPredictionPoint[];
  forecast: StockPredictionPoint | null;
}) {
  const chart = useMemo(() => {
    if (!history.length) {
      return null;
    }

    const points = forecast ? [...history, forecast] : history;
    const totalPoints = points.length;
    const values = points.map((point) => point.close);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
    const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;

    const xFor = (index: number, total: number) =>
      CHART_PADDING + (total <= 1 ? innerWidth / 2 : (index / (total - 1)) * innerWidth);
    const yFor = (value: number) =>
      CHART_PADDING + innerHeight - ((value - minValue) / range) * innerHeight;

    const actualPath = history
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${xFor(index, totalPoints).toFixed(2)} ${yFor(point.close).toFixed(2)}`)
      .join(' ');

    const forecastSegment =
      forecast && history.length
        ? `M${xFor(history.length - 1, totalPoints).toFixed(2)} ${yFor(history.at(-1)?.close ?? forecast.close).toFixed(2)} L${xFor(totalPoints - 1, totalPoints).toFixed(2)} ${yFor(forecast.close).toFixed(2)}`
        : '';

    return {
      actualPath,
      forecastSegment,
      minValue,
      maxValue,
      lastActualX: xFor(history.length - 1, totalPoints),
      lastActualY: yFor(history.at(-1)?.close ?? history[0].close),
      forecastX: forecast ? xFor(totalPoints - 1, totalPoints) : null,
      forecastY: forecast ? yFor(forecast.close) : null,
      startDate: history[0]?.date ?? '',
      endDate: history.at(-1)?.date ?? '',
      forecastDate: forecast?.date ?? '',
    };
  }, [forecast, history]);

  if (!chart) {
    return (
      <div className="mt-4 rounded-[20px] border border-dashed border-[#dbe5f1] px-4 py-10 text-center text-[13px] font-semibold text-[#71839d]">
        표시할 주가 흐름이 없습니다.
      </div>
    );
  }

  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full">
        <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} rx="22" fill="#ffffff" stroke="#dbe5f1" />
        <line x1={CHART_PADDING} y1={CHART_PADDING} x2={CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="#dbe5f1" />
        <line x1={CHART_PADDING} y1={CHART_HEIGHT - CHART_PADDING} x2={CHART_WIDTH - CHART_PADDING} y2={CHART_HEIGHT - CHART_PADDING} stroke="#dbe5f1" />
        <line
          x1={CHART_PADDING}
          y1={CHART_HEIGHT / 2}
          x2={CHART_WIDTH - CHART_PADDING}
          y2={CHART_HEIGHT / 2}
          stroke="#e7eef8"
          strokeDasharray="5 5"
        />
        <path d={chart.actualPath} fill="none" stroke="#1151ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {chart.forecastSegment ? (
          <path
            d={chart.forecastSegment}
            fill="none"
            stroke="#0b7d6f"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="10 8"
          />
        ) : null}
        <circle cx={chart.lastActualX} cy={chart.lastActualY} r="5.5" fill="#1151ff" />
        {chart.forecastX != null && chart.forecastY != null ? (
          <>
            <circle cx={chart.forecastX} cy={chart.forecastY} r="6" fill="#0b7d6f" />
            <circle cx={chart.forecastX} cy={chart.forecastY} r="12" fill="rgba(11,125,111,0.12)" />
          </>
        ) : null}
        <text x={CHART_PADDING} y="18" fill="#7b8da8" fontSize="11" fontWeight="700">
          {chart.maxValue.toFixed(2)}
        </text>
        <text x={CHART_PADDING} y={CHART_HEIGHT - 8} fill="#7b8da8" fontSize="11" fontWeight="700">
          {chart.minValue.toFixed(2)}
        </text>
        <text x={CHART_PADDING} y={CHART_HEIGHT - 8} dx="18" fill="#9aacc5" fontSize="11" fontWeight="700">
          {chart.startDate}
        </text>
        <text x={CHART_WIDTH - CHART_PADDING} y={CHART_HEIGHT - 8} textAnchor="end" fill="#9aacc5" fontSize="11" fontWeight="700">
          {chart.forecastDate || chart.endDate}
        </text>
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.16em]">
        <span className="inline-flex items-center gap-2 text-primary">
          <i className="h-2.5 w-2.5 rounded-full bg-primary" />
          최근 실제 종가
        </span>
        <span className="inline-flex items-center gap-2 text-[#0b7d6f]">
          <i className="h-2.5 w-2.5 rounded-full bg-[#0b7d6f]" />
          다음 거래일 예측값
        </span>
      </div>
    </div>
  );
}
