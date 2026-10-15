// Server-only registry: one verified directory source per HELIO exhibition.
// Credentials must be authorized for the source and never sent to the browser.
export type RxSource = {
  exhibitionId: string; directoryHost: string; app: string; key: string;
  index: string; edition: string; year: number; verified: boolean;
  evidenceUrl: string;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function getRxSource(exhibitionId:string): RxSource | null {
  let entries: unknown = [];
  const raw=process.env.HELIO_RX_SOURCES_JSON || "";
  if (raw.trim()) {
    try { entries=JSON.parse(raw); }
    catch {throw Error("Invalid HELIO_RX_SOURCES_JSON configuration");}
    if (!Array.isArray(entries)) throw Error("HELIO_RX_SOURCES_JSON must be an array");
  }
  const found=(entries as unknown[]).find(v=>{
    const x=v as Record<string,unknown> | null;
    return x && x.exhibitionId===exhibitionId;
  }) as Record<string,unknown> | undefined;
  // Legacy single-source configuration is supported for existing users,
  // but cannot be used until explicitly bound to an exhibition and verified.
  const x=found || (process.env.HELIO_RX_EXHIBITION_ID===exhibitionId ? {
    exhibitionId, directoryHost:process.env.HELIO_RX_DIRECTORY_HOST,
    app:process.env.HELIO_RX_ALGOLIA_APP_ID,key:process.env.HELIO_RX_ALGOLIA_SEARCH_KEY,
    index:process.env.HELIO_RX_ALGOLIA_INDEX,edition:process.env.HELIO_RX_EDITION_ID,
    year:Number(process.env.HELIO_RX_EDITION_YEAR||0),
    verified:process.env.HELIO_RX_EDITION_VERIFIED==="true",
    evidenceUrl:process.env.HELIO_RX_EDITION_EVIDENCE_URL
  }:null);
  if (!x) return null;
  const source:RxSource={
    exhibitionId:String(x.exhibitionId||""),directoryHost:String(x.directoryHost||""),
    app:String(x.app||""),key:String(x.key||""),index:String(x.index||""),
    edition:String(x.edition||""),year:Number(x.year||0),
    verified:x.verified===true,evidenceUrl:String(x.evidenceUrl||"")
  };
  if (source.exhibitionId!==exhibitionId || !uuid.test(source.exhibitionId) ||
      !/^[a-z0-9.-]+$/i.test(source.directoryHost) ||
      !/^[A-Z0-9]{5,20}$/i.test(source.app) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(source.index) ||
      !/^eve-[0-9a-f-]{36}$/i.test(source.edition) ||
      !Number.isInteger(source.year) || source.year<2020 || source.year>2100 ||
      !source.key || !source.verified ||
      !/^https:\/\//i.test(source.evidenceUrl)) {
    throw Error("RX source is incomplete or its edition mapping is not independently verified. No records retrieved.");
  }
  return source;
}
