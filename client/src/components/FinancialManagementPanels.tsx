import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { transactionEvidenceForRow } from "@/lib/transactionEvidence";
import { BrainCircuit, CheckCircle2, Paperclip, Pencil, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 2 });

export type ManagedTransaction = {
  id: number;
  transactionType: "income" | "expense";
  amount: string | number;
  category: string;
  note: string | null;
  occurredAt: Date | string;
};

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl bg-[#f4fbf8] px-4 py-3 text-xs text-[#789890]">{text}</p>;
}

export function TransactionManagerPanel({ transactions, financeAccountId, role = "owner" }: { transactions: ManagedTransaction[]; financeAccountId?: number; role?: "owner" | "manager" | "contributor" | "viewer" }) {
  const utils = trpc.useUtils();
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<ManagedTransaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const transactionIds = transactions.map(item => item.id);
  const evidence = trpc.milo.finance.attachments.useQuery({ transactionIds, financeAccountId }, { enabled: transactionIds.length > 0 });
  const refresh = () => {
    void utils.milo.finance.transactions.invalidate();
    void utils.milo.finance.summary.invalidate();
    void utils.milo.finance.report.invalidate();
    void utils.milo.overview.invalidate();
  };
  const create = trpc.milo.finance.create.useMutation({
    onSuccess: () => { toast.success("บันทึกธุรกรรมแล้ว"); setAmount(""); setCategory(""); setNote(""); refresh(); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.milo.finance.update.useMutation({
    onSuccess: () => { toast.success("แก้ไขธุรกรรมแล้ว"); setEditing(null); refresh(); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.milo.finance.delete.useMutation({
    onSuccess: () => { toast.success("ลบธุรกรรมแล้ว โดยเก็บ audit log ไว้"); refresh(); },
    onError: error => toast.error(error.message),
  });
  const canCreate = role !== "viewer";
  const canManage = role === "owner" || role === "manager";
  const startEdit = (item: ManagedTransaction) => {
    setEditing(item);
    setEditAmount(String(item.amount));
    setEditCategory(item.category);
    setEditNote(item.note ?? "");
  };

  return <section className="mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow" aria-label="จัดการธุรกรรม">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-sm font-semibold text-[#315f58]">จัดการธุรกรรม</p><p className="mt-1 text-xs text-[#83a19b]">เพิ่ม แก้ไข หรือลบแบบ soft-delete พร้อมบันทึกประวัติการตรวจสอบและหลักฐานที่ยืนยันแล้ว</p></div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eef9f5] px-3 py-1.5 text-[11px] font-medium text-[#368872]"><ShieldCheck className="size-3.5" />สิทธิ์: {role}</span>
    </div>
    {!canCreate && <div className="mt-4"><Empty text="สิทธิ์ผู้ดูดูข้อมูลได้อย่างเดียว จึงไม่สามารถเพิ่ม แก้ไข หรือลบธุรกรรม" /></div>}
    <form onSubmit={event => { event.preventDefault(); create.mutate({ transactionType: type, amount: Number(amount), category: category.trim(), note: note.trim() || undefined, financeAccountId }); }} className="mt-5 grid gap-2 sm:grid-cols-[auto_110px_1fr_1.5fr_auto]">
      <select disabled={!canCreate} aria-label="ประเภทธุรกรรม" value={type} onChange={event => setType(event.target.value as "income" | "expense")} className="h-10 rounded-xl border border-[#d2e7e1] bg-white px-3 text-sm text-[#426e65]"><option value="expense">รายจ่าย</option><option value="income">รายรับ</option></select>
      <Input disabled={!canCreate} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="จำนวนเงิน" className="rounded-xl" />
      <Input disabled={!canCreate} value={category} onChange={event => setCategory(event.target.value)} placeholder="หมวด" className="rounded-xl" />
      <Input disabled={!canCreate} value={note} onChange={event => setNote(event.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="rounded-xl" />
      <Button type="submit" disabled={!canCreate || Number(amount) <= 0 || !category.trim() || create.isPending} className="rounded-xl bg-[#238f76] text-white hover:bg-[#157a62]"><Plus className="mr-1 size-4" />{create.isPending ? "กำลังบันทึก" : "เพิ่ม"}</Button>
    </form>
    {editing && canManage && <form onSubmit={event => { event.preventDefault(); update.mutate({ id: editing.id, amount: Number(editAmount), category: editCategory.trim(), note: editNote.trim() || null, financeAccountId }); }} className="mt-4 rounded-2xl border border-[#cfe7df] bg-[#f3fbf8] p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[#33695f]">แก้ไขรายการ #{editing.id}</p><button type="button" onClick={() => setEditing(null)} className="text-xs text-[#7b9b94] hover:text-[#315f58]">ยกเลิก</button></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3"><Input inputMode="decimal" value={editAmount} onChange={event => setEditAmount(event.target.value)} aria-label="ยอดแก้ไข" /><Input value={editCategory} onChange={event => setEditCategory(event.target.value)} aria-label="หมวดแก้ไข" /><Input value={editNote} onChange={event => setEditNote(event.target.value)} aria-label="หมายเหตุแก้ไข" /></div>
      <Button type="submit" disabled={update.isPending || Number(editAmount) <= 0 || !editCategory.trim()} className="mt-3 rounded-xl bg-[#238f76] text-white hover:bg-[#157a62]">{update.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}</Button>
    </form>}
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-xs">
        <thead className="border-b border-[#e6f1ee] text-[#88a49d]"><tr><th className="px-3 py-2.5 font-medium">วันที่</th><th className="px-3 py-2.5 font-medium">รายการ</th><th className="px-3 py-2.5 font-medium">หมวด</th><th className="px-3 py-2.5 text-right font-medium">จำนวนเงิน</th><th className="px-3 py-2.5 font-medium">หลักฐาน</th><th className="px-3 py-2.5 text-right font-medium">จัดการ</th></tr></thead>
        <tbody>{transactions.map(item => {
          const linked = transactionEvidenceForRow(item.id, evidence.data ?? []);
          return <tr key={item.id} className="border-b border-[#f1f6f4] last:border-0"><td className="px-3 py-2.5 text-[#78958f]">{new Date(item.occurredAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</td><td className="px-3 py-2.5 text-[#315f58]">{item.note || (item.transactionType === "income" ? "รายรับ" : "รายจ่าย")}</td><td className="px-3 py-2.5 text-[#78958f]">{item.category}</td><td className={`px-3 py-2.5 text-right font-semibold ${item.transactionType === "income" ? "text-[#23856e]" : "text-[#ce6f5e]"}`}>{item.transactionType === "income" ? "+" : "−"}{currency.format(Number(item.amount))}</td><td className="px-3 py-2.5">{evidence.isLoading ? <span className="text-[#8fa5a0]">กำลังโหลด...</span> : linked.length ? linked.map(attachment => { const url = attachment.storageUrl ?? attachment.sourceUrl; return url ? <a key={attachment.id} href={url} target="_blank" rel="noreferrer" className="mb-1 flex w-fit items-center gap-1 rounded-lg bg-[#edf7fc] px-2 py-1 text-[10px] font-medium text-[#33799c] hover:bg-[#dff0f9]"><Paperclip className="size-3" />{attachment.label || attachment.title}</a> : <span key={attachment.id} className="text-[#9baeb2]">{attachment.label || attachment.title}</span>; }) : <span className="text-[#9baeb2]">ไม่มี</span>}</td><td className="px-3 py-2.5"><div className="flex justify-end gap-1.5">{canManage && <><button type="button" onClick={() => startEdit(item)} className="grid size-7 place-items-center rounded-lg text-[#2e846f] hover:bg-[#e8f8f2]" aria-label={`แก้ไขรายการ ${item.id}`}><Pencil className="size-3.5" /></button><button type="button" disabled={remove.isPending} onClick={() => remove.mutate({ id: item.id, financeAccountId })} className="grid size-7 place-items-center rounded-lg text-[#bb6558] hover:bg-[#fff0ec] disabled:opacity-50" aria-label={`ลบรายการ ${item.id}`}><Trash2 className="size-3.5" /></button></>}</div></td></tr>;
        })}</tbody>
      </table>
      {transactions.length === 0 && <div className="mt-3"><Empty text="ยังไม่มีธุรกรรมจริงที่จัดการได้" /></div>}
      {evidence.error && <p className="mt-3 rounded-xl bg-[#fff6f3] px-3 py-2 text-xs text-[#b65d52]">{evidence.error.message}</p>}
    </div>
  </section>;
}

export function FinancialAssistantPanel({ financeAccountId }: { financeAccountId?: number }) {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const assistant = trpc.milo.finance.aiSummary.useMutation({ onError: error => toast.error(error.message) });
  const insight = assistant.data;
  return <section className="mt-6 rounded-[1.6rem] border border-[#d5e9e3] bg-gradient-to-br from-[#f4fcf9] via-white to-[#f2f8ff] p-6 soft-shadow" aria-label="AI assistant การเงิน"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#e2f8ee] text-[#21866e]"><BrainCircuit className="size-5" /></span><div><p className="text-sm font-semibold text-[#315f58]">AI ผู้ช่วยวิเคราะห์การเงิน</p><p className="mt-1 text-xs leading-5 text-[#779891]">วิเคราะห์จากธุรกรรมที่บันทึกจริงในสมุดบัญชีที่เลือกเท่านั้น และจะแจ้งเมื่อข้อมูลยังไม่เพียงพอ</p></div></div><div className="flex gap-2"><select value={period} onChange={event => setPeriod(event.target.value as "day" | "week" | "month" | "year")} className="rounded-xl border border-[#cfe5df] bg-white px-3 text-xs text-[#47736a]"><option value="day">วันนี้</option><option value="week">สัปดาห์นี้</option><option value="month">เดือนนี้</option><option value="year">ปีนี้</option></select><Button onClick={() => assistant.mutate({ period, financeAccountId })} disabled={assistant.isPending} className="rounded-xl bg-[#276f9b] text-white hover:bg-[#1d5a80]">{assistant.isPending ? "กำลังวิเคราะห์..." : "วิเคราะห์"}</Button></div></div>{insight && <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_.8fr]"><div className="rounded-2xl bg-white/85 p-4"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-[#2f9d7e]" /><p className="text-xs font-semibold text-[#47766d]">{insight.dataSufficiency === "adequate" ? "ข้อมูลเพียงพอ" : insight.dataSufficiency === "limited" ? "ข้อมูลมีจำกัด" : "ข้อมูลไม่เพียงพอ"}</p></div><p className="mt-3 text-sm leading-6 text-[#315f58]">{insight.summary}</p>{insight.highlights.length > 0 && <ul className="mt-3 space-y-1.5 text-xs leading-5 text-[#567d74]">{insight.highlights.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul>}</div><div className="rounded-2xl border border-[#daeae6] bg-white/90 p-4"><p className="text-xs font-semibold text-[#47766d]">แนวทางจัดการ</p>{insight.suggestedActions.length ? <ul className="mt-3 space-y-2 text-xs leading-5 text-[#567d74]">{insight.suggestedActions.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)}</ul> : <p className="mt-3 text-xs text-[#7e9b95]">ยังไม่มีคำแนะนำจากข้อมูลที่มี</p>}</div></div>}</section>;
}

export function AdminGovernancePanelStandard({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const users = trpc.milo.admin.users.useQuery(undefined, { enabled: isAdmin });
  const audit = trpc.milo.admin.auditLogs.useQuery({ limit: 20 }, { enabled: isAdmin });
  const updateRole = trpc.milo.admin.updateUserRole.useMutation({ onSuccess: () => { toast.success("อัปเดตสิทธิ์แล้ว"); void utils.milo.admin.users.invalidate(); void utils.milo.admin.auditLogs.invalidate(); }, onError: error => toast.error(error.message) });
  if (!isAdmin) return null;
  const retryUsers = () => void users.refetch();
  const retryAudit = () => void audit.refetch();
  return <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="ผู้ดูแลระบบ"><section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f0eaff] text-[#8460ab]"><UserCog className="size-4" /></span><div><p className="text-sm font-semibold text-[#315f58]">ผู้ใช้และสิทธิ์</p><p className="text-xs text-[#83a19b]">กำหนด viewer, user, manager หรือ admin</p></div></div><div className="mt-4 space-y-2">{users.isLoading ? <Empty text="กำลังโหลดผู้ใช้" /> : users.error ? <AdminError text={users.error.message} onRetry={retryUsers} /> : users.data?.length ? users.data.map(member => <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f6fbf9] p-3"><div className="min-w-36 flex-1"><p className="text-xs font-semibold text-[#426e65]">{member.name || "ผู้ใช้"}</p><p className="text-[10px] text-[#87a29d]">{member.email || "ไม่มีอีเมล"}</p></div><select value={member.role} disabled={updateRole.isPending} onChange={event => updateRole.mutate({ id: member.id, role: event.target.value as "viewer" | "user" | "manager" | "admin" })} className="rounded-lg border border-[#cfe5df] bg-white px-2 py-1.5 text-xs text-[#426e65]"><option value="viewer">viewer</option><option value="user">user</option><option value="manager">manager</option><option value="admin">admin</option></select></div>) : <Empty text="ยังไม่มีผู้ใช้ที่จัดการได้" />}</div></section><section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fff0df] text-[#b87534]"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-semibold text-[#315f58]">Audit log ล่าสุด</p><p className="text-xs text-[#83a19b]">บันทึกการสร้าง แก้ไข ลบ และเปลี่ยนสิทธิ์</p></div></div><div className="mt-4 space-y-2">{audit.isLoading ? <Empty text="กำลังโหลด audit log" /> : audit.error ? <AdminError text={audit.error.message} onRetry={retryAudit} /> : audit.data?.length ? audit.data.map(log => <div key={log.id} className="rounded-xl bg-[#f8fcfb] px-3 py-2"><p className="text-xs font-medium text-[#416e65]">{log.action}</p><p className="mt-0.5 text-[10px] text-[#88a29c]">{new Date(log.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</p></div>) : <Empty text="ยังไม่มี audit log" />}</div></section></section>;
}

function AdminError({ text, onRetry }: { text: string; onRetry: () => void }) { return <div className="rounded-xl bg-[#fff7f4] px-3 py-3 text-xs text-[#b75c50]"><p>{text}</p><Button type="button" variant="outline" onClick={onRetry} className="mt-2 h-8 rounded-lg border-[#ebcfc8] text-xs text-[#a95248]">ลองใหม่</Button></div>; }

export function AdminGovernancePanel({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const users = trpc.milo.admin.users.useQuery(undefined, { enabled: isAdmin });
  const audit = trpc.milo.admin.auditLogs.useQuery({ limit: 20 }, { enabled: isAdmin });
  const updateRole = trpc.milo.admin.updateUserRole.useMutation({ onSuccess: () => { toast.success("อัปเดตสิทธิ์แล้ว"); void utils.milo.admin.users.invalidate(); void utils.milo.admin.auditLogs.invalidate(); }, onError: error => toast.error(error.message) });
  if (!isAdmin) return null;
  return <section className="mt-6 grid gap-6 xl:grid-cols-2" aria-label="ผู้ดูแลระบบ"><section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#f0eaff] text-[#8460ab]"><UserCog className="size-4" /></span><div><p className="text-sm font-semibold text-[#315f58]">ผู้ใช้และสิทธิ์</p><p className="text-xs text-[#83a19b]">กำหนด viewer, user, manager หรือ admin</p></div></div><div className="mt-4 space-y-2">{users.isLoading ? <Empty text="กำลังโหลดผู้ใช้" /> : users.data?.map(member => <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-[#f6fbf9] p-3"><div className="min-w-36 flex-1"><p className="text-xs font-semibold text-[#426e65]">{member.name || "ผู้ใช้"}</p><p className="text-[10px] text-[#87a29d]">{member.email || "ไม่มีอีเมล"}</p></div><select value={member.role} disabled={updateRole.isPending} onChange={event => updateRole.mutate({ id: member.id, role: event.target.value as "viewer" | "user" | "manager" | "admin" })} className="rounded-lg border border-[#cfe5df] bg-white px-2 py-1.5 text-xs text-[#426e65]"><option value="viewer">viewer</option><option value="user">user</option><option value="manager">manager</option><option value="admin">admin</option></select></div>)}</div></section><section className="rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#fff0df] text-[#b87534]"><ShieldCheck className="size-4" /></span><div><p className="text-sm font-semibold text-[#315f58]">Audit log ล่าสุด</p><p className="text-xs text-[#83a19b]">บันทึกการสร้าง แก้ไข ลบ และเปลี่ยนสิทธิ์</p></div></div><div className="mt-4 space-y-2">{audit.isLoading ? <Empty text="กำลังโหลด audit log" /> : audit.data?.length ? audit.data.map(log => <div key={log.id} className="rounded-xl bg-[#f8fcfb] px-3 py-2"><p className="text-xs font-medium text-[#416e65]">{log.action}</p><p className="mt-0.5 text-[10px] text-[#88a29c]">{new Date(log.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · {log.entityType}{log.entityId ? ` #${log.entityId}` : ""}</p></div>) : <Empty text="ยังไม่มี audit log" />}</div></section></section>;
}
