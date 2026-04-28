import type { DatasetItem, LibraryBlock, StatItem } from '@/types/builder';

const mnistClassLabels = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const fashionMnistClassLabels = [
  'T-shirt/top',
  'Trouser',
  'Pullover',
  'Dress',
  'Coat',
  'Sandal',
  'Shirt',
  'Sneaker',
  'Bag',
  'Ankle boot',
];
const cifar10ClassLabels = [
  'Airplane',
  'Automobile',
  'Bird',
  'Cat',
  'Deer',
  'Dog',
  'Frog',
  'Horse',
  'Ship',
  'Truck',
];

export const datasets: DatasetItem[] = [
  {
    id: 'mnist',
    icon: 'stack',
    label: 'MNIST Digit Set',
    inputShape: '1 x 28 x 28',
    records: '70,000 samples',
    domain: 'Handwritten digits',
    classCount: 10,
    descriptionKo:
      '손글씨 숫자 이미지 데이터셋입니다. 흑백 28x28 이미지로 구성되며 숫자 0부터 9까지를 분류합니다.',
    shapeDescriptionKo: '입력 텐서 형태는 1채널 28x28 이미지입니다.',
    classesDescriptionKo: '클래스는 총 10개이며 숫자 0, 1, 2, 3, 4, 5, 6, 7, 8, 9입니다.',
    classLabels: mnistClassLabels,
    infoSampleClasses: [
      { label: '숫자 0', imageSrc: '/dataset-samples/mnist/0.png' },
      { label: '숫자 1', imageSrc: '/dataset-samples/mnist/1.png' },
      { label: '숫자 7', imageSrc: '/dataset-samples/mnist/7.png' },
      { label: '숫자 9', imageSrc: '/dataset-samples/mnist/9.png' },
    ],
    sampleClasses: [
      { label: '0', imageSrc: '/dataset-samples/mnist/0.png' },
      { label: '1', imageSrc: '/dataset-samples/mnist/1.png' },
      { label: '2', imageSrc: '/dataset-samples/mnist/2.png' },
      { label: '3', imageSrc: '/dataset-samples/mnist/3.png' },
      { label: '4', imageSrc: '/dataset-samples/mnist/4.png' },
      { label: '5', imageSrc: '/dataset-samples/mnist/5.png' },
      { label: '6', imageSrc: '/dataset-samples/mnist/6.png' },
      { label: '7', imageSrc: '/dataset-samples/mnist/7.png' },
      { label: '8', imageSrc: '/dataset-samples/mnist/8.png' },
      { label: '9', imageSrc: '/dataset-samples/mnist/9.png' },
    ],
  },
  {
    id: 'fashion_mnist',
    icon: 'stack',
    label: 'Fashion-MNIST',
    inputShape: '1 x 28 x 28',
    records: '70,000 samples',
    domain: 'Apparel classification',
    classCount: 10,
    descriptionKo:
      '의류 품목을 분류하는 흑백 이미지 데이터셋입니다. MNIST와 같은 크기라 CNN 실험용으로 많이 씁니다.',
    shapeDescriptionKo: '입력 텐서 형태는 1채널 28x28 이미지입니다.',
    classesDescriptionKo:
      '클래스는 총 10개이며 티셔츠/상의, 바지, 풀오버, 드레스, 코트, 샌들, 셔츠, 스니커즈, 가방, 앵클부츠입니다.',
    classLabels: fashionMnistClassLabels,
    infoSampleClasses: [
      { label: '티셔츠', imageSrc: '/dataset-samples/fashion_mnist/0.png' },
      { label: '풀오버', imageSrc: '/dataset-samples/fashion_mnist/2.png' },
      { label: '가방', imageSrc: '/dataset-samples/fashion_mnist/8.png' },
      { label: '앵클부츠', imageSrc: '/dataset-samples/fashion_mnist/9.png' },
    ],
    sampleClasses: [
      { label: 'T-shirt', imageSrc: '/dataset-samples/fashion_mnist/0.png' },
      { label: 'Trouser', imageSrc: '/dataset-samples/fashion_mnist/1.png' },
      { label: 'Pullover', imageSrc: '/dataset-samples/fashion_mnist/2.png' },
      { label: 'Dress', imageSrc: '/dataset-samples/fashion_mnist/3.png' },
      { label: 'Coat', imageSrc: '/dataset-samples/fashion_mnist/4.png' },
      { label: 'Sandal', imageSrc: '/dataset-samples/fashion_mnist/5.png' },
      { label: 'Shirt', imageSrc: '/dataset-samples/fashion_mnist/6.png' },
      { label: 'Sneaker', imageSrc: '/dataset-samples/fashion_mnist/7.png' },
      { label: 'Bag', imageSrc: '/dataset-samples/fashion_mnist/8.png' },
      { label: 'Ankle boot', imageSrc: '/dataset-samples/fashion_mnist/9.png' },
    ],
  },
  {
    id: 'cifar10',
    icon: 'chip',
    label: 'CIFAR-10 Images',
    inputShape: '3 x 32 x 32',
    records: '60,000 samples',
    domain: 'Image classification',
    classCount: 10,
    descriptionKo:
      '작은 컬러 자연 이미지 데이터셋입니다. 기본적인 이미지 분류 모델 성능을 빠르게 비교할 때 자주 사용됩니다.',
    shapeDescriptionKo: '입력 텐서 형태는 RGB 3채널 32x32 이미지입니다.',
    classesDescriptionKo:
      '클래스는 총 10개이며 비행기, 자동차, 새, 고양이, 사슴, 개, 개구리, 말, 배, 트럭입니다.',
    classLabels: cifar10ClassLabels,
    infoSampleClasses: [
      { label: '비행기', imageSrc: '/dataset-samples/cifar10/0.png' },
      { label: '자동차', imageSrc: '/dataset-samples/cifar10/1.png' },
      { label: '고양이', imageSrc: '/dataset-samples/cifar10/3.png' },
      { label: '배', imageSrc: '/dataset-samples/cifar10/8.png' },
    ],
    sampleClasses: [
      { label: 'Airplane', imageSrc: '/dataset-samples/cifar10/0.png' },
      { label: 'Automobile', imageSrc: '/dataset-samples/cifar10/1.png' },
      { label: 'Bird', imageSrc: '/dataset-samples/cifar10/2.png' },
      { label: 'Cat', imageSrc: '/dataset-samples/cifar10/3.png' },
      { label: 'Deer', imageSrc: '/dataset-samples/cifar10/4.png' },
      { label: 'Dog', imageSrc: '/dataset-samples/cifar10/5.png' },
      { label: 'Frog', imageSrc: '/dataset-samples/cifar10/6.png' },
      { label: 'Horse', imageSrc: '/dataset-samples/cifar10/7.png' },
      { label: 'Ship', imageSrc: '/dataset-samples/cifar10/8.png' },
      { label: 'Truck', imageSrc: '/dataset-samples/cifar10/9.png' },
    ],
  },
];

