import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startLogin } from "@/const";
import { scrollToDashboardSection, type DashboardSectionId } from "@/lib/dashboardNavigation";
import { filterFinanceTransactions, filterVaultMetadata, isContentMutationPending, transactionPageWindow, vaultMetadataPayload } from "@/lib/dashboardMutation";
import { isProductionSiteHostname } from "@/lib/dashboardEnvironment";
import { environmentSwitchTarget, hasDashboardDraft } from "@/lib/environmentControls";
import { buildMiloFinancePdfHtml } from "@/lib/financePdf";
import { financeDelta, previousFinanceReportReference } from "@/lib/financeComparison";
import { Tooltip as UITooltip, TooltipContent as UITooltipContent, TooltipTrigger as UITooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdminGovernancePanelStandard, FinancialAssistantPanel, TransactionManagerPanel } from "@/components/FinancialManagementPanels";
import { FinanceAccountManagerPanel, FinanceAccountSwitcher, type FinanceAccountRecord } from "@/components/FinanceAccountPanels";
import { FinanceSettingsPanel } from "@/components/FinanceSettingsPanel";
import { canSubmitReminderDraft, clearedReminderDraft, normalizedReminderTitle, reminderDueAtFromBangkokInput } from "@/lib/reminderDraft";
import { trpc } from "@/lib/trpc";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  BellRing,
  BrainCircuit,
  Download,
  Copy,
  Check,
  Clock3,
  ShieldCheck,
  ArrowRightLeft,
  WalletCards,
  Repeat2,
  Table2,
  Bot,
  CheckCircle2,
  ChevronRight,
  FileArchive,
  FileText,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Plus,
  Pencil,
  Save,
  ReceiptText,
  Search,
  Settings,
  TrendingDown,
  TrendingUp,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });
const PRODUCTION_DASHBOARD_URL = "https://miloassist-suwp6bg2.manus.space/dashboard";
const PREVIEW_DASHBOARD_URL = "https://3000-i5wzpmy7nribffa3plzdi-532f5123.us3.manus.computer/dashboard";

const navigation: Array<{ id: DashboardSectionId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "ภาพรวม", icon: LayoutDashboard },
  { id: "analysis", label: "วิเคราะห์การเงิน", icon: BarChart3 },
  { id: "budgets", label: "หมวด / งบประมาณ", icon: WalletCards },
  { id: "transactions", label: "รายการธุรกรรม", icon: Table2 },
  { id: "recurring", label: "การเตือนประจำ", icon: Repeat2 },
  { id: "vault", label: "คลังไฟล์", icon: FileArchive },
  { id: "tasks", label: "โน้ตและงาน", icon: ListTodo },
  { id: "groups", label: "กลุ่ม LINE", icon: UsersRound },
  { id: "export", label: "ส่งออกข้อมูล", icon: Download },
];

