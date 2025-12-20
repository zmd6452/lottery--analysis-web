// build-4d-interactive-full.js
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const fetch = require('node-fetch');

const projectName = 'malaysia-4d-interactive';
const folders = ['icons', 'data', 'screenshots'];

// CSV downloads (live from opensheet)
const SHEET_URL = 'https://opensheet.elk.sh/16NJ3an81qlkX7HWcLOXnxQc-x4GXvpk_KbHXgVEVSn0/Responses';

// Ensure project dirs
if (!fs.existsSync(projectName)) fs.mkdirSync(projectName);
folders.forEach(f=>{
  const dir = path.join(projectName, f);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Create icon placeholders
const icons = [
  'icons/icon-72.png','icons/icon-96.png','icons/icon-128.png','icons/icon-144.png',
  'icons/icon-152.png','icons/icon-192.png','icons/icon-384.png','icons/icon-512.png',
  'icons/magnum-96.png','icons/search-96.png','icons/chart-96.png'
];
icons.forEach(icon => fs.writeFileSync(path.join(projectName, icon), ''));

// Manifest JSON
const manifestJSON = {
  name: "Malaysia 4D Interactive Tracker",
  short_name: "4DTracker",
  start_url: ".",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0d6efd",
  icons: [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }
  ]
};
fs.writeFileSync(path.join(projectName,'manifest.json'), JSON.stringify(manifestJSON,null,2));

// Service Worker
const sw = `const CACHE_NAME='malaysia-4d-v3';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(['./','./index.html','./manifest.json'])))}); 
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.pathname.endsWith('.csv')){
    e.respondWith(caches.open(CACHE_NAME).then(c=>fetch(e.request).then(r=>{if(r.status===200)c.put(e.request,r.clone());return r;}).catch(()=>c.match(e.request))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>{if(e.request.destination==='document')return caches.match('./index.html')})));
});`;
fs.writeFileSync(path.join(projectName,'service-worker.js'), sw);

// Fetch live 4D results and generate CSVs
async function generateCSVs(){
  console.log('Fetching 4D results...');
  const res = await fetch(SHEET_URL);
  const rows = await res.json();
  const companies = ['magnum','toto','damacai'];
  companies.forEach(company=>{
    const data = rows.filter(r=>r.Company?.toLowerCase()===company);
    const lines = ['Date,Company,First,Second,Third,Special,Consolation'];
    data.forEach(d=>{
      const spec = d.Special?.split(',').map(x=>x.trim()).join('|')||'';
      const cons = d.Consolation?.split(',').map(x=>x.trim()).join('|')||'';
      lines.push(`${d.Date},${d.Company},${d.First},${d.Second},${d.Third},${spec},${cons}`);
    });
    fs.writeFileSync(path.join(projectName,'data',\`\${company}.csv\`), lines.join('\\n'));
    console.log(\`✔ \${company}.csv done (\${data.length} rows)\`);
  });
}

// Interactive index.html
const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Malaysia 4D Interactive Tracker</title>
<link rel="manifest" href="manifest.json">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{font-family:sans-serif;padding:20px; background:#f5f7fa;}
h1,h2{text-align:center;}
table{width:100%;border-collapse:collapse;margin:10px 0;}
th,td{border:1px solid #ccc;padding:6px;text-align:center;}
button{padding:10px;margin:5px;}
#charts{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;}
canvas{background:white;border-radius:8px;padding:10px;}
</style>
</head>
<body>
<h1>🎰 Malaysia 4D Interactive Tracker</h1>
<div style="text-align:center;">
<button onclick="loadResults('magnum')">Magnum</button>
<button onclick="loadResults('toto')">Toto</button>
<button onclick="loadResults('damacai')">Da Ma Cai</button>
</div>
<div style="text-align:center;">
<input id="search" placeholder="Search number..." oninput="debouncedSearch()">
<button onclick="exportCSV()">Export CSV</button>
</div>

<h2 id="title">Select a company...</h2>
<table id="results"><tr><td colspan="6">No data</td></tr></table>

<h2>Charts & Insights</h2>
<div id="charts">
  <canvas id="freqChart" width="400" height="300"></canvas>
  <canvas id="aiChart" width="400" height="300"></canvas>
  <canvas id="clusterChart" width="400" height="300"></canvas>
  <canvas id="backtestChart" width="400" height="300"></canvas>
</div>

<script>
// Data handling
let currentData=[], currentType='', searchTimeout;

function parseCSV(text){
  const lines=text.trim().split(/\\r?\\n/);
  const header=lines.shift().split(',');
  return lines.map(l=>{const obj={};const vals=l.split(',');header.forEach((h,i)=>obj[h]=vals[i]);obj.Special=obj.Special?obj.Special.split('|'):[];obj.Consolation=obj.Consolation?obj.Consolation.split('|'):[];return obj;});
}

async function fetchCSV(path){
  try{const res=await fetch(path);const txt=await res.text();return parseCSV(txt);}catch{return [];}
}

async function loadLocalResults(type){
  const mag = await fetchCSV('./data/magnum.csv');
  const toto = await fetchCSV('./data/toto.csv');
  const dam = await fetchCSV('./data/damacai.csv');
  let combined = [];
  if(type==='magnum') combined = mag;
  if(type==='toto') combined = toto;
  if(type==='damacai') combined = dam;
  return combined;
}

async function loadResults(type){
  currentType=type;
  currentData = await loadLocalResults(type);
  document.getElementById('title').innerText=\`\${type.toUpperCase()} (\${currentData.length})\`;
  renderTable(currentData);
  updateFreqChart(currentData);
}

// Render
function renderTable(data){
  const table=document.getElementById('results');
  table.innerHTML='<tr><th>Date</th><th>1st</th><th>2nd</th><th>3rd</th><th>Special</th><th>Consolation</th></tr>';
  data.forEach(d=>{const row=table.insertRow();row.innerHTML=\`<td>\${d.Date}</td><td>\${d.First}</td><td>\${d.Second}</td><td>\${d.Third}</td><td>\${d.Special.join(', ')}</td><td>\${d.Consolation.join(', ')}</td>\`;});
}

function debouncedSearch(){clearTimeout(searchTimeout);searchTimeout=setTimeout(searchNumber,300);}
function searchNumber(){const q=document.getElementById('search').value.toLowerCase();const filt=currentData.filter(d=>[d.First,d.Second,d.Third,...d.Special,...d.Consolation].some(n=>n.toLowerCase().includes(q)));renderTable(filt);}

function exportCSV(){if(!currentData.length)return;const csv=[['Date','1st','2nd','3rd','Special','Consolation'],...currentData.map(d=>[d.Date,d.First,d.Second,d.Third,d.Special.join('|'),d.Consolation.join('|')])].map(r=>r.map(f=>\`"\${f}"\`).join(',')).join('\\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=\`4D-\${currentType}.csv\`;a.click();}

// Chart.js integration
let freqChart = null;
function updateFreqChart(data){
  const freq={};
  data.forEach(d=>[d.First,d.Second,d.Third,...d.Special,...d.Consolation].forEach(n=>freq[n]=(freq[n]||0)+1));
  const sorted=Object.entries(freq).sort(([,a],[,b])=>b-a).slice(0,10);
  const labels=sorted.map(e=>e[0]);
  const values=sorted.map(e=>e[1]);
  if(freqChart) freqChart.destroy();
  freqChart=new Chart(document.getElementById('freqChart'),{type:'bar',data:{labels,datasets:[{label:'Frequency',data:values,backgroundColor:'#007bff'}]},options:{plugins:{title:{display:true,text:'Top 10 Frequency'}}}});
}

window.addEventListener('load',()=>loadResults('magnum'));
</script>
</body>
</html>`;

// Write index.html
fs.writeFileSync(path.join(projectName,'index.html'), indexHTML);

// Build ZIP
async function buildZip(){
  await generateCSVs();
  const output = fs.createWriteStream(`${projectName}.zip`);
  const archive = archiver('zip',{zlib:{level:9}});
  output.on('close', ()=>console.log(`✅ ${projectName}.zip ready (${archive.pointer()} bytes)`));
  archive.pipe(output);
  archive.directory(projectName+'/', false);
  archive.finalize();
}

buildZip();
