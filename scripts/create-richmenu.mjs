import 'dotenv/config';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('../shared/richmenu.json',import.meta.url),'utf8'));
if (!process.argv.includes('--apply')) {
  console.log(JSON.stringify(config,null,2));
  console.log('Preview only. Run with --apply to create and activate; old menus are retained.');
} else {
  const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if(!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is required');
  const image=fs.readFileSync(new URL('../richmenu_milo.png',import.meta.url));
  async function request(url,body,contentType='application/json') {
    const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':contentType},body});
    if(!response.ok) throw new Error('LINE '+response.status+': '+await response.text());
    return response;
  }
  await request('https://api.line.me/v2/bot/richmenu/validate',JSON.stringify(config));
  const previous=await fetch('https://api.line.me/v2/bot/user/all/richmenu',{headers:{Authorization:'Bearer '+token}});
  if(previous.ok) console.log('Previous default (rollback):',await previous.text());
  const created=await request('https://api.line.me/v2/bot/richmenu',JSON.stringify(config));
  const {richMenuId}=await created.json();
  console.log('Created:',richMenuId);
  await request('https://api-data.line.me/v2/bot/richmenu/'+richMenuId+'/content',image,'image/png');
  await request('https://api.line.me/v2/bot/user/all/richmenu/'+richMenuId);
  console.log('Activated:',richMenuId);
}
