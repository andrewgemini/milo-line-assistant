import 'dotenv/config';
import mysql from 'mysql2/promise';
import sharp from 'sharp';
import fs from 'node:fs/promises';

// Additive, one-transaction seed. Never calls LINE or enables scheduled jobs.
const batch = 'milo-uat-20260915-v1';
const cases = [
 ['01','จดรายรับ','เงินเดือน 35,000','รายรับ 35000 บาท หมวดเงินเดือน'],
 ['02','จดรายจ่าย','กินกาแฟ 80','รายจ่าย 80 บาท หมวดอาหาร รายการกินกาแฟ'],
 ['03','ข้อความ LINE','ค่ากาแฟ 40 บาท','บันทึกครั้งเดียว 40 บาท วันที่เวลาที่ส่ง Asia/Bangkok'],
 ['04','อ่านสลิป','ส่ง receipt.png แล้ว ยืนยันค่าใช้จ่าย','เสนอ 40 บาทก่อนยืนยัน; ยังไม่ลงบัญชีจนยืนยัน'],
 ['05','หลายรายการในใบเสร็จ','ส่ง multi-receipt.pdf หรือรูปหลายรายการ','ข้าว 120 และกาแฟ 40 รวม160; ไม่บันทึกยอดรวมซ้ำ'],
 ['06','เสียง','พูด ค่ากาแฟ 40 บาท แล้ว ยืนยันเสียง','ถอดเสียงตรงจริง 40 บาท หมวดอาหาร; ต้องทดสอบ Groq จริง'],
 ['07','PDF Pro Max','ส่ง multi-receipt.pdf แล้ว ยืนยัน PDF','เสนอ2รายการรวม160 วันที่2026-09-15 พร้อมหลักฐาน'],
 ['08','จัดหมวดอัตโนมัติ','เติมน้ำมัน 1000','หมวดเดินทาง 1000 บาท'],
 ['09','หมวดกำหนดเอง','เพิ่มหมวด สัตว์เลี้ยง','หมวดใหม่ไม่ซ้ำ; นำไปใช้กับธุรกรรมได้'],
 ['10','งบประมาณ','ดู UAT ไมโล - ส่วนตัว','อาหารใช้3800/5000 เหลือ1200 ใช้76%'],
 ['11','งบเกิน','ดู UAT ไมโล - เกินงบ','อาหาร5200/5000 เกิน200 คิดเป็น4% ไม่ใช่104%เกิน'],
 ['12','สรุปวันนี้','สรุปวันนี้','ตรงยอดในบัญชีที่เลือกและวันที่ท้องถิ่น'],
 ['13','รายงานเดือน','สรุปเดือนนี้','กันยายนบัญชีส่วนตัว รายรับ35000 รายจ่าย5300 คงเหลือ29700'],
 ['14','วิเคราะห์พฤติกรรม','วิเคราะห์','ใช้ข้อมูลบัญชีที่เลือก หมวดอาหาร3800 เดินทาง1000 ช้อปปิ้ง500'],
 ['15','กราฟขั้นสูง Pro','เปิดกราฟบัญชีUAT','กราฟหลายเดือน/หมวดตรงธุรกรรม; Free ถูกจำกัดตามสิทธิ์'],
 ['16','รายการประจำ','ดูรายการอัตโนมัติ UAT','มีรายวัน/สัปดาห์/เดือน อยู่สถานะพักทั้งหมด'],
 ['17','เตือนจดรายวัน','ดูเตือน UAT รายวัน','เวลา21:00 Asia/Bangkok; เปิดส่งจริงเฉพาะเมื่อผู้ทดสอบสั่ง'],
 ['18','รอบงบ25','ดู UAT ไมโล - รอบ25','วันที่24อยู่นอกรอบ วันที่25เข้ารอบ25ส.ค.–24ก.ย.'],
 ['19','Export Excel','ส่งออก Excel','ไฟล์เปิดได้ ยอดและจำนวนแถวตรงบัญชีUAT'],
 ['20','Export CSV','ส่งออก CSV','ภาษาไทยถูกต้อง ยอดตรง ไม่มีข้อมูลบัญชีอื่น'],
 ['21','บัญชีกลุ่ม Pro Max','ดู UAT ไมโล - กลุ่มจำลอง','owner/manager/contributor/viewer; การส่งLINEต้องใช้กลุ่มจริงแยก'],
 ['22','หลายบัญชี','สลับบัญชี UAT ทั้ง4','ยอดแยกจากบัญชีจริงและแยกกันทุกบัญชี'],
 ['23','หลักฐาน','เปิดหลักฐานรายการ UAT','ดาวน์โหลดไฟล์จริงจาก vault ได้ ไม่ใช่ลิงก์จำลองที่เสีย'],
 ['24','แก้ก่อนบันทึก','แก้ใบเสร็จ ยอด 50 บาท','แก้เฉพาะข้อเสนอ; ยืนยันแล้วจึงเพิ่มธุรกรรม'],
 ['25','Free/Pro/Pro Max','ใช้ผู้ทดสอบจริงแต่ละแพ็กเกจ','ทดสอบสิทธิ์ด้วยผู้ใช้จริงที่ไม่ใช่admin; adminมีPro Maxจึงใช้แทนไม่ได้'],
 ['26','ขีดจำกัด20/100','เพิ่มรายการที่21ของPro และที่101ของPro Max','ข้อกำหนด20/100; OPEN: โค้ดปัจจุบันจำกัด20ทุกแพ็กเกจ'],
 ['27','เตือนรายครั้ง','ดู UAT เตือนรายครั้ง','วันเวลาตรง; fixtureพักไว้ ไม่มีข้อความถูกส่ง'],
 ['28','เตือนประจำ','ดู UAT เตือนทุก15นาที/สัปดาห์/เดือน','ช่วงเวลาถูกต้องและไม่มีส่งซ้ำ; deliveryจริงยังต้องทดสอบ'],
 ['29','เตือนจากรูป','ส่งภาพใบนัดทดสอบ','ตรวจวันที่/เวลาก่อนยืนยันและตั้งเตือน'],
 ['30','เก็บข้อความ/ลิงก์/รูป/ไฟล์','ค้นหา UAT','ค้นคืนไฟล์ได้หลังผ่านเวลา; ไม่รับรองไม่มีวันหมดอายุจากseed'],
 ['31','กลุ่มและแท็ก','เตือน @เพื่อนในกลุ่มUATจริง','แท็กสมาชิกถูกคน ไม่ข้ามกลุ่ม; fixtureกลุ่มจำลองไม่ส่งLINE'],
 ['32','ปฏิทิน','ดูตาราง UAT นัดตรวจรับ','15ก.ย.2569 14:00–15:00 Asia/Bangkok; calendarภายใน ไม่ใช่Google sync'],
 ['33','To do','ดูงาน UAT / ทำเสร็จ','todoและdoneแสดงถูกต้องและแก้สถานะได้'],
 ['34','Quick search','ค้นหา UAT กาแฟ','คืนรายการ/หลักฐานที่เกี่ยวข้องและเคารพสิทธิ์'],
 ['35','เสียงเงียบ/ข้อมูลผิด','ส่ง silence.wav หรือพิมพ์ค่ากาแฟโดยไม่มียอด','ไม่สร้างธุรกรรมหรือจำนวนเงินที่เดาขึ้นมา'],
 ['36','UX และข้อมูลซ้ำ','ส่งeventเดิมซ้ำ/ย้อนกลับรายการ','ไม่จดซ้ำ; การ์ดไม่มีเลขจากภาพตัวอย่าง; ใช้คำว่าน่ะจ๊ะ'],
];
const plans = [
 { key:'personal', name:'UAT ไมโล - ส่วนตัว', type:'personal', day:1 },
 { key:'overbudget', name:'UAT ไมโล - เกินงบ', type:'personal', day:1 },
 { key:'cycle25', name:'UAT ไมโล - รอบ25', type:'personal', day:25 },
 { key:'group', name:'UAT ไมโล - กลุ่มจำลอง', type:'group', day:1 },
];
const date = (s='2026-09-15',time='10:00') => new Date(`${s}T${time}:00+07:00`);
function pdf(lines) {
 const stream = `BT /F1 16 Tf 50 760 Td ${lines.map((s,i)=>`${i?'0 -28 Td ':''}(${s}) Tj`).join('\n')} ET`;
 const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let output='%PDF-1.4\n'; const offsets=[0]; objects.forEach((x,i)=>{offsets.push(Buffer.byteLength(output));output+=`${i+1} 0 obj\n${x}\nendobj\n`;}); const xref=Buffer.byteLength(output); output+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(output);
}
async function assets() {
 const lines=['UAT SAMPLE - NOT A REAL RECEIPT','RECEIPT','Merchant: UAT Coffee','Date 2026-09-15 10:00','Coffee 40.00 THB','Total 40.00 THB'];
 const image=await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="800"><rect width="1100" height="800" fill="white"/>${lines.map((s,i)=>`<text x="40" y="${80+i*100}" font-size="36" font-family="Arial">${s}</text>`).join('')}</svg>`)).png().toBuffer();
 const wav=Buffer.alloc(44+64000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(64000,40);
 return [['receipt.png','image/png',image],['multi-receipt.pdf','application/pdf',pdf(['UAT SAMPLE - NOT REAL','2026-09-15 Rice 120.00 THB','2026-09-15 Coffee 40.00 THB','TOTAL 160.00 THB'])],['silence.wav','audio/wav',wav]];
}
await fs.mkdir('docs/uat-fixtures',{recursive:true});
const files=await assets();for(const [name,,bytes] of files)await fs.writeFile(`docs/uat-fixtures/${name}`,bytes);
await fs.writeFile('docs/uat-fixtures/cases.json',JSON.stringify(cases.map(([id,feature,input,expected])=>({id,feature,input,expected,status:'NOT_RUN'})),null,2));
if(!process.argv.includes('--apply')) { console.log(JSON.stringify({mode:'preview',batch,accounts:plans.map(x=>x.name),cases:cases.length,files:files.map(x=>x[0]),note:'Run with --apply to insert in configured DATABASE_URL. No LINE messages; all jobs paused.'},null,2));process.exit(0); }
const c=await mysql.createConnection({uri:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true},timezone:'Z'});
const insert=async(table,data)=>{const keys=Object.keys(data);const [r]=await c.execute(`INSERT INTO \`${table}\` (${keys.map(k=>'`'+k+'`').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));return r.insertId;};
try {
 await c.query("SET time_zone = '+00:00'");await c.beginTransaction();
 const [prior]=await c.execute('SELECT detailsJson FROM audit_logs WHERE action=? AND entityType=? LIMIT 1',['uat.seed',batch]);
 if(prior.length){console.log('Already seeded; unchanged:',prior[0].detailsJson);await c.rollback();}
 else {
 const [admins]=await c.query('SELECT u.id,l.lineUserId FROM users u JOIN line_account_links l ON l.dashboardUserId=u.id WHERE u.role="admin"');
 if(admins.length!==1)throw Error('Expected one linked dashboard admin; specify ownership before seeding');
 const owner=admins[0].lineUserId;const ids={};let transactionCount=0;
 for(const plan of plans){
   const identity=`UAT:${batch}:${plan.key}`;
   await insert('line_chats',{scope:plan.type==='group'?'group':'user',lineChatId:identity,displayName:plan.name,isActive:0});
   const account=await insert('finance_accounts',{accountType:plan.type,name:plan.name,ownerLineUserId:identity,lineChatId:identity,budgetCycleStartDay:plan.day,isActive:1});ids[plan.key]=account;
   await insert('finance_account_members',{financeAccountId:account,lineUserId:owner,role:'owner'});
   await insert('line_members',{lineChatId:identity,lineUserId:owner,displayName:'UAT ผู้ทดสอบ'});
   if(plan.type==='group')for(const role of ['manager','contributor','viewer']) { const member=`${identity}:${role}`;await insert('finance_account_members',{financeAccountId:account,lineUserId:member,role});await insert('line_members',{lineChatId:identity,lineUserId:member,displayName:`UAT ${role}`}); }
   for(const category of ['อาหาร','เดินทาง','ช้อปปิ้ง','สัตว์เลี้ยง'])await insert('expense_categories',{lineUserId:identity,financeAccountId:account,transactionType:'expense',name:category});
   await insert('expense_categories',{lineUserId:identity,financeAccountId:account,transactionType:'income',name:'เงินเดือน'});
   await insert('budgets',{lineUserId:identity,financeAccountId:account,category:'อาหาร',amount:5000,monthKey:plan.day===25?'2026-08':'2026-09',alertAtPercent:80});
   const rows=plan.key==='personal'?[
    ['income',35000,'เงินเดือน','เงินเดือน','2026-09-01'],['expense',40,'อาหาร','กาแฟ','2026-09-15'],['expense',120,'อาหาร','ข้าว','2026-09-15'],['expense',3640,'อาหาร','อาหารสะสม','2026-09-10'],['expense',1000,'เดินทาง','น้ำมัน','2026-09-12'],['expense',500,'ช้อปปิ้ง','ซื้อของ','2026-09-13'],
    ['income',34000,'เงินเดือน','เงินเดือนสิงหาคม','2026-08-01'],['expense',4200,'อาหาร','อาหารสิงหาคม','2026-08-10'],['income',33000,'เงินเดือน','เงินเดือนกรกฎาคม','2026-07-01'],['expense',4500,'อาหาร','อาหารกรกฎาคม','2026-07-10']
   ]:plan.key==='overbudget'?[['expense',5200,'อาหาร','อาหารเกินงบ4%','2026-09-15']]:plan.key==='cycle25'?[['expense',100,'อาหาร','ก่อนรอบ','2026-08-24'],['expense',200,'อาหาร','เริ่มรอบ','2026-08-25'],['expense',300,'อาหาร','ระหว่างรอบ','2026-09-15'],['expense',400,'อาหาร','ท้ายรอบ','2026-09-24'],['expense',500,'อาหาร','รอบใหม่','2026-09-25']]:[['income',10000,'เงินเดือน','เงินกองกลาง','2026-09-01'],['expense',1200,'อาหาร','อาหารกลุ่ม','2026-09-15']];
   for(const [i,row] of rows.entries()){const [type,amount,category,note,day]=row;const id=await insert('transactions',{lineChatId:identity,lineUserId:identity,financeAccountId:account,transactionType:type,amount,category,note:`[UAT] ${note}`,source:'uat_fixture',sourceMessageId:`${identity}:tx:${i}`,occurredAt:date(day)});transactionCount++;if(plan.key==='personal'&&i===1)ids.coffeeTransaction=id;}
   const recurringCount=plan.key==='personal'?20:plan.key==='group'?3:1;
   for(let i=0;i<recurringCount;i++)await insert('recurring_transactions',{lineUserId:identity,financeAccountId:account,lineChatId:identity,transactionType:'expense',amount:100+i,category:'อาหาร',note:`[UAT] รายการประจำ ${i+1}`,recurrenceType:['day','week','month'][i%3],recurrenceInterval:1,nextRunAt:date('2026-10-01'),status:'paused'});
 }
 for(const [id,feature,input,expected]of cases)await insert('notes',{lineChatId:owner,createdByLineUserId:owner,title:`[UAT ${id}] ${feature}`,content:`ข้อมูลจำลอง ${batch}\nสถานะ: ยังไม่ทดสอบ\nขั้นตอน: ${input}\nผลที่คาดหวัง: ${expected}\nผลจริง: ______\nหลักฐาน: ______`});
 for(const type of ['once','minute','day','week','month'])await insert('reminders',{lineChatId:owner,createdByLineUserId:owner,title:`[UAT] เตือน ${type}`,detail:'ข้อมูลทดสอบ พักไว้ ไม่ส่งLINEอัตโนมัติ',status:'paused',timezone:'Asia/Bangkok',recurrenceType:type,recurrenceInterval:type==='minute'?15:1,dueAt:date('2026-09-16','21:00'),nextRunAt:date('2026-09-16','21:00'),sourceMessageId:`${batch}:reminder:${type}`});
 for(const status of ['todo','done'])await insert('todo_items',{lineChatId:owner,createdByLineUserId:owner,title:`[UAT] ตรวจรับไมโล ${status}`,detail:batch,status,dueAt:date('2026-09-16'),...(status==='done'?{completedAt:date()}: {})});
 await insert('calendar_events',{lineChatId:owner,createdByLineUserId:owner,title:'[UAT] นัดตรวจรับไมโล',detail:batch,startsAt:date('2026-09-15','14:00'),endsAt:date('2026-09-15','15:00'),sourceMessageId:`${batch}:calendar`});
 for(const [name,mimeType,content]of files){const storageKey=`db:uat/${batch}/${name}`;await insert('vault_blobs',{storageKey,mimeType,sizeBytes:content.length,content});const vault=await insert('vault_items',{lineChatId:owner,createdByLineUserId:owner,itemType:mimeType.startsWith('image')?'image':'file',title:`[UAT] ${name}`,searchableText:'UAT กาแฟ ข้าว หลักฐานจำลอง',tagsText:'UAT,ข้อมูลจำลอง',originalFilename:name,mimeType,storageKey,storageUrl:`/api/milo/storage/${encodeURIComponent(storageKey)}`,lineMessageId:`${batch}:${name}`});if(name==='receipt.png')await insert('transaction_attachments',{transactionId:ids.coffeeTransaction,vaultItemId:vault,lineUserId:owner,label:'UAT หลักฐานตัวอย่าง ไม่ใช่ผลOCRจริง'});}
 await insert('vault_items',{lineChatId:owner,createdByLineUserId:owner,itemType:'text',title:'[UAT] ข้อความเก็บไว้',searchableText:'UAT รายการกาแฟ 40 บาท ข้อมูลจำลอง',tagsText:'UAT'});
 await insert('vault_items',{lineChatId:owner,createdByLineUserId:owner,itemType:'link',title:'[UAT] คู่มือไมโล',sourceUrl:'https://milo-line-app.vercel.app',searchableText:'UAT ลิงก์ไมโล',tagsText:'UAT'});
 const result={batch,accounts:ids,transactions:transactionCount,uatCases:cases.length,reminders:5,todos:2,calendar:1,vault:5,recurring:25,allScheduledJobsPaused:true};
 await insert('audit_logs',{action:'uat.seed',entityType:batch,dashboardUserId:admins[0].id,detailsJson:JSON.stringify(result)});
 await c.commit();console.log(JSON.stringify(result,null,2));
 }
}catch(e){await c.rollback();console.error('UAT seed failed; rolled back:',e.code||e.message);process.exitCode=1;}finally{await c.end();}
