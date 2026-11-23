(() => {
    const element=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    const button=(text,handler)=>{const b=element('button',text);b.type='button';b.onclick=handler;return b;};
    const describe=step=>{
        const name=step.target?.label||step.target?.name||'Eleman';
        const value=step.target?.inputType==='password'?'••••••':step.value;
        return ({click:`${name} → tıkla`,fill:`${name} → "${value}" yaz`,select:`${name} → "${value}" seç`,check:`${name} → ${step.checked?'işaretle':'işareti kaldır'}`,press:`${name} → ${value}`,goto:`Sayfaya git: ${value}`,assertText:`Metni doğrula: ${value}`})[step.action]||step.action;
    };
    async function request(url,body) {
        const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok)throw new Error(data.error||'Tarayıcı isteği tamamlanamadı.');return data;
    }
    class Panel {
        constructor({mode='record',id,projectName,targetUrl,onSave=()=>{},notify=()=>{}}) {
            Object.assign(this,{mode,id,projectName,targetUrl,onSave,notify});this.closed=false;this.chain=Promise.resolve();this.pending=0;this.steps=[];
            this.panel=element('aside');this.panel.className='browser-panel';this.panel.setAttribute('aria-label',mode==='record'?'Tarayıcıdan senaryo kaydı':'Canlı test görüntüsü');
            const header=element('div');header.className='browser-bar';header.append(element('h3',mode==='record'?'Tarayıcıdan Kaydet':'Canlı İzle · Salt okunur'));
            header.append(button(mode==='record'?'Kaydı Bitir ve Adımları Ekle':'Görüntüyü Kapat',()=>this.finish()));
            if(mode==='record')header.append(button('Kaydı İptal Et',()=>this.cancel()));
            this.panel.append(header);
            this.message=element('p','Tarayıcı hazırlanıyor…');this.message.setAttribute('aria-live','polite');this.panel.append(this.message);
            if(mode==='record'){
                const nav=element('div');nav.className='browser-bar';this.url=element('input');this.url.type='url';this.url.value=targetUrl;this.url.setAttribute('aria-label','Kayıt tarayıcısı URL');
                nav.append(this.url,button('Git',()=>this.send({type:'goto',url:this.url.value})));this.panel.append(nav);
                this.panel.append(element('p','Görüntüye tıklayın; ardından klavyenizle yazın. İşlemler hedef sitede gerçekten uygulanır. Metin, tarih ve açılır kutular için alttaki alan araçlarını da kullanabilirsiniz.'));
            }
            this.screen=element('div');this.screen.className='browser-screen';this.screen.tabIndex=0;this.screen.setAttribute('aria-label',mode==='record'?'Uzak tarayıcı; tıklayıp klavyeyle kullanın':'Test tarayıcısı görüntüsü');
            this.image=element('img');this.image.alt='Tarayıcı görüntüsü';this.image.draggable=false;
            const placeholder=element('span','Görüntü bekleniyor…');placeholder.className='browser-placeholder';this.screen.append(this.image,placeholder);this.panel.append(this.screen);
            this.error=element('p');this.error.className='browser-error';this.error.setAttribute('role','alert');
            if(mode==='record'){
                const tools=element('div');tools.className='browser-bar';this.text=element('input');this.text.placeholder='Seçili alana yazılacak metin';this.text.setAttribute('aria-label','Seçili alana yazılacak metin');
                tools.append(this.text,button('Alanı Doldur',()=>{this.send({type:'fill',text:this.text.value});this.text.value='';}));
                this.select=element('select');this.select.setAttribute('aria-label','Seçili açılır kutunun seçenekleri');this.select.hidden=true;this.select.onchange=()=>this.send({type:'select',value:this.select.value});tools.append(this.select);this.panel.append(tools);
                const keys=element('div');keys.className='browser-bar';
                for(const key of ['Tab','Enter','Escape','Backspace'])keys.append(button(key,()=>this.send({type:'key',key})));
                keys.append(button('Tümünü Seç',()=>this.send({type:'key',key:'ControlOrMeta+A'})));this.panel.append(keys);
                const assertion=element('div');assertion.className='browser-bar';const expected=element('input');expected.placeholder='Görünmesi gereken sonuç mesajı';expected.setAttribute('aria-label','Doğrulanacak metin');
                assertion.append(expected,button('Metni Doğrula ve Ekle',()=>this.send({type:'assert',text:expected.value})));this.panel.append(assertion);
                this.events=element('ol');this.events.className='browser-events';this.panel.append(this.events);
                this.bindInput();
                const modal=document.getElementById('scenario-modal');modal.classList.add('browser-recording');modal.append(this.panel);
                this.observer=new MutationObserver(()=>{if(modal.classList.contains('hidden'))void this.cancel();});this.observer.observe(modal,{attributes:true,attributeFilter:['class']});
            }else{this.overlay=element('div');this.overlay.className='browser-live-overlay';this.overlay.append(this.panel);document.body.append(this.overlay);}
            this.panel.append(this.error);
            this.expire=()=>void this.cancel();window.addEventListener('session-expired',this.expire);
            this.unload=()=>{if(this.id && this.mode==='record')fetch(this.base()+'/close',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'fetch'},body:'{}',keepalive:true}).catch(()=>{});};window.addEventListener('pagehide',this.unload);
        }
        base(){return '/api/scenarios/browser/'+encodeURIComponent(this.id);}
        async start() {
            try{if(this.mode==='record'){const data=await request('/api/scenarios/browser/start',{projectName:this.projectName,targetUrl:this.targetUrl});this.id=data.session.id;}
                if(this.closed){if(this.mode==='record')await request(this.base()+'/close',{});return;}
                await this.poll();
            }catch(e){this.error.textContent=e.message;this.message.textContent='Tarayıcı başlatılamadı.';}
        }
        send(command){
            if(this.closed||!this.id||this.mode!=='record')return;
            if(this.pending>=30){this.error.textContent='Tarayıcı yetişene kadar bekleyin.';return;}
            this.pending++;
            this.chain=this.chain.then(async()=>{if(this.closed)return;try{await request(this.base()+'/control',command);this.error.textContent='';}catch(e){this.error.textContent=e.message;}}).finally(()=>this.pending--);
            return this.chain;
        }
        point(event){const r=this.screen.getBoundingClientRect();return {x:Math.min(1279,Math.max(0,(event.clientX-r.left)*1280/r.width)),y:Math.min(719,Math.max(0,(event.clientY-r.top)*720/r.height))};}
        bindInput(){
            this.screen.onclick=e=>{this.screen.focus();this.send({type:'click',...this.point(e)});};
            this.screen.onwheel=e=>{e.preventDefault();this.send({type:'wheel',...this.point(e),delta:Math.max(-1500,Math.min(1500,e.deltaY))});};
            this.screen.addEventListener('keydown',e=>{
                if(e.isComposing)return;
                if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();this.send({type:'key',key:'ControlOrMeta+A'});return;}
                if(e.ctrlKey||e.metaKey||e.altKey)return;
                if(e.key.length===1){e.preventDefault();this.send({type:'text',text:e.key});}
                else if(['Enter','Tab','Escape','Backspace','Delete','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();this.send({type:'key',key:e.key==='Tab'&&e.shiftKey?'Shift+Tab':e.key});}
            });
            this.screen.addEventListener('paste',e=>{e.preventDefault();this.send({type:'text',text:e.clipboardData.getData('text').slice(0,2000)});});
        }
        async poll(){
            if(this.closed)return;
            try{
                const data=await request(this.base());if(this.closed)return;const s=data.session;
                this.message.textContent=(s.message?s.message+' · ':'')+({recording:`Kayıt açık · ${s.count} adım`,queued:'Test sırada; başladığında görüntü gelecek.',running:'Test çalışıyor · görüntü yaklaşık saniyede bir yenilenir.',finished:'Test tamamlandı. Son görüntü gösteriliyor.',limit:'Adım sınırı doldu; kaydı bitirin.'}[s.state]||s.state);
                if(this.mode==='record'){
                    this.steps=s.steps;this.events.replaceChildren(...s.steps.map(step=>element('li',describe(step))));
                    const focused=s.focused;this.select.hidden=!focused?.options;
                    if(focused?.options){const signature=JSON.stringify(focused.options);if(this.optionSignature!==signature){this.optionSignature=signature;this.select.replaceChildren(element('option','Seçenek seçin…'),...focused.options.map(o=>{const option=element('option',o.text);option.value=o.value;option.disabled=o.disabled;return option;}));}}
                    this.text.type=focused?.type==='password'?'password':'text';this.text.placeholder=focused?'Seçili alan: '+focused.label:'Önce görüntüde bir alan seçin';
                }
                const response=await fetch(this.base()+'/frame');
                if(response.status===200){const blob=await response.blob();if(this.closed)return;const url=URL.createObjectURL(blob);const previous=this.image.src;this.image.src=url;this.screen.classList.add('has-frame');if(previous.startsWith('blob:'))URL.revokeObjectURL(previous);}
                else if(!response.ok)throw new Error('Görüntü alınamadı.');
                if(s.state==='finished')return;
            }catch(e){if(this.closed)return;this.error.textContent=e.message;if(/bulunamadı|Oturum|erişim/i.test(e.message))return;}
            if(!this.closed)this.timer=setTimeout(()=>void this.poll(),1200);
        }
        async finish(){
            if(this.mode==='live'){this.destroy();return;}
            if(!this.id){this.destroy();return;}
            await this.chain;
            try{const result=await request(this.base()+'/stop',{});this.onSave(result.steps);if(result.warning)this.notify(result.warning);this.destroy();}catch(e){this.error.textContent=e.message;}
        }
        async cancel(){if(this.closed)return;this.destroy();if(this.id && this.mode==='record')await request(this.base()+'/close',{}).catch(()=>{});}
        destroy(){this.closed=true;clearTimeout(this.timer);this.observer?.disconnect();window.removeEventListener('session-expired',this.expire);window.removeEventListener('pagehide',this.unload);if(this.image.src.startsWith('blob:'))URL.revokeObjectURL(this.image.src);this.overlay?.remove();this.panel.remove();document.getElementById('scenario-modal')?.classList.remove('browser-recording');if(window.BrowserPanel.active===this)window.BrowserPanel.active=null;}
    }
    window.BrowserPanel={active:null,describe,open(options){if(this.active&&!this.active.closed){this.active.panel.scrollIntoView({block:'center'});return this.active;}const panel=new Panel(options);this.active=panel;void panel.start();return panel;}};
})();
