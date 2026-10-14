"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/db";

type Exhibitor = {
  company_name: string;
  country: string;
  hall: string;
  stand: string;
  profile_url: string;
};

type EnrichedExhibitor = Exhibitor & {
  website: string;
  description: string;
  evidence?: {stand_status:string;stand_candidates:{value:string;context:string;source_url:string}[];source_url:string};
  checked_at?: string;
};

export default function ExhibitorReviewPreview({
  exhibitionId
}: {
  exhibitionId: string;
}) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

const [importedNames, setImportedNames] = useState<string[]>([]);
const [checkingImported, setCheckingImported] = useState(false);
const [importRefresh, setImportRefresh] = useState(0);
useEffect(() => {
  let cancelled = false;

  async function loadImported() {
    setImportedNames([]);
    if (!exhibitionId) return;

    setCheckingImported(true);

    try {
      const { data, error } = await db()
        .from("exhibitors")
        .select("company_name")
        .eq("exhibition_id", exhibitionId)
        .order("company_name")
        .limit(1000);

      if (error) throw error;

      if (!cancelled) {
        setImportedNames(
          (data || []).map(item =>
            item.company_name.toLowerCase().trim()
          )
        );
      }
    } catch (error) {
      console.error("Could not load imported exhibitors:", error);
    } finally {
      if (!cancelled) setCheckingImported(false);
    }
  }

  loadImported();

  return () => {
    cancelled = true;
  };
}, [exhibitionId, importRefresh]);

const [reading, setReading] = useState(false);

const [enriching, setEnriching] = useState<number | null>(null);

const [bulkEnriching, setBulkEnriching] = useState(false);
const [bulkProgress, setBulkProgress] = useState("");
const [showEnrichedDetails, setShowEnrichedDetails] = useState(false);
const [approvedProfiles, setApprovedProfiles] = useState<number[]>([]);
const [enrichMessage, setEnrichMessage] = useState("");

const [reviewNotes, setReviewNotes] = useState<Record<number,string>>({});
const [savingEvidence, setSavingEvidence] = useState<number | null>(null);
const [evidenceMessages, setEvidenceMessages] = useState<Record<number,string>>({});

async function saveEvidence(index: number) {
  const profile = enrichedProfiles[index];
  if (!profile || !exhibitionId) return;
  setSavingEvidence(index);
  setEvidenceMessages(previous => ({...previous, [index]: ""}));
  try {
    const client = db();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error("Please sign in first.");
    const { data: exhibition, error: exhibitionError } = await client
      .from("exhibitions").select("name,edition_year").eq("id", exhibitionId)
      .eq("owner_id", user.id).single();
    if (exhibitionError || !exhibition) throw new Error("Exhibition could not be verified.");
    const notes = reviewNotes[index] || "";
    const source = profile.profile_url;
    const status = profile.evidence?.stand_status === "conflicting_requires_review"
      ? "conflicting" : "pending_review";
    const records = (["company_name","country","hall","stand","website","description"] as const)
      .map(field => ({
        user_id: user.id,
        exhibition_name: exhibition.name,
        exhibition_year: Number(exhibition.edition_year),
        company_name: profile.company_name,
        profile_url: source,
        field_name: field,
        extracted_value: profile[field] || null,
        source_url: source,
        evidence_text: field === "stand"
          ? (profile.evidence?.stand_candidates || []).map(c => c.value + " [" + c.context + "]").join("; ").slice(0, 4000)
          : field === "website" ? (profile.website ? "Website link extracted from exhibitor profile" : "No labeled company website found") : null,
        verification_status: field === "stand" ? status : profile[field] ? "pending_review" : "not_found",
        reviewer_notes: notes || null,
        checked_at: profile.checked_at || new Date().toISOString()
      }));
    const { error } = await client.from("helio_research_evidence").insert(records);
    if (error) throw error;
    setEvidenceMessages(previous => ({...previous,[index]: "Saved 6 field evidence records in Supabase. Status remains unverified pending review."}));
  } catch (error) {
    setEvidenceMessages(previous => ({...previous,[index]: error instanceof Error ? error.message : "Could not save evidence."}));
  } finally {
    setSavingEvidence(null);
  }
}


const [enrichedProfiles, setEnrichedProfiles] = useState<
  Record<number, EnrichedExhibitor>
>({});