type ScopedFinanceSummary = { income: number; expense: number; balance: number; openingBalance?: number; availableBalance?: number; categories: Record<string, number> };
type VaultMetadataItem = { id: number; title: string; tagsText: string | null; sourceUrl: string | null };

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const overview = trpc.milo.overview.useQuery(undefined, { enabled: isAuthenticated });
  const [activeFinanceAccountId, setActiveFinanceAccountId] = useState<number | undefined>();
  const [transactionPage, setTransactionPage] = useState(0);
  const [transactionSearch, setTransactionSearch] = useState("");
  const financeScopeInput = useMemo(() => activeFinanceAccountId ? { financeAccountId: activeFinanceAccountId } : undefined, [activeFinanceAccountId]);
  const transactions = trpc.milo.finance.transactions.useQuery(financeScopeInput, { enabled: Boolean(overview.data?.lineUserId) });
  const [lineUserId, setLineUserId] = useState("");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<DashboardSectionId>("overview");
  const [showAdminProfile, setShowAdminProfile] = useState(false);

  const handleLogout = () => {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {}
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success("ออกจากระบบเรียบร้อยแล้ว");
        window.location.reload();
      },
      onError: () => {
        window.location.reload();
      },
    });
  };
  const [schedulerError, setSchedulerError] = useState("");
  const [isEditingLineLink, setIsEditingLineLink] = useState(false);
  const [completingTodoId, setCompletingTodoId] = useState<number | null>(null);
  const [updatingVaultId, setUpdatingVaultId] = useState<number | null>(null);
  const [vaultEditor, setVaultEditor] = useState<VaultMetadataItem | null>(null);
  const [pendingEnvironmentUrl, setPendingEnvironmentUrl] = useState<string | null>(null);
  const [isPreviewFading, setIsPreviewFading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const reportInput = useMemo(() => ({ period: reportPeriod, financeAccountId: activeFinanceAccountId }), [reportPeriod, activeFinanceAccountId]);
  const financeReport = trpc.milo.finance.report.useQuery(reportInput, { enabled: Boolean(overview.data?.lineUserId) });
  const financeSummary = trpc.milo.finance.summary.useQuery(financeScopeInput, { enabled: Boolean(overview.data?.lineUserId) && Boolean(activeFinanceAccountId) });
  const financeAnalytics = trpc.milo.finance.analytics.useQuery(financeScopeInput, { enabled: Boolean(overview.data?.lineUserId) && Boolean(activeFinanceAccountId) });
  const financeBudgets = trpc.milo.finance.budgets.useQuery(financeScopeInput, { enabled: Boolean(overview.data?.lineUserId) && Boolean(activeFinanceAccountId) });
  const isProductionSite = typeof window !== "undefined" && isProductionSiteHostname(window.location.hostname);
  const lastPublishedLabel = typeof document !== "undefined" && document.lastModified && !Number.isNaN(new Date(document.lastModified).getTime()) ? dateTime.format(new Date(document.lastModified)) : "กำลังตรวจสอบ";
  const hasUnsavedChanges = hasDashboardDraft({ reminderTitle, reminderTime, isEditingLineLink, lineUserId });
  const navigateEnvironment = (target: string) => { if (!isProductionSite) { setIsPreviewFading(true); window.setTimeout(() => window.location.assign(target), 180); } else window.location.assign(target); };
  const switchEnvironment = () => { const target = environmentSwitchTarget(isProductionSite, PREVIEW_DASHBOARD_URL, PRODUCTION_DASHBOARD_URL); if (hasUnsavedChanges) setPendingEnvironmentUrl(target); else navigateEnvironment(target); };
  useEffect(() => { setTransactionPage(0); }, [activeFinanceAccountId, transactionSearch]);

  const link = trpc.milo.linkLineAccount.useMutation({
    onSuccess: () => { setIsEditingLineLink(false); setLineUserId(""); toast.success("เชื่อมบัญชี LINE แล้ว"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const createReminder = trpc.milo.reminders.create.useMutation({
    onSuccess: () => { const draft = clearedReminderDraft(); setReminderTitle(draft.title); setReminderTime(draft.time); toast.success("สร้างรายการเตือนแล้ว"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const completeTodo = trpc.milo.todos.complete.useMutation({
    onMutate: input => setCompletingTodoId(input.id),
    onSuccess: () => { toast.success("ทำงานเสร็จแล้ว"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
    onSettled: () => setCompletingTodoId(null),
  });
  const deleteReminder = trpc.milo.reminders.delete.useMutation({
    onSuccess: () => { toast.success("ลบรายการเตือนแล้ว"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const updateVault = trpc.milo.vault.updateMetadata.useMutation({
    onMutate: input => setUpdatingVaultId(input.id),
    onSuccess: () => { toast.success("อัปเดตคลังแล้ว"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
    onSettled: () => setUpdatingVaultId(null),
  });
  const setupScheduler = trpc.milo.automation.setupReminderDelivery.useMutation({
    onSuccess: result => { setSchedulerError(""); toast.success(`ตั้ง scheduler แล้ว (${result.status})`); },
    onError: error => { setSchedulerError(error.message); toast.error(error.message); },
  });
  const runDueNow = trpc.milo.automation.runDueNow.useMutation({
    onSuccess: result => { toast.success(result.sent ? `ส่ง reminder แล้ว ${result.sent} รายการ` : "ยังไม่มี reminder ที่ถึงเวลา"); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });

  const canSaveAndSwitch = Boolean((isEditingLineLink && lineUserId.trim()) || canSubmitReminderDraft(reminderTitle) && reminderTime);
  const saveAndSwitch = () => {
    if (!pendingEnvironmentUrl) return;
    const target = pendingEnvironmentUrl;
    if (isEditingLineLink && lineUserId.trim()) {
      link.mutate({ lineUserId: lineUserId.trim() }, { onSuccess: () => navigateEnvironment(target) });
      return;
    }
    if (canSubmitReminderDraft(reminderTitle) && reminderTime) {
      createReminder.mutate({ title: normalizedReminderTitle(reminderTitle), dueAt: reminderDueAtFromBangkokInput(reminderTime) }, { onSuccess: () => navigateEnvironment(target) });
    }
  };

  const goTo = (id: DashboardSectionId) => {
    setActiveSection(id);
    scrollToDashboardSection(id);
  };

  if (!user) return <LoginGate loading={loading} />;
  if (overview.error) return <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />;
  if (!overview.data) return <LoadingState />;

  const data = overview.data;
  const isLinked = Boolean(data.lineUserId);
  const financeAccounts = (data.financeAccounts ?? []) as FinanceAccountRecord[];
  const activeFinanceAccount = activeFinanceAccountId ? financeAccounts.find(item => item.account.id === activeFinanceAccountId) : financeAccounts.find(item => item.account.accountType === "personal");
  const scopedFinance: ScopedFinanceSummary = activeFinanceAccountId ? (financeSummary.data ?? { income: 0, expense: 0, balance: 0, openingBalance: 0, availableBalance: 0, categories: {} }) : data.finance as ScopedFinanceSummary;
  const scopedAnalytics = activeFinanceAccountId ? (financeAnalytics.data ?? { daily: [], transactionCount: 0, sevenDayIncome: 0, sevenDayExpense: 0 }) : data.financeAnalytics;
  const scopedBudgets = activeFinanceAccountId ? (financeBudgets.data ?? []) : data.budgets;
  const contentMutationPending = isContentMutationPending(completeTodo.isPending, updateVault.isPending);
  const vaultItemsForManagement = data.vault.filter(item => !search || `${item.title} ${item.searchableText ?? ""}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8);
  const shownVault: typeof vaultItemsForManagement = [];
  const allScopedTransactions = transactions.data ?? [];
  const filteredTransactions = filterFinanceTransactions(allScopedTransactions, transactionSearch);
  const transactionPageSize = 20;
  const transactionWindow = transactionPageWindow(filteredTransactions.length, transactionPage, transactionPageSize);
  const transactionPageCount = transactionWindow.pageCount;
  const safeTransactionPage = transactionWindow.page;
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#d8ede8] bg-[#f5fcfa]/90 px-5 py-4 backdrop-blur lg:px-9">
        <div>
          <button
            type="button"
            onClick={() => setShowAdminProfile(true)}
            className="group flex items-center gap-1.5 text-xs font-semibold text-[#187e67] hover:underline"
            title="คลิกเพื่อจัดการโปรไฟล์ Admin"
          >
            <UserCog className="size-3.5 text-[#187e67] transition-transform group-hover:scale-110" />
            <span>สวัสดี, {user.name || "ผู้ดูแลระบบ (Admin)"}</span>
          </button>
          <h1 className="font-display text-xl font-semibold">ภาพรวมของคุณ</h1>
        </div>
        <div className="flex items-center gap-2.5">
          <FinanceAccountSwitcher accounts={financeAccounts} financeAccountId={activeFinanceAccountId} onChange={setActiveFinanceAccountId} />
          <EnvironmentBadge isProduction={isProductionSite} onSwitch={switchEnvironment} />
          <PublishHistoryPopover lastPublishedLabel={lastPublishedLabel} />
          <Button
            variant="outline"
            onClick={() => setShowAdminProfile(true)}
            className="hidden rounded-xl border-[#bce2d7] bg-[#eefaf5] text-xs font-semibold text-[#187e67] hover:bg-[#e2f5ee] sm:inline-flex items-center gap-1.5 h-9"
          >
            <UserCog className="size-3.5" />
            โปรไฟล์ Admin
          </Button>
          <Link href="/">
            <Button variant="outline" className="hidden rounded-xl border-[#d2e9e3] bg-white text-[#548078] sm:inline-flex text-xs h-9">
              หน้าแรก
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="rounded-xl border-[#f5d3cc] bg-white text-xs font-semibold text-[#c04b3b] hover:bg-[#fff5f3] inline-flex items-center gap-1.5 h-9"
            title="ออกจากระบบ"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
          <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${isLinked ? "bg-[#dff8e9] text-[#1b886e]" : "bg-[#fff1dd] text-[#b47732]"}`}>
            {isLinked ? "เชื่อม LINE แล้ว" : "รอเชื่อม LINE"}
          </span>
          {isLinked && (
            <button
              type="button"
              onClick={() => setIsEditingLineLink(true)}
              className="grid size-8 place-items-center rounded-lg border border-[#d2e9e3] bg-white text-[#548078] transition-colors hover:bg-[#edf8f4]"
              aria-label="แก้ไขบัญชี LINE"
              title="แก้ไขบัญชี LINE"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </header>
  return <div className={`relative min-h-screen bg-[#f5fcfa] text-[#245851] ${!isProductionSite ? "preview-surface" : ""}`}>
    {!isProductionSite && <div className={`preview-frame-overlay pointer-events-none fixed inset-2 z-40 rounded-[1.25rem] border-2 border-[#e7ad43]/45 shadow-[inset_0_0_0_9999px_rgba(255,205,108,.035),0_0_0_5px_rgba(231,173,67,.08)] ${isPreviewFading ? "preview-frame-fade-out" : ""}`} aria-hidden="true" />}
    <aside className="fixed inset-y-0 hidden w-64 flex-col border-r border-[#d6ece6] bg-white p-5 lg:flex">
      <Link href="/" className="flex items-center gap-2.5"><BotBadge /><span className="font-display text-xl font-semibold">ไมโล</span></Link>
      <p className="mt-1 pl-12 text-xs text-[#8aa9a4]">แดชบอร์ดจัดการชีวิต</p>
      <DashboardNavigation active={activeSection} onNavigate={goTo} className="mt-10" />
      <SchedulerCard isAdmin={user.role === "admin"} isProduction={isProductionSite} pending={setupScheduler.isPending || runDueNow.isPending} error={schedulerError} onSetup={() => setupScheduler.mutate()} onRunDue={() => runDueNow.mutate()} />
      <button onClick={logout} className="mt-5 flex items-center gap-2 text-sm text-[#7e9e98] transition-colors hover:text-[#bb5969]"><LogOut className="size-4" />ออกจากระบบ</button>
    </aside>

    <main className="relative lg:ml-64" aria-busy={contentMutationPending}>
      {contentMutationPending && <div role="status" aria-live="polite" className="absolute inset-0 z-30 grid min-h-full place-items-start bg-[#f5fcfa]/55 pt-24 text-sm font-medium text-[#2b876f] backdrop-blur-[1px]">กำลังบันทึกข้อมูล...</div>}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#d8ede8] bg-[#f5fcfa]/90 px-5 py-4 backdrop-blur lg:px-9">
        <div><p className="text-xs text-[#7c9b95]">สวัสดี, {user.name || "ผู้ใช้ไมโล"}</p><h1 className="font-display text-xl font-semibold">ภาพรวมของคุณ</h1></div>
        <div className="flex items-center gap-2.5"><FinanceAccountSwitcher accounts={financeAccounts} financeAccountId={activeFinanceAccountId} onChange={setActiveFinanceAccountId} /><EnvironmentBadge isProduction={isProductionSite} onSwitch={switchEnvironment} /><PublishHistoryPopover lastPublishedLabel={lastPublishedLabel} /><Link href="/"><Button variant="outline" className="hidden rounded-xl border-[#d2e9e3] bg-white text-[#548078] sm:inline-flex">หน้าแรก</Button></Link><span className={`rounded-full px-3 py-1.5 text-xs font-medium ${isLinked ? "bg-[#dff8e9] text-[#1b886e]" : "bg-[#fff1dd] text-[#b47732]"}`}>{isLinked ? "เชื่อม LINE แล้ว" : "รอเชื่อม LINE"}</span>{isLinked && <button type="button" onClick={() => setIsEditingLineLink(true)} className="grid size-8 place-items-center rounded-lg border border-[#d2e9e3] bg-white text-[#548078] transition-colors hover:bg-[#edf8f4]" aria-label="แก้ไขบัญชี LINE" title="แก้ไขบัญชี LINE"><Pencil className="size-3.5" /></button>}</div>
      </header>
      {!isProductionSite && <PreviewBanner />}
      {isLinked && <div className="border-b border-[#d8ede8] bg-white px-4 py-2 md:hidden"><FinanceAccountSwitcher accounts={financeAccounts} financeAccountId={activeFinanceAccountId} onChange={setActiveFinanceAccountId} mobile /></div>}
      <div className="border-b border-[#d8ede8] bg-white px-4 py-3 lg:hidden">
        <DashboardNavigation active={activeSection} onNavigate={goTo} mobile />
        {user.role === "admin" && <SchedulerCard mobile isAdmin isProduction={isProductionSite} pending={setupScheduler.isPending || runDueNow.isPending} error={schedulerError} onSetup={() => setupScheduler.mutate()} onRunDue={() => runDueNow.mutate()} />}
      </div>

      <div className="mx-auto max-w-7xl p-5 lg:p-9">
        {!isLinked || isEditingLineLink ? <LinkAccountForm lineUserId={lineUserId} setLineUserId={setLineUserId} pending={link.isPending} isRelinking={isLinked} onCancel={isLinked ? () => { setIsEditingLineLink(false); setLineUserId(""); } : undefined} onSubmit={() => link.mutate({ lineUserId: lineUserId.trim() })} /> : <>
          <section id="overview" className="scroll-mt-24 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]"><StatCard label="ยอดคงเหลือในบัญชี" value={money.format(scopedFinance.balance)} icon={BarChart3} tone="violet" emphasized /><StatCard label="รายรับเดือนนี้" value={money.format(scopedFinance.income)} icon={TrendingUp} tone="mint" /><StatCard label="รายจ่ายเดือนนี้" value={money.format(scopedFinance.expense)} icon={ReceiptText} tone="peach" /><StatCard label="ธุรกรรมใน 7 วัน" value={`${scopedAnalytics.transactionCount} รายการ`} icon={FileText} tone="sky" /></section>

          <DashboardDetailMenu data={{ ...data, finance: scopedFinance, budgets: scopedBudgets }} transactions={transactions.data ?? []} onNavigate={goTo} />

          <FinanceAnalyticsPanel trend={trendChart} categories={categoryChart} transactionCount={scopedAnalytics.transactionCount} sevenDayIncome={scopedAnalytics.sevenDayIncome} sevenDayExpense={scopedAnalytics.sevenDayExpense} />
          <FinanceReportPanel period={reportPeriod} onPeriodChange={setReportPeriod} report={financeReport.data} loading={financeReport.isLoading} financeAccountId={activeFinanceAccountId} />
          <FinancePeriodComparison period={reportPeriod} financeAccountId={activeFinanceAccountId} />
          <FinanceSettingsPanel financeAccountId={activeFinanceAccountId} role={activeFinanceAccount?.membership.role} />
          <FinancialAssistantPanel financeAccountId={activeFinanceAccountId} />
          <TransactionSearch value={transactionSearch} matchedCount={filteredTransactions.length} totalCount={allScopedTransactions.length} onChange={setTransactionSearch} />
          <TransactionManagerPanel transactions={paginatedTransactions} financeAccountId={activeFinanceAccountId} role={activeFinanceAccount?.membership.role} />
          <TransactionPagination page={safeTransactionPage} pageCount={transactionPageCount} itemCount={filteredTransactions.length} pageSize={transactionPageSize} onChange={setTransactionPage} />
          <AdminGovernancePanelStandard isAdmin={user.role === "admin"} />

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <section id="reminders" className="scroll-mt-24 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="การเตือนที่กำลังจะถึง" subtitle="จัดการจากแชท LINE หรือเพิ่มรายการด้วยมือ" icon={BellRing} tone="text-[#25a586]" /><div className="mt-5 space-y-3">{data.reminders.slice(0, 6).map(reminder => <div key={reminder.id} className="flex items-center gap-3 rounded-2xl bg-[#f3fbf8] p-3"><span className="grid size-9 place-items-center rounded-xl bg-white text-[#27a487]"><BellRing className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{reminder.title}</p><p className="text-xs text-[#77a098]">{reminder.nextRunAt ? dateTime.format(new Date(reminder.nextRunAt)) : "รอกำหนดเวลา"}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] text-[#4d8277]">{reminder.recurrenceType === "once" ? "ครั้งเดียว" : `ทุก ${reminder.recurrenceType}`}</span><button onClick={() => deleteReminder.mutate({ id: reminder.id })} disabled={deleteReminder.isPending} aria-busy={deleteReminder.isPending} aria-label={`ลบการเตือน ${reminder.title}`} className="grid size-7 place-items-center rounded-lg text-[#b27770] transition-colors hover:bg-[#ffeae5] hover:text-[#b44b3e] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div>)}{data.reminders.length === 0 && <Empty text="ยังไม่มีรายการเตือน ลองพิมพ์ “เตือนประชุมพรุ่งนี้ 10:00” ใน LINE" />}</div><form onSubmit={event => { event.preventDefault(); createReminder.mutate({ title: normalizedReminderTitle(reminderTitle), dueAt: reminderDueAtFromBangkokInput(reminderTime) }); }} className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input value={reminderTitle} onChange={event => setReminderTitle(event.target.value)} placeholder="เพิ่มการเตือน" className="rounded-xl" /><Input type="datetime-local" value={reminderTime} onChange={event => setReminderTime(event.target.value)} className="rounded-xl" /><Button type="submit" disabled={!canSubmitReminderDraft(reminderTitle) || createReminder.isPending} aria-busy={createReminder.isPending} className="rounded-xl bg-[#238f76] text-white hover:bg-[#157a62]">{createReminder.isPending ? "กำลังเพิ่ม..." : <><Plus className="mr-1 size-4" />เพิ่ม</>}</Button></form></section>
            <section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="สรุปรายรับรายจ่าย" subtitle={`${activeFinanceAccount?.account.name ?? "บัญชีส่วนตัว"} · เดือนปัจจุบัน`} icon={ReceiptText} tone="text-[#a977c4]" /><div className="mt-6 flex items-end justify-between"><div><p className="text-xs text-[#7b9e98]">รายรับ</p><p className="font-display mt-1 text-2xl font-semibold text-[#23856e]">{money.format(scopedFinance.income)}</p></div><div className="text-right"><p className="text-xs text-[#7b9e98]">รายจ่าย</p><p className="font-display mt-1 text-2xl font-semibold text-[#ce6f5e]">{money.format(scopedFinance.expense)}</p></div></div><div className="mt-6 space-y-3">{Object.entries(scopedFinance.categories).slice(0, 4).map(([category, amount]) => <div key={category}><div className="flex justify-between text-xs"><span>{category}</span><span className="text-[#6d938b]">{money.format(amount)}</span></div><div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#edf7f4]"><div className="h-full rounded-full bg-[#a7dfcd]" style={{ width: `${Math.min(100, (amount / Math.max(scopedFinance.expense, 1)) * 100)}%` }} /></div></div>)}{Object.keys(scopedFinance.categories).length === 0 && <Empty text="บันทึกรายจ่ายจาก LINE เพื่อดูสรุปที่นี่" />}</div></section>
          </section>

          <section id="tasks" className="scroll-mt-24 mt-6 grid gap-6 xl:grid-cols-2"><section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="งานที่ต้องทำ" icon={ListTodo} tone="text-[#378eb4]" /><div className="mt-4 space-y-2">{data.todos.slice(0, 8).map(todo => <div className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#f3fbf8]" key={todo.id}><button onClick={() => completeTodo.mutate({ id: todo.id })} aria-label={`ทำงาน ${todo.title} เสร็จ`} className="grid size-5 place-items-center rounded-full border border-[#badbd2] text-transparent transition-colors hover:border-[#22a386] hover:text-[#22a386]"><CheckCircle2 className="size-3" /></button><span className="flex-1 text-sm">{todo.title}</span>{todo.dueAt && <span className="text-xs text-[#86a29e]">{dateTime.format(new Date(todo.dueAt))}</span>}</div>)}{data.todos.length === 0 && <Empty text="พิมพ์ “งาน ส่งสรุป” ใน LINE เพื่อเพิ่มรายการ" />}</div></section><section id="vault" className="scroll-mt-24 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="คลังที่เพิ่งบันทึก" icon={FileArchive} tone="text-[#b9803c]" /><div className="relative mt-4"><Search className="absolute left-3 top-2.5 size-4 text-[#8aa6a0]" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="ค้นหาไฟล์ โน้ต หรือลิงก์" className="h-9 rounded-xl pl-9 text-sm" /></div><div className="mt-3 space-y-2">{shownVault.map(item => <div key={item.id} className="rounded-xl px-2 py-2 hover:bg-[#f3fbf8]"><div className="flex items-center gap-3"><FileText className="size-4 shrink-0 text-[#2c9a80]" /><span className="flex-1 truncate text-sm">{item.title}</span>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-[#2785ad]">เปิดลิงก์</a>}<button onClick={() => { const tagsText = window.prompt("แก้ไขแท็ก (คั่นด้วยเว้นวรรค)", item.tagsText ?? ""); if (tagsText !== null) updateVault.mutate({ id: item.id, tagsText: tagsText || null, sourceUrl: item.sourceUrl ?? null }); }} className="rounded-md bg-[#edf8f4] px-2 py-1 text-[10px] font-medium text-[#2b876f]">แท็ก</button><button onClick={() => { const sourceUrl = window.prompt("วางลิงก์ (ต้องขึ้นต้น https://)", item.sourceUrl ?? ""); if (sourceUrl !== null) updateVault.mutate({ id: item.id, tagsText: item.tagsText ?? null, sourceUrl: sourceUrl || null }); }} className="rounded-md bg-[#eef7fc] px-2 py-1 text-[10px] font-medium text-[#2f7fa3]">ลิงก์</button></div>{item.tagsText && <p className="mt-1 pl-7 text-[10px] text-[#6f9d92]">{item.tagsText}</p>}</div>)}{shownVault.length === 0 && <Empty text={search ? "ไม่พบรายการที่ค้นหา" : "ส่งไฟล์หรือพิมพ์ “เก็บ ...” ใน LINE เพื่อเริ่มคลัง"} />}</div></section></section>

          <section className="mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="โน้ตล่าสุด" icon={FileText} tone="text-[#2c9a80]" /><div className="mt-4 grid gap-2 lg:grid-cols-2">{data.notes.slice(0, 6).map(note => <div className="rounded-xl bg-[#f3fbf8] p-3" key={note.id}><p className="text-sm font-medium">{note.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#779891]">{note.content}</p></div>)}{data.notes.length === 0 && <Empty text="พิมพ์ “โน้ต ...” ใน LINE เพื่อบันทึกสิ่งสำคัญ" />}</div></section>

          <FinanceAccountManagerPanel groups={data.groups} />
          <VaultMetadataManager items={vaultItemsForManagement} onEdit={setVaultEditor} />

          <section className="mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="กราฟรายจ่ายตามหมวด" subtitle="สรุปเฉพาะเดือนปัจจุบัน" icon={BarChart3} tone="text-[#8965b2]" />{categoryChart.length ? <div className="mt-5 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={categoryChart} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}><XAxis dataKey="category" tickLine={false} axisLine={false} tick={{ fill: "#71938c", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#71938c", fontSize: 11 }} /><Tooltip cursor={{ fill: "#edf8f4" }} formatter={(value: number) => money.format(value)} contentStyle={{ borderRadius: 14, border: "1px solid #d7ebe6", boxShadow: "0 8px 22px rgba(31, 131, 118, .12)" }} /><Bar dataKey="amount" fill="#85cfbc" radius={[8, 8, 3, 3]} maxBarSize={52} /></BarChart></ResponsiveContainer></div> : <div className="mt-5"><Empty text="เริ่มบันทึกรายจ่ายผ่าน LINE เพื่อดูกราฟสรุปตามหมวด" /></div>}</section>
        </>}
      </div>{contentMutationPending && <><div className="fixed inset-0 z-40 cursor-wait" aria-hidden="true" /><div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#245851] px-4 py-2 text-sm font-medium text-white shadow-lg">{completingTodoId !== null ? "กำลังบันทึกงาน..." : "กำลังอัปเดตคลัง..."}</div></>}
      {pendingEnvironmentUrl && <EnvironmentSwitchModal targetUrl={pendingEnvironmentUrl} canSave={canSaveAndSwitch} saving={link.isPending || createReminder.isPending} onCancel={() => setPendingEnvironmentUrl(null)} onConfirm={() => navigateEnvironment(pendingEnvironmentUrl)} onSaveAndConfirm={saveAndSwitch} />}
      {/* Admin Profile Modal */}
      {showAdminProfile && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-7 text-left shadow-2xl border border-[#d3ebe5] space-y-4">
            <div className="flex items-center justify-between border-b border-[#eef5f2] pb-3">
              <div className="flex items-center gap-2.5">
                <span className="grid size-10 place-items-center rounded-2xl bg-[#e4f7f1] text-[#1c8c72]">
                  <ShieldCheck className="size-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#1a3832]">โปรไฟล์ผู้ดูแลระบบ (Admin)</h3>
                  <p className="text-[11px] text-[#638b82]">Milo System Governance</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminProfile(false)}
                className="grid size-8 place-items-center rounded-lg text-[#729890] hover:bg-[#f1faf6]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-[#315c53]">
              <div className="flex justify-between items-center py-1.5 border-b border-[#f4faf7]">
                <span className="text-[#6d9189]">สถานะบัญชี</span>
                <span className="rounded-full bg-[#dff8e9] px-2.5 py-0.5 font-bold text-[#15886d]">ผู้ดูแลระบบสูงสุด (Master Admin)</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f4faf7]">
                <span className="text-[#6d9189]">ชื่อผู้ใช้ (Username)</span>
                <span className="font-semibold font-mono">{user.openId || "admin"}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f4faf7]">
                <span className="text-[#6d9189]">สิทธิ์การเข้าถึง</span>
                <span className="font-semibold text-[#187e67]">Full Access (ทุกสมุดบัญชี)</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f4faf7]">
                <span className="text-[#6d9189]">บัญชี LINE ที่เชื่อมต่อ</span>
                <span className="font-mono text-[11px] bg-[#f0faf5] px-2 py-0.5 rounded-md text-[#1d826a]">
                  {overview.data?.lineUserId || "ยังไม่ได้เชื่อมต่อ"}
                </span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[#f4faf7]">
                <span className="text-[#6d9189]">ฐานข้อมูล (Database)</span>
                <span className="text-[11px] font-medium text-[#1c8269]">TiDB Cloud (SSL Connected)</span>
              </div>
            </div>

            <div className="rounded-2xl bg-[#f5fbf9] p-3.5 border border-[#e0f2ec] text-xs space-y-1.5">
              <p className="font-bold text-[#206051] flex items-center gap-1.5">
                <Key className="size-3.5 text-[#1fa080]" /> การเปลี่ยนรหัสผ่านผู้ดูแลระบบ:
              </p>
              <p className="text-[#648c83] text-[11px] leading-relaxed">
                เพื่อความปลอดภัยสูงสุด สามารถเปลี่ยน Username และ Password ได้ใน <strong>Vercel &gt; Settings &gt; Environment Variables</strong> โดยตั้งค่า:
              </p>
              <div className="font-mono text-[10.5px] text-[#2c6558] bg-white p-2 rounded-lg border border-[#d6ede5] space-y-0.5">
                <p>ADMIN_USERNAME = ชื่อใหม่</p>
                <p>ADMIN_PASSWORD = รหัสผ่านใหม่</p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="rounded-xl border-[#f5d3cc] text-[#c04b3b] hover:bg-[#fff5f3] text-xs font-semibold gap-1.5"
              >
                <LogOut className="size-3.5" />
                ออกจากระบบ
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAdminProfile(false)}
                className="rounded-xl bg-[#238f76] text-white hover:bg-[#1b7e68] text-xs px-4"
              >
                ปิดหน้าต่าง
              </Button>
            </div>
          </div>
        </div>
      )}

      <VaultMetadataDialog item={vaultEditor} pending={updatingVaultId === vaultEditor?.id} onClose={() => setVaultEditor(null)} onSave={input => updateVault.mutate(input, { onSuccess: () => setVaultEditor(null) })} />
    </main>
  </div>;
}

function VaultMetadataDialog({ item, pending, onClose, onSave }: { item: VaultMetadataItem | null; pending: boolean; onClose: () => void; onSave: (input: { id: number; tagsText: string | null; sourceUrl: string | null }) => void }) {
  const [tagsText, setTagsText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  useEffect(() => { setTagsText(item?.tagsText ?? ""); setSourceUrl(item?.sourceUrl ?? ""); }, [item?.id, item?.tagsText, item?.sourceUrl]);
  const open = Boolean(item);
  return <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}><DialogContent className="max-w-md rounded-2xl border-[#cfe5df] bg-white"><DialogHeader><DialogTitle className="font-display text-[#315f58]">จัดการคลัง</DialogTitle><DialogDescription className="text-[#789891]">{item?.title ?? ""}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (item) onSave(vaultMetadataPayload(item.id, tagsText, sourceUrl)); }} className="space-y-4"><div><label htmlFor="vault-tags" className="text-xs font-medium text-[#47766d]">แท็ก</label><Input id="vault-tags" value={tagsText} onChange={event => setTagsText(event.target.value)} placeholder="เช่น งาน สำคัญ" maxLength={500} className="mt-1.5 rounded-xl" /></div><div><label htmlFor="vault-url" className="text-xs font-medium text-[#47766d]">ลิงก์อ้างอิง</label><Input id="vault-url" type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://example.com" maxLength={2000} className="mt-1.5 rounded-xl" /></div><DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={pending} className="rounded-xl">ยกเลิก</Button><Button type="submit" disabled={pending} className="rounded-xl bg-[#238f76] text-white hover:bg-[#157a62]">{pending ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function VaultMetadataManager({ items, onEdit }: { items: VaultMetadataItem[]; onEdit: (item: VaultMetadataItem) => void }) {
  const [query, setQuery] = useState("");
  const filteredItems = filterVaultMetadata(items, query);
  return <section id="vault-management" className="scroll-mt-24 mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow" aria-label="จัดการคลังไฟล์"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm font-semibold text-[#315f58]">จัดการแท็กและลิงก์คลัง</p><p className="mt-1 text-xs text-[#789891]">ค้นหาและแก้ไข metadata ของรายการที่แสดงอยู่ โดยไม่แก้ไขไฟล์ต้นฉบับ</p></div><span className="rounded-full bg-[#eef7fc] px-3 py-1 text-[11px] text-[#3a7e9e]">พบ {filteredItems.length} จาก {items.length} รายการ</span></div><div className="relative mt-4"><Search className="absolute left-3 top-2.5 size-4 text-[#8aa6a0]" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อไฟล์ แท็ก หรือลิงก์" aria-label="ค้นหารายการในคลัง" className="h-9 rounded-xl pl-9 text-sm" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{filteredItems.map(item => <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-[#f6fbfa] p-3"><FileText className="size-4 shrink-0 text-[#2c9a80]" /><span className="min-w-0 flex-1 truncate text-xs text-[#496f68]">{item.title}</span><Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)} className="h-7 shrink-0 rounded-lg border-[#cce5df] px-2 text-[11px] text-[#277d69] hover:bg-white">จัดการ</Button></div>)}{filteredItems.length === 0 && <Empty text={query ? "ไม่พบรายการที่ตรงกับการค้นหา" : "ยังไม่มีรายการในคลัง"} />}</div></section>;
}

function TransactionPagination({ page, pageCount, itemCount, pageSize, onChange }: { page: number; pageCount: number; itemCount: number; pageSize: number; onChange: (page: number) => void }) {
  if (itemCount <= pageSize) return null;
  const start = page * pageSize + 1;
  const end = Math.min(itemCount, (page + 1) * pageSize);
  return <nav className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#dceee9] bg-[#fbfefd] px-4 py-3 text-xs text-[#5d8179] sm:flex-row sm:items-center sm:justify-between" aria-label="แบ่งหน้ารายการธุรกรรม"><span>แสดง {start}–{end} จาก {itemCount} รายการ</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)} className="h-8 rounded-lg border-[#cfe6df]">ก่อนหน้า</Button><span className="min-w-16 text-center">หน้า {page + 1}/{pageCount}</span><Button type="button" variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)} className="h-8 rounded-lg border-[#cfe6df]">ถัดไป</Button></div></nav>;
}

function TransactionSearch({ value, matchedCount, totalCount, onChange }: { value: string; matchedCount: number; totalCount: number; onChange: (value: string) => void }) {
  return <section id="transactions-main" className="scroll-mt-24 mt-6 rounded-[1.35rem] border border-[#dceee9] bg-[#fbfefd] p-4" aria-label="ค้นหาธุรกรรม"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#315f58]">ค้นหาธุรกรรมย้อนหลัง</p><p className="mt-1 text-xs text-[#789891]">ค้นจากประเภท จำนวนเงิน หมวด หรือหมายเหตุในสมุดบัญชีที่เลือก</p></div><span className="text-xs text-[#5d897e]">พบ {matchedCount} จาก {totalCount} รายการ</span></div><Input value={value} onChange={event => onChange(event.target.value)} placeholder="เช่น อาหาร, กาแฟ, 65 หรือ รายรับ" aria-label="ค้นหาธุรกรรมย้อนหลัง" className="mt-3 rounded-xl bg-white" /></section>;
}

type DashboardDetailData = {
  finance: { income: number; expense: number; balance: number; categories: Record<string, number> };
  reminders: Array<{ recurrenceType: string }>;
  groups: unknown[];
  vault: unknown[];
  todos: unknown[];
  budgets: Array<{ category: string; amount: string | number; monthKey: string }>;
};

type DashboardTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: string | number;
  category: string;
  note: string | null;
  occurredAt: Date | string;
};

function DashboardDetailMenu({ data, transactions, onNavigate }: { data: DashboardDetailData; transactions: DashboardTransaction[]; onNavigate: (id: DashboardSectionId) => void }) {
  const menuItems: Array<{ id: DashboardSectionId; label: string; description: string; icon: typeof BarChart3; tone: string }> = [
    { id: "analysis", label: "วิเคราะห์การเงิน", description: "ดูแนวโน้มจากธุรกรรมจริง", icon: BarChart3, tone: "bg-[#e6f7f1] text-[#218b72]" },
    { id: "budgets", label: "หมวด / งบประมาณ", description: `${Object.keys(data.finance.categories).length} หมวด · ${data.budgets.length} งบที่ตั้งไว้`, icon: WalletCards, tone: "bg-[#fff0df] text-[#b87534]" },
    { id: "transactions", label: "รายการธุรกรรม", description: `${transactions.length} รายการล่าสุด`, icon: Table2, tone: "bg-[#e7f4fb] text-[#3a87ab]" },
    { id: "recurring", label: "การเตือนประจำ", description: `${data.reminders.filter(item => item.recurrenceType !== "once").length} รายการ`, icon: Repeat2, tone: "bg-[#f0eaff] text-[#8660ad]" },
    { id: "groups", label: "ผู้ช่วยกลุ่ม LINE", description: `${data.groups.length} กลุ่มที่เชื่อม`, icon: UsersRound, tone: "bg-[#ffece7] text-[#b86657]" },
    { id: "export", label: "ส่งออกข้อมูล", description: "ดาวน์โหลดธุรกรรมเป็น CSV", icon: Download, tone: "bg-[#e9f7e8] text-[#5b9a58]" },
  ];
  const exportTransactions = () => {
    const header = ["วันที่", "ประเภท", "หมวด", "จำนวนเงิน", "หมายเหตุ"];
    const rows = transactions.map(item => [new Date(item.occurredAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }), item.transactionType === "income" ? "รายรับ" : "รายจ่าย", item.category, String(item.amount), item.note ?? ""]);
    const csv = [header, ...rows].map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\\n");
    const url = URL.createObjectURL(new Blob([`\\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `milo-transactions-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const exportExcel = async () => {
    if (!transactions.length) return;
    try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const transactionRows = transactions.map(item => ({
      วันที่: new Date(item.occurredAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
      ประเภท: item.transactionType === "income" ? "รายรับ" : "รายจ่าย", หมวด: item.category,
      จำนวนเงิน: Number(item.amount), หมายเหตุ: item.note ?? "",
    }));
    const categoryRows = Object.entries(data.finance.categories).map(([หมวด, รายจ่าย]) => ({ หมวด, รายจ่าย }));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactionRows), "ธุรกรรม");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ รายรับ: data.finance.income, รายจ่าย: data.finance.expense, กำไร_ขาดทุน: data.finance.balance }]), "สรุป");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoryRows), "รายจ่ายตามหมวด");
    XLSX.writeFile(workbook, `milo-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch {
      toast.error("สร้างไฟล์ Excel ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  };
  const exportPdf = () => {
    if (!transactions.length) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) { toast.error("เปิดหน้าต่างสร้าง PDF ไม่สำเร็จ กรุณาอนุญาต pop-up แล้วลองใหม่"); return; }
    printWindow.document.write(buildMiloFinancePdfHtml({ income: data.finance.income, expense: data.finance.expense, balance: data.finance.balance, categories: data.finance.categories, transactions }));
    printWindow.document.close();
    printWindow.addEventListener("load", () => printWindow.print(), { once: true });
  };
  return <>
    <section className="mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-5 soft-shadow" aria-label="เมนูรายละเอียด">
      <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#315f58]">เมนูรายละเอียด</p><p className="mt-1 text-xs text-[#83a19b]">เลือกดูข้อมูลแต่ละส่วนของไมโลได้จากที่นี่</p></div><span className="rounded-full bg-[#f0faf6] px-3 py-1.5 text-[11px] text-[#438b7a]">ข้อมูลจริงจาก LINE</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{menuItems.map(({ id, label, description, icon: Icon, tone }) => <button key={id} onClick={() => onNavigate(id)} className="group flex items-center gap-3 rounded-2xl border border-[#e5f1ee] bg-[#fcfffe] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-[#b8ded3] hover:shadow-sm"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-[#315f58]">{label}</span><span className="mt-0.5 block truncate text-[11px] text-[#88a39d]">{description}</span></span><ChevronRight className="size-4 text-[#a1bdb6] transition-transform group-hover:translate-x-0.5" /></button>)}</div>
    </section>
    <section id="budgets" className="scroll-mt-24 mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><SectionTitle title="หมวดค่าใช้จ่ายและงบประมาณ" subtitle={`ยอดใช้จริงเดือนนี้ · งบที่ตั้งไว้ ${data.budgets.length} รายการ`} icon={WalletCards} tone="text-[#b87534]" />{data.budgets.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.budgets.map(budget => { const spent = data.finance.categories[budget.category] ?? 0; const limit = Number(budget.amount); return <div key={`${budget.category}-${budget.monthKey}`} className="rounded-2xl border border-[#f4e5d4] bg-[#fffaf4] p-4"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium text-[#6f6258]">{budget.category}</p><span className="text-xs font-semibold text-[#b87534]">{money.format(spent)} / {money.format(limit)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f5e9dc]"><div className={`h-full rounded-full ${spent > limit ? "bg-[#dd6f6b]" : "bg-[#e2a45d]"}`} style={{ width: `${Math.min(100, (spent / Math.max(limit, 1)) * 100)}%` }} /></div><p className="mt-2 text-[11px] text-[#a7907c]">{spent > limit ? "เกินงบประมาณ" : "ใช้จ่ายตามงบเดือนนี้"}</p></div>; })}</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(data.finance.categories).map(([category, amount]) => <div key={category} className="rounded-2xl bg-[#fffaf4] p-4"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium text-[#6f6258]">{category}</p><span className="text-sm font-semibold text-[#b87534]">{money.format(amount)}</span></div><p className="mt-2 text-[11px] text-[#a7907c]">ใช้จ่ายจริงเดือนนี้</p></div>)}{Object.keys(data.finance.categories).length === 0 && <div className="sm:col-span-2 lg:col-span-3"><Empty text="ยังไม่มีรายจ่ายสำหรับจัดหมวดและตั้งงบประมาณ บันทึกผ่าน LINE ได้เลย" /></div>}</div></section>
    <section id="transactions" className="scroll-mt-24 mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><SectionTitle title="รายการธุรกรรมล่าสุด" subtitle="แสดงข้อมูลจริงที่บันทึกผ่าน LINE สูงสุด 250 รายการ" icon={Table2} tone="text-[#3a87ab]" /><button onClick={() => onNavigate("export")} className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-[#edf8fc] px-3 py-2 text-xs font-medium text-[#327c9e] hover:bg-[#e2f3fa]"><Download className="size-3.5" />ส่งออก CSV</button></div><div className="mt-4 overflow-x-auto">{transactions.length ? <table className="w-full min-w-[620px] text-left text-xs"><thead className="border-b border-[#e5f0ed] text-[#87a39d]"><tr><th className="px-3 py-3 font-medium">วันที่</th><th className="px-3 py-3 font-medium">รายการ</th><th className="px-3 py-3 font-medium">หมวด</th><th className="px-3 py-3 text-right font-medium">จำนวนเงิน</th></tr></thead><tbody>{transactions.slice(0, 12).map(item => <tr key={item.id} className="border-b border-[#f0f6f4] last:border-0"><td className="px-3 py-3 text-[#718e88]">{dateTime.format(new Date(item.occurredAt))}</td><td className="px-3 py-3 text-[#315f58]">{item.note || (item.transactionType === "income" ? "รายรับ" : "รายจ่าย")}</td><td className="px-3 py-3 text-[#718e88]">{item.category}</td><td className={`px-3 py-3 text-right font-semibold ${item.transactionType === "income" ? "text-[#23856e]" : "text-[#ce6f5e]"}`}>{item.transactionType === "income" ? "+" : "−"}{money.format(Number(item.amount))}</td></tr>)}</tbody></table> : <Empty text="ยังไม่มีธุรกรรมจริงที่บันทึกผ่าน LINE" />}</div></section>
    <section id="export" className="scroll-mt-24 mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-gradient-to-r from-white to-[#f4fbf8] p-6 soft-shadow"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><SectionTitle title="ส่งออกข้อมูล" subtitle="ดาวน์โหลดรายการธุรกรรมจริงเพื่อเก็บไว้หรือวิเคราะห์ต่อ" icon={Download} tone="text-[#5b9a58]" /><p className="mt-3 text-xs text-[#86a19b]">CSV มีรายการธุรกรรม, Excel มีชีตสรุป และ PDF เปิดหน้าพิมพ์รายงานธีมไมโลจากข้อมูลจริง</p></div><div className="flex flex-wrap gap-2"><button onClick={exportTransactions} disabled={!transactions.length} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#9fdacb] bg-white px-4 py-3 text-sm font-medium text-[#1c8069] transition hover:bg-[#f5fffb] disabled:cursor-not-allowed disabled:opacity-45"><Download className="size-4" />CSV ({transactions.length})</button><button onClick={exportExcel} disabled={!transactions.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#238f76] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#157a62] disabled:cursor-not-allowed disabled:opacity-45"><Download className="size-4" />Excel (.xlsx)</button><button onClick={exportPdf} disabled={!transactions.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#755aa2] px-4 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#63488f] disabled:cursor-not-allowed disabled:opacity-45"><FileText className="size-4" />PDF</button></div></div></section>
  </>;
}

function EnvironmentBadge({ isProduction, onSwitch }: { isProduction: boolean; onSwitch: () => void }) { return <button type="button" onClick={onSwitch} title={`คลิกเพื่อสลับไปโหมด ${isProduction ? "Preview" : "Production"}`} aria-label={`โหมดปัจจุบัน ${isProduction ? "Production" : "Preview"}; คลิกเพื่อสลับโหมด`} className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55b99c] ${isProduction ? "border-[#bde4c8] bg-[#e8faed] text-[#21804a]" : "border-[#f0d5a4] bg-[#fff6e5] text-[#a76a16]"}`}><span className={`size-1.5 rounded-full ${isProduction ? "bg-[#36a45c]" : "bg-[#e1a135]"}`} />{isProduction ? "Production" : "Preview"}<ArrowRightLeft className="size-3 opacity-55 transition-transform group-hover:rotate-180" /></button>; }

function PreviewBanner() { const [copied, setCopied] = useState(false); const copyProductionLink = async () => { try { await navigator.clipboard.writeText(PRODUCTION_DASHBOARD_URL); setCopied(true); toast.success("คัดลอกลิงก์ Production แล้ว"); window.setTimeout(() => setCopied(false), 1800); } catch { toast.error("คัดลอกลิงก์ไม่สำเร็จ กรุณาคัดลอกด้วยตนเอง"); } }; return <div className="border-b border-[#f2dfb9] bg-gradient-to-r from-[#fff8e8] via-[#fffdf7] to-[#fef3df] px-5 py-3 lg:px-9"><div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#fff0c9] text-[#bd7a1c]"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-semibold text-[#765522]">กำลังใช้งานโหมด Preview</p><p className="mt-0.5 text-xs leading-5 text-[#9a7c4b]">ข้อมูลและหน้าจอแสดงผลเหมือน Production แต่ scheduler จะทำงานได้หลังเปิดจากเว็บไซต์ที่เผยแพร่แล้ว</p></div></div><div className="flex flex-wrap items-center gap-2"><a href={PRODUCTION_DASHBOARD_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-[#e6c98e] bg-white px-3 py-2 text-xs font-medium text-[#9a681e] hover:bg-[#fffaf0]">เปิด Production</a><button type="button" onClick={copyProductionLink} className={`inline-flex items-center gap-1.5 rounded-lg bg-[#c58a2c] px-3 py-2 text-xs font-medium text-white transition-all hover:bg-[#a9711f] ${copied ? "animate-pulse ring-2 ring-[#f2cf8d] ring-offset-1" : ""}`}><Copy className="size-3.5" />{copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์ Production"}</button></div></div></div>; }

function PublishHistoryPopover({ lastPublishedLabel }: { lastPublishedLabel: string }) { const releases = [{ title: "เวอร์ชันที่กำลังใช้งาน", time: lastPublishedLabel, note: "เผยแพร่จาก checkpoint ล่าสุด" }, { title: "รุ่น 07333dc8", time: dateTime.format(new Date("2026-08-26T14:46:48Z")), note: "เพิ่มกรอบ Preview และ confirmation modal" }, { title: "รุ่น 90f5c132", time: dateTime.format(new Date("2026-08-26T14:16:49Z")), note: "เพิ่ม Badge, copy feedback และ Tooltip" }]; return <Popover><PopoverTrigger asChild><button type="button" aria-label="เปิดประวัติการเผยแพร่" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1.5 text-[10px] text-[#78938d] transition hover:bg-white hover:text-[#3f766b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#55b99c]"><Clock3 className="size-3" /><span className="hidden lg:inline">เผยแพร่ล่าสุด · {lastPublishedLabel}</span><span className="hidden sm:inline lg:hidden">เผยแพร่</span></button></PopoverTrigger><PopoverContent align="end" className="w-80 rounded-2xl border-[#d7ebe6] bg-white p-4 text-[#285d54] shadow-[0_16px_38px_rgba(29,105,88,.16)]"><div className="flex items-center justify-between"><p className="text-sm font-semibold">ประวัติการเผยแพร่</p><span className="rounded-full bg-[#e8faed] px-2 py-1 text-[10px] font-medium text-[#248254]">3 รายการล่าสุด</span></div><div className="mt-3 space-y-3">{releases.map((release, index) => <div key={release.title} className="flex gap-3"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-[#dff8e9] text-[#238f76]" : "bg-[#f2f7f5] text-[#86a29e]"}`}><Check className="size-3" /></span><div className="min-w-0"><p className="text-xs font-semibold">{release.title}</p><p className="mt-0.5 text-[10px] text-[#75968f]">{release.time}</p><p className="mt-1 text-[11px] leading-4 text-[#587d75]">{release.note}</p></div></div>)}</div></PopoverContent></Popover>; }

function EnvironmentSwitchModal({ targetUrl, canSave, saving, onCancel, onConfirm, onSaveAndConfirm }: { targetUrl: string; canSave: boolean; saving: boolean; onCancel: () => void; onConfirm: () => void; onSaveAndConfirm: () => void }) { const targetName = targetUrl.includes("manus.space") ? "Production" : "Preview"; return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#173d36]/35 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="environment-switch-title"><div className="w-full max-w-md rounded-[1.5rem] border border-[#d7ebe6] bg-white p-6 shadow-[0_24px_70px_rgba(31,93,79,.24)]"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff3d6] text-[#bf7b1e]"><ShieldCheck className="size-5" /></span><div><h2 id="environment-switch-title" className="text-base font-semibold text-[#285d54]">มีข้อมูลที่ยังไม่ได้บันทึก</h2><p className="mt-2 text-sm leading-6 text-[#76958e]">ช่องกรอกข้อมูลบนหน้านี้ยังมีข้อมูลค้างอยู่ หากสลับไป {targetName} ตอนนี้ ข้อมูลเหล่านี้อาจหายไป</p></div></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end"><button type="button" disabled={saving} onClick={onCancel} className="rounded-xl border border-[#cfe6df] px-4 py-2.5 text-sm font-medium text-[#527d74] hover:bg-[#f3fbf8] disabled:opacity-50">อยู่หน้านี้ต่อ</button><button type="button" disabled={saving} onClick={onConfirm} className="rounded-xl border border-[#e3c88f] bg-[#fff9ec] px-4 py-2.5 text-sm font-semibold text-[#9a681e] hover:bg-[#fff3d8] disabled:opacity-50">สลับโดยไม่บันทึก</button>{canSave && <button type="button" disabled={saving} onClick={onSaveAndConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#238f76] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#157a62] disabled:opacity-50"><Save className="size-4" />{saving ? "กำลังบันทึก..." : "บันทึกและสลับโหมด"}</button>}</div></div></div>; }

function DashboardNavigation({ active, onNavigate, className = "", mobile = false }: { active: string; onNavigate: (id: DashboardSectionId) => void; className?: string; mobile?: boolean }) {
  return <nav className={`${mobile ? "flex gap-2 overflow-x-auto" : "space-y-1"} ${className}`} aria-label="เมนูแดชบอร์ด">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onNavigate(id)} className={mobile ? `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs ${active === id ? "bg-[#dff8e9] font-semibold text-[#187e67]" : "bg-[#f3faf8] text-[#688c84]"}` : `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors ${active === id ? "bg-[#e7f8f2] font-semibold text-[#167d67]" : "text-[#6b8d87] hover:bg-[#f2faf7]"}`}><Icon className={mobile ? "size-3.5" : "size-4"} />{label}</button>)}</nav>;
}

function SchedulerCard({ isAdmin, isProduction, pending, error, onSetup, onRunDue, mobile = false }: { isAdmin: boolean; isProduction: boolean; pending: boolean; error: string; onSetup: () => void; onRunDue: () => void; mobile?: boolean }) {
  const disabledReason = "Scheduler เปิดได้เฉพาะหน้า Production เพื่อให้ระบบ Heartbeat เรียก callback ที่เผยแพร่แล้วได้";
  return <div className={`${mobile ? "mt-3" : "mt-auto"} rounded-2xl bg-[#effbf7] p-4`}><p className="text-xs font-semibold text-[#3d756b]">การแจ้งเตือนอัตโนมัติ</p><p className="mt-1 text-[11px] leading-5 text-[#73948e]">{isProduction ? "ตั้งค่าเพื่อให้ไมโลส่ง reminder ตรงเวลา" : "โหมด Preview พร้อมตรวจข้อมูล แต่ยังไม่สามารถเปิด scheduler ได้"}</p>{!isProduction && <a href={PRODUCTION_DASHBOARD_URL} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-medium text-[#238f76] underline-offset-2 hover:underline">เปิด dashboard ที่เผยแพร่แล้ว</a>}{isAdmin ? isProduction ? <><button onClick={onSetup} disabled={pending} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#238f76] px-3 py-2 text-xs font-medium text-white hover:bg-[#157a62] disabled:opacity-60"><Settings className="size-3.5" />{pending ? "กำลังประมวลผล" : "เปิด scheduler"}</button><button onClick={onRunDue} disabled={pending} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#9fdacb] bg-white text-xs font-medium text-[#1c8069] hover:bg-[#f6fffc] disabled:opacity-60"><BellRing className="size-3.5" />ส่งรายการที่ถึงเวลา</button></> : <UITooltip><UITooltipTrigger asChild><span className="mt-3 block"><button type="button" disabled aria-disabled="true" className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-[#c7ddd7] px-3 py-2 text-xs font-medium text-white opacity-80"><Settings className="size-3.5" />เปิด scheduler</button></span></UITooltipTrigger><UITooltipContent className="w-72 border-[#e4b65e] bg-[#fff9ec] p-4 text-[#755522] shadow-[0_12px_32px_rgba(172,112,29,.22)]"><p className="font-semibold">เปิด scheduler ไม่ได้ใน Preview</p><p className="mt-1 text-xs leading-5 text-[#9a7c4b]">{disabledReason}</p><a href={PRODUCTION_DASHBOARD_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center rounded-lg bg-[#c58a2c] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#a9711f]">เปิด Production จาก Tooltip →</a></UITooltipContent></UITooltip> : <Settings className="mt-3 size-4 text-[#2a9c80]" />}{error && <p className="mt-2 text-[10px] leading-4 text-[#ad5652]" role="alert">{error}</p>}</div>;
}

const chartColors = ["#25a586", "#2288bd", "#f29b38", "#a06acd", "#dd6f6b", "#5b9488"];

function FinancePeriodComparison({ period, financeAccountId }: { period: "day" | "week" | "month" | "year"; financeAccountId?: number }) {
  const currentInput = useMemo(() => ({ period, financeAccountId }), [period, financeAccountId]);
  const previousInput = useMemo(() => ({ period, reference: previousFinanceReportReference(period), financeAccountId }), [period, financeAccountId]);
  const current = trpc.milo.finance.report.useQuery(currentInput);
  const previous = trpc.milo.finance.report.useQuery(previousInput);
  if (current.isLoading || previous.isLoading) return <div className="mt-4 h-28 animate-pulse rounded-2xl bg-[#f5fbf9]" aria-label="กำลังโหลดการเปรียบเทียบ" />;
  if (current.error || previous.error || !current.data || !previous.data) return <div className="mt-4 rounded-2xl bg-[#fff8f5] px-4 py-3 text-xs text-[#b66457]">ไม่สามารถเปรียบเทียบช่วงก่อนหน้าได้ในขณะนี้</div>;
  const metrics = [{ label: "รายรับ", current: current.data.income, previous: previous.data.income, tone: "text-[#23856e]" }, { label: "รายจ่าย", current: current.data.expense, previous: previous.data.expense, tone: "text-[#ce6f5e]" }, { label: "คงเหลือ", current: current.data.balance, previous: previous.data.balance, tone: current.data.balance >= 0 ? "text-[#23856e]" : "text-[#ce6f5e]" }];
  return <section className="mt-4 rounded-2xl border border-[#dcece8] bg-[#fbfefd] p-4" aria-label="เปรียบเทียบช่วงก่อนหน้า"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[#315f58]">เปรียบเทียบกับช่วงก่อนหน้า</p><span className="text-[11px] text-[#7e9e97]">จากธุรกรรมจริง {previous.data.transactionCount} รายการ</span></div><div className="mt-3 grid gap-2 sm:grid-cols-3">{metrics.map(metric => { const delta = financeDelta(metric.current, metric.previous); return <div key={metric.label} className="rounded-xl border border-[#e3efec] bg-white px-3 py-2.5"><p className="text-[11px] text-[#7b9c95]">{metric.label}</p><p className={`mt-1 text-base font-semibold ${metric.tone}`}>{money.format(metric.current)}</p><p className={`mt-1 text-[11px] ${delta.difference > 0 ? "text-[#26866f]" : delta.difference < 0 ? "text-[#c56859]" : "text-[#849a96]"}`}>{delta.difference === 0 ? "ไม่เปลี่ยนแปลง" : `${delta.difference > 0 ? "+" : ""}${money.format(delta.difference)}${delta.percentage === null ? "" : ` (${delta.percentage > 0 ? "+" : ""}${delta.percentage.toFixed(0)}%)`}`}</p></div>; })}</div></section>;
}

function FinanceReportPanel({ period, onPeriodChange, report, loading, financeAccountId }: { period: "day" | "week" | "month" | "year"; onPeriodChange: (value: "day" | "week" | "month" | "year") => void; report?: { start: Date | string; end: Date | string; income: number; expense: number; balance: number; transactionCount: number; categories: Record<string, number> }; loading: boolean; financeAccountId?: number }) {
  const options: Array<{ value: "day" | "week" | "month" | "year"; label: string }> = [{ value: "day", label: "วัน" }, { value: "week", label: "สัปดาห์" }, { value: "month", label: "เดือน" }, { value: "year", label: "ปี" }];
  const categoryRows = Object.entries(report?.categories ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <section className="mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow" aria-label="รายงานการเงินจริง"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><SectionTitle title="รายงานการเงินจริง" subtitle={report ? `${dateTime.format(new Date(report.start))} – ${dateTime.format(new Date(report.end))}` : "เลือกช่วงเวลาที่ต้องการสรุป"} icon={TrendingUp} tone="text-[#2d8b76]" /></div><div className="flex rounded-xl bg-[#f1faf7] p-1">{options.map(option => <button key={option.value} type="button" onClick={() => onPeriodChange(option.value)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${period === option.value ? "bg-white text-[#1d826a] shadow-sm" : "text-[#789a92] hover:text-[#3c766a]"}`}>{option.label}</button>)}</div></div>{loading ? <div className="mt-5 h-28 animate-pulse rounded-2xl bg-[#f5fbf9]" /> : report ? <><div className="mt-5 grid gap-3 sm:grid-cols-3"><MiniReportStat label="รายรับ" value={money.format(report.income)} tone="text-[#23856e]" /><MiniReportStat label="รายจ่าย" value={money.format(report.expense)} tone="text-[#ce6f5e]" /><MiniReportStat label="กำไร / คงเหลือ" value={money.format(report.balance)} tone={report.balance >= 0 ? "text-[#21846e]" : "text-[#bf5f54]"} /></div><div className="mt-5 rounded-2xl bg-[#f5fbf9] p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#4c786f]">รายจ่ายตามหมวด</p><span className="text-[11px] text-[#82a19a]">{report.transactionCount} ธุรกรรม</span></div>{categoryRows.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{categoryRows.map(([category, amount]) => <div key={category} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs"><span className="text-[#547e76]">{category}</span><span className="font-semibold text-[#b87534]">{money.format(amount)}</span></div>)}</div> : <p className="mt-3 text-xs text-[#82a19a]">ยังไม่มีรายจ่ายในช่วงที่เลือก</p>}</div></> : <Empty text="กำลังโหลดรายงานจากธุรกรรมจริง" />}<CustomRangeReportPanel financeAccountId={financeAccountId} /></section>;
}

function CustomRangeReportPanel({ financeAccountId }: { financeAccountId?: number }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestedRange, setRequestedRange] = useState<{ start: string; end: string } | null>(null);
  const queryInput = useMemo(() => requestedRange ? { start: new Date(`${requestedRange.start}T00:00:00+07:00`), end: new Date(`${requestedRange.end}T23:59:59.999+07:00`), financeAccountId } : { start: new Date(0), end: new Date(0), financeAccountId }, [requestedRange, financeAccountId]);
  const result = trpc.milo.finance.reportRange.useQuery(queryInput, { enabled: Boolean(requestedRange) });
  const report = result.data;
  return <section className="mt-4 rounded-2xl border border-dashed border-[#cfe5df] bg-[#fbfefd] p-4"><form onSubmit={event => { event.preventDefault(); if (startDate && endDate) setRequestedRange({ start: startDate, end: endDate }); }} className="flex flex-col gap-3 lg:flex-row lg:items-end"><div className="flex-1"><p className="text-xs font-semibold text-[#47766d]">รายงานตามช่วงวันที่กำหนด</p><p className="mt-1 text-[11px] text-[#86a19b]">เลือกวันเริ่มต้นและวันสิ้นสุดเพื่อสรุปจากธุรกรรมจริง</p></div><Input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} aria-label="วันเริ่มต้นรายงาน" className="h-9 rounded-xl text-xs" /><Input type="date" value={endDate} min={startDate || undefined} onChange={event => setEndDate(event.target.value)} aria-label="วันสิ้นสุดรายงาน" className="h-9 rounded-xl text-xs" /><Button type="submit" disabled={!startDate || !endDate || result.isFetching} className="h-9 rounded-xl bg-[#3b8674] text-xs text-white hover:bg-[#28705f]">{result.isFetching ? "กำลังสรุป..." : "ดูรายงาน"}</Button></form>{result.error && <p className="mt-3 text-xs text-[#ba5a51]">{result.error.message}</p>}{report && <div className="mt-4 grid gap-2 sm:grid-cols-4"><MiniReportStat label="รายรับ" value={money.format(report.income)} tone="text-[#23856e]" /><MiniReportStat label="รายจ่าย" value={money.format(report.expense)} tone="text-[#ce6f5e]" /><MiniReportStat label="กำไร / คงเหลือ" value={money.format(report.balance)} tone={report.balance >= 0 ? "text-[#21846e]" : "text-[#bf5f54]"} /><MiniReportStat label="ธุรกรรม" value={`${report.transactionCount} รายการ`} tone="text-[#3d7f99]" /></div>}</section>;
}

function MiniReportStat({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="rounded-2xl border border-[#e2f0ec] bg-[#fcfffe] p-4"><p className="text-xs text-[#7d9d96]">{label}</p><p className={`font-display mt-1 text-xl font-semibold ${tone}`}>{value}</p></div>; }

function FinanceAnalyticsPanel({ trend, categories, transactionCount, sevenDayIncome, sevenDayExpense }: { trend: Array<{ dateKey: string; label: string; income: number; expense: number }>; categories: Array<{ category: string; amount: number }>; transactionCount: number; sevenDayIncome: number; sevenDayExpense: number }) {
  const totalCategoryExpense = categories.reduce((sum, item) => sum + item.amount, 0);
  const topCategory = categories.slice().sort((left, right) => right.amount - left.amount)[0];
  const netSevenDay = sevenDayIncome - sevenDayExpense;
  return <section id="finance" className="scroll-mt-24 mt-6 overflow-hidden rounded-[1.75rem] border border-[#cde8df] bg-white soft-shadow" aria-label="วิเคราะห์การเงิน">
    <div className="flex flex-col gap-3 border-b border-[#e2f1ed] bg-gradient-to-r from-[#f1fcf8] via-white to-[#eef8fd] px-6 py-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-[#275e55]">วิเคราะห์การเงิน</p><p className="mt-1 text-xs text-[#75968f]">มองภาพรวมจากธุรกรรมจริงของคุณใน 7 วันล่าสุด</p></div><span className="inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-[#2c8d76] shadow-sm">อัปเดตจาก LINE</span></div>
    <div className="grid gap-6 p-5 lg:grid-cols-[1.55fr_.95fr] lg:p-6">
      <div className="rounded-2xl border border-[#e4f0ed] bg-[#fbfefd] p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#315f58]">กระแสเงินเข้า–ออก</p><p className="mt-1 text-xs text-[#829e98]">รายได้และรายจ่ายรายวัน</p></div><div className={`rounded-xl px-3 py-2 text-right ${netSevenDay >= 0 ? "bg-[#e6f8ef] text-[#21866f]" : "bg-[#fff0ea] text-[#c56656]"}`}><p className="text-[10px] font-medium">สุทธิ 7 วัน</p><p className="mt-0.5 text-sm font-semibold">{netSevenDay >= 0 ? "+" : ""}{money.format(netSevenDay)}</p></div></div>{transactionCount ? <><div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="miloExpenseFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e98573" stopOpacity={0.3} /><stop offset="100%" stopColor="#e98573" stopOpacity={0} /></linearGradient><linearGradient id="miloIncomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2ca98a" stopOpacity={0.28} /><stop offset="100%" stopColor="#2ca98a" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e9f2ef" strokeDasharray="3 3" /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#7d9a94", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#7d9a94", fontSize: 11 }} width={42} /><Tooltip formatter={(value: number) => money.format(value)} labelStyle={{ color: "#315f58" }} contentStyle={{ borderRadius: 14, border: "1px solid #d5eae4", boxShadow: "0 10px 28px rgba(35, 116, 96, .12)" }} /><Area type="monotone" dataKey="income" name="รายรับ" stroke="#2ca98a" strokeWidth={2.5} fill="url(#miloIncomeFill)" /><Area type="monotone" dataKey="expense" name="รายจ่าย" stroke="#e98573" strokeWidth={2.5} fill="url(#miloExpenseFill)" /></AreaChart></ResponsiveContainer></div><div className="mt-1 flex flex-wrap gap-4 text-xs"><span className="flex items-center gap-2 text-[#398b79]"><i className="size-2 rounded-full bg-[#2ca98a]" />รายรับ</span><span className="flex items-center gap-2 text-[#c66b5c]"><i className="size-2 rounded-full bg-[#e98573]" />รายจ่าย</span></div></> : <div className="mt-4 grid h-64 place-items-center"><Empty text="ยังไม่มีธุรกรรมใน 7 วันล่าสุด กราฟจะแสดงทันทีเมื่อบันทึกรายรับหรือรายจ่ายผ่าน LINE" /></div>}</div>
      <div className="rounded-2xl border border-[#e4f0ed] bg-[#fbfefd] p-4 sm:p-5"><div><p className="text-sm font-semibold text-[#315f58]">สัดส่วนรายจ่าย</p><p className="mt-1 text-xs text-[#829e98]">แยกตามหมวดของเดือนนี้</p></div>{categories.length ? <><div className="relative mt-3 h-44"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="amount" nameKey="category" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none">{categories.map((item, index) => <Cell key={item.category} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip formatter={(value: number) => money.format(value)} contentStyle={{ borderRadius: 12, border: "1px solid #d5eae4" }} /></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[10px] text-[#829e98]">รายจ่ายรวม</p><p className="mt-0.5 text-lg font-semibold text-[#315f58]">{money.format(totalCategoryExpense)}</p></div></div></div><div className="mt-2 space-y-2">{categories.slice(0, 4).map((item, index) => <div key={item.category} className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-[#5f837b]"><i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="truncate">{item.category}</span></span><span className="font-medium text-[#315f58]">{Math.round((item.amount / totalCategoryExpense) * 100)}%</span></div>)}</div></> : <div className="mt-5"><Empty text="บันทึกรายจ่ายผ่าน LINE เพื่อดูสัดส่วนหมวดที่นี่" /></div>}</div>
    </div>
    <div className="grid border-t border-[#e2f1ed] bg-[#fcfffe] sm:grid-cols-3"><AnalyticsMetric label="ธุรกรรม 7 วัน" value={`${transactionCount} รายการ`} icon={ReceiptText} tone="sky" /><AnalyticsMetric label="รายรับ 7 วัน" value={money.format(sevenDayIncome)} icon={TrendingUp} tone="mint" /><AnalyticsMetric label={topCategory ? `หมวดสูงสุด: ${topCategory.category}` : "รอข้อมูลรายจ่าย"} value={topCategory ? money.format(topCategory.amount) : "—"} icon={TrendingDown} tone="peach" last /></div>
  </section>;
}

function AnalyticsMetric({ label, value, icon: Icon, tone, last = false }: { label: string; value: string; icon: typeof ReceiptText; tone: "mint" | "sky" | "peach"; last?: boolean }) { const tones = { mint: "bg-[#ddf7eb] text-[#218a70]", sky: "bg-[#e3f5fc] text-[#3688b0]", peach: "bg-[#fff0df] text-[#b46e30]" }; return <div className={`flex items-center gap-3 px-5 py-4 ${last ? "" : "border-b border-[#e5f0ed] sm:border-b-0 sm:border-r"}`}><span className={`grid size-9 place-items-center rounded-xl ${tones[tone]}`}><Icon className="size-4" /></span><div className="min-w-0"><p className="truncate text-[11px] text-[#7d9c95]">{label}</p><p className="mt-0.5 text-sm font-semibold text-[#315f58]">{value}</p></div></div>; }

function LinkAccountForm({ lineUserId, setLineUserId, pending, onSubmit, isRelinking = false, onCancel }: { lineUserId: string; setLineUserId: (value: string) => void; pending: boolean; onSubmit: () => void; isRelinking?: boolean; onCancel?: () => void }) {
  const isValidLineUserId = /^U[0-9a-fA-F]{32}$/.test(lineUserId.trim());
  return <section className="mx-auto mt-8 max-w-2xl rounded-[2rem] border border-[#cde8df] bg-white p-7 paper-shadow sm:p-10"><BotBadge /><p className="mt-6 text-sm font-semibold text-[#1a987b]">{isRelinking ? "แก้ไขบัญชี LINE" : "ขั้นตอนแรก: เชื่อมบัญชี LINE"}</p><h2 className="font-display mt-2 text-3xl font-semibold">{isRelinking ? "อัปเดต LINE ของคุณ" : "ให้ไมโลรู้ว่าเป็นคุณ"}</h2><p className="mt-4 leading-7 text-[#6c8d87]">พิมพ์คำว่า <b>ไอดี</b> ในแชทส่วนตัวกับไมโล แล้วคัดลอก LINE User ID ที่ไมโลตอบกลับมาวางด้านล่าง</p><form onSubmit={event => { event.preventDefault(); onSubmit(); }} className="mt-6 flex flex-col gap-3 sm:flex-row"><Input value={lineUserId} onChange={event => setLineUserId(event.target.value)} placeholder="LINE User ID เช่น Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" maxLength={33} autoCapitalize="none" className="h-12 rounded-xl border-[#cfe6df]" /><Button disabled={!isValidLineUserId || pending} className="h-12 rounded-xl bg-[#238f76] text-white hover:bg-[#157a62]">{isRelinking ? "บันทึกการเชื่อม" : "เชื่อมบัญชี"} <ChevronRight className="ml-1 size-4" /></Button>{onCancel && <Button type="button" variant="outline" onClick={onCancel} className="h-12 rounded-xl border-[#d2e9e3] text-[#548078]">ยกเลิก</Button>}</form><p className={`mt-4 text-xs leading-5 ${lineUserId && !isValidLineUserId ? "text-[#b35a50]" : "text-[#819f99]"}`}>{lineUserId && !isValidLineUserId ? "LINE User ID ต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว" : "LINE User ID ที่ถูกต้องขึ้นต้นด้วย U และตามด้วยอักขระ 32 ตัว"}</p></section>;
}

function SectionTitle({ title, subtitle, icon: Icon, tone }: { title: string; subtitle?: string; icon: typeof BellRing; tone: string }) { return <div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-[#315f58]">{title}</p>{subtitle && <p className="mt-1 text-xs text-[#83a19b]">{subtitle}</p>}</div><Icon className={`size-5 ${tone}`} /></div>; }
function StatCard({ label, value, icon: Icon, tone, emphasized = false }: { label: string; value: string; icon: typeof BellRing; tone: "mint" | "sky" | "peach" | "violet"; emphasized?: boolean }) { const tones = { mint: "bg-[#ddf7eb] text-[#218a70]", sky: "bg-[#e3f5fc] text-[#3688b0]", peach: "bg-[#fff0df] text-[#b46e30]", violet: "bg-[#f1eaff] text-[#8863b1]" }; return <div className={`rounded-[1.5rem] border p-5 soft-shadow ${emphasized ? "border-[#ded1ef] bg-[linear-gradient(135deg,#fbf8ff_0%,#fff_68%)]" : "border-[#d8ece7] bg-white"}`}><span className={`grid size-10 place-items-center rounded-2xl ${tones[tone]}`}><Icon className="size-5" /></span><p className="mt-5 text-xs text-[#789991]">{label}</p><p className={`font-display mt-1 font-semibold text-[#285c54] ${emphasized ? "text-3xl" : "text-2xl"}`}>{value}</p></div>; }
function BotBadge() { return <span className="grid size-10 place-items-center rounded-2xl bg-[#2bb895] text-white"><Bot className="size-5" /></span>; }
function Empty({ text }: { text: string }) { return <p className="rounded-xl bg-[#f5fbf9] px-3 py-4 text-center text-xs leading-5 text-[#87a39e]">{text}</p>; }
function LoadingState() { return <div className="grid min-h-screen place-items-center bg-[#f6fffc]"><div className="text-center"><Bot className="mx-auto size-7 animate-pulse text-[#2aa487]" /><p className="mt-3 text-sm text-[#759992]">กำลังเปิดข้อมูลไมโล...</p></div></div>; }
function LoginGate({ loading }: { loading: boolean }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const utils = trpc.useUtils();

  const adminLoginMutation = trpc.auth.adminLogin.useMutation({
    onSuccess: async (data: any) => {
      toast.success("เข้าสู่ระบบผู้ดูแลระบบสำเร็จ กำลังเปิดแดชบอร์ด...");
      if (data?.token) {
        try {
          sessionStorage.setItem("manus-cookie", `app_session_id=${data.token}`);
        } catch {}
      }
      await utils.auth.me.invalidate();
      window.location.reload();
    },
    onError: (err: any) => {
      toast.error(err.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      setIsSubmitting(false);
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username.trim()) {
      toast.error("กรุณากรอกชื่อผู้ดูแลระบบ (Username)");
      return;
    }
    if (!password) {
      toast.error("กรุณากรอกรหัสผ่าน (Password)");
      return;
    }
    setIsSubmitting(true);
    adminLoginMutation.mutate({ username: username.trim(), password });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f4faf7] px-5">
      <div className="w-full max-w-md rounded-[2.2rem] border border-[#d2ebe5] bg-white p-8 text-center paper-shadow">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e4f7f1] text-[#1c8c72]">
          <ShieldCheck className={`size-8 ${loading || isSubmitting ? "animate-pulse" : ""}`} />
        </div>
        <h1 className="font-display mt-5 text-2xl font-bold text-[#1a3d36]">ระบบจัดการหลังบ้านไมโล</h1>
        <p className="mt-1 text-xs text-[#208a71] font-semibold">Milo Admin Management Portal</p>
        <p className="mt-2 text-xs leading-relaxed text-[#688e87]">
          เข้าสู่ระบบสำหรับผู้ดูแลระบบ เพื่อจัดการการตั้งค่าและดูสถิติ
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
          <div>
            <label className="text-xs font-semibold text-[#284f47] block mb-1">ชื่อผู้ใช้ (Username)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={isSubmitting}
              className="w-full h-11 rounded-xl border border-[#cbe3dc] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#238f76]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-[#284f47]">รหัสผ่าน (Password)</label>
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-[11px] text-[#22a386] hover:underline font-medium"
              >
                ลืมรหัสผ่าน?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านผู้ดูแลระบบ"
                disabled={isSubmitting}
                className="w-full h-11 rounded-xl border border-[#cbe3dc] pl-3.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#238f76]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-[#79a098] hover:text-[#238f76]"
              >
                {showPassword ? "ซ่อน" : "ดู"}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-11 rounded-xl bg-[#238f76] text-white hover:bg-[#187863] font-semibold text-sm mt-2"
          >
            {isSubmitting ? "กำลังตรวจสอบข้อมูล..." : "ลงชื่อเข้าใช้ผู้ดูแลระบบ"}
          </Button>

          <div className="rounded-xl bg-[#f5fbf9] p-3 text-center border border-[#e4f5ef]">
            <p className="text-[11px] text-[#5e877f]">
              🔑 ค่าเริ่มต้น: Username <strong>admin</strong> | Password <strong>admin1234</strong>
            </p>
          </div>
        </form>

        <Link href="/" className="mt-6 block text-xs text-[#528c81] hover:underline">
          กลับหน้าหลัก
        </Link>

        {showForgotModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-left shadow-2xl border border-[#d3ebe5]">
              <h3 className="text-base font-bold text-[#1a3832]">กู้คืนรหัสผ่านผู้ดูแลระบบ</h3>
              <p className="text-xs text-[#638b82] mt-2 leading-relaxed">
                คุณสามารถเปลี่ยนหรือรีเซ็ตรหัสผ่านของ Admin ได้ทันทีผ่านการตั้งค่าตัวแปรในระบบโฮสติ้ง:
              </p>
              <div className="mt-3 rounded-xl bg-[#f5fbf9] p-3 text-xs text-[#315c53] font-mono border border-[#e0f2ec] space-y-1">
                <p>ADMIN_USERNAME = ชื่อที่ต้องการ</p>
                <p>ADMIN_PASSWORD = รหัสผ่านใหม่</p>
              </div>
              <p className="text-[11px] text-[#71968e] mt-2">
                บน Vercel: ไปที่ Settings &gt; Environment Variables เพื่อกำหนดรหัสผ่านใหม่แล้ว Redeploy
              </p>
              <div className="mt-5 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => setShowForgotModal(false)}
                  className="rounded-xl bg-[#238f76] text-white hover:bg-[#1b7e68] text-xs px-4"
                >
                  เข้าใจแล้ว ปิดหน้าต่าง
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="grid min-h-screen place-items-center bg-[#f6fffc] px-5"><div className="max-w-md rounded-3xl border border-[#f2d5ce] bg-white p-8 text-center paper-shadow"><p className="font-display text-xl font-semibold text-[#9a4f44]">เปิดข้อมูลไมโลไม่สำเร็จ</p><p className="mt-2 text-sm leading-6 text-[#8a756e]">{message}</p><Button onClick={onRetry} className="mt-5 rounded-xl bg-[#238f76] text-white">ลองอีกครั้ง</Button></div></div>; }

