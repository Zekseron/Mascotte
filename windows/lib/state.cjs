'use strict';
class StateController {
  constructor(pack, parser, emit, clock = { setTimeout, clearTimeout }) {
    Object.assign(this, { pack, parser, emit, clock, state: 'idle', timer: null });
  }
  set(state, forever = false) {
    if (!this.parser.STATES.states[state]) return false;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null; this.state = state;
    const used = this.parser.resolveState(state, this.pack).used;
    const animation = this.pack.animations[used];
    this.emit({ state, used, animation });
    if (forever || ['sleep', 'drag'].includes(state)) return true;
    let ms = state === 'idle' ? 300000 : ['done', 'error', 'talk'].includes(state) ? 4000 : 5000;
    if (state === 'celebrate' && !animation.loop) ms = this.parser.totalMs(this.parser.frameSchedule(animation)) + 1000;
    this.timer = this.clock.setTimeout(() => this.set(state === 'idle' ? 'sleep' : 'idle'), ms);
    return true;
  }
  close() { if (this.timer) this.clock.clearTimeout(this.timer); }
}
function clampPosition(position, width, height, displays) {
  const valid = displays.find(d => position && Number.isFinite(position.x) && Number.isFinite(position.y) &&
    position.x + width > d.x && position.y + height > d.y && position.x < d.x + d.width && position.y < d.y + d.height);
  const d = valid || displays[0];
  const x = valid ? position.x : d.x + d.width - width - 24;
  const y = valid ? position.y : d.y + d.height - height - 24;
  return { x: Math.round(Math.max(d.x, Math.min(x, d.x + d.width - width))), y: Math.round(Math.max(d.y, Math.min(y, d.y + d.height - height))) };
}
module.exports = { StateController, clampPosition };
