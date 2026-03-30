
import { ChangeEvent, ReactNode, useMemo, useState } from 'react';
import { samplePayload } from './samplePayload';

type JsonRecord = Record<string, unknown>;

type ValidationResponse = {
  status: string;
  summary: { totalRules: number; passed: number; failed: number; warnings: number };
  resolvedMappings?: JsonRecord;
  mappingSources?: JsonRecord;
  normalizedClaim?: JsonRecord;
  normalizedPolicy?: JsonRecord;
  ruleEngineContext?: JsonRecord;
  issues?: Array<Record<string, unknown>>;
  ruleResults?: Array<Record<string, unknown>>;
  matchedContext?: Array<Record<string, unknown>>;
  ingestion?: Record<string, unknown>;
};

type WorkspaceView = 'review' | 'audit' | 'rules' | 'reports';
type DetailTab = 'claim' | 'policy' | 'mappings' | 'rules';
type InputMode = 'json' | 'pdf';
type DocumentBuckets = Record<string, File[]>;

type AuditEntry = {
  id: string; createdAt: string; patientName: string; policyNumber: string;
  claimReference: string; status: string; failed: number; warnings: number;
  totalRules: number; inferredMappings: number; result: ValidationResponse;
};

type RuleGuide = { id: string; name: string; description: string; sourceLabel: string; action: string; severity: string };

const pretty = (v: unknown): string => JSON.stringify(v, null, 2);
const parseJson = (v: string): JsonRecord => JSON.parse(v) as JsonRecord;
const readFileAsText = async (f: File): Promise<string> => f.text();

const STATUS_META: Record<string, { label: string; tone: 'high' | 'medium' | 'low'; title: string; summary: string; nextStep: string }> = {
  REJECTION_RISK: { label: 'Rejection Risk', tone: 'high', title: 'This claim needs correction before submission', summary: 'At least one important policy check failed. The claim may be rejected unless the flagged items are corrected or justified.', nextStep: 'Review the blocking items first, correct data if needed, and re-run the check before submission.' },
  REVIEW_REQUIRED: { label: 'Review Required', tone: 'medium', title: 'This claim can move forward after a manual review', summary: 'There are no confirmed rejection blocks, but some items still need a person to verify them before approval.', nextStep: 'Review the warning items, confirm the medical and billing details, then proceed if they are expected.' },
  CLEARED: { label: 'Cleared', tone: 'low', title: 'This claim looks ready for the next step', summary: 'The current checks did not find blocking policy issues. The claim appears ready for submission or internal processing.', nextStep: 'Proceed with your normal submission flow and keep this result as a review record.' },
};

const BUILT_IN_RULES: RuleGuide[] = [
  { id: 'room_rent_limit', name: 'Room Rent Limit', description: 'Checks whether the billed room rent is higher than the room rent allowed by the policy.', sourceLabel: 'Claim room rent vs policy room rent limit', action: 'Verify the hospital room category and policy entitlement before submission.', severity: 'Blocks approval' },
  { id: 'coverage_rule', name: 'Treatment Coverage', description: 'Checks whether the treatment or diagnosis appears in the policy coverage list.', sourceLabel: 'Claim treatment name vs covered treatments', action: 'Verify diagnosis coding and policy coverage before moving ahead.', severity: 'Blocks approval' },
  { id: 'waiting_period_rule', name: 'Waiting Period', description: 'Checks whether the policy has been active long enough for this treatment to be eligible.', sourceLabel: 'Policy age vs waiting period months', action: 'Confirm policy start date and whether the treatment is exempt from waiting period rules.', severity: 'Blocks approval' },
  { id: 'duplicate_charge_rule', name: 'Duplicate Charge Detection', description: 'Checks whether the same billing item appears more than once and may need manual review.', sourceLabel: 'Billing items in the claim', action: 'Inspect hospital line items and remove repeated or accidental duplicates.', severity: 'Needs review' },
];

const demoHistory = (): AuditEntry[] => [
  { id: 'demo-1', createdAt: '2026-03-20T09:15:00.000Z', patientName: 'Baby Rupal Tyagi', policyNumber: '34436826202501', claimReference: 'CFR260208003', status: 'REJECTION_RISK', failed: 2, warnings: 1, totalRules: 6, inferredMappings: 5, result: { status: 'REJECTION_RISK', summary: { totalRules: 6, passed: 3, failed: 2, warnings: 1 } } },
  { id: 'demo-2', createdAt: '2026-03-18T12:45:00.000Z', patientName: 'Aman Gupta', policyNumber: 'POL-782341', claimReference: 'CLM-221045', status: 'REVIEW_REQUIRED', failed: 0, warnings: 2, totalRules: 5, inferredMappings: 4, result: { status: 'REVIEW_REQUIRED', summary: { totalRules: 5, passed: 3, failed: 0, warnings: 2 } } },
];

