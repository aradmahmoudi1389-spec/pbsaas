const modules = [
  {key:'overview',label:'نمای کلی',roles:['owner','product','support','finance','viewer']},
  {key:'crm',label:'کاربران و CRM',roles:['owner','product','support','finance','viewer']},
  {key:'billing',label:'اشتراک و مالی',roles:['owner','finance','viewer']},
  {key:'product',label:'قابلیت‌ها و محتوا',roles:['owner','product','viewer']},
  {key:'tickets',label:'پشتیبانی',roles:['owner','support','viewer']},
  {key:'growth',label:'رشد و ریزش',roles:['owner','product','support','viewer']},
  {key:'ai',label:'کیفیت هوش مصنوعی',roles:['owner','product','viewer']},
  {key:'integrations',label:'اتصال‌ها',roles:['owner','product','support','viewer']},
  {key:'security',label:'امنیت و حسابرسی',roles:['owner','viewer']}
];
const labels={owner:'مالک',product:'مدیر محصول',support:'پشتیبانی',finance:'مالی',viewer:'مشاهده‌گر'};
const rights={
  overview:{read:['owner','product','support','finance','viewer']},
  crm:{read:['owner','product','support','finance','viewer'],note:['owner','support'],label:['owner','product','support'],inspect:['owner','support']},
  billing:{read:['owner','finance','viewer'],change:['owner','finance'],refund:['owner','finance']},
  product:{read:['owner','product','viewer'],change:['owner','product'],rollback:['owner','product']},
  tickets:{read:['owner','support','viewer'],reply:['owner','support'],close:['owner','support']},
  growth:{read:['owner','product','support','viewer']},
  ai:{read:['owner','product','viewer'],feedback:['owner','product']},
  integrations:{read:['owner','product','support','viewer'],retry:['owner','product']},
  security:{read:['owner','viewer'],revoke:['owner']}
};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const display=value=>value===null||value===undefined||value===''?'—':escapeHTML(value);
const badge=(value,tone='neutral')=>`<span class="admin-badge admin-badge--${tone}">${display(value)}</span>`;
const empty=(title,text)=>`<div class="admin-empty"><strong>${escapeHTML(title)}</strong><p>${escapeHTML(text)}</p></div>`;
const button=(label,operation,id,{danger=false,reason=false}={})=>`<button type="button" class="admin-button ${danger?'admin-button--danger':'admin-button--quiet'}" data-operation="${operation}" data-id="${escapeHTML(id)}" ${reason?'data-reason="true"':''}>${escapeHTML(label)}</button>`;
const card=(title,body,action='')=>`<section class="admin-card"><div class="admin-card-head"><h2>${title}</h2>${action}</div>${body}</section>`;
const table=(head,rows)=>`<div class="admin-table-wrap"><table><thead><tr>${head.map(value=>`<th scope="col">${escapeHTML(value)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const row=(values)=>`<tr>${values.map(value=>`<td>${value}</td>`).join('')}</tr>`;
const actionLink=(label,key,id)=>`<button type="button" class="admin-link" data-navigate="${key}" data-id="${escapeHTML(id)}">${label}</button>`;
function content(section,data,allow,selectedUser){
  const users=data.users||[];
  if(section==='overview')return `<div class="admin-stats">${[['کاربران',data.summary?.total],['فعال‌سازی',data.summary?.activated],['تیکت باز',data.summary?.openTickets],['هزینه ماه',data.summary?.monthlyCost]].map(([title,value])=>`<div class="admin-card admin-stat"><span>${title}</span><strong dir="ltr">${display(value)}</strong></div>`).join('')}</div><div class="admin-two">${card('اقدام‌های امروز',`<div class="admin-list"><p>تیکت‌های باز را مرور کنید و برای کاربران در معرض ریزش، پیگیری محدود ثبت کنید.</p>${allow('tickets','read')?actionLink('مشاهده تیکت‌ها','tickets',''):''}${allow('growth','read')?actionLink('هشدارهای ریزش','growth',''):''}</div>`)}${card('محورهای سناریو برای کاربر',`<div class="admin-list"><p>در تجربه کاربر، دو اقدام «سناریو دارم؛ بهترش کن» و «سناریو ندارم؛ بساز» باید هم‌سطح و واضح بمانند.</p><p>هر ایده باید هدف برند، مرحله مسیر رشد، فرمت، هوک، دعوت به اقدام و علت پیشنهاد داشته باشد.</p></div>`)}</div>`;
  if(section==='crm'){
    const user=users.find(item=>item.id===selectedUser);
    if(user)return `${card('پروفایل 360 · '+display(user.name),`<div class="admin-facts">${[['شناسه',user.id],['ایمیل',user.email],['برچسب‌ها',(user.tags||[]).join('، ')],['وضعیت فعال‌سازی',user.activation],['مصرف',user.usage],['اشتراک',user.plan],['امتیاز برند',user.score],['آخرین فعالیت',user.lastActivity]].map(([key,value])=>`<div><span>${key}</span><strong>${display(value)}</strong></div>`).join('')}</div><div class="admin-card-actions">${allow('crm','note')?button('ثبت یادداشت','crm.note',user.id):''}${allow('crm','label')?button('ویرایش برچسب','crm.label',user.id):''}${allow('crm','inspect')?button('درخواست مشاهده محدود','crm.inspect',user.id,{reason:true}):''}</div>`)}`+card('تاریخچه',empty('رویداد بیشتری موجود نیست','تاریخچه فعال‌سازی، محتوای تولیدشده و ارتباطات پس از اتصال API اینجا نمایش داده می‌شود.'));
    return card('مدیریت کاربران',`<label class="admin-search">جست‌وجوی کاربر<input type="search" id="admin-user-search" placeholder="نام، شناسه یا ایمیل"></label><div id="admin-user-results">${renderUsers(users)}</div>`);
  }
  if(section==='billing')return `${card('پلن‌ها و سهمیه‌ها',table(['پلن','تعرفه','سهمیه','وضعیت','اقدام'],(data.plans||[]).map(v=>row([display(v.name),display(v.price),display(v.quota),badge(v.state),allow('billing','change')?button('ویرایش پلن','billing.change',v.name,{reason:true}):'—']))))}${card('کدهای تخفیف',data.discounts?.length?table(['کد','اعتبار','وضعیت'],data.discounts.map(v=>row([display(v.code),display(v.expiry),badge(v.state)]))):empty('کد تخفیفی ثبت نشده','پس از اتصال سیستم پرداخت، کدها و محدودیت استفاده اینجا مدیریت می‌شوند.'),allow('billing','change')?button('ایجاد کد تخفیف','billing.discount','new',{reason:true}):'')}${card('فاکتور و تراکنش',table(['شناسه','کاربر','مبلغ','وضعیت','اقدام'],(data.invoices||[]).map(v=>row([display(v.id),display(v.user),display(v.amount),badge(v.state),allow('billing','refund')?button('درخواست بررسی بازپرداخت','billing.refund',v.id,{danger:true,reason:true}):'—']))))}`;
  if(section==='product')return `${card('کنترل قابلیت‌ها',table(['قابلیت','وضعیت','اقدام'],(data.features||[]).map(v=>row([display(v.name),badge(v.state),allow('product','change')?button('ویرایش با دلیل','product.feature',v.name,{reason:true}):'—']))))}${card('محتوای سایت، پرسش‌ها و پیام‌های آنبوردینگ',table(['بخش','نسخه','ویرایشگر','وضعیت','اقدام'],(data.changes||[]).map(v=>row([display(v.scope),display(v.version),display(v.author),badge(v.state),allow('product','rollback')?button('بازگشت با تأیید','product.rollback',v.id,{danger:true,reason:true}):'—']))))}`;
  if(section==='tickets')return card('تیکت‌ها و عملیات پشتیبانی',table(['شناسه','موضوع','کاربر','اولویت','وضعیت','مسئول','اقدام'],(data.tickets||[]).map(v=>row([display(v.id),display(v.subject),display(v.user),display(v.priority),badge(v.state),display(v.assigned),allow('tickets','reply')?button('مشاهده و پاسخ','tickets.reply',v.id):'—']))));
  if(section==='growth')return `<div class="admin-two">${card('قیف رشد',`<div class="admin-funnel">${(data.funnel||[]).map(v=>`<div><span>${display(v.step)}</span><strong dir="ltr">${display(v.count)}</strong></div>`).join('')}</div>`)}${card('هشدارهای ریزش',data.churn?.length?table(['کاربر','نشانه','مسئول'],data.churn.map(v=>row([display(v.user),display(v.signal),display(v.owner)]))):empty('هشدار تازه‌ای نیست','کاربران در معرض ریزش با داده مجاز و حداقل دسترسی نمایش داده می‌شوند.'))}</div>`;
  if(section==='ai')return `${card('کیفیت، هزینه و بازخورد خروجی',table(['نوع خروجی','تعداد','زمان پاسخ','هزینه','بازخورد'],(data.ai||[]).map(v=>row([display(v.type),display(v.runs),display(v.latency),display(v.cost),display(v.feedback)]))))}${card('اصول کنترل کیفیت',`<p>خروجی‌ها بدون اطلاعات حساس بازبینی می‌شوند. نگهداری نمونه‌ها باید مبتنی بر رضایت و سیاست حداقل‌سازی داده باشد.</p>${allow('ai','feedback')?button('ثبت بازخورد کیفیت','ai.feedback','quality',{reason:true}):''}`)}`;
  if(section==='integrations')return card('سلامت اتصال‌ها',table(['اتصال','وضعیت','آخرین همگام‌سازی','مجوز','خطا','اقدام'],(data.integrations||[]).map(v=>row([display(v.name),badge(v.status),display(v.lastSync),display(v.scope),display(v.error),allow('integrations','retry')?button('درخواست همگام‌سازی','integrations.retry',v.name,{reason:true}):'—']))));
  if(section==='security')return `${card('نشست‌ها',table(['شناسه','کاربر','شروع','وضعیت','اقدام'],(data.sessions||[]).map(v=>row([display(v.id),display(v.user),display(v.started),badge(v.state),allow('security','revoke')?button('لغو نشست','security.revoke',v.id,{danger:true,reason:true}):'—']))))}${card('رویدادهای حسابرسی',table(['زمان','کنشگر','اقدام','دلیل','نتیجه'],(data.audit||[]).map(v=>row([display(v.at),display(v.actor),display(v.action),display(v.reason),display(v.result)]))))}`;
  return empty('بخش پیدا نشد','از منوی سمت راست یک بخش معتبر انتخاب کنید.');
}
function renderUsers(users){return users.length?table(['نام','شناسه','وضعیت','فعال‌سازی','اشتراک','امتیاز','آخرین فعالیت','پروفایل'],users.map(v=>row([display(v.name),display(v.id),badge(v.status),display(v.activation),display(v.plan),display(v.score),display(v.lastActivity),actionLink('مشاهده 360','crm',v.id)]))):empty('کاربری پیدا نشد','نام یا شناسه دیگری را جست‌وجو کنید.')}
const operationPermissions={
  'crm.note':['crm','note'],'crm.label':['crm','label'],'crm.inspect':['crm','inspect'],
  'billing.change':['billing','change'],'billing.discount':['billing','change'],'billing.refund':['billing','refund'],
  'product.feature':['product','change'],'product.rollback':['product','rollback'],
  'tickets.reply':['tickets','reply'],'ai.feedback':['ai','feedback'],
  'integrations.retry':['integrations','retry'],'security.revoke':['security','revoke']
};
export function mountAdmin(root,{principal,data,onAction}={}){
  if(!root||!principal||!Object.hasOwn(labels,principal.role)||!data||typeof data!=='object'||typeof onAction!=='function')throw new Error('A verified principal, server-filtered data and action adapter are required');
  let section='overview',selectedUser='';
  const allow=(area,operation)=>operation==='read'&&rights[area]?.read?.includes(principal.role)===true;
  function render(){
    if(!allow(section,'read')){section='overview';selectedUser=''}
    root.innerHTML=`<div class="admin-shell" dir="rtl"><aside class="admin-sidebar"><div class="admin-brand"><span class="admin-brand-icon" aria-hidden="true">ب</span><div><strong>برندیار</strong><small>مرکز مدیریت</small></div></div><p class="admin-nav-label">فضای کاری</p><nav aria-label="بخش‌های مدیریت">${modules.filter(v=>allow(v.key,'read')).map(v=>`<button type="button" data-navigate="${v.key}" class="${section===v.key?'active':''}" ${section===v.key?'aria-current="page"':''}>${v.label}</button>`).join('')}</nav><div class="admin-sidebar-foot">دسترسی محدود بر اساس نقش</div></aside><div class="admin-workspace"><header class="admin-header"><div><span class="admin-kicker">مرکز عملیات برندیار</span><h1>${modules.find(v=>v.key===section)?.label||'نمای کلی'}</h1></div><div class="admin-identity"><span>نقش: ${labels[principal.role]}</span><strong>${display(principal.displayName||'همکار')}</strong></div></header><div class="admin-banner" role="note">این رابط تنها نمایش داده‌های پالایش‌شده و نتیجه عملیات تأییدشده توسط سرور را نشان می‌دهد؛ مجوزدهی و حسابرسی باید سمت سرور انجام شود.</div><main id="admin-main" tabindex="-1">${content(section,data,allow,selectedUser)}</main><div class="admin-feedback" role="status" aria-live="polite" hidden></div></div></div>`;
  }
  async function handleClick(event){
    const navigation=event.target.closest('[data-navigate]');
    if(navigation&&root.contains(navigation)){
      if(!allow(navigation.dataset.navigate,'read'))return;
      section=navigation.dataset.navigate;selectedUser=navigation.dataset.id||'';render();root.querySelector('#admin-main')?.focus();return;
    }
    const target=event.target.closest('[data-operation]');
    if(!target||!root.contains(target))return;
    const permission=operationPermissions[target.dataset.operation];
    if(!permission||!allow(...permission))return;
    const reason=target.dataset.reason==='true'?window.prompt('دلیل این اقدام را ثبت کنید:'):undefined;
    if(target.dataset.reason==='true'&&(!reason||!reason.trim()))return;
    if(!window.confirm('این درخواست پس از بررسی مجوز و ثبت در حسابرسی پردازش شود؟'))return;
    target.disabled=true;
    const feedback=root.querySelector('.admin-feedback');feedback.hidden=false;feedback.textContent='در حال ارسال درخواست...';
    try{
      const result=await onAction({operation:target.dataset.operation,id:target.dataset.id,reason:reason?.trim()});
      feedback.textContent=result?.status==='success'?'اقدام با تأیید سرور انجام شد.':'پاسخ قطعی از سرور دریافت نشد؛ وضعیت را بررسی کنید و در صورت نیاز دوباره تلاش کنید.';
    }catch{feedback.textContent='درخواست انجام نشد. دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.'}
    finally{target.disabled=false}
  }
  function handleInput(event){if(event.target.id!=='admin-user-search')return;const term=event.target.value.trim().toLocaleLowerCase('fa');const users=(data.users||[]).filter(v=>[v.name,v.id,v.email].some(value=>String(value||'').toLocaleLowerCase('fa').includes(term)));root.querySelector('#admin-user-results').innerHTML=renderUsers(users)}
  root.addEventListener('click',handleClick);root.addEventListener('input',handleInput);render();
  return {destroy(){root.removeEventListener('click',handleClick);root.removeEventListener('input',handleInput);root.replaceChildren()},update(nextData){data=nextData;render()}};
}
