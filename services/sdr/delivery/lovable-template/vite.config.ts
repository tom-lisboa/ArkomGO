declare const process:{env:Record<string,string|undefined>};
import { defineConfig } from 'vite';
export default defineConfig({define:{'import.meta.env.VITE_SDR_REMIX':JSON.stringify('true')},base:process.env.SDR_ASSET_BASE??'/',resolve:{alias:{'@':new URL('./src',import.meta.url).pathname}},build:{sourcemap:false}});
