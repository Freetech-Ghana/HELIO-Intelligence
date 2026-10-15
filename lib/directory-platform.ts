export type DirectoryPlatform = "rx_global" | "mapyourshow" | "expoplatform" | "static_html" | "unknown";
export type DirectoryDetection = {platform:DirectoryPlatform; confidence:"high"|"medium"|"low"; signals:string[]; adapterStatus:"inspection_only"|"static_reader_available"|"needs_integration"};
export function detectDirectoryPlatform(sourceUrl:string, html:string):DirectoryDetection {
  const signals:string[]=[];
  let host="";
  try {host=new URL(sourceUrl).hostname.toLowerCase();} catch {}
  if (/reactSettingsShowPlanning|algoliaConfig|api\.reedexpo\.com|rxweb-prd/i.test(html) || /theairportshow\.com$/.test(host)) {
    if (/reactSettingsShowPlanning|algoliaConfig/i.test(html)) signals.push("RX Global show-planning application");
    if (/api\.reedexpo\.com/i.test(html)) signals.push("RX Global API origin referenced");
    return {platform:"rx_global",confidence:signals.length?"high":"medium",signals,adapterStatus:"inspection_only"};
  }
  if (/mapyourshow\.com|mapyourshow/i.test(html+" "+host)) return {platform:"mapyourshow",confidence:"high",signals:["MapYourShow platform reference"],adapterStatus:"needs_integration"};
  if (/expoplatform\.com|expoplatform/i.test(html+" "+host)) return {platform:"expoplatform",confidence:"high",signals:["ExpoPlatform reference"],adapterStatus:"needs_integration"};
  if (/<a\b[^>]*href/i.test(html) && /exhibitor/i.test(html)) return {platform:"static_html",confidence:"low",signals:["HTML links detected; company profile verification still required"],adapterStatus:"static_reader_available"};
  return {platform:"unknown",confidence:"low",signals:[],adapterStatus:"needs_integration"};
}
