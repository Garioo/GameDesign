const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

test('sidebar subscriptions cover scoped writes, deletes, reconnect, focus and cleanup', async () => {
  const events = [], listeners = new Map();
  let effect, cleanup, subscribed, pending, interval, calls = 0, removed = false;
  const channel = { on(_type, filter, callback) { events.push({filter, callback}); return this; }, subscribe(callback) { subscribed = callback; return this; } };
  const client = { channel: () => channel, removeChannel: () => { removed = true; } };
  const source = ts.transpileModule(fs.readFileSync(require.resolve('../lib/useSidebarLiveUpdates.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const result = {exports:{}};
  const windowStub = {addEventListener: (name, fn) => listeners.set(name,fn), removeEventListener: name => listeners.delete(name)};
  const docStub = {...windowStub, visibilityState:'visible'};
  new Function('require','exports','window','document','setTimeout','clearTimeout','setInterval','clearInterval',source)(
    name => name === 'react' ? {useEffect: fn => {effect=fn;},useRef: value => ({current:value})} : {supabase:client},
    result.exports,windowStub,docStub,fn => {pending=fn;return 1;},() => {pending=null;},fn => {interval=fn;return 2;},() => {interval=null;});
  result.exports.useSidebarLiveUpdates('workspace-1',['boards','canvases'],async()=>{calls++;});
  cleanup=effect();
  assert.equal(events.length,6);
  assert.ok(events.filter(e=>e.filter.event!=='DELETE').every(e=>e.filter.filter==='project_id=eq.workspace-1'));
  assert.ok(events.filter(e=>e.filter.event==='DELETE').every(e=>!e.filter.filter));
  subscribed('SUBSCRIBED');await pending();assert.equal(calls,1);
  events[0].callback();events[1].callback();await pending();assert.equal(calls,2);
  events.find(e=>e.filter.event==='DELETE').callback();await pending();assert.equal(calls,3);
  subscribed('CHANNEL_ERROR');interval();await pending();assert.equal(calls,4);
  subscribed('SUBSCRIBED');await pending();assert.equal(calls,5);
  listeners.get('focus')();await pending();assert.equal(calls,6);
  cleanup();assert.equal(removed,true);assert.equal(listeners.size,0);assert.equal(interval,null);
});