async function enrichProfile(index: number) {
  const exhibitor = rows[index];
setApprovedProfiles(previous =>
  previous.filter(i => i !== index)
);
  if (!exhibitor?.profile_url) {
    setEnrichMessage("This exhibitor has no profile URL.");
    return;
  }

  setEnriching(index);
  setEnrichMessage("");

  try {
    const { data: { session } } = await db().auth.getSession();

    if (!session) {
      throw new Error("Please sign in first.");
    }

    const response = await fetch("/api/exhibitors/enrich-profiles", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        exhibitionId,
        profileUrl: exhibitor.profile_url
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Profile enrichment failed.");
    }

    const profile = result.profile;

    if (!profile) {
      throw new Error("No profile information returned.");
    }

setEnrichedProfiles(previous => ({
  ...previous,
  [index]: {
    company_name: exhibitor.company_name,
    country: profile.country || exhibitor.country,
    hall: profile.hall || exhibitor.hall,
    stand: profile.stand || "",
    profile_url: exhibitor.profile_url,
    website: profile.website || "",
    description: profile.description || "",
    evidence: profile.evidence,
    checked_at: new Date().toISOString()
  }
}));

    const details = [
      `Company: ${profile.company_name || exhibitor.company_name}`,
      `Country: ${profile.country || "Not available"}`,
      `Hall: ${profile.hall || "Not available"}`,
      `Stand: ${profile.stand || "Not available"}`,
      `Website: ${profile.website || "Not available"}`,
      `Description: ${profile.description || "Not available"}`,
      `Stand evidence status: ${profile.evidence?.stand_status || "Not provided"}`,
      `Stand evidence: ${(profile.evidence?.stand_candidates || []).map((x: {value:string;context:string}) => x.value + " [" + x.context + "]").join("; ") || "None found"}`,
      `Source: ${profile.profile_url || exhibitor.profile_url}`
    ];

    setEnrichMessage(details.join("\n"));
  } catch (error) {
    setEnrichMessage(
      error instanceof Error ? error.message : "Enrichment failed."
    );
  } finally {
    setEnriching(null);
  }
}

const [importing, setImporting] = useState(false);
const [importMessage, setImportMessage] = useState("");

async function importSelected() {
  if (importing) return;
if (!showEnrichedDetails) {
  setImportMessage(
    "Please open Review Enriched Companies and check the company details before importing."
  );
  return;
}
  const approved = selected
      .filter(index =>
    !duplicates[index] &&
    !importedNames.includes(
      rows[index].company_name.toLowerCase().trim()
    ) &&
    enrichedProfiles[index] !== undefined &&
enrichedProfiles[index].profile_url === rows[index].profile_url &&
approvedProfiles.includes(index)
  )
    .map(index => ({
      ...rows[index],
      ...enrichedProfiles[index]
    }))
    .filter(item => item.company_name && item.profile_url);

  if (approved.length === 0) {
    setImportMessage(
  "Please enrich the selected companies before importing. " +
  "Only companies with matching enriched profiles can be approved."
);
    return;
  }

  if (approved.length > 50) {
    setImportMessage("Select no more than 50 exhibitors per import.");
    return;
  }

  if (!window.confirm(
    `Import ${approved.length} selected exhibitors into HELIO? ` +
    "Existing records will not be overwritten. " +
    "Directory listings are not confirmed current participants."
  )) return;

  setImporting(true);
  setImportMessage("");

  try {
    const { data: { session } } = await db().auth.getSession();

    if (!session) {
      throw new Error("Please sign in first.");
    }

    const response = await fetch("/api/exhibitors/import-approved", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        exhibitionId,
        exhibitors: approved
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Import failed.");
    }

    setImportMessage(
      `Imported: ${result.imported} | ` +
      `Skipped duplicates: ${result.skipped} | ` +
      `Errors: ${result.errors?.length || 0}` +
      (result.errors?.length
        ? `\n${result.errors.join("\n")}`
        : "")
    );
setImportRefresh(previous => previous + 1);
    setSelected([]);
  } catch (error) {
    setImportMessage(
      error instanceof Error ? error.message : "Import failed."
    );
  } finally {
    setImporting(false);
  }
}

