import fs from "node:fs";
import sharp from "sharp";
const W=2500,H=1686,cols=5,rows=4;
const labels=[
["จดบันทึก","รายรับ • รายจ่าย"],["สแกนใบเสร็จ","OCR • สลิป"],["บันทึกเสียง","พูดแทนพิมพ์"],["วันนี้","ภาพรวมวันนี้"],["สัปดาห์นี้","สรุปการเงิน"],
["เดือนนี้","สรุปการเงิน"],["วิเคราะห์","พฤติกรรมการใช้เงิน"],["งบประมาณ","คุมงบรายหมวด"],["รายการ","ประวัติธุรกรรม"],["หมวดหมู่","จัดการหมวด"],
["เตือน","แจ้งเตือน"],["ปฏิทิน","นัดหมาย"],["งาน","สิ่งที่ต้องทำ"],["บิลรอจ่าย","ติดตามบิล"],["รายการประจำ","จดอัตโนมัติ"],
["ส่งออก","Excel / CSV"],["เอกสาร","สรุปเอกสาร"],["คลังไฟล์","ค้นหาไฟล์"],["ผู้ช่วยกลุ่ม","LINE Group"],["เมนูเพิ่ม","ฟีเจอร์ทั้งหมด"]];
const fills=["#EAFBF2","#EAF5FF","#FFF1F5","#FFF8DD","#F1EDFF"],strokes=["#55B98A","#62AEEB","#E77D9D","#E6B94A","#8D7BDB"];
const esc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-opacity=".13"/></filter></defs><rect width="2500" height="1686" fill="#F7FBF8"/>`];
labels.forEach(([title,sub],i)=>{const c=i%cols,r=Math.floor(i/cols),x=c*500,y=r*421,h=r===3?423:421,k=i%5;out.push(`<rect x="${x+16}" y="${y+16}" width="468" height="${h-32}" rx="32" fill="${fills[k]}" stroke="${strokes[k]}" stroke-width="5" filter="url(#s)"/><circle cx="${x+70}" cy="${y+68}" r="39" fill="${strokes[k]}"/><text x="${x+70}" y="${y+81}" text-anchor="middle" font-family="Arial,sans-serif" font-size="34" font-weight="700" fill="white">${i+1}</text><circle cx="${x+250}" cy="${y+150}" r="45" fill="white" stroke="${strokes[k]}" stroke-width="4"/><path d="M${x+225} ${y+150}q25-32 50 0q-25 32-50 0" fill="none" stroke="${strokes[k]}" stroke-width="7" stroke-linecap="round"/><circle cx="${x+238}" cy="${y+140}" r="4" fill="${strokes[k]}"/><circle cx="${x+262}" cy="${y+140}" r="4" fill="${strokes[k]}"/><text x="${x+250}" y="${y+252}" text-anchor="middle" font-family="Tahoma,Noto Sans Thai,Arial,sans-serif" font-size="44" font-weight="700" fill="#24493D">${esc(title)}</text><text x="${x+250}" y="${y+303}" text-anchor="middle" font-family="Tahoma,Noto Sans Thai,Arial,sans-serif" font-size="27" fill="#557269">${esc(sub)}</text><path d="M${x+428} ${y+340}h32m-12-10 12 10-12 10" fill="none" stroke="${strokes[k]}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`);});
out.push("</svg>");
const file=process.argv.includes("--preview")?"richmenu_milo_preview.png":"richmenu_milo.png";
await sharp(Buffer.from(out.join(""))).png({compressionLevel:9}).toFile(file);
console.log(JSON.stringify({file,width:W,height:H,buttons:labels.length}));
