import argparse
import base64
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import struct
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DB = Path(os.environ.get('BRANDYAR_DB', str(ROOT / '.data' / 'brandyar.sqlite3')))
ROLES = {'owner', 'product', 'support', 'finance', 'viewer'}
SECTIONS = {
    'owner': ('summary', 'users', 'tickets', 'plans', 'invoices', 'discounts', 'changes', 'features', 'funnel', 'churn', 'ai', 'integrations', 'sessions', 'audit'),
    'product': ('summary', 'users', 'changes', 'features', 'funnel', 'churn', 'ai', 'integrations'),
    'support': ('summary', 'users', 'tickets', 'funnel', 'churn', 'integrations'),
    'finance': ('summary', 'users', 'plans', 'invoices', 'discounts'),
    'viewer': ('summary', 'users', 'plans', 'invoices', 'discounts', 'changes', 'features', 'tickets', 'funnel', 'churn', 'ai', 'integrations', 'audit'),
}


def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    os.chmod(DB, 0o600)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript('''
        CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, salt BLOB NOT NULL, password_hash BLOB NOT NULL, totp_secret TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, staff_id INTEGER NOT NULL REFERENCES staff(id), csrf TEXT NOT NULL, verified INTEGER NOT NULL, created INTEGER NOT NULL, last_seen INTEGER NOT NULL, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (source TEXT NOT NULL, account TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'فعال', plan TEXT NOT NULL DEFAULT 'رایگان', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'باز', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, staff_id INTEGER REFERENCES staff(id), action TEXT NOT NULL, result TEXT NOT NULL, at INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS attempts_lookup ON attempts(source,account,at);
    ''')
    return db


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32, maxmem=32 * 1024 * 1024)


