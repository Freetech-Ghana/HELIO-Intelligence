// Reusable directory technology fingerprints. These describe platforms, never events.
// A match identifies technology only; it does NOT authorize fetching or prove edition.
export type PlatformKey = "rx_global"|"mapyourshow"|"expoplatform"|"a2z"|"messe_frankfurt"|"static_html"|"unknown";
export type ReaderKind = "verified_api"|"public_html"|"browser_rendered"|"manual_review";
export type PlatformDefinition = {
  key:PlatformKey; label:string; reader:ReaderKind;
  hostPatterns:RegExp[]; htmlPatterns:RegExp[];
  pagination:"api_cursor_or_page"|"html_links"|"platform_specific"|"unknown";
  verification:string;
};
export const DIRECTORY_PLATFORMS:readonly PlatformDefinition[]=[
  {key:"rx_global",label:"RX Global",reader:"verified_api",hostPatterns:[/rxweb-prd\\.com$/i,/reedexpo\\.com$/i],htmlPatterns:[/reactSettingsShowPlanning/i,/algoliaConfig/i,/api\\.reedexpo\\.com/i],pagination:"api_cursor_or_page",verification:"Require verified API origin, edition ID and permission."},
  {key:"mapyourshow",label:"MapYourShow",reader:"manual_review",hostPatterns:[/mapyourshow\\.com$/i],htmlPatterns:[/mapyourshow/i],pagination:"platform_specific",verification:"Require authorized source and edition mapping."},
  {key:"expoplatform",label:"ExpoPlatform",reader:"manual_review",hostPatterns:[/expoplatform\\.com$/i],htmlPatterns:[/expoplatform/i],pagination:"api_cursor_or_page",verification:"Verify event identifier, edition and public access."},
  {key:"a2z",label:"A2Z Events",reader:"manual_review",hostPatterns:[/a2zinc\\.net$/i],htmlPatterns:[/a2zinc/i,/a2z\\s*events/i],pagination:"platform_specific",verification:"Confirm organizer directory and edition."},
  {key:"messe_frankfurt",label:"Messe Frankfurt",reader:"manual_review",hostPatterns:[/messefrankfurt\\.com$/i],htmlPatterns:[/messefrankfurt/i],pagination:"platform_specific",verification:"Confirm exhibitor directory edition and permitted access."}
];
export function platformFingerprint(sourceUrl:string,html:string){
  let hostname="";
  try{hostname=new URL(sourceUrl).hostname.toLowerCase();}catch{}
  for(const definition of DIRECTORY_PLATFORMS){
    const signals:string[]=[];
    if(definition.hostPatterns.some(p=>p.test(hostname))) signals.push("Platform host fingerprint");
    if(definition.htmlPatterns.some(p=>p.test(html))) signals.push("Platform HTML fingerprint");
    if(signals.length) return {definition,signals,confidence:signals.length>1?"high" as const:"medium" as const};
  }
  return null;
}
