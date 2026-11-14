const hosted = import.meta.env.BASE_URL.startsWith('/arkomgo/');
const mount = hosted ? '/arkomgo' : '';
export const platformHome = hosted ? mount + '/' : '/demo';
export const apiBase = mount + '/api/demo/backend';
export const assetBase = import.meta.env.BASE_URL + 'demo-assets/';
export const platformFont = mount + '/genesis-flutter/assets/assets/fonts/Roboto-Regular.ttf';
