import { useState } from "react";
import { Link } from "wouter";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const utils = trpc.useUtils();
  const login = trpc.auth.adminLogin.useMutation({
    onSuccess: async () => {
      toast.success("เข้าสู่ระบบผู้ดูแลระบบสำเร็จ กำลังเปิดแดชบอร์ด...");
      await utils.auth.me.invalidate();
      window.location.reload();
    },
    onError: error => {
      setPending(false);
      toast.error(error.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername) return toast.error("กรุณากรอกชื่อผู้ใช้ (Username)");
    if (!password) return toast.error("กรุณากรอกรหัสผ่าน (Password)");
    setPending(true);
    login.mutate({ username: normalizedUsername, password });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#f4faf7] px-5">
      <div className="w-full max-w-md rounded-[2.2rem] border border-[#d2ebe5] bg-white p-8 text-center paper-shadow">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e4f7f1] text-[#1c8c72]">
          <ShieldCheck className={`size-8 ${pending ? "animate-pulse" : ""}`} />
        </div>
        <h1 className="font-display mt-5 text-2xl font-bold text-[#1a3d36]">ระบบจัดการหลังบ้านไมโล</h1>
        <p className="mt-1 text-xs font-semibold text-[#208a71]">Milo Admin Management Portal</p>
        <p className="mt-2 text-xs leading-relaxed text-[#688e87]">เข้าสู่ระบบสำหรับผู้ดูแลระบบ เพื่อจัดการการตั้งค่าและดูสถิติ</p>

        <form onSubmit={submit} className="mt-6 space-y-4 text-left">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#284f47]">ชื่อผู้ใช้ (Username)</label>
            <input type="text" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="ชื่อผู้ใช้ผู้ดูแลระบบ" disabled={pending} className="h-11 w-full rounded-xl border border-[#cbe3dc] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#238f76]" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#284f47]">รหัสผ่าน (Password)</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="กรอกรหัสผ่านผู้ดูแลระบบ" disabled={pending} className="h-11 w-full rounded-xl border border-[#cbe3dc] pl-3.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#238f76]" />
              <button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3 text-[#79a098] hover:text-[#238f76]">{showPassword ? "ซ่อน" : "ดู"}</button>
            </div>
          </div>
          <Button type="submit" disabled={pending} className="mt-2 h-11 w-full rounded-xl bg-[#238f76] text-sm font-semibold text-white hover:bg-[#187863]">{pending ? "กำลังตรวจสอบข้อมูล..." : "ลงชื่อเข้าใช้ผู้ดูแลระบบ"}</Button>
        </form>

        <div className="mt-4 rounded-xl border border-[#e4f5ef] bg-[#f5fbf9] p-3 text-center">
          <p className="text-[11px] leading-5 text-[#5e877f]">ไม่มีการแสดง Username หรือรหัสผ่านเริ่มต้นบนหน้า Login</p>
        </div>
        <Link href="/" className="mt-6 block text-xs text-[#528c81] hover:underline">กลับหน้าหลัก</Link>
      </div>
    </div>
  );
}
