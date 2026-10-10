const { execFile } = require('node:child_process');
class Vault {
  constructor(binary = process.env.BETTERBW_CLI || 'bw') { this.binary = binary; this.session = ''; this.generation = 0; this.authorized = new Set(); }
  run(args, extra = {}) {
    const env = { ...process.env, BW_SESSION: this.session, BW_NOINTERACTION: 'true', ...extra };
    return new Promise((resolve, reject) => execFile(this.binary, args, { env, timeout: 90000, maxBuffer: 32 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { const message = error.code === 'ENOENT' ? 'Bitwarden CLI was not found. Install bw and make sure it is on your PATH.' : (stderr.trim() || 'Bitwarden could not complete the request. Check your credentials and connection.'); reject(new Error(message.replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[redacted]'))); }
      else resolve(stdout.trim());
    }));
  }
  async status() { const state = JSON.parse(await this.run(['status'])); if (!this.session && state.status === 'unlocked') state.status = 'locked'; return state; }
  async unlock({ password, email, method, code }) {
    if (typeof password !== 'string' || !password) throw new Error('Enter your master password.');
    const generation = this.generation;
    const state = await this.status();
    const args = state.status === 'unauthenticated' ? ['login', String(email || ''), '--raw'] : ['unlock', '--raw'];
    args.push('--passwordenv', 'BETTERBW_PASSWORD');
    if (state.status === 'unauthenticated' && code) args.push('--method', String(method || '0'), '--code', String(code));
    const session = await this.run(args, { BETTERBW_PASSWORD: password });
    if (generation !== this.generation) throw new Error('Unlock cancelled because the vault was locked.');
    if (!session || /\s/.test(session)) throw new Error('Bitwarden did not return a valid session.');
    this.session = session;
    return this.status();
  }
  async list() {
    this.requireSession();
    const [items, folders] = await Promise.all([this.run(['list', 'items']), this.run(['list', 'folders'])]);
    return { items: JSON.parse(items).filter(i => !i.deletedDate).map(i => ({ id: i.id, name: i.name, type: i.type, favorite: i.favorite, folderId: i.folderId, reprompt: i.reprompt, username: i.login?.username || '', uris: i.login?.uris || [], revisionDate: i.revisionDate })), folders: JSON.parse(folders) };
  }
  requireSession() { if (!this.session) throw new Error('Unlock your vault first.'); }
  async item(id, password) {
    const generation = this.generation;
    this.requireSession();
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid item.');
    const item = JSON.parse(await this.run(['get', 'item', id]));
    if (generation !== this.generation) throw new Error('Vault is locked.');
    if (item.reprompt && !this.authorized.has(id)) {
      if (!password) throw new Error('This item requires your master password.');
      const session = await this.run(['unlock', '--raw', '--passwordenv', 'BETTERBW_PASSWORD'], { BETTERBW_PASSWORD: password }).catch(() => { throw new Error('Master password verification failed.'); });
      if (generation !== this.generation) throw new Error('Vault is locked.');
      this.session = session;
      this.authorized.add(id);
    }
    return item;
  }
  async lock() { this.generation++; this.session = ''; this.authorized.clear(); }
}
module.exports = { Vault };