export default function App() {
  const [claimJson, setClaimJson] = useState(pretty(samplePayload.claim));
  const [policyJson, setPolicyJson] = useState(pretty(samplePayload.policy));
  const [claimInputMode, setClaimInputMode] = useState<InputMode>('json');
  const [policyInputMode, setPolicyInputMode] = useState<InputMode>('json');
  const [claimPdfFiles, setClaimPdfFiles] = useState<File[]>([]);
  const [policyPdfFiles, setPolicyPdfFiles] = useState<File[]>([]);
  const [claimPdfBuckets, setClaimPdfBuckets] = useState<DocumentBuckets>({
    claimFinalBill: [],
    claimDischargeSummary: [],
    claimItemizedBill: [],
    claimClaimForm: [],
    claimPrescription: [],
    claimInvestigationReport: [],
    claimDocument: []
  });
  const [policyPdfBuckets, setPolicyPdfBuckets] = useState<DocumentBuckets>({
    policyCertificate: [],
    policySchedule: [],
    policyWording: [],
    policyDocument: []
  });
  const [result, setResult] = useState<ValidationResponse | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeView, setActiveView] = useState<WorkspaceView>('review');
  const [activeTab, setActiveTab] = useState<DetailTab>('claim');
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>(demoHistory);
  const [selectedAuditId, setSelectedAuditId] = useState(demoHistory()[0]?.id ?? '');

  const parsedPolicy = useMemo(() => { try { return parseJson(policyJson); } catch { return null; } }, [policyJson]);
  const topIssues = result?.issues ?? [];
  const statusMeta = STATUS_META[result?.status ?? 'CLEARED'];
  const currentAudit = auditHistory.find(e => e.id === selectedAuditId) ?? auditHistory[0] ?? null;
  const previousAudit = currentAudit ? auditHistory.find(e => e.id !== currentAudit.id) ?? null : null;

  const historySummary = useMemo(() => {
    const total = auditHistory.length;
    return { total, blocked: auditHistory.filter(e => e.status === 'REJECTION_RISK').length, review: auditHistory.filter(e => e.status === 'REVIEW_REQUIRED').length, cleared: auditHistory.filter(e => e.status === 'CLEARED').length, inferredAverage: total === 0 ? 0 : Math.round(auditHistory.reduce((s, e) => s + e.inferredMappings, 0) / total) };
  }, [auditHistory]);

  const reportSummary = useMemo(() => {
    const m = new Map<string, number>();
    auditHistory.forEach(e => (e.result.issues ?? []).forEach(i => { const k = String(i.rule ?? 'unknown'); m.set(k, (m.get(k) ?? 0) + 1); }));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { openActions: auditHistory.reduce((s, e) => s + e.failed + e.warnings, 0), topRule: top ? fmtRuleName(top[0]) : 'No repeated issue yet', topRuleCount: top?.[1] ?? 0 };
  }, [auditHistory]);

  const customRules = useMemo(() => { const r = parsedPolicy?.customRules; return Array.isArray(r) ? r as Array<Record<string, unknown>> : []; }, [parsedPolicy]);

  const handleFileUpload = (target: 'claim' | 'policy') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const text = await readFileAsText(file);
    if (target === 'claim') setClaimJson(text); else setPolicyJson(text);
  };

  const handleClaimPdfUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setClaimPdfFiles(files);
    if (files.length > 0) {
      setClaimInputMode('pdf');
    }
  };

  const handlePolicyPdfUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPolicyPdfFiles(files);
    if (files.length > 0) {
      setPolicyInputMode('pdf');
    }
  };

  const handleBucketUpload = (bucket: string, side: 'claim' | 'policy') => (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (side === 'claim') {
      setClaimPdfBuckets((prev) => ({ ...prev, [bucket]: files }));
      if (files.length > 0) {
        setClaimInputMode('pdf');
      }
    } else {
      setPolicyPdfBuckets((prev) => ({ ...prev, [bucket]: files }));
      if (files.length > 0) {
        setPolicyInputMode('pdf');
      }
    }
  };

  const loadSamples = () => { setClaimJson(pretty(samplePayload.claim)); setPolicyJson(pretty(samplePayload.policy)); setClaimInputMode('json'); setPolicyInputMode('json'); setClaimPdfFiles([]); setPolicyPdfFiles([]); setClaimPdfBuckets({ claimFinalBill: [], claimDischargeSummary: [], claimItemizedBill: [], claimClaimForm: [], claimPrescription: [], claimInvestigationReport: [], claimDocument: [] }); setPolicyPdfBuckets({ policyCertificate: [], policySchedule: [], policyWording: [], policyDocument: [] }); setError(''); setResult(null); setActiveView('review'); };
  const clearWorkspace = () => { setClaimJson(''); setPolicyJson(''); setClaimPdfFiles([]); setPolicyPdfFiles([]); setClaimPdfBuckets({ claimFinalBill: [], claimDischargeSummary: [], claimItemizedBill: [], claimClaimForm: [], claimPrescription: [], claimInvestigationReport: [], claimDocument: [] }); setPolicyPdfBuckets({ policyCertificate: [], policySchedule: [], policyWording: [], policyDocument: [] }); setError(''); setResult(null); };

  const handleSubmit = async () => {
    setError(''); setResult(null);
    setIsSubmitting(true);
    try {
      let res: Response;
      if (claimInputMode === 'pdf' || policyInputMode === 'pdf') {
        const claimAllFiles = [...claimPdfFiles, ...Object.values(claimPdfBuckets).flat()];
        const policyAllFiles = [...policyPdfFiles, ...Object.values(policyPdfBuckets).flat()];
        if (claimInputMode === 'pdf' && claimAllFiles.length === 0) {
          setError('Upload a claim PDF before running verification.');
          setIsSubmitting(false);
          return;
        }
        if (policyInputMode === 'pdf' && policyAllFiles.length === 0) {
          setError('Upload a policy PDF before running verification.');
          setIsSubmitting(false);
          return;
        }
        const formData = new FormData();
        if (claimInputMode === 'pdf' && claimPdfFiles.length > 0) {
          claimPdfFiles.forEach((file) => formData.append('claimDocument', file));
        }
        Object.entries(claimPdfBuckets).forEach(([bucket, files]) => files.forEach((file) => formData.append(bucket, file)));
        if (claimInputMode !== 'pdf') {
          formData.append('claimJson', claimJson);
        }
        if (policyInputMode === 'pdf' && policyPdfFiles.length > 0) {
          policyPdfFiles.forEach((file) => formData.append('policyDocument', file));
        }
        Object.entries(policyPdfBuckets).forEach(([bucket, files]) => files.forEach((file) => formData.append(bucket, file)));
        if (policyInputMode !== 'pdf') {
          formData.append('policyJson', policyJson);
        }
        res = await fetch('/validate-claim/document', { method: 'POST', body: formData });
      } else {
        let policy: JsonRecord;
        try { policy = parseJson(policyJson); }
        catch (e) { setError(`Invalid policy JSON: ${String((e as Error).message)}`); setIsSubmitting(false); return; }
        let claim: JsonRecord;
        try { claim = parseJson(claimJson); }
        catch (e) { setError(`Invalid claim JSON: ${String((e as Error).message)}`); setIsSubmitting(false); return; }
        res = await fetch('/validate-claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claim, policy }) });
      }

      const data = await res.json() as ValidationResponse | { message?: string };
      if (!res.ok) { setError(typeof data === 'object' && 'message' in data ? `Service error: ${pretty(data.message)}` : `Failed: ${res.status}`); return; }
      const r = data as ValidationResponse;
      setResult(r);
      const entry: AuditEntry = { id: `run-${Date.now()}`, createdAt: new Date().toISOString(), patientName: sv(rn(r.normalizedClaim, 'patient.name')), policyNumber: sv(rn(r.normalizedPolicy, 'policyNumber')), claimReference: sv(rn(r.normalizedClaim, 'claimReference')) !== '—' ? sv(rn(r.normalizedClaim, 'claimReference')) : sv(rn(r.normalizedClaim, 'metadata.caseId')), status: r.status, failed: r.summary.failed, warnings: r.summary.warnings, totalRules: r.summary.totalRules, inferredMappings: Object.keys(r.resolvedMappings ?? {}).length, result: r };
      setAuditHistory(prev => [entry, ...prev]);
      setSelectedAuditId(entry.id);
    } catch (e) { setError(`Cannot reach service. ${(e as Error).message}`); }
    finally { setIsSubmitting(false); }
  };

  const navItems = [
    { id: 'review' as WorkspaceView, label: 'Claim Review', sub: 'Upload, validate, interpret', icon: <svg viewBox="0 0 18 18" fill="none"><path d="M4 5h10M4 8.5h7M4 12h9M4 15h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    { id: 'audit' as WorkspaceView, label: 'Audit History', sub: 'Review past runs', icon: <svg viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M9 6v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg> },
    { id: 'rules' as WorkspaceView, label: 'Policy Rules', sub: 'Understand decisions', icon: <svg viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { id: 'reports' as WorkspaceView, label: 'Reports', sub: 'Track trends & risks', icon: <svg viewBox="0 0 18 18" fill="none"><path d="M3 13l4-4 3 3 4-5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><svg viewBox="0 0 26 26" fill="none"><rect x="10" y="2" width="6" height="22" rx="3" fill="currentColor"/><rect x="2" y="10" width="22" height="6" rx="3" fill="currentColor"/></svg></div>
          <div><div className="brand-name">ClaimGuard</div><div className="brand-sub">Medical claims review</div></div>
        </div>

        <div className="nav-section-label">Workspace</div>
        <nav className="nav">
          {navItems.map(item => (
            <button key={item.id} type="button" className={`nav-btn ${activeView === item.id ? 'active' : ''}`} onClick={() => setActiveView(item.id)}>
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-text"><span className="nav-label">{item.label}</span><span className="nav-sub">{item.sub}</span></span>
            </button>
          ))}
        </nav>

        <div className="sidebar-info">
          <div className="si-icon"><svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 6v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg></div>
          <div><strong>Built for operations teams</strong><p>Non-technical reviewers can understand claim risk without reading raw JSON.</p></div>
        </div>

        <div className="sidebar-user">
          <div className="user-ava">OT</div>
          <div><div className="user-name">Ops Team</div><div className="user-role">Claims Reviewer</div></div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="topbar-crumb">{navItems.find(n => n.id === activeView)?.label}</div>
            <h1 className="topbar-title">{getTitle(activeView)}</h1>
            <p className="topbar-desc">{getDesc(activeView)}</p>
          </div>
          <div className="topbar-actions">
            <button className="btn-ghost" onClick={loadSamples}>Load Demo</button>
            <button className="btn-ghost" onClick={clearWorkspace}>Clear</button>
            <button className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? <><span className="spin" />Reviewing…</> : <>
                <svg viewBox="0 0 14 14" fill="none" style={{width:14,height:14,flexShrink:0}}><path d="M2 7h10M8 4l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Run Verification
              </>}
            </button>
          </div>
        </header>

        <div className="content">
          {activeView === 'review' && <ReviewView {...{claimJson, policyJson, claimInputMode, policyInputMode, claimPdfFiles, policyPdfFiles, claimPdfBuckets, policyPdfBuckets, result, error, topIssues, statusMeta, activeTab, setActiveTab, onClaimChange: setClaimJson, onPolicyChange: setPolicyJson, onClaimUpload: handleFileUpload('claim'), onPolicyUpload: handleFileUpload('policy'), onClaimPdfUpload: handleClaimPdfUpload, onPolicyPdfUpload: handlePolicyPdfUpload, onClaimBucketUpload: (bucket: string) => handleBucketUpload(bucket, 'claim'), onPolicyBucketUpload: (bucket: string) => handleBucketUpload(bucket, 'policy'), onClaimInputModeChange: setClaimInputMode, onPolicyInputModeChange: setPolicyInputMode}} />}
          {activeView === 'audit' && <AuditView {...{history: auditHistory, summary: historySummary, selectedId: selectedAuditId, onSelect: setSelectedAuditId, currentAudit, previousAudit}} />}
          {activeView === 'rules' && <RulesView builtInRules={BUILT_IN_RULES} customRules={customRules} resolvedMappings={result?.resolvedMappings} />}
          {activeView === 'reports' && <ReportsView history={auditHistory} summary={historySummary} reportSummary={reportSummary} />}
        </div>
      </div>
    </div>
  );
}

/* ── Review ── */
function ReviewView({ claimJson, policyJson, claimInputMode, policyInputMode, claimPdfFiles, policyPdfFiles, claimPdfBuckets, policyPdfBuckets, result, error, topIssues, statusMeta, activeTab, setActiveTab, onClaimChange, onPolicyChange, onClaimUpload, onPolicyUpload, onClaimPdfUpload, onPolicyPdfUpload, onClaimBucketUpload, onPolicyBucketUpload, onClaimInputModeChange, onPolicyInputModeChange }: {
  claimJson: string; policyJson: string; claimInputMode: InputMode; policyInputMode: InputMode; claimPdfFiles: File[]; policyPdfFiles: File[]; claimPdfBuckets: DocumentBuckets; policyPdfBuckets: DocumentBuckets; result: ValidationResponse | null; error: string;
  topIssues: Array<Record<string, unknown>>; statusMeta: (typeof STATUS_META)[string];
  activeTab: DetailTab; setActiveTab: (t: DetailTab) => void;
  onClaimChange: (v: string) => void; onPolicyChange: (v: string) => void;
  onClaimUpload: (e: ChangeEvent<HTMLInputElement>) => void; onPolicyUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onClaimPdfUpload: (e: ChangeEvent<HTMLInputElement>) => void; onPolicyPdfUpload: (e: ChangeEvent<HTMLInputElement>) => void; onClaimBucketUpload: (bucket: string) => (e: ChangeEvent<HTMLInputElement>) => void; onPolicyBucketUpload: (bucket: string) => (e: ChangeEvent<HTMLInputElement>) => void; onClaimInputModeChange: (v: InputMode) => void; onPolicyInputModeChange: (v: InputMode) => void;
}) {
  return (
    <div className="stack">
      <div className="card how-card">
        <div className="how-title">4-step review flow</div>
        <div className="how-steps">
          {[{n:'01',t:'Add claim JSON or PDF',b:'Use structured JSON or upload a claim PDF for extraction and parsing.'},{n:'02',t:'Paste policy JSON',b:'Insurer policy with coverage, limits and optional custom rules.'},{n:'03',t:'Run verification',b:'System extracts text, parses fields, normalises data, and checks every policy rule.'},{n:'04',t:'Take action',b:'Read the risk report and recommended next step.'}].map(s => (
            <div className="how-step" key={s.n}><div className="how-num">{s.n}</div><div><strong>{s.t}</strong><p>{s.b}</p></div></div>
          ))}
        </div>
      </div>

      <div className="upload-grid">
        <UploadCard title="Patient Claim" kicker="Step 01" sub="Hospital discharge summary, reimbursement JSON, or claim PDF"
          icon={<svg viewBox="0 0 20 20" fill="none"><path d="M5 17h10a2 2 0 002-2V7l-4-4H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="currentColor" strokeWidth="1.4"/><path d="M11 3v5h5M7 11h6M7 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>}
          value={claimJson} onChange={onClaimChange} onFile={onClaimUpload} placeholder="Paste raw claim JSON…"
          mode={claimInputMode} onModeChange={onClaimInputModeChange} onPdfFile={onClaimPdfUpload} pdfFiles={claimPdfFiles} pdfLabel="Upload uncategorized claim PDFs">
          <DocumentBucketGrid
            title="Claim document buckets"
            buckets={[
              { key: 'claimDischargeSummary', label: 'Discharge summary' },
              { key: 'claimFinalBill', label: 'Final bill' },
              { key: 'claimItemizedBill', label: 'Itemized bill' },
              { key: 'claimClaimForm', label: 'Claim form' },
              { key: 'claimPrescription', label: 'Prescription' },
              { key: 'claimInvestigationReport', label: 'Investigation report' }
            ]}
            files={claimPdfBuckets}
            onUpload={onClaimBucketUpload}
          />
        </UploadCard>
        <UploadCard title="Insurance Policy" kicker="Step 02" sub="Policy benefits, limits and optional custom rules"
          icon={<svg viewBox="0 0 20 20" fill="none"><path d="M10 3l7 3.5v4.5c0 4-3 7.2-7 8-4-0.8-7-4-7-8V6.5L10 3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          value={policyJson} onChange={onPolicyChange} onFile={onPolicyUpload} placeholder="Paste raw policy JSON…"
          mode={policyInputMode} onModeChange={onPolicyInputModeChange} onPdfFile={onPolicyPdfUpload} pdfFiles={policyPdfFiles} pdfLabel="Upload uncategorized policy PDFs">
          <DocumentBucketGrid
            title="Policy document buckets"
            buckets={[
              { key: 'policyCertificate', label: 'Policy certificate' },
              { key: 'policySchedule', label: 'Policy schedule' },
              { key: 'policyWording', label: 'Policy wording' }
            ]}
            files={policyPdfBuckets}
            onUpload={onPolicyBucketUpload}
          />
        </UploadCard>
      </div>

      {error && (
        <div className="err-bar">
          <svg viewBox="0 0 18 18" fill="none" style={{width:18,height:18,flexShrink:0}}><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M9 6v3M9 12h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <div><strong>Verification failed</strong><p>{error}</p></div>
        </div>
      )}

      {result ? (<>
        <div className={`status-banner sb-${statusMeta.tone}`}>
          <div className="sb-main">
            <span className={`status-pill sp-${statusMeta.tone}`}>{statusMeta.label}</span>
            <h2>{statusMeta.title}</h2>
            <p>{statusMeta.summary}</p>
          </div>
          <div className="sb-next">
            <div className="next-label"><svg viewBox="0 0 12 12" fill="none" style={{width:12,height:12}}><path d="M1 6h10M7 3l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Recommended next step</div>
            <p>{statusMeta.nextStep}</p>
          </div>
        </div>

        <div className="metrics-grid">
          {[{v:result.summary.totalRules,l:'Checks run',t:'neutral',i:'◈'},{v:result.summary.passed,l:'Passed',t:'low',i:'✓'},{v:result.summary.failed,l:'Blocking',t:'high',i:'✕'},{v:result.summary.warnings,l:'Warnings',t:'medium',i:'⚑'}].map(m => (
            <div className={`metric-card mc-${m.t}`} key={m.l}><div className="mc-icon">{m.i}</div><div className="mc-val">{m.v}</div><div className="mc-label">{m.l}</div></div>
          ))}
        </div>

        <div className="insight-grid">
          <div className="card p16">
            <SHead title="Issues requiring action" sub="Check these before submitting the claim" />
            <div className="issue-list">
              {topIssues.length > 0 ? topIssues.map((issue, i) => <IssueCard key={`${issue.rule}-${i}`} issue={issue} />) : (
                <div className="empty-ok"><span>✓</span><strong>No issues found</strong><p>All checks passed for this claim.</p></div>
              )}
            </div>
          </div>
          <div className="card p16">
            <SHead title="Normalised patient summary" sub="Standardised view after data mapping" />
            <SlLabel text="Patient" />
            <dl className="dl"><SRow label="Name" value={sv(rn(result.normalizedClaim,'patient.name'))} /><SRow label="Age" value={sv(rn(result.normalizedClaim,'patient.age'))} /><SRow label="Gender" value={sv(rn(result.normalizedClaim,'patient.gender'))} /></dl>
            <SlLabel text="Treatment" />
            <dl className="dl"><SRow label="Diagnosis" value={sv(rn(result.normalizedClaim,'treatment.name'))} /><SRow label="Est. cost" value={fmtINR(rn(result.normalizedClaim,'treatment.estimatedCost'))} /></dl>
            <SlLabel text="Billing" />
            <dl className="dl"><SRow label="Room rent" value={fmtINR(rn(result.normalizedClaim,'billing.roomRent'))} /><SRow label="Total amount" value={fmtINR(rn(result.normalizedClaim,'billing.totalAmount'))} bold /><SRow label="Policy no." value={sv(rn(result.normalizedPolicy,'policyNumber'))} /></dl>
          </div>
        </div>

          <div className="card p16">
            <SHead title="Technical details" sub="For operations review, QA, or investigation" />
            {result.ingestion ? (
              <div className="ingestion-card">
                <div className="ingestion-title">Document ingestion summary</div>
                <p>
                  Claim source: <strong>{sv(result.ingestion.claimSource ?? result.ingestion.sourceType)}</strong>
                  {' '}• Policy source: <strong>{sv(result.ingestion.policySource ?? 'json')}</strong>
                  {' '}• Claim extractor: <strong>{sv(result.ingestion.claimExtractor ?? result.ingestion.extractor)}</strong>
                  {' '}• Policy extractor: <strong>{sv(result.ingestion.policyExtractor)}</strong>
                </p>
                <p>
                  Claim PDFs merged: <strong>{sv(result.ingestion.claimMergedFileCount ?? (result.ingestion.claimMerged ? 1 : 0))}</strong>
                  {' '}• Policy PDFs merged: <strong>{sv(result.ingestion.policyMergedFileCount ?? (result.ingestion.policyMerged ? 1 : 0))}</strong>
                </p>
                {Array.isArray(result.ingestion.claimMergedFilenames) || Array.isArray(result.ingestion.policyMergedFilenames) ? (
                  <p>
                    Claim files: <strong>{fmtFileList(result.ingestion.claimMergedFilenames)}</strong>
                    {' '}• Policy files: <strong>{fmtFileList(result.ingestion.policyMergedFilenames)}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}
            {result.ingestion?.rawParsedClaimPreview || result.ingestion?.rawParsedPolicyPreview ? (
              <div className="two-col mb1">
                <CBlock
                  title="Raw OCR claim JSON"
                  sub="Generic OCR-normalized claim structure before mapping"
                  content={pretty(result.ingestion?.rawParsedClaimPreview ?? {})}
                />
                <CBlock
                  title="Raw OCR policy JSON"
                  sub="Generic OCR-normalized policy structure before mapping"
                  content={pretty(result.ingestion?.rawParsedPolicyPreview ?? {})}
                />
              </div>
            ) : null}
            {result.ingestion?.canonicalClaimPreview || result.ingestion?.canonicalPolicyPreview ? (
              <div className="two-col mb1">
                <CBlock
                  title="Mapped claim JSON"
                  sub="Canonical claim JSON sent into the rule engine"
                  content={pretty(result.ingestion?.canonicalClaimPreview ?? {})}
                />
                <CBlock
                  title="Mapped policy JSON"
                  sub="Canonical policy JSON sent into the rule engine"
                  content={pretty(result.ingestion?.canonicalPolicyPreview ?? {})}
                />
              </div>
            ) : null}
            {result.ruleEngineContext ? (
              <div className="mb1">
                <CBlock
                  title="Rule engine context"
                  sub="Canonical fields stored and evaluated by the stricter rule engine"
                  content={pretty(result.ruleEngineContext)}
                />
              </div>
            ) : null}
            <div className="tab-bar">
            {(['claim','policy','mappings','rules'] as DetailTab[]).map(t => (
              <button key={t} type="button" className={`tab-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
                {{claim:'Claim JSON',policy:'Policy JSON',mappings:'Field Mappings',rules:'Rule Log'}[t]}
              </button>
            ))}
          </div>
          {activeTab === 'claim' && <pre>{pretty(result.normalizedClaim ?? {})}</pre>}
          {activeTab === 'policy' && <pre>{pretty(result.normalizedPolicy ?? {})}</pre>}
          {activeTab === 'mappings' && <div className="two-col"><CBlock title="Resolved mappings" sub="Field paths used" content={pretty(result.resolvedMappings ?? {})} /><CBlock title="Mapping sources" sub="Inferred vs explicit" content={pretty(result.mappingSources ?? {})} /></div>}
          {activeTab === 'rules' && <div className="two-col"><CBlock title="All rule results" sub="Complete backend output" content={pretty(result.ruleResults ?? [])} /><CBlock title="Matched context" sub="Claim-policy overlaps" content={pretty(result.matchedContext ?? [])} /></div>}
        </div>
      </>) : !error && (
        <div className="card empty-card"><div className="empty-ico"><svg viewBox="0 0 48 48" fill="none"><rect x="7" y="7" width="34" height="34" rx="7" stroke="currentColor" strokeWidth="1.5"/><path d="M24 17v14M17 24h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></div><h3>No claim reviewed yet</h3><p>Add claim and policy JSON above, then click <strong>Run Verification</strong>.</p></div>
      )}
    </div>
  );
}

/* ── Audit ── */
function AuditView({ history, summary, selectedId, onSelect, currentAudit, previousAudit }: {
  history: AuditEntry[]; summary: { total: number; blocked: number; review: number; cleared: number; inferredAverage: number };
  selectedId: string; onSelect: (id: string) => void; currentAudit: AuditEntry | null; previousAudit: AuditEntry | null;
}) {
  return (
    <div className="stack">
      <div className="metrics-grid">
        {[{v:summary.total,l:'Total reviewed',t:'neutral',i:'◈'},{v:summary.blocked,l:'High-risk',t:'high',i:'✕'},{v:summary.review,l:'Needs review',t:'medium',i:'⚑'},{v:summary.cleared,l:'Cleared',t:'low',i:'✓'}].map(m => (
          <div className={`metric-card mc-${m.t}`} key={m.l}><div className="mc-icon">{m.i}</div><div className="mc-val">{m.v}</div><div className="mc-label">{m.l}</div></div>
        ))}
      </div>
      <div className="audit-layout">
        <div className="card p16">
          <SHead title="Audit timeline" sub="All runs, most recent first" />
          <div className="history-list">
            {history.map(e => (
              <button key={e.id} type="button" className={`history-item ${e.id === selectedId ? 'hi-active' : ''}`} onClick={() => onSelect(e.id)}>
                <div className="hi-top"><strong>{e.patientName}</strong><span className={`badge t-${getTone(e.status)}`}>{fmtStatus(e.status)}</span></div>
                <div className="hi-ref">{e.claimReference}</div>
                <div className="hi-meta">{fmtDate(e.createdAt)} · {e.failed} blocked · {e.warnings} warnings</div>
              </button>
            ))}
          </div>
        </div>
        <div className="card p16">
          {currentAudit ? (<>
            <SHead title="Selected audit record" sub="Summary of this review run" />
            <div className="info-grid">
              {[['Patient',currentAudit.patientName],['Claim ref',currentAudit.claimReference],['Policy no.',currentAudit.policyNumber],['Reviewed on',fmtDate(currentAudit.createdAt)],['Decision',fmtStatus(currentAudit.status)],['Avg mappings',`${summary.inferredAverage} per run`]].map(([l,v]) => (
                <div className="info-row" key={l}><span>{l}</span><strong>{v}</strong></div>
              ))}
            </div>
            <div className="delta-card">
              <div className="delta-label">Change from previous run</div>
              <p>{previousAudit ? buildDelta(currentAudit, previousAudit) : 'This is the only audit record available.'}</p>
            </div>
            <div className="two-col mt1">
              <CBlock title="Rule summary" sub="Counts from this run" content={pretty(currentAudit.result.summary)} />
              <CBlock title="Issue snapshot" sub="Issues recorded" content={pretty(currentAudit.result.issues ?? [])} />
            </div>
          </>) : <div className="empty-note"><strong>No audit records yet.</strong><p>Run a claim verification to create the first entry.</p></div>}
        </div>
      </div>
    </div>
  );
}

/* ── Rules ── */
function RulesView({ builtInRules, customRules, resolvedMappings }: { builtInRules: RuleGuide[]; customRules: Array<Record<string, unknown>>; resolvedMappings?: JsonRecord }) {
  return (
    <div className="stack">
      <div className="rules-layout">
        <div className="card p16">
          <SHead title="Built-in claim checks" sub="Standard checks applied to all policies" />
          <div className="rule-list">
            {builtInRules.map(r => (
              <div className="rule-card" key={r.id}>
                <div className="rule-top"><strong>{r.name}</strong><span className={`badge ${r.severity === 'Blocks approval' ? 't-high' : 't-medium'}`}>{r.severity}</span></div>
                <p>{r.description}</p>
                <div className="rule-src">Source: {r.sourceLabel}</div>
                <div className="rule-action">{r.action}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card p16">
          <SHead title="Custom policy rules" sub="Rules from the current policy JSON" />
          {customRules.length > 0 ? (
            <div className="rule-list">
              {customRules.map((r, i) => (
                <div className="rule-card" key={`${r.code}-${i}`}>
                  <div className="rule-top"><strong>{fmtRuleName(String(r.code ?? `rule_${i+1}`))}</strong><span className={`badge ${r.failureStatus === 'FAIL' ? 't-high' : 't-medium'}`}>{String(r.failureStatus ?? 'Custom')}</span></div>
                  <p>{String(r.message ?? 'No description.')}</p>
                  <div className="rule-src">Field: {String(r.field ?? 'N/A')}</div>
                  <div className="rule-action">Expected: {sv(r.expectedValue)}</div>
                </div>
              ))}
            </div>
          ) : <div className="empty-note"><strong>No custom rules found.</strong><p>Standard checks will still run.</p></div>}
        </div>
      </div>
      <div className="card p16">
        <SHead title="Current field mappings" sub="Where the engine found data for each check" />
        <pre>{pretty(resolvedMappings ?? {})}</pre>
      </div>
    </div>
  );
}

/* ── Reports ── */
function ReportsView({ history, summary, reportSummary }: { history: AuditEntry[]; summary: { total: number; blocked: number; review: number; cleared: number; inferredAverage: number }; reportSummary: { openActions: number; topRule: string; topRuleCount: number } }) {
  return (
    <div className="stack">
      <div className="card report-hero">
        <div><div className="kicker">Operational reporting</div><h2>Track recurring risks and where the team loses time.</h2><p>For operations leads, quality teams, and business users who need a quick view of overall claim health.</p></div>
        <div className="report-callout"><div className="rc-num">{reportSummary.openActions}</div><div className="rc-sub">Open actions across all runs</div></div>
      </div>

      <div className="metrics-grid">
        {[{v:summary.total,l:'Total audits',t:'neutral',i:'◈'},{v:summary.blocked,l:'Rejection risk',t:'high',i:'✕'},{v:summary.review,l:'Manual review',t:'medium',i:'⚑'},{v:summary.cleared,l:'Ready to submit',t:'low',i:'✓'}].map(m => (
          <div className={`metric-card mc-${m.t}`} key={m.l}><div className="mc-icon">{m.i}</div><div className="mc-val">{m.v}</div><div className="mc-label">{m.l}</div></div>
        ))}
      </div>

      <div className="report-cards">
        <div className="card p16"><SHead title="Most common issue" sub="Rule appearing most across audits" /><div className="rstat-val">{reportSummary.topRule}</div><div className="rstat-sub">{reportSummary.topRuleCount} audit run(s)</div></div>
        <div className="card p16"><SHead title="Mapping confidence" sub="Avg inferred fields per run" /><div className="rstat-val">{summary.inferredAverage}</div><div className="rstat-sub">Inferred mappings per run</div></div>
        <div className="card p16"><SHead title="Recommendation" sub="Based on current audit pattern" /><p className="rstat-rec">{summary.blocked > summary.cleared ? 'More claims are falling into rejection risk than clearance. Review policy mapping quality and top blocking rules first.' : 'Clearance volume is healthy. Focus next on reducing repeated warning-level reviews to improve processing speed.'}</p></div>
      </div>

      <div className="card p16">
        <SHead title="Audit report table" sub="For team leads, audit teams, and settlement reviewers" />
        <div className="report-table">
          <div className="rt-row rt-head"><span>Patient</span><span>Claim Ref</span><span>Status</span><span>Blocked</span><span>Warnings</span><span>Date</span></div>
          {history.map(e => (
            <div className="rt-row" key={e.id}><span>{e.patientName}</span><span>{e.claimReference}</span><span><span className={`badge t-${getTone(e.status)} sm`}>{fmtStatus(e.status)}</span></span><span>{e.failed}</span><span>{e.warnings}</span><span>{fmtDate(e.createdAt)}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Shared components ── */
function UploadCard({ title, kicker, sub, icon, value, onChange, onFile, placeholder, mode, onModeChange, onPdfFile, pdfFiles = [], pdfLabel = 'Upload PDFs', children }: { title: string; kicker: string; sub: string; icon: ReactNode; value: string; onChange: (v: string) => void; onFile: (e: ChangeEvent<HTMLInputElement>) => void; placeholder: string; mode?: InputMode; onModeChange?: (v: InputMode) => void; onPdfFile?: (e: ChangeEvent<HTMLInputElement>) => void; pdfFiles?: File[]; pdfLabel?: string; children?: ReactNode }) {
  const valid = isValidJson(value);
  const isPdfCard = Boolean(onModeChange);
  return (
    <div className="card upload-card">
      <div className="uc-head">
        <div className="uc-icon">{icon}</div>
        <div className="uc-meta"><div className="uc-kicker">{kicker}</div><div className="uc-title">{title}</div><div className="uc-sub">{sub}</div></div>
        <label className="btn-ghost file-btn"><svg viewBox="0 0 12 12" fill="none" style={{width:12,height:12}}><path d="M6 1v7M3 4l3-3 3 3M1 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>Upload<input type="file" accept=".json,application/json" onChange={onFile} /></label>
      </div>
      {isPdfCard ? (
        <div className="source-switch">
          <button type="button" className={`source-btn ${mode === 'json' ? 'active' : ''}`} onClick={() => onModeChange?.('json')}>Use JSON</button>
          <button type="button" className={`source-btn ${mode === 'pdf' ? 'active' : ''}`} onClick={() => onModeChange?.('pdf')}>Use PDF</button>
        </div>
      ) : null}
      {mode === 'pdf' && onPdfFile ? (
        <div className="pdf-panel">
          <label className="btn-ghost pdf-upload-btn">
            {pdfLabel}
            <input type="file" accept="application/pdf" multiple onChange={onPdfFile} />
          </label>
          <div className="pdf-file-state">
            {pdfFiles.length > 0 ? `Selected ${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''}` : 'No PDFs selected yet'}
          </div>
          {pdfFiles.length > 0 ? (
            <div className="pdf-file-list">
              {pdfFiles.map((file) => (
                <span className="pdf-file-chip" key={`${file.name}-${file.size}`}>{file.name}</span>
              ))}
            </div>
          ) : null}
          {children}
          <p className="pdf-help">If you upload multiple PDFs, the backend merges them into one claim or policy document before OCR and parsing.</p>
        </div>
      ) : (
        <>
          <textarea value={value} onChange={e => onChange(e.target.value)} spellCheck={false} placeholder={placeholder} />
          <div className="uc-foot"><span className={`jv ${value ? (valid ? 'ok' : 'err') : ''}`}>{value ? (valid ? '✓ Valid JSON' : '✕ Invalid JSON') : 'Awaiting input'}</span><span className="cc">{value.length} chars</span></div>
        </>
      )}
    </div>
  );
}

function DocumentBucketGrid({ title, buckets, files, onUpload }: { title: string; buckets: Array<{ key: string; label: string }>; files: DocumentBuckets; onUpload: (bucket: string) => (e: ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <div className="bucket-grid-wrap">
      <div className="bucket-grid-title">{title}</div>
      <div className="bucket-grid">
        {buckets.map((bucket) => {
          const bucketFiles = files[bucket.key] ?? [];
          return (
            <label className="bucket-card" key={bucket.key}>
              <span className="bucket-label">{bucket.label}</span>
              <span className="bucket-meta">{bucketFiles.length > 0 ? `${bucketFiles.length} file${bucketFiles.length > 1 ? 's' : ''}` : 'No file selected'}</span>
              <input type="file" accept="application/pdf" multiple onChange={onUpload(bucket.key)} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: Record<string, unknown> }) {
  const status = String(issue.status ?? '');
  const tone = status === 'FAIL' ? 'high' : 'medium';
  return (
    <div className={`issue-card ic-${tone}`}>
      <div className="ic-top"><div><span className={`badge t-${tone} sm`}>{status === 'FAIL' ? 'Blocking' : 'Warning'}</span><strong>{fmtRuleName(String(issue.rule ?? 'Unknown'))}</strong></div><span className={`ic-tag t-${tone}`}>{status}</span></div>
      <p>{String(issue.message ?? 'No explanation available.')}</p>
      <div className="ic-field">Field: <code>{String(issue.field ?? 'N/A')}</code></div>
    </div>
  );
}

function SHead({ title, sub }: { title: string; sub: string }) {
  return <div className="shead"><h3>{title}</h3><p>{sub}</p></div>;
}

function SlLabel({ text }: { text: string }) {
  return <div className="sl-label">{text}</div>;
}

function SRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <><dt>{label}</dt><dd className={bold ? 'bold' : ''}>{value}</dd></>;
}

function CBlock({ title, sub, content }: { title: string; sub: string; content: string }) {
  return <div className="cblock"><div className="cb-head"><strong>{title}</strong><span>{sub}</span></div><pre>{content}</pre></div>;
}

/* ── Helpers ── */
function rn(v: unknown, path: string): unknown {
  if (!v || typeof v !== 'object') return undefined;
  return path.split('.').reduce<unknown>((c, s) => { if (!c || typeof c !== 'object') return undefined; return (c as Record<string, unknown>)[s]; }, v);
}
function fmtINR(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
function sv(v: unknown): string { if (v === null || v === undefined || v === '') return '—'; return String(v); }
function fmtFileList(v: unknown): string {
  return Array.isArray(v) && v.length > 0 ? v.map((item) => String(item)).join(', ') : '—';
}
function fmtRuleName(v: string): string { return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function getTone(s: string): string { if (['REJECTION_RISK','FAIL'].includes(s)) return 'high'; if (['REVIEW_REQUIRED','WARNING'].includes(s)) return 'medium'; if (['CLEARED','PASS'].includes(s)) return 'low'; return 'neutral'; }
function fmtStatus(s: string): string { return s.replace(/_/g, ' '); }
function fmtDate(v: string): string { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)); }
function buildDelta(c: AuditEntry, p: AuditEntry): string { if (c.status !== p.status) return `Decision changed from ${fmtStatus(p.status)} to ${fmtStatus(c.status)}.`; if (c.failed !== p.failed) return `Blocking issues changed from ${p.failed} to ${c.failed}.`; if (c.warnings !== p.warnings) return `Warning count changed from ${p.warnings} to ${c.warnings}.`; return 'Same overall profile as the previous audit record.'; }
function isValidJson(s: string): boolean { if (!s.trim()) return false; try { JSON.parse(s); return true; } catch { return false; } }
function getTitle(v: WorkspaceView) { return {review:'Claim review workspace',audit:'Audit history & review trail',rules:'Policy rule guide',reports:'Operational reports'}[v]; }
function getDesc(v: WorkspaceView) { return {review:'Upload claim and policy JSON to get a plain-language eligibility report.',audit:'Review past verification runs, compare outcomes, and explain what changed.',rules:'Understand what the engine checks and what action to take when a rule fails.',reports:'Track risk trends, audit workload, and the most common causes of review or rejection.'}[v]; }
