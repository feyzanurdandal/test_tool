(() => {
const labels={name:'Adı',surname:'Soyadı',email:'E-Posta',username:'Kullanıcı Adı',phone:'Telefon',dateOfBirth:'Doğum Tarihi',fatherName:'Baba Adı',motherName:'Anne Adı',placeOfBirth:'Doğum Yeri',studentNo:'Öğrenci No',identityNo:'Kimlik No'};
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const inputClass='bg-[#27272a] text-white border border-zinc-600 rounded px-2 py-1 text-xs w-full';
function input(value){const e=el('input');e.value=value;e.className=inputClass;return e;}
function select(options,value){const e=el('select');e.className=inputClass;for(const [v,t] of options){const o=el('option',t);o.value=v;e.append(o);}e.value=value;return e;}
const rules=[['fixed','Sabit'],['increment','Sayıyı artır'],['suffix','Metin sonuna numara'],['email','E-postaya numara']];
const dateFormats=[['auto','Otomatik'],['MM/DD/YYYY','MM/DD/YYYY · 10/14/2026'],['DD/MM/YYYY','DD/MM/YYYY · 14/10/2026'],['DD.MM.YYYY','DD.MM.YYYY · 14.10.2026'],['DD-MM-YYYY','DD-MM-YYYY · 14-10-2026'],['YYYY-MM-DD','YYYY-MM-DD · 2026-10-14']];
const modes=[['text','Görünen metin'],['value','Seçenek değeri / ID'],['index','Sıra (0’dan başlar)'],['random','Rastgele geçerli seçenek']];
class Editor {
 constructor({form,steps,addRow,reindex,notify}) {
  Object.assign(this,{form,steps,addRow,reindex,notify});this.data={enabled:false,fields:[],variables:[]};
  const toolbar = document.getElementById('add-step-field-btn').parentElement;
  toolbar.className = '';
  Object.assign(toolbar.style, {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '10px'
  });

  const styleButton = (button, title, description) => {
    button.className =
      'text-zinc-300 hover:text-blue-400 hover:border-blue-500 transition';

    Object.assign(button.style, {
      border: '1px solid #3f3f46',
      borderRadius: '8px',
      background: 'transparent',
      padding: '7px 11px',
      fontSize: '12px',
      lineHeight: '18px',
      whiteSpace: 'nowrap',
      cursor: 'pointer'
    });

    button.title = description;
    button.replaceChildren(el('span', title));
  };

  const first = el('div');
  const second = el('div');

  for (const row of [first, second]) {
    Object.assign(row.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px'
    });
  }

  const addButton = document.getElementById('add-step-field-btn');
  styleButton(
    addButton,
    '＋ Yeni Adım',
    'Bir işlemi kendi cümlenizle yazın.'
  );
  first.append(addButton);

  const importButton = document.getElementById('open-import-scenario-btn');
  if (importButton) {
    styleButton(
      importButton,
      '↓ İçe Aktar',
      'Kayıtlı bir senaryonun adımlarını ekleyin.'
    );
    first.append(importButton);
  }

  const json = el('button');
  json.type = 'button';
  json.id = 'json-form-open';
  json.onclick = () => this.open();
  styleButton(
    json,
    'JSON’dan Oluştur',
    'JSON verisini form alanlarına dönüştürün.'
  );

  const change = el('button');
  change.type = 'button';
  change.id = 'data-values-open';
  change.onclick = () => this.open(true);
  styleButton(
    change,
    'Veri Ayarları',
    'Değişecek değerleri ve doldurma yöntemini seçin.'
  );

  second.append(json, change);
  toolbar.append(first, second);
  this.info=el('p',undefined,'text-xs text-zinc-400 pt-2');toolbar.parentElement.append(this.info);this.summary();
  form.addEventListener('reset',()=>this.load());
 }
 load(data={}) {this.data=JSON.parse(JSON.stringify({enabled:false,fields:[],variables:[],...data}));this.summary();}
 summary(){this.info.textContent=`${this.data.fields.length} JSON alanı · ${[...this.data.fields,...this.data.variables].filter(f=>this.data.enabled && f.rule!=='fixed').length} değişen değer. Her alan kendi kuralına göre çalışır; Sabit seçilenler değişmez.`;}
 get(){
  const keys=new Set([...this.steps.querySelectorAll('[data-form-key]')].map(r=>r.dataset.formKey));
  const text=[...this.steps.querySelectorAll('.step-input')].map(i=>i.value).join('\n');
  return {...this.data,fields:this.data.fields.filter(f=>keys.has(f.key)),variables:this.data.variables.filter(v=>text.includes('{{data.'+v.key+'}}'))};
 }
 importSteps(steps,data={}) {
  const mapping=new Map();const prefix='i_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)+'_';
  for(const f of data.fields||[]){const key=prefix+mapping.size;mapping.set(f.key,key);this.data.fields.push({...f,key,rule:data.enabled?f.rule:'fixed'});}
  for(const v of data.variables||[]){const key=prefix+mapping.size;mapping.set(v.key,key);this.data.variables.push({...v,key,rule:data.enabled?v.rule:'fixed'});}
  if(data.enabled){this.data.enabled=true;}
  this.summary();
  return steps.map(t=>String(t).replace(/\[\[FORM:([A-Za-z][A-Za-z0-9_]*)\]\]/g,(m,k)=>mapping.has(k)?'[[FORM:'+mapping.get(k)+']]':m).replace(/\{\{data\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,(m,k)=>mapping.has(k)?'{{data.'+mapping.get(k)+'}}':m));
 }
 decorate(row,text) {
  const m=text.match(/^\[\[FORM:([A-Za-z][A-Za-z0-9_]*)\]\]$/);if(!m)return;
  const field=this.data.fields.find(f=>f.key===m[1]);row.dataset.formKey=m[1];const i=row.querySelector('.step-input');i.value=field?`JSON · ${field.label}: ${field.selectionMode==='random'?'Rastgele seçenek':field.value}`:`JSON alanı eksik: ${m[1]}`;i.readOnly=true;
  const b=el('button','Ayarlar','text-xs text-blue-400');b.type='button';b.onclick=()=>this.open();row.append(b);
 }
 refresh(){for(const r of this.steps.querySelectorAll('[data-form-key]')){const f=this.data.fields.find(f=>f.key===r.dataset.formKey);if(f)r.querySelector('.step-input').value=`JSON · ${f.label}: ${f.selectionMode==='random'?'Rastgele seçenek':f.value}`;}this.summary();}
 flatten(object){
  if(!object || typeof object!=='object' || Array.isArray(object))throw new Error('JSON’un kökü bir nesne olmalıdır.');
  const out=[];const walk=(obj,path=[],depth=0)=>{if(depth>8)throw new Error('JSON çok fazla iç içe alan içeriyor.');for(const [k,v] of Object.entries(obj)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Desteklenmeyen JSON alanı.');const p=[...path,k];if(v!==null && typeof v==='object'){walk(v,p,depth+1);}else if(v!==null){if(typeof v==='number' && Number.isInteger(v) && !Number.isSafeInteger(v))throw new Error('Uzun numaraları JSON içinde çift tırnakla metin olarak belirtin.');out.push({path:p.join('.'),name:k,value:String(v)});if(out.length>80)throw new Error('En fazla 80 alan yükleyebilirsiniz.');}}};walk(object);return out;
 }
 open(variablesOnly=false){
  if(this.dialog)this.dialog.remove();
  const overlay=el('div',undefined,'fixed inset-0 bg-black/80 flex items-center justify-center p-4');overlay.style.zIndex='70';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  const panel=el('div',undefined,'bg-[#18181b] border border-zinc-600 rounded-xl p-5 w-full max-w-6xl text-white space-y-4');panel.style.maxHeight='90vh';panel.style.overflow='auto';overlay.append(panel);this.dialog=overlay;
  const title=el('h2',variablesOnly?'Veri ve Yazma Ayarları':'JSON’dan Form Adımları','font-semibold');panel.append(title);overlay.setAttribute('aria-label',title.textContent);
  const explain=el('p','JSON yalnızca form verisidir. Login, sayfaya gitme ve Kaydet adımlarını ayrıca ekleyin. ID eşleşmezse rastgele seçim yapılmaz. Tarih alanlarında Tarih biçimi sütununu seçin. Değeri ISO tarih olarak bırakabilirsiniz; yalnız takvimle seçilebilen alanlarda normal takvim adımlarını kullanın.','text-xs text-zinc-400');panel.append(explain);panel.append(el('p','Yazma yöntemi: Otomatik tarihlerde klavye, diğer alanlarda doğrudan doldurma kullanır. Klavyeden yaz ek yapay zeka çağrısı yapmaz. Kullan kutusu yalnızca alanı senaryoya dahil eder. Değişim kuralı Sabit ise değer değişmez.','text-xs text-zinc-400'));
  const error=el('p','','text-sm text-red-400');error.setAttribute('role','alert');
  const fieldRows=[];const variableRows=[];
  const table=el('table',undefined,'w-full text-xs');table.id='json-preview-table';const head=el('tr');for(const t of ['Kullan','JSON alanı','Formdaki adı','Değer','İşlem','Liste yöntemi','Yazma yöntemi','Tarih biçimi','Değişim kuralı','Bölüm / pencere'])head.append(el('th',t,'p-2 text-left'));table.append(head);
  const tbody=el('tbody');table.append(tbody);const tableWrap=el('div');tableWrap.style.overflowX='auto';tableWrap.append(table);
  function fieldRow(f,sourceName,used=true){
   const tr=el('tr');const use=el('input');use.type='checkbox';use.checked=used;
   const label=input(f.label),value=input(f.value),action=select([['fill','Metin yaz'],['select','Açılır kutu'],['date','Tarih gir'],['check','İşaretleme kutusu']],f.action),mode=select(modes,f.selectionMode),dateFormat=select(dateFormats,f.dateFormat||'auto'),typing=select([['auto','Otomatik'],['fill','Doğrudan doldur'],['keyboard','Klavyeden yaz']],f.typingMode||'auto'),rule=select(rules,f.rule),scope=input(f.scope||'');
   const update=()=>{mode.disabled=action.value!=='select';dateFormat.disabled=action.value!=='date';typing.disabled=!['fill','date'].includes(action.value);rule.disabled=action.value!=='fill'||/password|şifre/i.test(sourceName+' '+label.value);if(rule.disabled)rule.value='fixed';};action.onchange=update;label.oninput=update;update();
   for(const item of [use,el('span',sourceName),label,value,action,mode,typing,dateFormat,rule,scope]){const td=el('td',undefined,'p-1 align-top');td.append(item);tr.append(td);}tbody.append(tr);
   fieldRows.push({f,use,label,value,action,mode,typing,dateFormat,rule,scope});
  }
  for(const f of this.data.fields)fieldRow({...f},f.key);
  if(!variablesOnly){
   const paste=el('textarea');paste.id='json-form-source';paste.className=inputClass;paste.rows=5;paste.placeholder='{"name":"Feyza","email":"feyza@example.com"}';
   const file=el('input');file.id='json-form-file';file.type='file';file.accept='.json,application/json';file.className='text-xs';file.onchange=async()=>{try{if(file.files[0].size>65536)throw new Error('JSON dosyası en fazla 64 KB olabilir.');paste.value=await file.files[0].text();}catch(e){error.textContent=e.message;}};
   const preview=el('button','JSON’u Önizle','bg-blue-600 rounded px-3 py-2 text-xs');preview.type='button';preview.id='json-preview';preview.onclick=()=>{try{
    if(new TextEncoder().encode(paste.value).length>65536)throw new Error('JSON en fazla 64 KB olabilir.');const flat=this.flatten(JSON.parse(paste.value));
    // Önizleme yalnızca yeni yüklemeyi değiştirir; önceki senaryo alanlarını korur.
    while(fieldRows.length>this.data.fields.length){fieldRows.pop();tbody.lastChild.remove();}
    const stamp=Date.now().toString(36);
    for(let index=0;index<flat.length;index++){const x=flat[index],technical=/^(id|userId)$/.test(x.name);const action=['true','false'].includes(x.value)?'check':/date|tarih/i.test(x.name)?'date':/Id$/.test(x.name)?'select':'fill';fieldRow({key:'f_'+stamp+'_'+index,label:labels[x.name]||x.path,value:x.value,action,selectionMode:action==='select'?'value':'text',rule:'fixed',scope:''},x.path,!technical);}
    error.textContent='';
   }catch(e){error.textContent='Geçerli JSON yükleyin. '+e.message;}};
   panel.append(file,paste,preview);
  }
  if(!variablesOnly || this.data.fields.length)panel.append(tableWrap);
  panel.append(el('h3','Mevcut adımlardaki değerleri değişken yap','font-medium text-sm'));
  panel.append(el('p','Bir adımın içindeki çift tırnaklı veri değerini seçin. Login bilgilerini sabit bırakın. TC/kimlik numarası artırılırsa uygulamanın doğrulamasını geçmeyebilir.','text-xs text-zinc-400'));
  const varBox=el('div',undefined,'space-y-2');panel.append(varBox);
  const makeVariable=(v={key:'v_'+Date.now().toString(36)+'_'+variableRows.length,value:'',rule:'suffix'})=>{
   const row=el('div',undefined,'grid grid-cols-3 gap-2');const value=input(v.value),rule=select(rules,v.rule);const remove=el('button','Kaldır','text-xs text-red-400');remove.type='button';const item={v,value,rule,row,removed:false};remove.onclick=()=>{item.removed=true;row.remove();};row.append(value,rule,remove);varBox.append(row);variableRows.push(item);
  };
  this.data.variables.forEach(v=>makeVariable({...v}));
  const chooser=select([['','Adımdan veri seç…']], '');chooser.id='data-value-choice';
  for(const row of this.steps.querySelectorAll('.step-input')){if(row.closest('[data-form-key]'))continue;const quoted=[...row.value.matchAll(/"([^"\n]+)"/g)];const typed=row.value.match(/(?:type|fill|enter)\s+"([^"]+)"/i);const value=typed?.[1] || (/(?:yaz|gir|doldur)/i.test(row.value)?quoted.at(-1)?.[1]:null);if(value && !value.startsWith('{{data.')){const o=el('option',value+' — '+row.value.slice(0,100));o.value=value;chooser.append(o);}}
  const add=el('button','Seçilen değeri ekle','text-xs text-blue-400');add.type='button';add.onclick=()=>{if(chooser.value && !variableRows.some(r=>!r.removed&&r.value.value===chooser.value)){makeVariable({key:'v_'+Date.now().toString(36)+'_'+variableRows.length,value:chooser.value,rule:'suffix'});}};panel.append(chooser,add,error);
  const footer=el('div',undefined,'flex gap-3 justify-end');const cancel=el('button','İptal','text-xs border rounded px-3 py-2');cancel.type='button';cancel.onclick=()=>overlay.remove();
  const save=el('button',variablesOnly?'Ayarları Uygula':'Seçili Alanları Uygula','text-xs bg-blue-600 rounded px-3 py-2');save.type='button';save.id='json-apply';save.onclick=()=>{try{
   const fields=fieldRows.filter(r=>r.use.checked).map(r=>({...r.f,label:r.label.value.trim(),value:r.value.value,action:r.action.value,selectionMode:r.mode.value,dateFormat:r.dateFormat.value,typingMode:r.typing.value,rule:r.rule.value,scope:r.scope.value.trim()}));
   if(fields.some(f=>!f.label))throw new Error('Her seçili alanın formdaki adını belirtin.');
   if(fields.length>80)throw new Error('En fazla 80 JSON alanı eklenebilir.');
   for(const f of fields){if(f.action==='select'&&f.selectionMode==='index'&&!/^\d+$/.test(f.value))throw new Error('Sıra numarası 0 veya pozitif tam sayı olmalıdır.');if(f.rule==='increment'&&!/^\d+$/.test(f.value))throw new Error('Artırılacak değer yalnızca rakam içermelidir.');}
   const variables=variableRows.filter(r=>!r.removed).map(r=>({...r.v,value:r.value.value,rule:r.rule.value}));
   if(variables.some(v=>!v.value))throw new Error('Değişecek değer boş olamaz.');
   // Kaldırılan/değiştirilen değişkenleri temel değere döndür.
   const staged=[...this.steps.querySelectorAll('.step-input')].filter(i=>!i.readOnly).map(i=>({i,text:i.value}));
   for(const old of this.data.variables)for(const item of staged)item.text=item.text.split('{{data.'+old.key+'}}').join(old.value);
   for(const v of variables){let found=false;for(const item of staged){const quoted=JSON.stringify(v.value);if(item.text.includes(quoted)){item.text=item.text.split(quoted).join(JSON.stringify('{{data.'+v.key+'}}'));found=true;}}if(!found)throw new Error('Değer adımlarda çift tırnak içinde bulunamadı: '+v.value);}
   for(const item of staged)item.i.value=item.text;
   const oldKeys=new Set([...this.steps.querySelectorAll('[data-form-key]')].map(r=>r.dataset.formKey));this.data.fields=fields;this.data.variables=variables;
   for(const r of [...this.steps.querySelectorAll('[data-form-key]')])if(!fields.some(f=>f.key===r.dataset.formKey))r.remove();
   for(const f of fields)if(!oldKeys.has(f.key)){const empty=this.steps.children.length===1?this.steps.querySelector('.step-input'):null;if(empty&&!empty.value.trim())this.steps.innerHTML='';this.steps.append(this.addRow('[[FORM:'+f.key+']]'));}
   this.data.enabled=variables.some(v=>v.rule!=='fixed')||fields.some(f=>f.rule!=='fixed');
   this.refresh();this.reindex();overlay.remove();
  }catch(e){error.textContent=e.message;}};footer.append(cancel,save);panel.append(footer);document.body.append(overlay);cancel.focus();overlay.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.remove();});
 }
}
window.readableDataSteps=(text,data={})=>String(text).replace(/\[\[FORM:([A-Za-z][A-Za-z0-9_]*)\]\]/g,(m,k)=>{const f=(data.fields||[]).find(f=>f.key===k);return f?`JSON · ${f.label}: ${f.selectionMode==='random'?'Rastgele seçenek':f.value}`:'JSON alanı';}).replace(/\{\{data\.([A-Za-z][A-Za-z0-9_]*)\}\}/g,(m,k)=>[...(data.fields||[]),...(data.variables||[])].find(f=>f.key===k)?.value||m);
window.TestDataEditor=Editor;
})();
