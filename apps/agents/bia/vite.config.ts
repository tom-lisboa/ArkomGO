import {defineConfig} from "vite";
import {fileURLToPath} from "node:url";
export default defineConfig({base:"/agents/bia/",esbuild:{jsx:"automatic"},resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}}});