export const competitionDatasets: DatasetItem[] = [
  ...datasets,
  {
    id: 'imagenet',
    icon: 'chip',
    label: 'Tiny ImageNet Competition',
    inputShape: '3 x 64 x 64',
    records: '100K train / hidden public-private eval',
    domain: 'Competition classification',
    classCount: 200,
    descriptionKo:
      '축소된 ImageNet 스타일 데이터셋입니다. 더 많은 클래스와 복잡한 이미지로 경쟁형 분류 실험을 할 수 있습니다.',
    shapeDescriptionKo: '입력 텐서 형태는 RGB 3채널 64x64 이미지입니다.',
    classesDescriptionKo: '클래스는 총 200개입니다.',
  },
  {
    id: 'oxford_iiit_pet',
    icon: 'chip',
    label: 'Oxford-IIIT Pet',
    inputShape: '3 x 128 x 128',
    records: '7,349 samples',
    domain: 'Pet breed classification',
    classCount: 37,
    descriptionKo:
      '고양이와 강아지 품종을 구분하는 컬러 이미지 데이터셋입니다. 중간 규모의 분류 경쟁 문제로 쓰기 좋습니다.',
    shapeDescriptionKo: '입력 텐서 형태는 RGB 3채널 128x128 이미지입니다.',
    classesDescriptionKo: '클래스는 총 37개이며 반려동물 품종 분류 문제입니다.',
    infoSampleClasses: [
      { label: 'Abyssinian', imageSrc: '/dataset-samples/oxford_pet/abyssinian.svg' },
      { label: 'Beagle', imageSrc: '/dataset-samples/oxford_pet/beagle.svg' },
      { label: 'Persian', imageSrc: '/dataset-samples/oxford_pet/persian.svg' },
      { label: 'Pomeranian', imageSrc: '/dataset-samples/oxford_pet/pomeranian.svg' },
      { label: 'Siamese', imageSrc: '/dataset-samples/oxford_pet/siamese.svg' },
      { label: 'Shiba Inu', imageSrc: '/dataset-samples/oxford_pet/shiba.svg' },
    ],
    sampleClasses: [
      { label: 'Abyssinian', imageSrc: '/dataset-samples/oxford_pet/abyssinian.svg' },
      { label: 'Beagle', imageSrc: '/dataset-samples/oxford_pet/beagle.svg' },
      { label: 'Persian', imageSrc: '/dataset-samples/oxford_pet/persian.svg' },
      { label: 'Pomeranian', imageSrc: '/dataset-samples/oxford_pet/pomeranian.svg' },
      { label: 'Siamese', imageSrc: '/dataset-samples/oxford_pet/siamese.svg' },
      { label: 'Shiba Inu', imageSrc: '/dataset-samples/oxford_pet/shiba.svg' },
    ],
  },
  {
    id: 'flowers102',
    icon: 'chip',
    label: 'Flowers102',
    inputShape: '3 x 128 x 128',
    records: '8,189 samples',
    domain: 'Flower classification',
    classCount: 102,
    descriptionKo:
      '꽃 이미지를 102개 품종으로 분류하는 컬러 이미지 데이터셋입니다. 클래스 수가 많아 competition용으로 적합합니다.',
    shapeDescriptionKo: '입력 텐서 형태는 RGB 3채널 128x128 이미지입니다.',
    classesDescriptionKo: '클래스는 총 102개이며 꽃 품종 분류 문제입니다.',
    infoSampleClasses: [
      { label: 'Daisy', imageSrc: '/dataset-samples/flowers102/daisy.svg' },
      { label: 'Sunflower', imageSrc: '/dataset-samples/flowers102/sunflower.svg' },
      { label: 'Tulip', imageSrc: '/dataset-samples/flowers102/tulip.svg' },
      { label: 'Lotus', imageSrc: '/dataset-samples/flowers102/lotus.svg' },
      { label: 'Rose', imageSrc: '/dataset-samples/flowers102/rose.svg' },
      { label: 'Iris', imageSrc: '/dataset-samples/flowers102/iris.svg' },
    ],
    sampleClasses: [
      { label: 'Daisy', imageSrc: '/dataset-samples/flowers102/daisy.svg' },
      { label: 'Sunflower', imageSrc: '/dataset-samples/flowers102/sunflower.svg' },
      { label: 'Tulip', imageSrc: '/dataset-samples/flowers102/tulip.svg' },
      { label: 'Lotus', imageSrc: '/dataset-samples/flowers102/lotus.svg' },
      { label: 'Rose', imageSrc: '/dataset-samples/flowers102/rose.svg' },
      { label: 'Iris', imageSrc: '/dataset-samples/flowers102/iris.svg' },
    ],
  },
];

