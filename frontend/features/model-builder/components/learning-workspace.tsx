'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Document, Page, pdfjs } from 'react-pdf';
import { Icon } from '@/features/model-builder/components/icons';
import {
  chatWithLearning,
  getLearningChapter,
  getLearningChapterPdfUrl,
  listLearningChapters,
  type LearningChapterContent,
  type LearningChapterSummary,
} from '@/lib/api/learning';

type LearningMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  imagePreviewUrl?: string | null;
  imageName?: string | null;
};

type DroppedImage = {
  name: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
};

type PdfRegionImage = {
  file: File;
  dataUrl: string;
  pageNumber: number;
};

type PdfSelectionDraft = {
  pageNumber: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type PdfSelectionBox = {
  pageNumber: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('내용을 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(new Error('내용을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function compactText(text: string, maxLength = 2400) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}...`;
}

async function imageFileToDroppedImage(file: File): Promise<DroppedImage> {
  const dataUrl = await fileToDataUrl(file);
  const [, base64 = ''] = dataUrl.split(',', 2);
  return {
    name: file.name || 'pdf-image.png',
    mimeType: file.type || 'image/png',
    base64,
    previewUrl: dataUrl,
  };
}

async function pdfRegionToDroppedImage(region: PdfRegionImage): Promise<DroppedImage> {
  return imageFileToDroppedImage(region.file);
}

function dataUrlToDroppedImage(name: string, dataUrl: string): DroppedImage | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }

  return {
    name,
    mimeType: match[1],
    base64: match[2],
    previewUrl: dataUrl,
  };
}

function getImageFile(dataTransfer: DataTransfer) {
  const file = Array.from(dataTransfer.files).find((item) => item.type.startsWith('image/'));
  if (file) {
    return file;
  }

  const imageItem = Array.from(dataTransfer.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'));
  return imageItem?.getAsFile() ?? null;
}

function getPdfRegionImage(dataTransfer: DataTransfer): DroppedImage | null {
  const rawPayload = dataTransfer.getData('application/x-visaible-pdf-region');
  if (!rawPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(rawPayload) as { name?: unknown; dataUrl?: unknown };
    if (typeof payload.dataUrl !== 'string') {
      return null;
    }

    return dataUrlToDroppedImage(typeof payload.name === 'string' ? payload.name : 'pdf-selection.png', payload.dataUrl);
  } catch {
    return null;
  }
}

function getSelectionBox(selection: PdfSelectionDraft | null): PdfSelectionBox | null {
  if (!selection) {
    return null;
  }

  const left = Math.min(selection.startX, selection.endX);
  const top = Math.min(selection.startY, selection.endY);
  const width = Math.abs(selection.endX - selection.startX);
  const height = Math.abs(selection.endY - selection.startY);

  if (width < 8 || height < 8) {
    return null;
  }

  return {
    pageNumber: selection.pageNumber,
    left,
    top,
    width,
    height,
  };
}

async function canvasBlobToFile(canvas: HTMLCanvasElement, fileName: string) {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('선택 영역을 내용으로 만들지 못했습니다.');
  }

  return new File([blob], fileName, { type: 'image/png' });
}

async function capturePdfSelection(pageShell: HTMLElement, box: PdfSelectionBox, chapterId: string): Promise<PdfRegionImage> {
  const sourceCanvas = pageShell.querySelector<HTMLCanvasElement>('.react-pdf__Page__canvas');
  if (!sourceCanvas) {
    throw new Error('PDF 페이지 캔버스를 찾지 못했습니다.');
  }

  const canvasRect = sourceCanvas.getBoundingClientRect();
  const shellRect = pageShell.getBoundingClientRect();
  const sourceX = Math.max(0, (box.left + shellRect.left - canvasRect.left) * (sourceCanvas.width / canvasRect.width));
  const sourceY = Math.max(0, (box.top + shellRect.top - canvasRect.top) * (sourceCanvas.height / canvasRect.height));
  const sourceWidth = Math.min(sourceCanvas.width - sourceX, box.width * (sourceCanvas.width / canvasRect.width));
  const sourceHeight = Math.min(sourceCanvas.height - sourceY, box.height * (sourceCanvas.height / canvasRect.height));

  if (sourceWidth < 2 || sourceHeight < 2) {
    throw new Error('선택 영역이 너무 작습니다.');
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.round(sourceWidth);
  outputCanvas.height = Math.round(sourceHeight);

  const context = outputCanvas.getContext('2d');
  if (!context) {
    throw new Error('내용 캡처 컨텍스트를 만들지 못했습니다.');
  }

  context.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputCanvas.width, outputCanvas.height);

  const dataUrl = outputCanvas.toDataURL('image/png');
  const file = await canvasBlobToFile(outputCanvas, `learning-${chapterId}-p${box.pageNumber}-selection.png`);
  return { file, dataUrl, pageNumber: box.pageNumber };
}

function PdfSelectionViewer({
  chapter,
  pdfUrl,
  onError,
  onCapture,
}: {
  chapter: LearningChapterContent;
  pdfUrl: string;
  onError: (message: string | null) => void;
  onCapture: (image: DroppedImage) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [viewerWidth, setViewerWidth] = useState(720);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectionDraft, setSelectionDraft] = useState<PdfSelectionDraft | null>(null);
  const [capturedRegion, setCapturedRegion] = useState<PdfRegionImage | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const selectionBox = useMemo(() => getSelectionBox(selectionDraft), [selectionDraft]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setViewerWidth(Math.max(360, element.clientWidth - 8));
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPageCount(0);
    setCurrentPage(1);
    setSelectionDraft(null);
    setCapturedRegion(null);
  }, [chapter.id]);

  const goToPage = (pageNumber: number) => {
    const nextPage = Math.min(Math.max(pageNumber, 1), Math.max(pageCount, 1));
    setCurrentPage(nextPage);
    setSelectionDraft(null);
    setCapturedRegion(null);
    scrollRef.current?.querySelector('[data-pdf-page-scroll]')?.scrollTo({ top: 0 });
  };

  const startSelection = (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (event.button !== 0) {
      return;
    }

    const shell = pageRefs.current[pageNumber];
    if (!shell) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setIsSelecting(true);
    setCapturedRegion(null);
    setSelectionDraft({ pageNumber, startX: x, startY: y, endX: x, endY: y });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const updateSelection = (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (!isSelecting || selectionDraft?.pageNumber !== pageNumber) {
      return;
    }

    const shell = pageRefs.current[pageNumber];
    if (!shell) {
      return;
    }

    const rect = shell.getBoundingClientRect();
    setSelectionDraft((current) =>
      current
        ? {
            ...current,
            endX: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
            endY: Math.min(Math.max(event.clientY - rect.top, 0), rect.height),
          }
        : current,
    );
  };

  const finishSelection = async (event: React.PointerEvent<HTMLDivElement>, pageNumber: number) => {
    if (!isSelecting || selectionDraft?.pageNumber !== pageNumber) {
      return;
    }

    setIsSelecting(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    const nextBox = getSelectionBox(selectionDraft);
    const shell = pageRefs.current[pageNumber];
    if (!nextBox || !shell) {
      setSelectionDraft(null);
      return;
    }

    try {
      const region = await capturePdfSelection(shell, nextBox, chapter.id);
      setCapturedRegion(region);
      onCapture(await pdfRegionToDroppedImage(region));
      onError(null);
    } catch (error) {
      setSelectionDraft(null);
      setCapturedRegion(null);
      onError(error instanceof Error ? error.message : '선택 영역 캡처에 실패했습니다.');
    }
  };

  return (
    <div ref={scrollRef} className="learning-pdf-scroll grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[#eef4ff]">
      <div className="flex items-center justify-between gap-3 border-b border-[#dbe5f1] bg-white/82 px-4 py-3">
        <div className="text-[12px] font-extrabold text-[#24405f]">
          PDF Viewer
        </div>
        <div className="text-[11px] font-semibold text-[#60718a]">
          페이지를 넘기면서 보고, 필요한 부분만 드래그해 캡처할 수 있습니다.
        </div>
      </div>

      <div data-pdf-page-scroll className="min-h-0 overflow-auto px-3 py-3">
      <Document
        key={chapter.id}
        file={pdfUrl}
        loading={<div className="grid h-full min-h-0 place-items-center py-16 text-[13px] font-semibold text-[#60718a]">PDF를 렌더링하는 중입니다...</div>}
        error={<div className="grid h-full min-h-0 place-items-center px-6 py-16 text-center text-[13px] font-semibold text-[#b42318]">PDF를 렌더링하지 못했습니다. Open PDF로 원본을 열어주세요.</div>}
        onLoadSuccess={({ numPages }) => {
          setPageCount(numPages);
          setCurrentPage(1);
        }}
      >
        {pageCount > 0 ? (
          (() => {
            const pageNumber = currentPage;
            const activeBox = selectionBox?.pageNumber === pageNumber ? selectionBox : null;
            const activeCapture = capturedRegion?.pageNumber === pageNumber ? capturedRegion : null;

            return (
            <div
              key={`${chapter.id}-${pageNumber}`}
              ref={(element) => {
                pageRefs.current[pageNumber] = element;
              }}
              className="learning-pdf-page-shell relative mx-auto w-fit overflow-hidden rounded-[14px] bg-white shadow-[0_16px_34px_rgba(15,23,42,0.11)]"
              onPointerDown={(event) => startSelection(event, pageNumber)}
              onPointerMove={(event) => updateSelection(event, pageNumber)}
              onPointerUp={(event) => void finishSelection(event, pageNumber)}
              onPointerCancel={() => {
                setIsSelecting(false);
                setSelectionDraft(null);
              }}
            >
              <Page pageNumber={pageNumber} width={viewerWidth} renderAnnotationLayer={false} renderTextLayer />
              {activeBox ? (
                <div
                  className="pointer-events-none absolute border-[3px] border-primary shadow-[0_0_0_1px_rgba(255,255,255,0.92)]"
                  style={{
                    left: activeBox.left,
                    top: activeBox.top,
                    width: activeBox.width,
                    height: activeBox.height,
                  }}
                />
              ) : null}
              {activeBox && activeCapture ? (
                <div
                  className="pointer-events-none absolute inline-flex items-center rounded-full border border-primary/20 bg-white px-2.5 py-1 text-[10px] font-extrabold tracking-[0.04em] text-primary shadow-[0_8px_18px_rgba(17,81,255,0.16)]"
                  style={{
                    left: activeBox.left + 10,
                    top: Math.max(activeBox.top + 10, 10),
                  }}
                >
                  첨부 완료
                </div>
              ) : null}
            </div>
            );
          })()
        ) : null}
      </Document>
      </div>

      <div className="sticky bottom-0 z-20 flex items-center justify-center gap-3 border-t border-[#dbe5f1] bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
          className="rounded-[12px] border border-[#dbe5f1] bg-white px-4 py-2 text-[12px] font-extrabold text-[#24405f] shadow-[0_6px_16px_rgba(15,23,42,0.04)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Prev
        </button>
        <div className="min-w-[92px] text-center text-[12px] font-extrabold tabular-nums text-[#24405f]">
          {currentPage} / {pageCount || '-'}
        </div>
        <button
          type="button"
          disabled={pageCount === 0 || currentPage >= pageCount}
          onClick={() => goToPage(currentPage + 1)}
          className="rounded-[12px] border border-[#dbe5f1] bg-white px-4 py-2 text-[12px] font-extrabold text-[#24405f] shadow-[0_6px_16px_rgba(15,23,42,0.04)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function LearningWorkspace({
  requestedChapterId,
  onRequestedChapterHandled,
}: {
  requestedChapterId?: string | null;
  onRequestedChapterHandled?: () => void;
}) {
  const [chapters, setChapters] = useState<LearningChapterSummary[]>([]);
  const [activeChapterId, setActiveChapterId] = useState('');
  const [activeChapter, setActiveChapter] = useState<LearningChapterContent | null>(null);
  const [loadingChapter, setLoadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [selectedExcerpt, setSelectedExcerpt] = useState<string | null>(null);
  const [droppedImage, setDroppedImage] = useState<DroppedImage | null>(null);
  const [draft, setDraft] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const activePdfUrl = activeChapter ? getLearningChapterPdfUrl(activeChapter.id, activeChapter.sourceUrl) : null;
  const [messages, setMessages] = useState<LearningMessage[]>([
    {
      id: 'learning-assistant-intro',
      role: 'assistant',
      content:
        '안녕, 나는 Mina야. PDF에서 궁금한 영역을 캡처해서 놓으면 그 내용을 같이 보면서 설명해줄게.',
    },
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadChapters() {
      setChapterError(null);
      try {
        const nextChapters = await listLearningChapters();
        if (cancelled) {
          return;
        }
        setChapters(nextChapters);
        setActiveChapterId((current) => current || nextChapters[0]?.id || '');
      } catch (error) {
        if (!cancelled) {
          setChapterError(error instanceof Error ? error.message : 'Learning chapter list를 불러오지 못했습니다.');
        }
      }
    }

    void loadChapters();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedChapterId) {
      return;
    }

    setActiveChapterId(requestedChapterId);
    onRequestedChapterHandled?.();
  }, [onRequestedChapterHandled, requestedChapterId]);

  useEffect(() => {
    if (!activeChapterId) {
      return;
    }

    let cancelled = false;

    async function loadChapter() {
      setLoadingChapter(true);
      setChapterError(null);
      try {
        const nextChapter = await getLearningChapter(activeChapterId);
        if (cancelled) {
          return;
        }
        setActiveChapter(nextChapter);
        setSelectedExcerpt(null);
        setDroppedImage(null);
        setChatError(null);
      } catch (error) {
        if (!cancelled) {
          setChapterError(error instanceof Error ? error.message : 'Learning chapter를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoadingChapter(false);
        }
      }
    }

    void loadChapter();
    return () => {
      cancelled = true;
    };
  }, [activeChapterId]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chatBusy, selectedExcerpt, droppedImage]);

  const attachText = (text: string) => {
    const nextText = compactText(text);
    if (!nextText) {
      return false;
    }

    setSelectedExcerpt(nextText);
    setDroppedImage(null);
    setChatError(null);
    return true;
  };

  const attachImage = (image: DroppedImage) => {
    setDroppedImage(image);
    setSelectedExcerpt(null);
    setChatError(null);
  };

  const handleClipboardPaste = async (clipboardData: DataTransfer | null) => {
    if (!clipboardData) {
      return false;
    }

    const imageFile = getImageFile(clipboardData);
    if (imageFile) {
      try {
        attachImage(await imageFileToDroppedImage(imageFile));
        return true;
      } catch (error) {
        setChatError(error instanceof Error ? error.message : '클립보드 내용을 읽지 못했습니다.');
        return false;
      }
    }

    return attachText(clipboardData.getData('text/plain'));
  };

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragActive(false);
    setChatError(null);

    const imageFile = getImageFile(event.dataTransfer);
    if (imageFile) {
      try {
        attachImage(await imageFileToDroppedImage(imageFile));
        return;
      } catch (error) {
        setChatError(error instanceof Error ? error.message : '내용 드롭을 처리하지 못했습니다.');
        return;
      }
    }

    const pdfRegionImage = getPdfRegionImage(event.dataTransfer);
    if (pdfRegionImage) {
      attachImage(pdfRegionImage);
      return;
    }

    if (attachText(event.dataTransfer.getData('text/plain'))) {
      return;
    }

    setChatError('텍스트 또는 내용으로 인식할 수 있는 드롭 데이터가 없습니다.');
  };

  const handleSend = async () => {
    const question = draft.trim();
    if (!question || !activeChapter || chatBusy) {
      return;
    }

    const lectureContext = [
      activeChapter.title,
      activeChapter.summary,
      selectedExcerpt ? `Selected excerpt: ${selectedExcerpt}` : null,
      droppedImage ? `Dropped content: ${droppedImage.name}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const userMessage: LearningMessage = {
      id: `learning-user-${Date.now()}`,
      role: 'user',
      content: selectedExcerpt
        ? `${question}\n\n[드롭한 텍스트]\n${compactText(selectedExcerpt)}`
        : droppedImage
          ? `${question}\n\n[드롭한 내용]\n${droppedImage.name}`
          : question,
      imagePreviewUrl: droppedImage?.previewUrl ?? null,
      imageName: droppedImage?.name ?? null,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setChatBusy(true);
    setChatError(null);

    try {
      const response = await chatWithLearning({
        question,
        chapterId: activeChapter.id,
        chapterTitle: activeChapter.title,
        sourceLabel: activeChapter.sourceLabel,
        sourceUrl: activeChapter.sourceUrl,
        lectureContext,
        selectedExcerpt,
        selectedImageBase64: droppedImage?.base64 ?? null,
        selectedImageMimeType: droppedImage?.mimeType ?? null,
      });

      setMessages((current) => [
        ...current,
        {
          id: `learning-assistant-${Date.now()}`,
          role: 'assistant',
          content: response.answer,
        },
      ]);
      setSelectedExcerpt(null);
      setDroppedImage(null);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Mina 답변을 받아오지 못했습니다.');
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <section className="grid h-[calc(100vh-132px)] min-h-0 items-start gap-3 overflow-hidden lg:grid-cols-[196px_minmax(0,1fr)_332px] xl:grid-cols-[208px_minmax(0,1fr)_352px]">
      <aside className="ui-surface min-h-0 self-start px-2.5 py-3 lg:sticky lg:top-0 lg:h-full lg:overflow-y-auto">
        <div className="rounded-[18px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#fbfdff,#f4f8fe)] px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#eef4ff] text-primary">
              <Icon name="file" className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="ui-section-title">Learning</div>
              <div className="mt-1 text-[15px] font-extrabold text-[#10213b]">PDF Chapters</div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {chapters.map((chapter, index) => {
            const active = chapter.id === activeChapterId;
            return (
              <button
                key={chapter.id}
                type="button"
                onClick={() => setActiveChapterId(chapter.id)}
                className={[
                  'w-full rounded-[18px] border px-3.5 py-3 text-left transition',
                  active
                    ? 'border-primary/25 bg-[linear-gradient(180deg,#eef4ff,#f7faff)] shadow-[0_12px_26px_rgba(17,81,255,0.08)]'
                    : 'border-[#dbe5f1] bg-white/92 hover:border-[#bdd0eb] hover:bg-[#f8fbff]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#6b7f9a]">
                    {String(index + 1).padStart(2, '0')} · {chapter.chapterLabel}
                  </div>
                  {active ? <Icon name="check" className="h-4 w-4 text-primary" /> : null}
                </div>
                <div className="mt-2 text-[15px] font-extrabold leading-5 text-[#10213b]">
                  {chapter.title}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="ui-surface grid h-full min-h-0 self-start grid-rows-[auto_minmax(0,1fr)] overflow-hidden px-3 py-3 xl:px-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1e8f3] pb-3">
          <div className="min-w-0">
            <div className="ui-section-title">{activeChapter?.chapterLabel ?? 'PDF'}</div>
            <h2 className="mt-1.5 font-display text-[25px] font-bold leading-tight text-[#10213b]">
              {activeChapter?.title ?? 'Learning PDF'}
            </h2>
          </div>
          {activeChapter?.sourceUrl ? (
            <a
              href={activeChapter.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-[14px] border border-[#dbe5f1] bg-white px-3.5 py-2 text-[12px] font-extrabold text-[#24405f] shadow-[0_8px_18px_rgba(15,23,42,0.04)]"
            >
              <Icon name="file" className="h-4 w-4 text-primary" />
              Open PDF
            </a>
          ) : null}
        </div>

        <div className="mt-3 min-h-0 overflow-hidden rounded-[20px] border border-[#dbe5f1] bg-[#eef4ff]">
          {loadingChapter ? (
            <div className="grid h-full min-h-0 place-items-center text-[13px] font-semibold text-[#60718a]">
              PDF를 불러오는 중입니다...
            </div>
          ) : chapterError ? (
            <div className="grid h-full min-h-0 place-items-center px-6 text-center text-[13px] font-semibold text-[#b42318]">
              {chapterError}
            </div>
          ) : activeChapter && activePdfUrl ? (
            <PdfSelectionViewer
              chapter={activeChapter}
              pdfUrl={activePdfUrl}
              onError={setChatError}
              onCapture={attachImage}
            />
          ) : (
            <div className="grid h-full min-h-0 place-items-center text-[13px] font-semibold text-[#60718a]">
              PDF를 선택해 주세요.
            </div>
          )}
        </div>
      </main>

      <aside
        className={[
          'ui-surface relative grid h-full min-h-0 self-start grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5 overflow-hidden px-3 py-3 transition lg:sticky lg:top-0',
          dragActive ? 'ring-2 ring-primary/45' : '',
        ].join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => void handleDrop(event)}
        onPaste={(event) => {
          void handleClipboardPaste(event.clipboardData);
        }}
      >
        <div className="rounded-[16px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#fbfdff,#f4f8fe)] px-3 py-2.5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[12px] bg-[#eef4ff]">
              <Image
                src="/images/mnist-quest-mina-focused.svg"
                alt="Mina"
                fill
                sizes="36px"
                className="object-contain p-1"
              />
            </div>
            <div className="min-w-0">
              <div className="ui-section-title">Mina Assistant</div>
              <div className="mt-0.5 text-[14px] font-extrabold text-[#10213b]">Ask About This Page</div>
            </div>
          </div>
        </div>

        <div ref={messagesRef} className="min-h-0 space-y-3.5 overflow-y-auto rounded-[18px] border border-[#dbe5f1] bg-[linear-gradient(180deg,#f8fbff,#f5f8fd)] px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
          {messages.map((message) =>
            message.role === 'assistant' ? (
              <div
                key={message.id}
                className="max-w-[94%] rounded-[16px] rounded-tl-[8px] border border-[#dbe5f1] bg-white px-4 py-3 text-[13px] leading-[1.65] text-[#24405f] shadow-[0_8px_20px_rgba(15,23,42,0.04)] whitespace-pre-wrap"
              >
                {message.content}
              </div>
            ) : (
              <div
                key={message.id}
                className="ml-auto max-w-[90%] rounded-[16px] rounded-tr-[8px] bg-[#1151ff] px-4 py-3 text-[13px] font-semibold leading-[1.6] text-white shadow-[0_12px_24px_rgba(17,81,255,0.14)] whitespace-pre-wrap"
              >
                {message.imagePreviewUrl ? (
                  <img src={message.imagePreviewUrl} alt={message.imageName ?? 'dropped content'} className="mb-3 max-h-24 w-full rounded-[12px] bg-white/10 object-contain" />
                ) : null}
                {message.content}
              </div>
            ),
          )}
          {chatBusy ? (
            <div className="rounded-[16px] rounded-tl-[8px] border border-[#dbe5f1] bg-white px-4 py-3 text-[13px] font-semibold leading-[1.6] text-[#5f7390] shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
              Mina가 첨부한 내용을 읽는 중입니다...
            </div>
          ) : null}
        </div>

        <div className="rounded-[18px] border border-[#d7e2f2] bg-white px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
          {selectedExcerpt ? (
            <div className="mb-2.5 rounded-[14px] border border-[#dbe5f1] bg-[#f8fbff] px-3 py-2 text-[12px] leading-5 text-[#4f627f]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Text Attached</div>
                <button
                  type="button"
                  onClick={() => setSelectedExcerpt(null)}
                  className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7890ad]"
                >
                  Clear
                </button>
              </div>
              <div className="mt-1.5 line-clamp-2">{selectedExcerpt}</div>
            </div>
          ) : null}

          {droppedImage ? (
            <div className="mb-2.5 rounded-[14px] border border-[#dbe5f1] bg-[#f8fbff] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">Content Attached</div>
                <button
                  type="button"
                  onClick={() => setDroppedImage(null)}
                  className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#7890ad]"
                >
                  Clear
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2.5 rounded-[12px] bg-white px-2.5 py-2">
                <img src={droppedImage.previewUrl} alt={droppedImage.name} className="h-12 w-12 shrink-0 rounded-[10px] bg-white object-contain" />
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-semibold text-[#24405f]">{droppedImage.name}</div>
                  <div className="mt-0.5 text-[11px] text-[#7b8da9]">첨부된 캡처 이미지</div>
                </div>
              </div>
            </div>
          ) : null}

          {dragActive && !selectedExcerpt && !droppedImage ? (
            <div className="mb-2.5 rounded-[16px] border-2 border-dashed border-primary bg-[#eef4ff] px-3 py-3 text-center text-[12px] font-extrabold text-primary">
              Drop text or content here
            </div>
          ) : null}

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPaste={(event) => {
              void handleClipboardPaste(event.clipboardData);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="질문을 입력하세요"
            className="min-h-[64px] w-full resize-none rounded-[16px] border border-[#e2e8f3] bg-[#fbfcfe] px-3 py-2.5 text-[13px] leading-5 text-[#18314f] outline-none transition focus:border-primary/35 focus:bg-white placeholder:text-[#90a0b8]"
          />
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold text-[#7b8da9]">
              `Enter` 전송
            </div>
            <button
              type="button"
              disabled={chatBusy || draft.trim().length === 0 || !activeChapter}
              onClick={() => void handleSend()}
              className="inline-flex items-center gap-2 rounded-[14px] bg-[#1151ff] px-4 py-2.5 text-[12px] font-extrabold tracking-[0.06em] text-white shadow-[0_12px_22px_rgba(17,81,255,0.16)] transition hover:bg-[#0f49e6] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <Icon name="help" className="h-4 w-4" />
              Send
            </button>
          </div>
          {chatError ? (
            <div className="mt-3 rounded-[16px] border border-[#fecaca] bg-[#fff5f5] px-4 py-3 text-[12px] font-semibold text-[#b42318]">
              {chatError}
            </div>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