def valid_totp(secret, code, now):
    try:
        key = base64.b32decode(secret.upper().replace(' ', ''), casefold=True)
        if not (len(code) == 6 and code.isascii() and code.isdigit() and len(key) >= 20):
            return False
    except (ValueError, base64.binascii.Error):
        return False
    for tick in (now // 30 - 1, now // 30, now // 30 + 1):
        digest = hmac.new(key, struct.pack('>Q', tick), hashlib.sha1).digest()
        offset = digest[-1] & 15
        value = (struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7fffffff) % 1000000
        if hmac.compare_digest(f'{value:06d}', code):
            return True
    return False


def add_staff(email, name, role):
    if role not in ROLES or not email.strip() or not name.strip():
        raise ValueError('Invalid staff details')
    password = getpass.getpass('Password: ')
    confirmation = getpass.getpass('Confirm password: ')
    otp_secret = getpass.getpass('Existing authenticator Base32 secret: ').replace(' ', '').upper()
    if len(password) < 12 or password != confirmation or not _valid_secret(otp_secret):
        raise ValueError('Password confirmation or authenticator secret is invalid')
    salt = secrets.token_bytes(32)
    with connect() as db:
        db.execute('INSERT INTO staff(email,name,role,salt,password_hash,totp_secret) VALUES(?,?,?,?,?,?)',
                   (email.strip().lower(), name.strip(), role, salt, password_hash(password, salt), otp_secret))
    print('Staff account created.')


def _valid_secret(value):
    try:
        return len(base64.b32decode(value, casefold=True)) >= 20
    except (ValueError, base64.binascii.Error):
        return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def respond(self, status, body=b'', content_type='application/json', headers=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        policy = "default-src 'none'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        if self.path in ('/', '/index.html'):
            policy = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        self.send_header('Content-Security-Policy', policy)
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, payload, headers=None):
        self.respond(status, json.dumps(payload, ensure_ascii=False).encode(), headers=headers)

    def request_data(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length < 1 or length > 4096 or self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Invalid request')
        data = json.loads(self.rfile.read(length))
        if not isinstance(data, dict):
            raise ValueError('Invalid request')
        return data

    def session(self, db, require_mfa=True):
        cookie = next((part.strip()[len('brandysid='):] for part in self.headers.get('Cookie', '').split(';') if part.strip().startswith('brandysid=')), '')
        if not cookie or len(cookie) != 64:
            return None
        record = db.execute('SELECT sessions.*, staff.role,staff.name FROM sessions JOIN staff ON staff.id=sessions.staff_id WHERE token_hash=?', (hashlib.sha256(cookie.encode()).hexdigest(),)).fetchone()
        now = int(time.time())
        if not record or now > record['expires'] or now - record['last_seen'] > 1800 or (require_mfa and not record['verified']):
            return None
        db.execute('UPDATE sessions SET last_seen=? WHERE token_hash=?', (now, record['token_hash']))
        db.commit()
        return record

    def cookie(self, token, max_age=28800):
        return f'brandysid={token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age={max_age}'

    def safe_origin(self):
        origin = self.headers.get('Origin', '')
        expected = ('https://' if self.headers.get('X-Forwarded-Proto') == 'https' else 'http://') + self.headers.get('Host', '')
        return bool(origin) and origin == expected

    def throttle(self, db, source, account):
        now = int(time.time())
        db.execute('DELETE FROM attempts WHERE at<?', (now - 900,))
        blocked = db.execute('SELECT count(*) FROM attempts WHERE at>? AND (source=? OR account=?)', (now - 900, source, account)).fetchone()[0] >= 8
        db.execute('INSERT INTO attempts(source,account,at) VALUES(?,?,?)', (source, account, now))
        db.commit()
        return blocked

    def do_GET(self):
        path = urlsplit(self.path).path
        public = {'/', '/index.html'}
        with connect() as db:
            staff = self.session(db) if path.startswith('/api/admin/') or path in ('/admin', '/admin-panel.js', '/admin-panel.css', '/admin-client.js') else None
            if path.startswith('/api/admin/'):
                if not staff:
                    return self.json(401, {'error': 'Unauthorized'})
                if path == '/api/admin/me':
                    return self.json(200, {'principal': {'role': staff['role'], 'displayName': staff['name']}, 'csrf': staff['csrf']})
                if path == '/api/admin/data':
                    permitted = SECTIONS[staff['role']]
                    data = {key: [] for key in permitted if key != 'summary'}
                    if 'users' in permitted:
                        rows = db.execute('SELECT id,name,email,status,plan FROM users ORDER BY id DESC LIMIT 50').fetchall()
                        data['users'] = [{'id': str(v['id']), 'name': v['name'], 'email': v['email'] if staff['role'] in ('owner','support') else '—', 'status': v['status'], 'plan': v['plan']} for v in rows]
                    if 'tickets' in permitted:
                        rows = db.execute('SELECT tickets.id,subject,tickets.status,users.name AS user FROM tickets JOIN users ON users.id=tickets.user_id ORDER BY tickets.id DESC LIMIT 50').fetchall()
                        data['tickets'] = [{'id': str(v['id']), 'subject': v['subject'] if staff['role'] in ('owner','support') else '—', 'state': v['status'], 'user': v['user']} for v in rows]
                    if 'audit' in permitted:
                        data['audit'] = [dict(row) for row in db.execute('SELECT at,action,result FROM audit ORDER BY id DESC LIMIT 50')]
                    data['summary'] = {'total': db.execute('SELECT count(*) FROM users').fetchone()[0], 'openTickets': db.execute("SELECT count(*) FROM tickets WHERE status='باز'").fetchone()[0] if 'tickets' in permitted else '—'}
                    return self.json(200, data)
                return self.json(404, {'error': 'Not found'})
            if path in public:
                file = ROOT / 'index.html'
            elif staff and path in ('/admin', '/admin-panel.js', '/admin-panel.css', '/admin-client.js'):
                file = ROOT / ('admin.html' if path == '/admin' else path[1:])
            else:
                return self.json(404, {'error': 'Not found'})
            types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'}
            self.respond(200, file.read_bytes(), types[file.suffix])

    def do_POST(self):
        path = urlsplit(self.path).path
        if not self.safe_origin():
            return self.json(403, {'error': 'Forbidden'})
        try:
            data = self.request_data()
        except (ValueError, json.JSONDecodeError):
            return self.json(422, {'error': 'Invalid input'})
        with connect() as db:
            source = self.client_address[0]
            if path == '/api/auth/login':
                email = str(data.get('email', '')).strip().lower()[:254]
                password = str(data.get('password', ''))
                if self.throttle(db, source, email) or not email or len(password) > 1024:
                    return self.json(429, {'error': 'Try later'})
                staff = db.execute('SELECT * FROM staff WHERE email=?', (email,)).fetchone()
                salt = staff['salt'] if staff else b'0' * 32
                check = password_hash(password, salt)
                if not staff or not hmac.compare_digest(check, staff['password_hash']):
                    return self.json(401, {'error': 'Invalid credentials'})
                token = secrets.token_hex(32)
                now = int(time.time())
                db.execute('DELETE FROM sessions WHERE staff_id=? OR expires<?', (staff['id'], now))
                db.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), staff['id'], secrets.token_hex(32), 0, now, now, now + 300))
                db.commit()
                return self.json(200, {'mfaRequired': True}, {'Set-Cookie': self.cookie(token, 300)})
            if path == '/api/auth/mfa/verify':
                staff = self.session(db, require_mfa=False)
                code = str(data.get('code', ''))
                if not staff or staff['verified'] or self.throttle(db, source, f'mfa:{staff["staff_id"]}'):
                    return self.json(401, {'error': 'Verification failed'})
                secret = db.execute('SELECT totp_secret FROM staff WHERE id=?', (staff['staff_id'],)).fetchone()[0]
                if not valid_totp(secret, code, int(time.time())):
                    return self.json(401, {'error': 'Verification failed'})
                token = secrets.token_hex(32)
                now = int(time.time())
                db.execute('DELETE FROM sessions WHERE token_hash=?', (staff['token_hash'],))
                db.execute('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), staff['staff_id'], secrets.token_hex(32), 1, now, now, now + 28800))
                db.execute('INSERT INTO audit(staff_id,action,result,at) VALUES(?,?,?,?)', (staff['staff_id'], 'login', 'success', now))
                db.commit()
                return self.json(200, {'authenticated': True}, {'Set-Cookie': self.cookie(token)})
            if path == '/api/admin/logout':
                staff = self.session(db)
                if not staff:
                    return self.json(401, {'error': 'Unauthorized'})
                if not hmac.compare_digest(str(data.get('csrf', '')), staff['csrf']):
                    return self.json(403, {'error': 'Forbidden'})
                db.execute('DELETE FROM sessions WHERE token_hash=?', (staff['token_hash'],))
                db.commit()
                return self.json(200, {'status': 'success'}, {'Set-Cookie': self.cookie('', 0)})
            return self.json(404, {'error': 'Not found'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('serve')
    run.add_argument('--port', type=int, default=8000)
    create = sub.add_parser('add-staff')
    create.add_argument('email')
    create.add_argument('name')
    create.add_argument('role', choices=sorted(ROLES))
    args = parser.parse_args()
    if args.command == 'add-staff':
        add_staff(args.email, args.name, args.role)
    else:
        print('Serving on loopback; terminate with Ctrl-C')
        ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