async function bulkEnrichSelected() {
  if (bulkEnriching || enriching !== null) return;

  const indexes = selected.filter(index =>
    rows[index]?.profile_url &&
    !duplicates[index] &&
    !importedNames.includes(
      rows[index].company_name.toLowerCase().trim()
    )
  );
setApprovedProfiles(previous =>
  previous.filter(index => !indexes.includes(index))
);
  if (indexes.length === 0) {
    setBulkProgress("Select exhibitors that have not been imported.");
    return;
  }

  setBulkEnriching(true);
  setBulkProgress(`Preparing to enrich ${indexes.length} exhibitors...`);

  let completed = 0;
  let failed = 0;

  try {
    const { data: { session } } = await db().auth.getSession();

    if (!session) throw new Error("Please sign in first.");

    for (const index of indexes) {
      const exhibitor = rows[index];

      try {
        const response = await fetch("/api/exhibitors/enrich-profiles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            exhibitionId,
            profileUrl: exhibitor.profile_url
          })
        });

        const result = await response.json();

        if (!response.ok || !result.profile) {
          throw new Error(result.error || "Enrichment failed");
        }

        const profile = result.profile;

        setEnrichedProfiles(previous => ({
          ...previous,
          [index]: {
            company_name: exhibitor.company_name,
            country: profile.country || exhibitor.country,
            hall: profile.hall || exhibitor.hall,
            stand: profile.stand || "",
            profile_url: exhibitor.profile_url,
            website: profile.website || "",
            description: profile.description || "",
            evidence: profile.evidence,
            checked_at: new Date().toISOString()
          }
        }));

        completed++;
      } catch (error) {
        console.error("Bulk enrichment failed:", error);
        failed++;
      }

      setBulkProgress(
        `Processed: ${completed + failed}/${indexes.length} | ` +
        `Enriched: ${completed} | Failed: ${failed}`
      );
    }
  } catch (error) {
    setBulkProgress(
      error instanceof Error ? error.message : "Bulk enrichment failed."
    );
  } finally {
    setBulkEnriching(false);
  }
}

const [readMessage, setReadMessage] = useState("");

