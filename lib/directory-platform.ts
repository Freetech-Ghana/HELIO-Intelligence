import { platformFingerprint, type PlatformKey } from "./directory-platform-registry";

export type DirectoryPlatform = PlatformKey;
export type DirectoryDetection = {
  platform:DirectoryPlatform;
  confidence:"high"|"medium"|"low";
  signals:string[];
  adapterStatus:"inspection_only"|"static_reader_available"|"needs_integration";
  readerKind?:"verified_api"|"public_html"|"browser_rendered"|"manual_review";
  paginationStrategy?:string;
  verificationRequirement?:string;
};

export function detectDirectoryPlatform(sourceUrl:string,html:string):DirectoryDetection {
  const match=platformFingerprint(sourceUrl,html);
  if(match) return {
    platform:match.definition.key,
    confidence:match.confidence,
    signals:match.signals,
    adapterStatus:match.definition.key==="rx_global"?"inspection_only":"needs_integration",
    readerKind:match.definition.reader,
    paginationStrategy:match.definition.pagination,
    verificationRequirement:match.definition.verification
  };
  if (/<a\b[^>]*href/i.test(html) && /exhibitor/i.test(html)) return {
    platform:"static_html",confidence:"low",
    signals:["HTML exhibitor links detected; profiles require review"],
    adapterStatus:"static_reader_available",readerKind:"public_html",
    paginationStrategy:"html_links",
    verificationRequirement:"Confirm directory edition and exhibitor participation."
  };
  return {platform:"unknown",confidence:"low",signals:[],
    adapterStatus:"needs_integration",readerKind:"manual_review",
    paginationStrategy:"unknown",verificationRequirement:"Identify the official directory and its edition."};
}
