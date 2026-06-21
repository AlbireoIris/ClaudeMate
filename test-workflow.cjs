const http=require('http'),fs=require('fs'),path=require('path'),{execSync,spawn}=require('child_process')
const PORT=18993,OPENCODE_BIN=path.join(__dirname,'opencode-engine.exe'),LOG=path.join(__dirname,'workflow-test.log')
const PRE='自动化测试。所有工具已安装直接用不询问权限。60秒超时。输出简洁。'

function req(m,p,b,t=180000){return new Promise((R,J)=>{let s=b?JSON.stringify(b):undefined,Bu=s?Buffer.from(s,'utf-8'):undefined;const r=http.request({hostname:'127.0.0.1',port:PORT,path:p,method:m,headers:{'Content-Type':'application/json;charset=utf-8',...(Bu?{'Content-Length':String(Bu.length)}:{})},timeout:t},res=>{let d='';res.on('data',c=>d+=c.toString());res.on('end',()=>{try{R({status:res.statusCode,data:JSON.parse(d)})}catch{R({status:res.statusCode,data:d})}})});r.on('error',J);if(Bu)r.write(Bu);r.end()})}
async function ai(p,t=180000){const r1=await req('POST','/session',{directory:'H:/claude-code-assistant'});const r2=await req('POST','/session/'+r1.data.id+'/message',{parts:[{type:'text',text:p}],resume:true},t);const all=r2.data.parts||[];const texts=all.filter(p=>p.type==='text').map(p=>p.text).join('');const tools=all.filter(p=>p.type==='tool');let out=texts;if(tools.length)out+=' [TOOLS:'+tools.length+']';return out}

const STEPS=[
  ["1-Playwright抓取","用Playwright无头打开https://hxcy.top/634305.html。从H:/downloads/cookies.json读hxcy域名cookie注入。等5秒。提取解压密码和百度提取码。输出FLYYZ和smbd。",o=>o.includes("FLYYZ")],
  ["2-QR解码","下载QR图片(https://image.acg.lol/file/2026/06/19/LISQYfMA_pwdsmbd03969e98d7462b98.png)到H:/navi_qr.png,用jsQR+pngjs解码。输出百度盘链接surl和pwd。",o=>o.includes("pan.baidu")||o.includes("1lc98")],
  ["3-触发百度下载","用Playwright:注入百度cookie→打开https://pan.baidu.com/s/1lc98wHXZv7o9CbLISQYfMA→填提取码smbd→点下载按钮→等90秒。",o=>o.includes("下载")||o.includes("baidu")],
  ["4-等新文件","用node检查D:/百度网盘临时下载是否有新文件出现。等120秒后列出最新5个文件。",o=>o.includes("New")||/d/.test(o)],
  ["5-伪装检测","检查下载目录中最新的.mp4文件是否MP4头+ZIP尾的伪装文件。是则改名.zip。",o=>o.includes("伪装")||o.includes("normal")||o.includes(".zip")],
  ["6-解压","用WinRAR(C:/Users/Iris/Downloads/Winrar+小脚本3.2.1/Winrar/WinRAR.exe)解压到D:/百度网盘临时下载/extracted。密码FLYYZ,yejiang,smbd。递归。",o=>o.includes("解压")||o.includes("完成")||o.includes("extracted")],
]

async function main(){
  try{execSync('taskkill //F //IM opencode-engine.exe',{stdio:'ignore'})}catch{}
  await new Promise(r=>setTimeout(r,2000))
  spawn(OPENCODE_BIN,['serve','--hostname','127.0.0.1','--port',String(PORT)],{cwd:'H:/',env:{...process.env,DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY||'${DEEPSEEK_API_KEY}'},stdio:'ignore'})
  await new Promise(r=>setTimeout(r,8000))
  fs.writeFileSync(LOG,'')
  console.log('=== NAVI Workflow ===\n')
  
  let pass=0,fail=0
  for(const [label,prompt,check] of STEPS){
    console.log('── '+label+' ──')
    const t=Date.now()
    try{
      const out=await ai(PRE+'\n'+prompt,300000)
      const d=((Date.now()-t)/1000).toFixed(1)
      const ok=check(out)
      console.log((ok?'✅':'❌')+' '+d+'s | '+out.slice(0,200))
      fs.appendFileSync(LOG,JSON.stringify({time:new Date().toISOString(),label,status:ok?'PASS':'FAIL',output:out.slice(0,500),duration:d})+'\n')
      if(ok)pass++;else{fail++;console.log('⛔ 中断: 此步骤失败');break}
    }catch(e){
      console.log('❌ '+e.message)
      fail++;break
    }
  }
  console.log('\n'+pass+'/'+(pass+fail)+' passed | log: '+LOG)
  try{execSync('taskkill //F //IM opencode-engine.exe',{stdio:'ignore'})}catch{}
}
main().catch(e=>{console.error(e.message);process.exit(1)})
