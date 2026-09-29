import {mountAdmin} from '/admin-panel.js';

const root = document.getElementById('admin-root');
try {
  const [identity, dataset] = await Promise.all([
    fetch('/api/admin/me', {credentials:'same-origin', cache:'no-store'}),
    fetch('/api/admin/data', {credentials:'same-origin', cache:'no-store'})
  ]);
  if (!identity.ok || !dataset.ok) throw new Error('دسترسی به داده‌های مدیریت ممکن نیست.');
  const {principal, csrf} = await identity.json();
  const data = await dataset.json();
  mountAdmin(root, {principal, data, onAction: async () => {throw new Error('عملیات تغییر هنوز فعال نیست.');}});
  const logout = document.createElement('button');
  logout.type = 'button';
  logout.className = 'admin-button admin-logout';
  logout.textContent = 'خروج از مدیریت';
  logout.addEventListener('click', async () => {
    const response = await fetch('/api/admin/logout', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({csrf})});
    if (response.ok) location.replace('/');
    else logout.textContent = 'خروج انجام نشد؛ دوباره تلاش کنید.';
  });
  root.querySelector('.admin-identity').append(logout);
} catch (error) {
  root.textContent = error.message;
}
