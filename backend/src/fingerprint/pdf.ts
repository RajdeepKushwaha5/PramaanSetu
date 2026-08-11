/**
 * PDF page rendering, so forged SEBI circulars (which are PDFs) get the same
 * perceptual + QR treatment as images. Each page is rasterised to a PNG and
 * then fed through the existing image fingerprint and QR-decode pipeline.
 *
 * Uses pdfjs-dist (legacy, worker disabled) + @napi-rs/canvas - both verified
 * to run in this Node environment.
 */

import { createCanvas } from "@napi-rs/canvas";

// pdfjs legacy build has no matching subpath types; load dynamically and type
// only what we use.
interface PdfViewport { width: number; height: number }
interface PdfPage {
  getViewport(o: { scale: number }): PdfViewport;
  render(o: unknown): { promise: Promise<void> };
}
interface PdfDoc {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfjsModule {
  getDocument(o: unknown): { promise: Promise<PdfDoc> };
}

let pdfjs: PdfjsModule | null = null;
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjs) {
    pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  }
  return pdfjs;
}

async function renderPage(page: PdfPage, scale = 2): Promise<Buffer> {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toBuffer("image/png");
}

/**
 * Safe upper bound on how many pages we will rasterise and fingerprint. Every
 * page up to this limit is checked; a document with MORE pages is rejected at
 * signing and flagged at verification, so pages are never silently ignored.
 */
export const MAX_PDF_PAGES = 20;

export interface PdfRender {
  numPages: number; // the document's ACTUAL page count
  pages: Buffer[]; // rendered PNG pages (length = min(numPages, maxPages))
  truncated: boolean; // numPages > maxPages: some pages were NOT rendered
}

/**
 * Render a PDF's pages to PNGs and report its ACTUAL page count. `truncated` is
 * true when the document has more pages than `maxPages` - callers must fail
 * closed rather than compare only the rendered prefix (which would let a tamper
 * on an unrendered page slip through).
 */
export async function renderPdfPagesDetailed(
  buffer: Buffer,
  maxPages = MAX_PDF_PAGES,
): Promise<PdfRender> {
  try {
    const lib = await loadPdfjs();
    const doc = await lib.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
    }).promise;
    const numPages = doc.numPages;
    const count = Math.min(numPages, maxPages);
    const pages: Buffer[] = [];
    for (let i = 1; i <= count; i++) {
      pages.push(await renderPage(await doc.getPage(i)));
    }
    return { numPages, pages, truncated: numPages > maxPages };
  } catch (e) {
    console.error("PDF render failed:", (e as Error).message);
    return { numPages: 0, pages: [], truncated: false };
  }
}

/** Render pages of a PDF to PNG buffers (every page up to {@link MAX_PDF_PAGES}). */
export async function renderPdfPages(buffer: Buffer, maxPages = MAX_PDF_PAGES): Promise<Buffer[]> {
  return (await renderPdfPagesDetailed(buffer, maxPages)).pages;
}

/** Render just the first page (used for QR extraction). */
export async function renderPdfFirstPage(buffer: Buffer): Promise<Buffer | null> {
  const pages = await renderPdfPages(buffer, 1);
  return pages[0] ?? null;
}
