import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { Landmark, ShieldCheck, UserMinus, UserPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export type FinanceAccountRecord = {
  account: { id: number; accountType: "personal" | "group"; name: string; lineChatId: string | null };
  membership: { role: "owner" | "manager" | "contributor" | "viewer" };
};

type LineGroup = { chat: { id: number; lineChatId: string; displayName: string | null } };

const roleLabel = { owner: "เจ้าของ", manager: "ผู้จัดการ", contributor: "ผู้บันทึก", viewer: "ผู้ดู" } as const;

export function FinanceAccountSwitcher({ accounts, financeAccountId, onChange, mobile = false }: { accounts: FinanceAccountRecord[]; financeAccountId?: number; onChange: (id: number | undefined) => void; mobile?: boolean }) {
  const personal = accounts.find(item => item.account.accountType === "personal");
  return <label className={`${mobile ? "flex w-full" : "hidden min-w-48 md:flex"} items-center gap-2 rounded-xl border border-[#d2e9e3] bg-white px-3 py-2 text-xs text-[#547a72]`}><Landmark className="size-3.5 text-[#6953a2]" /><span className="shrink-0 font-medium">{mobile ? "สมุดบัญชี" : ""}</span><select aria-label="เลือกสมุดบัญชีการเงิน" value={financeAccountId ?? "personal"} onChange={event => onChange(event.target.value === "personal" ? undefined : Number(event.target.value))} className="min-w-0 flex-1 bg-transparent outline-none"><option value="personal">{personal?.account.name ?? "บัญชีส่วนตัว"}</option>{accounts.filter(item => item.account.accountType === "group").map(item => <option key={item.account.id} value={item.account.id}>{item.account.name} · {roleLabel[item.membership.role]}</option>)}</select></label>;
}

export function FinanceAccountManagerPanel({ groups }: { groups: LineGroup[] }) {
  const utils = trpc.useUtils();
  const accounts = trpc.milo.financeAccounts.list.useQuery();
  const [groupChatId, setGroupChatId] = useState("");
  const [groupName, setGroupName] = useState("");
  const createGroup = trpc.milo.financeAccounts.createGroup.useMutation({
    onSuccess: () => { setGroupChatId(""); setGroupName(""); toast.success("เปิดสมุดบัญชีกลุ่มแล้ว สมาชิกจะเห็นเฉพาะเมื่อได้รับบทบาท"); void utils.milo.financeAccounts.list.invalidate(); void utils.milo.overview.invalidate(); },
    onError: error => toast.error(error.message),
  });
  const existingChatIds = new Set((accounts.data ?? []).filter(item => item.account.accountType === "group").map(item => item.account.lineChatId));
  const availableGroups = groups.filter(({ chat }) => !existingChatIds.has(chat.lineChatId));
  return <section id="groups" className="scroll-mt-24 mt-6 rounded-[1.6rem] border border-[#d7ebe6] bg-white p-6 soft-shadow" aria-label="สมุดบัญชีกลุ่ม LINE"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#fff0e9] text-[#b86657]"><UsersRound className="size-5" /></span><div><p className="text-sm font-semibold text-[#315f58]">สมุดบัญชีและกลุ่ม LINE</p><p className="mt-1 max-w-2xl text-xs leading-5 text-[#789891]">บัญชีส่วนตัวและบัญชีกลุ่มแยกจากกันเสมอ กลุ่มจะไม่แชร์ข้อมูลการเงินจนกว่าจะเปิดสมุดบัญชีและกำหนดบทบาทสมาชิกอย่างชัดเจน</p></div></div><span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#f0eaff] px-3 py-1.5 text-[11px] font-medium text-[#76519e]"><ShieldCheck className="size-3.5" />สิทธิ์ระดับบัญชี</span></div>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{accounts.isLoading ? <State text="กำลังโหลดสมุดบัญชี" /> : accounts.data?.filter(item => item.account.accountType === "personal").map(item => <div key={item.account.id} className="rounded-2xl border border-[#d9ece6] bg-[#f7fcfa] p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-white text-[#3a927b]"><Landmark className="size-4" /></span><div><p className="text-sm font-semibold text-[#315f58]">{item.account.name}</p><p className="text-[11px] text-[#7d9c95]">ส่วนตัว · {roleLabel[item.membership.role]} · ไม่เปิดเผยกับกลุ่ม</p></div></div></div>)}{accounts.data?.filter(item => item.account.accountType === "group").map(item => <GroupLedgerCard key={item.account.id} account={item} />)}</div>
    {availableGroups.length > 0 ? <form onSubmit={event => { event.preventDefault(); createGroup.mutate({ lineChatId: groupChatId, name: groupName.trim() }); }} className="mt-5 rounded-2xl border border-dashed border-[#c8e4dc] bg-[#fbfefd] p-4"><p className="text-xs font-semibold text-[#47766d]">เปิดสมุดบัญชีสำหรับกลุ่มที่เชื่อมแล้ว</p><p className="mt-1 text-[11px] leading-5 text-[#89a39e]">สร้างได้เฉพาะกลุ่มที่ไมโลตรวจพบว่าคุณเป็นสมาชิก แล้วเพิ่มสมาชิกจากรายชื่อที่ไมโลพบในกลุ่มเท่านั้น</p><div className="mt-3 grid gap-2 sm:grid-cols-[1.1fr_1fr_auto]"><select aria-label="เลือกกลุ่ม LINE" value={groupChatId} onChange={event => setGroupChatId(event.target.value)} className="h-10 rounded-xl border border-[#d2e7e1] bg-white px-3 text-sm text-[#426e65]"><option value="">เลือกกลุ่ม LINE</option>{availableGroups.map(({ chat }) => <option key={chat.lineChatId} value={chat.lineChatId}>{chat.displayName || "กลุ่ม LINE"}</option>)}</select><Input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="ชื่อสมุดบัญชี เช่น ค่าใช้จ่ายทีม" maxLength={120} className="rounded-xl" /><Button type="submit" disabled={!groupChatId || !groupName.trim() || createGroup.isPending} className="rounded-xl bg-[#765aa0] text-white hover:bg-[#65488f]">{createGroup.isPending ? "กำลังเปิด..." : "เปิดสมุดบัญชี"}</Button></div></form> : <State text={groups.length ? "ทุกกลุ่มที่ตรวจพบมีสมุดบัญชีแล้ว" : "เพิ่มไมโลเข้ากลุ่มและส่งข้อความอย่างน้อยหนึ่งครั้งก่อน จึงจะเปิดสมุดบัญชีกลุ่มได้"} />}</section>;
}

function GroupLedgerCard({ account }: { account: FinanceAccountRecord }) {
  const utils = trpc.useUtils();
  const members = trpc.milo.financeAccounts.members.useQuery({ financeAccountId: account.account.id });
  const [lineUserId, setLineUserId] = useState("");
  const [role, setRole] = useState<"manager" | "contributor" | "viewer">("contributor");
  const canManageMembers = account.membership.role === "owner";
  const refresh = () => { void utils.milo.financeAccounts.members.invalidate({ financeAccountId: account.account.id }); void utils.milo.financeAccounts.list.invalidate(); };
  const upsert = trpc.milo.financeAccounts.upsertMember.useMutation({ onSuccess: () => { setLineUserId(""); toast.success("อัปเดตบทบาทสมาชิกแล้ว"); refresh(); }, onError: error => toast.error(error.message) });
  const remove = trpc.milo.financeAccounts.removeMember.useMutation({ onSuccess: () => { toast.success("นำสมาชิกออกจากสมุดบัญชีแล้ว"); refresh(); }, onError: error => toast.error(error.message) });
  return <div className="rounded-2xl border border-[#eee5f7] bg-[#fcfaff] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#4f3b6f]">{account.account.name}</p><p className="mt-0.5 text-[11px] text-[#8d7ba3]">บัญชีกลุ่ม · สิทธิ์ของคุณ: {roleLabel[account.membership.role]}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-[#76519e]">แชร์เมื่อกำหนดสิทธิ์แล้ว</span></div><div className="mt-4 space-y-2">{members.isLoading ? <State text="กำลังโหลดสมาชิก" /> : members.data?.map(member => <div key={member.id} className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2"><span className="grid size-7 place-items-center rounded-full bg-[#f0eaff] text-[10px] font-semibold text-[#71559a]">{roleLabel[member.role].slice(0, 1)}</span><p className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#617e78]">{member.lineUserId}</p><span className="text-[11px] text-[#795f98]">{roleLabel[member.role]}</span>{canManageMembers && member.role !== "owner" && <button type="button" onClick={() => remove.mutate({ financeAccountId: account.account.id, lineUserId: member.lineUserId })} disabled={remove.isPending} aria-label={`นำ ${member.lineUserId} ออกจากสมุดบัญชี`} className="grid size-7 place-items-center rounded-lg text-[#ba665b] hover:bg-[#fff0ec] disabled:opacity-50"><UserMinus className="size-3.5" /></button>}</div>)}</div>{canManageMembers && <form onSubmit={event => { event.preventDefault(); upsert.mutate({ financeAccountId: account.account.id, lineUserId: lineUserId.trim(), role }); }} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"><Input value={lineUserId} onChange={event => setLineUserId(event.target.value)} placeholder="LINE User ID ของสมาชิก" aria-label="LINE User ID ของสมาชิก" className="rounded-xl text-xs" /><select value={role} onChange={event => setRole(event.target.value as "manager" | "contributor" | "viewer")} aria-label="บทบาทสมาชิก" className="rounded-xl border border-[#dfd3ed] bg-white px-3 text-xs text-[#62497f]"><option value="contributor">ผู้บันทึก</option><option value="viewer">ผู้ดู</option><option value="manager">ผู้จัดการ</option></select><Button type="submit" disabled={!lineUserId.trim() || upsert.isPending} className="rounded-xl bg-[#765aa0] text-white hover:bg-[#65488f]"><UserPlus className="mr-1 size-3.5" />เพิ่ม</Button></form>}</div>;
}

function State({ text }: { text: string }) { return <p className="mt-4 rounded-xl bg-[#f4fbf8] px-4 py-3 text-xs leading-5 text-[#789890]">{text}</p>; }
