// Reusable, read-only parser for user-supplied exhibition directory JSON.
// Add future platforms as adapters without changing the review UI.
export type DirectoryCompany = {
  source_id: string; company_name: string; display_name: string; country: string;
  stand: string; hall: string; website: string; email: string; phone: string;
  description: string; profile_url: string; edition_id: string; source_platform: string;
};
export type DirectoryReview = {
  platform: string; companies: DirectoryCompany[]; reported_total: number | null;
  page: number | null; total_pages: number | null; edition_ids: string[];
  warnings: string[]; can_import: false;
};
type UnknownRecord = Record<string, unknown>;
const obj = (v: unknown): UnknownRecord => v && typeof v === "object" && !Array.isArray(v) ? v as UnknownRecord : {};
const str = (v: unknown): string => typeof v === "string" ? v.trim() : "";
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;
const domain = (v: string) => { try { const u = new URL(v); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
// Conservative platform-specific readers: only documented/explicitly mapped JSON
// fields are accepted. An arbitrary search result is never treated as an exhibitor.
function genericListing(r: UnknownRecord, platform: "mapyourshow" | "expoplatform"): DirectoryReview {
  const entries=arr(r.exhibitors);
  if (!entries.length) throw Error("No exhibitor entries in the supported "+platform+" JSON format.");
  const companies=entries.map(v=>{
    const x=obj(v);
    const id=str(x.id) || str(x.exhibitorId);
    const name=str(x.companyName) || str(x.name);
    const edition=str(x.editionId) || str(r.editionId);
    return {
      source_id:id,company_name:name,display_name:name,
      country:str(x.country),stand:str(x.booth) || str(x.stand),
      hall:str(x.hall),website:domain(str(x.website)),
      email:str(x.email),phone:str(x.phone),
      description:str(x.description),profile_url:domain(str(x.profileUrl)),
      edition_id:edition,source_platform:platform
    };
  }).filter(x=>x.source_id && x.company_name && x.edition_id);
  if (companies.length!==entries.length) throw Error("Missing company ID, name or edition ID in "+platform+" listing. No records accepted.");
  return {
    platform,companies,reported_total:num(r.total),page:num(r.page),
    total_pages:num(r.totalPages),
    edition_ids:[...new Set(companies.map(x=>x.edition_id))],
    warnings:["This adapter requires a normalized, source-authorized exhibitor listing with explicit edition IDs; it does not claim to support every vendor API response."],
    can_import:false
  };
}
const adapters: { name: string; match: (r: UnknownRecord) => boolean; read: (r: UnknownRecord) => DirectoryReview }[] = [
  {name:"mapyourshow",match:r=>r.sourcePlatform==="mapyourshow" && Array.isArray(r.exhibitors),read:r=>genericListing(r,"mapyourshow")},
  {name:"expoplatform",match:r=>r.sourcePlatform==="expoplatform" && Array.isArray(r.exhibitors),read:r=>genericListing(r,"expoplatform")},
  {
    name: "rx_global_algolia",
    match: r => Array.isArray(r.hits) && arr(r.hits).some(h => obj(h).recordType === "exhibitor" && !!str(obj(h).eventEditionId)),
    read: r => {
      const companies = arr(r.hits).filter(h => obj(h).recordType === "exhibitor").map(h => {
        const x = obj(h);
        return {
          source_id: str(x.objectID) || str(x.id),
          company_name: str(x.companyName) || str(x.exhibitorName),
          display_name: str(x.exhibitorName),
          country: str(x.countryName),
          stand: str(x.standReference),
          hall: "",
          website: domain(str(x.website)),
          email: str(x.email),
          phone: str(x.phone),
          description: str(x.exhibitorDescription),
          // Never fabricate a profile URL from a record ID.
          profile_url: domain(str(x.profileUrl)),
          edition_id: str(x.eventEditionId),
          source_platform: "rx_global_algolia"
        };
      }).filter(x => x.company_name && x.source_id);
      return {
        platform: "rx_global_algolia", companies,
        reported_total: num(r.nbHits), page: num(r.page), total_pages: num(r.nbPages),
        edition_ids: [...new Set(companies.map(x => x.edition_id).filter(Boolean))],
        warnings: [], can_import: false
      };
    }
  }
];
export function inspectDirectoryJson(value: unknown): DirectoryReview {
  const input = obj(value);
  const pages = Array.isArray(value) ? value : Array.isArray(input.pages) ? input.pages : [value];
  const reports = pages.map(p => {
    const root = obj(p);
    const adapter = adapters.find(a => a.match(root));
    if (!adapter) throw new Error("Unsupported directory JSON format. Supported JSON: RX Global Algolia, or explicitly normalized MapYourShow/ExpoPlatform exhibitor listings with edition IDs.");
    return adapter.read(root);
  });
  const seen = new Set<string>();
  const companies = reports.flatMap(r => r.companies).filter(c => {
    const key = c.source_platform + ":" + c.edition_id + ":" + c.source_id;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const edition_ids = [...new Set(companies.map(c => c.edition_id).filter(Boolean))];
  const reported_total = reports.find(r => r.reported_total !== null)?.reported_total ?? null;
  const warnings: string[] = [
    "Read-only inspection: no database records were created.",
    "Exhibition edition and year must be verified independently before any import.",
    "Public directory contact information must be used in accordance with applicable privacy and marketing rules."
  ];
  if (edition_ids.length > 1) warnings.push("Multiple edition IDs detected: do not combine these as one exhibition.");
  if (reported_total !== null && companies.length < reported_total) warnings.push("Partial dataset: " + companies.length + " of " + reported_total + " reported exhibitors.");
  if (reported_total !== null && companies.length > reported_total) warnings.push("Dataset exceeds the reported count; check pagination and source consistency.");
  if (reports.some(r => r.page !== null) && reports.length > 1 && new Set(reports.map(r => r.page)).size !== reports.length) warnings.push("Duplicate page numbers detected.");
  return {
    platform: [...new Set(reports.map(r => r.platform))].join(", "),
    companies, reported_total,
    page: reports.length === 1 ? reports[0].page : null,
    total_pages: reports[0]?.total_pages ?? null,
    edition_ids, warnings, can_import: false
  };
}