async function readDirectory() {
  setReading(true);
  setReadMessage("");

  try {

    if (!exhibitionId) {
      throw new Error("No exhibition ID supplied to the preview.");
    }

    const { data: { session } } = await db().auth.getSession();

    if (!session) {
      throw new Error("Please sign in first.");
    }

    const response = await fetch("/api/exhibitors/preview-directory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ exhibitionId })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Directory reading failed.");
    }

    const exhibitors = result.exhibitors || [];

    const lines = [
      "company_name\tcountry\thall\tstand\tprofile_url",
      ...exhibitors.map((e: {
        company_name: string;
        country: string;
        hall: string;
        stand: string;
        profile_url: string;
      }) => [
        e.company_name,
        e.country,
        e.hall,
        e.stand,
        e.profile_url
      ].map(value => String(value || "").replace(/[\t\r\n]/g, " ")).join("\t"))
    ];

    setInput(lines.join("\n"));
setSelected([]);
setEnrichedProfiles({});
setEnrichMessage("");
setBulkProgress("");

setEnrichedProfiles({});
setEnrichMessage("");
setBulkProgress("");

setEnrichedProfiles({});
setEnrichMessage("");
setBulkProgress("");
setShowEnrichedDetails(false);
setShowEnrichedDetails(false);
setApprovedProfiles([]);
    setReadMessage(`${exhibitors.length} candidate exhibitors found. Review before importing.`);
  } catch (error) {
    setReadMessage(error instanceof Error ? error.message : "Reading failed.");
  } finally {
    setReading(false);
  }
}

  const rows = useMemo(() => {
    const lines = input.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [] as Exhibitor[];

    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const cells = lines.map(line =>
      line.split(delimiter).map(v => v.trim())
    );

    const fields = ["company_name", "country", "hall", "stand", "profile_url"];
    const header = cells[0].map(v => v.toLowerCase());
    const hasHeader = header.includes("company_name");
    const names = hasHeader ? header : fields;

    return cells.slice(hasHeader ? 1 : 0, 501).map(row => {
      const get = (name: string) => row[names.indexOf(name)] || "";
      return {
        company_name: get("company_name"),
        country: get("country"),
        hall: get("hall"),
        stand: get("stand"),
        profile_url: get("profile_url")
      };
    }).filter(row => row.company_name);
  }, [input]);

  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    return rows.map(row => {
      const key = row.company_name.toLowerCase().trim();
      const duplicate = seen.has(key);
      seen.add(key);
      return duplicate;
    });
  }, [rows]);

  const visible = rows
    .map((row, index) => ({ ...row, index }))
    .filter(row => row.company_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section style={{ marginTop: 24, padding: 20, border: "1px solid #ccc", borderRadius: 12 }}>
      <h2>Exhibitor Review Workspace — v2.2</h2>
<button type="button" onClick={readDirectory} disabled={
  reading ||
  bulkEnriching ||
  importing ||
  enriching !== null
}>
  {reading ? "Reading directory..." : "Read Official Directory"}
</button>

<p role="status">{readMessage}</p>
      <p>Paste tab-separated or simple CSV exhibitor records to preview them before importing.</p>

      <textarea
        value={input}
disabled={bulkEnriching || importing || reading || enriching !== null}
        onChange={e => {
  setInput(e.target.value);
  setSelected([]);
  setEnrichedProfiles({});
  setReviewNotes({});
  setEnrichMessage("");
  setBulkProgress("");
setApprovedProfiles([]);
}}
        placeholder={"company_name\tcountry\thall\tstand\tprofile_url"}
        rows={6}
        style={{ width: "100%", padding: 10 }}
      />

      <p>
        <strong>{rows.length}</strong> exhibitors found |
        <strong> {duplicates.filter(Boolean).length}</strong> duplicate names |
        <strong> {selected.length}</strong> selected
      </p>

      <input
        placeholder="Search company..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: 10, marginBottom: 12 }}
      />

<div style={{ marginBottom: 16 }}>
  <button
    type="button"
    onClick={bulkEnrichSelected}
    disabled={
      bulkEnriching ||
      enriching !== null ||
      importing ||
      reading ||
      checkingImported ||
      selected.length === 0
    }
    style={{
      padding: "12px 20px",
      fontWeight: 600,
      marginRight: 12
    }}
  >
    {bulkEnriching
      ? "Enriching Selected..."
      : `Bulk Enrich Selected (${selected.length})`}
  </button>

  <p role="status">{bulkProgress}</p>

<button
  type="button"
  onClick={() => setShowEnrichedDetails(previous => !previous)}
  disabled={Object.keys(enrichedProfiles).length === 0}
  style={{ padding: "10px 16px", marginTop: 8 }}
>
  {showEnrichedDetails
    ? "Hide Enriched Company Details"
    : `Review Enriched Companies (${Object.keys(enrichedProfiles).length})`}
</button>

{showEnrichedDetails && (
  <div style={{ marginTop: 16 }}>
    <h3>Enriched Company Details — Review Before Import</h3>

    {Object.entries(enrichedProfiles).map(([index, profile]) => (
      <div
        key={index}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          marginBottom: 12
        }}
      >
        <p><strong>Company:</strong> {profile.company_name}</p>

<label
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    fontWeight: 600
  }}
>
  <input
    type="checkbox"
    checked={approvedProfiles.includes(Number(index))}
    disabled={bulkEnriching || importing}
    onChange={e => {
      const companyIndex = Number(index);

      setApprovedProfiles(previous =>
        e.target.checked
          ? [...previous.filter(i => i !== companyIndex), companyIndex]
          : previous.filter(i => i !== companyIndex)
      );
    }}
  />
  I have reviewed and approved this company's details
</label>

        <div style={{ padding: 12, border: "1px solid #bbb", borderRadius: 8, marginBottom: 12 }}>
          <h4>Company Verification Centre</h4>
          <p><strong>Evidence status:</strong> {profile.evidence?.stand_status || "No stand evidence provided"}</p>
          <p><strong>Checked:</strong> {profile.checked_at ? new Date(profile.checked_at).toLocaleString() : "Not recorded"}</p>
          {(profile.evidence?.stand_candidates || []).map((candidate, i) => (
            <p key={i} style={{ overflowWrap: "anywhere" }}>
              <strong>Candidate:</strong> {candidate.value} — {candidate.context}
              {" "}<a href={candidate.source_url} target="_blank" rel="noopener noreferrer">Official source</a>
            </p>
          ))}
          <p><a href={profile.profile_url} target="_blank" rel="noopener noreferrer">Open official exhibitor profile for manual verification</a></p>
          <label>Verified stand (enter only after checking official evidence)
            <input value={profile.stand} onChange={e => {
              const value = e.target.value.toUpperCase().trim();
              setEnrichedProfiles(previous => ({...previous, [Number(index)]: {...previous[Number(index)], stand:value}}));
              setApprovedProfiles(previous => previous.filter(i => i !== Number(index)));
            }} style={{display:"block",padding:8,marginTop:4}} placeholder="Leave blank if unverified" />
          </label>
          <label>Review notes / conflicting evidence
            <textarea rows={2} value={reviewNotes[Number(index)] || ""} onChange={e => setReviewNotes(previous => ({...previous,[Number(index)]:e.target.value}))} style={{display:"block",width:"100%",padding:8,marginTop:4}} />
          </label>
          <button type="button" disabled={savingEvidence !== null || bulkEnriching || importing} onClick={() => saveEvidence(Number(index))}>
            {savingEvidence === Number(index) ? "Saving evidence..." : "Save Research Evidence to Supabase"}
          </button>
          <p role="status">{evidenceMessages[Number(index)] || ""}</p>
          <p><small>Save stores a timestamped evidence snapshot and notes, not an approved or verified result. Manual corrections and approvals remain in this review session; importing exhibitors is a separate action.</small></p>
        </div>
        <p><strong>Country:</strong> {profile.country || "Not available"}</p>
        <p><strong>Hall:</strong> {profile.hall || "Not available"}</p>
        <p><strong>Stand:</strong> {profile.stand || "Not available"}</p>
        <p><strong>Website:</strong> {profile.website || "Not available"}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>
          <strong>Description:</strong> {profile.description || "Not available"}
        </p>
        <p style={{ overflowWrap: "anywhere" }}>
          <strong>Source:</strong> {profile.profile_url || "Not available"}
        </p>
      </div>
    ))}
  </div>
)}

