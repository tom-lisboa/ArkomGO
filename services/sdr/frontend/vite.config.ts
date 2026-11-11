declare const process:{env:Record<string,string|undefined>};
import { defineConfig } from 'vite';
export default defineConfig({base:process.env.SDR_ASSET_BASE??'/',resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},build:{sourcemap:false}});
