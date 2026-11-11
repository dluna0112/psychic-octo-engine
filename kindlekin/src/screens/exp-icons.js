// Kindlekin — small inline SVG icons for the expedition UI (Dungeon agent).
// Each returns an <svg> string, 24x24 viewBox, coloured with currentColor unless noted.

const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" ${extra}>${body}</svg>`;
const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

export const NODE_ICONS = {
  fight: svg(`<g ${S}><path d="M5 4l10 10M4 5l1-1 2 .5L17 14l-3 3L4.5 7z"/><path d="M19 4L9 14M20 5l-1-1-2 .5L7 14l3 3L19.5 7z"/><path d="M5 16l3 3M16 19l3-3M4 20l2-2M20 20l-2-2"/></g>`),
  elite: svg(`<g ${S}><path d="M5 3c0 3 1 5 3 6M19 3c0 3-1 5-3 6"/><path d="M6 13a6 6 0 1 1 12 0c0 2-1 3-2 3.5V19a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C7 16 6 15 6 13z"/></g><circle cx="9.5" cy="13" r="1.6" fill="currentColor"/><circle cx="14.5" cy="13" r="1.6" fill="currentColor"/>`),
  rest: svg(`<path d="M12 3c2 3 5 4.5 5 8.5a5 5 0 0 1-10 0c0-2 1-3.2 2-4 0 1.5.6 2.5 1.6 2.8C10 8 11 5.5 12 3z" fill="currentColor"/><g ${S}><path d="M4 20l16-3M4 17l16 3"/></g>`),
  event: svg(`<g ${S}><path d="M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1-1.2 1.8v.5"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="3 3"/></g><circle cx="12" cy="17.4" r="1.3" fill="currentColor"/>`),
  boss: svg(`<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor"/><path d="M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`),
  start: svg(`<g ${S}><path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></g>`),
};

export const BOON_ICONS = {
  cinder_charm: svg(`<path d="M12 2c3 4 7 6.5 7 12a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3.5 2.3 4C10 9 11 5 12 2z" fill="#ff8f3d" stroke="#3a1608" stroke-width="1.4"/><path d="M12 12c1.5 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1.5-3 3-5z" fill="#ffe08a"/>`),
  dew_charm: svg(`<path d="M12 2.5C15 7 19 10.5 19 15a7 7 0 0 1-14 0c0-4.5 4-8 7-12.5z" fill="#5cbdf0" stroke="#0b2440" stroke-width="1.4"/><path d="M9 14.5a3 3 0 0 0 3 3" stroke="#e6f8ff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  thorn_charm: svg(`<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#86d662" stroke="#163010" stroke-width="1.4"/><path d="M5 19L15 9" stroke="#163010" stroke-width="1.6" stroke-linecap="round"/>`),
  hearthstone: svg(`<path d="M4 9l3-5h10l3 5-8 12z" fill="#8c7aa8" stroke="#241a33" stroke-width="1.4"/><path d="M12 16.5s-3.5-2.2-3.5-4.5a1.9 1.9 0 0 1 3.5-1 1.9 1.9 0 0 1 3.5 1c0 2.3-3.5 4.5-3.5 4.5z" fill="#ff7fb5"/>`),
  calm_bell: svg(`<path d="M6 17c1-1 1.5-2.5 1.5-5.5a4.5 4.5 0 0 1 9 0c0 3 .5 4.5 1.5 5.5z" fill="#ffd45a" stroke="#3a2608" stroke-width="1.4"/><circle cx="12" cy="19" r="2" fill="#ffd45a" stroke="#3a2608" stroke-width="1.2"/><path d="M12 4v3" stroke="#3a2608" stroke-width="1.6" stroke-linecap="round"/>`),
  second_cheer: svg(`<path d="M8 3l1.6 4.4L14 9l-4.4 1.6L8 15l-1.6-4.4L2 9l4.4-1.6z" fill="#ffd45a"/><path d="M17 9l1.2 3.3 3.3 1.2-3.3 1.2L17 18l-1.2-3.3-3.3-1.2 3.3-1.2z" fill="#ffb340"/>`),
  keen_eye: svg(`<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="#e6f1ff" stroke="#1a2440" stroke-width="1.4"/><circle cx="12" cy="12" r="3.6" fill="#63b9ff" stroke="#1a2440" stroke-width="1.2"/><circle cx="13" cy="11" r="1" fill="#fff"/>`),
  soft_moss: svg(`<path d="M3 19c1-5 4-7 9-7s8 2 9 7z" fill="#6f9a4e" stroke="#1a2a10" stroke-width="1.4"/><path d="M8 12c0-3 1-5 3-6M14 12c0-2.5 1-4 3-5" stroke="#86d662" stroke-width="1.8" fill="none" stroke-linecap="round"/>`),
  mote_magnet: svg(`<path d="M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z" fill="#ff6f8e" stroke="#33101a" stroke-width="1.4"/><path d="M5 4h4v3H5zM15 4h4v3h-4z" fill="#e6e6f0"/><circle cx="12" cy="20.5" r="1.8" fill="#5cbdf0"/>`),
  wardlight: svg(`<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="#fff2b0" stroke="#3a2a08" stroke-width="1.4"/><path d="M12 7v9M7.5 11.5h9" stroke="#ffb340" stroke-width="2" stroke-linecap="round"/>`),
};

export const ICON = {
  heart: svg(`<path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7 2.7C19 15.6 12 20 12 20z" fill="currentColor"/>`),
  speed: svg(`<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z" fill="currentColor"/>`),
  flame: svg(`<path d="M12 2c3 4 7 6.5 7 12a7 7 0 0 1-14 0c0-3 2-5 3-6 0 2 1 3.5 2.3 4C10 9 11 5 12 2z" fill="currentColor"/>`),
  skull: NODE_ICONS.elite,
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`),
};
