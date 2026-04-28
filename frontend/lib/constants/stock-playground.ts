import type { StockPreset } from '@/types/builder';

export const stockPlaygroundPresets: StockPreset[] = [
  {
    ticker: 'AAPL',
    label: 'Apple',
    sector: 'Consumer Tech',
    description:
      '제품 사이클과 서비스 매출이 함께 움직여서, 상대적으로 읽기 쉬운 중기 추세를 관찰하기 좋은 대표 종목입니다.',
  },
  {
    ticker: 'MSFT',
    label: 'Microsoft',
    sector: 'Cloud Software',
    description:
      'Azure와 엔터프라이즈 소프트웨어 흐름이 반영되어 완만한 장기 추세와 이벤트성 변동을 함께 살펴보기 좋습니다.',
  },
  {
    ticker: 'NVDA',
    label: 'NVIDIA',
    sector: 'AI Semiconductors',
    description:
      'AI 기대감이 가격에 강하게 반영되어 고변동 모멘텀 구간이 많아서 시계열 모델의 강점과 한계를 잘 드러냅니다.',
  },
  {
    ticker: 'TSLA',
    label: 'Tesla',
    sector: 'EV Mobility',
    description:
      '뉴스 민감도가 크고 추세 전환 폭이 커서 예측 난도가 높은 사례로 실험하기 좋은 종목입니다.',
  },
  {
    ticker: 'GOOGL',
    label: 'Alphabet',
    sector: 'Search & Ads',
    description:
      '광고 매출과 클라우드 성장 흐름이 함께 반영되어 빅테크의 완만한 추세와 이벤트 변동을 비교하기 좋습니다.',
  },
  {
    ticker: 'AMZN',
    label: 'Amazon',
    sector: 'Commerce & Cloud',
    description:
      '이커머스, AWS, 소비 경기 신호가 섞여 있어 서로 다른 사업 흐름이 주가에 어떻게 반영되는지 보기 좋습니다.',
  },
  {
    ticker: 'META',
    label: 'Meta',
    sector: 'Social Platforms',
    description:
      '광고 경기와 AI 투자 기대가 빠르게 반영되어 모멘텀과 조정 구간을 함께 관찰하기 좋은 종목입니다.',
  },
  {
    ticker: 'JPM',
    label: 'JPMorgan Chase',
    sector: 'Financials',
    description:
      '금리와 경기 사이클에 민감한 금융주라서 기술주와 다른 가격 흐름을 비교하는 데 적합합니다.',
  },
  {
    ticker: 'XOM',
    label: 'Exxon Mobil',
    sector: 'Energy',
    description:
      '유가와 에너지 수요 변화가 주가에 반영되어 원자재 사이클형 종목의 움직임을 살펴보기 좋습니다.',
  },
  {
    ticker: 'UNH',
    label: 'UnitedHealth',
    sector: 'Healthcare',
    description:
      '헬스케어 방어주의 성격이 있어 고성장 기술주와 다른 안정적인 가격 패턴을 비교해볼 수 있습니다.',
  },
];