export const libraryBlocks: LibraryBlock[] = [
  {
    id: 'linear',
    title: 'Linear Layer',
    description: '입력 특징을 다음 단계로 연결해 주는 기본 레이어예요.',
    icon: 'layers',
    accent: 'blue',
    defaults: {
      fields: [
        { label: 'Input', value: '784' },
        { label: 'Output', value: '128' },
      ],
      activation: 'ReLU',
      activationOptions: ['None', 'ReLU', 'Leaky ReLU', 'GELU', 'Sigmoid', 'Tanh', 'Softplus'],
    },
  },
  {
    id: 'cnn',
    title: 'CNN Layer',
    description: '이미지의 패턴을 찾을 때 자주 쓰는 합성곱 레이어예요.',
    icon: 'panel',
    accent: 'amber',
    defaults: {
      fields: [
        { label: 'Channel In', value: '1' },
        { label: 'Channel Out', value: '16' },
        { label: 'Kernel Size', value: '3x3' },
        { label: 'Padding', value: '1' },
        { label: 'Stride', value: '1' },
      ],
      activation: 'ReLU',
      activationOptions: ['None', 'ReLU', 'ELU', 'SELU', 'GELU', 'Swish', 'Tanh'],
    },
  },
  {
    id: 'pooling',
    title: 'Pooling Layer',
    description: '특징 맵 크기를 줄여서 핵심 정보만 남겨주는 레이어예요.',
    icon: 'pool',
    accent: 'violet',
    defaults: {
      fields: [
        { label: 'Pool Type', value: 'MaxPool' },
        { label: 'Kernel Size', value: '2x2' },
        { label: 'Stride', value: '' },
        { label: 'Padding', value: '0' },
      ],
      activation: 'None',
      activationOptions: ['None'],
    },
  },
  {
    id: 'dropout',
    title: 'Dropout Layer',
    description: '학습 중 일부 값을 쉬게 해서 과적합을 줄여주는 레이어예요.',
    icon: 'dropout',
    accent: 'rose',
    defaults: {
      fields: [{ label: 'Probability', value: '0.30' }],
      activation: 'None',
      activationOptions: ['None'],
    },
  },
];

export const stats: StatItem[] = [
  { label: 'Total Parameters', value: '142,501' },
  { label: 'Batch Size', value: '128' },
  { label: 'Epochs Completed', value: '48 / 100' },
];