</div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Select</th>
              <th>Company</th>
              <th>Country</th>
              <th>Hall</th>
              <th>Stand</th>
              <th>Source</th>
              <th>Action</th>
<th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, 100).map(row => (
              <tr key={row.index}>
                <td>
                  <input
                    type="checkbox"
                    
disabled={
  checkingImported ||
  duplicates[row.index] ||
  importedNames.includes(row.company_name.toLowerCase().trim())
}

                    checked={selected.includes(row.index)}
                    onChange={e => setSelected(old =>
                      e.target.checked
                        ? [...old, row.index]
                        : old.filter(i => i !== row.index)
                    )}
                  />
                </td>
                <td>{row.company_name}</td>
                <td>{row.country || "—"}</td>
                <td>{row.hall || "—"}</td>
                <td>{row.stand || "—"}</td>
                <td>
                  {/^https:\/\//i.test(row.profile_url)
                    ? <a href={row.profile_url} target="_blank" rel="noopener noreferrer">View</a>
                    : "—"}
                </td>
                <td>
  <button
    type="button"
    disabled={enriching !== null || !row.profile_url}
    onClick={() => enrichProfile(row.index)}
  >
    {enriching === row.index ? "Reading..." : "Enrich Profile"}
  </button>
</td>

<td>
  {checkingImported
    ? "Checking..."
    : duplicates[row.index]
      ? "Duplicate"
      : importedNames.includes(row.company_name.toLowerCase().trim())
        ? "Already Imported"
       : enrichedProfiles[row.index]?.profile_url === row.profile_url
  ? approvedProfiles.includes(row.index)
    ? "Approved for Import"
    : "Ready for Approval"
  : "Ready for Enrichment"}
</td>

              </tr>
            ))}
          </tbody>
        </table>
      </div>
{enrichMessage && (
  <div style={{ marginTop: 16, padding: 12, border: "1px solid #ccc", borderRadius: 8 }}>
    <h3>Exhibitor Profile Details</h3>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {enrichMessage}
    </pre>
  </div>
)}
      
<div style={{ marginTop: 20 }}>
  <button
    type="button"
    onClick={importSelected}
    
disabled={
  importing ||
  bulkEnriching ||
  reading ||
  enriching !== null ||
  checkingImported ||
  selected.length === 0
}
    style={{ padding: "12px 20px", fontWeight: 600 }}
  >
    {importing ? "Importing..." : `Approve & Import Selected (${selected.length})`}
  </button>

  <pre role="status" style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
    {importMessage}
  </pre>

  <p>
    Only selected exhibitors are submitted. Existing records are not
    overwritten. Directory listings are not confirmed current participants.
  </p>
</div>

    </section>
  );
}
