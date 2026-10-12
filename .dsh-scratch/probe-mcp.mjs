// One-shot diagnostics: start `od mcp` over stdio, initialize, list tools, exit.
import { spawn } from 'node:child_process';

const REPO = '/home/xuyinjie/Web/xuyinjiesh.github.io/.dsh-scratch/open-design';
const child = spawn(`${REPO}/node_modules/.bin/od`, ['mcp', '--daemon-url', 'http://127.0.0.1:7456'], {
  cwd: REPO,
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');

child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === 1) {
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    } else if (msg.id === 2) {
      const names = (msg.result?.tools ?? []).map((t) => t.name);
      console.log('TOOL_COUNT=' + names.length);
      console.log('TOOLS=' + names.join(','));
      child.kill();
      process.exit(0);
    }
  }
});
child.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d.toString()));

send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '1.0.0' } },
});

setTimeout(() => { console.error('TIMEOUT'); child.kill(); process.exit(1); }, 30000);
