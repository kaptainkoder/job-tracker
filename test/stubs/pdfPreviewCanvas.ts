// DOM tests render under jsdom, which has no real canvas. This stub keeps the pdf.js `?url` worker
// import out of the Node/jsdom bundle and resolves immediately so the preview reaches its ready
// state without painting.
export async function renderPdfToCanvas(): Promise<{ pages: number }> {
  return { pages: 1 };
}
