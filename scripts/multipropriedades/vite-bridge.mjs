const portal = "http://127.0.0.1:3007";
const product = "http://127.0.0.1:8180";
const script = `
import { getSupabase } from "/src/homolog/client.ts";

const portal = ${JSON.stringify(portal)};
const requestId = crypto.randomUUID();
if (window.parent !== window) {
  // Start each launch without any session left over in this tab.
  const prior = sessionStorage.getItem("arkom-multi-launch");
  if (prior) sessionStorage.removeItem("arkom-multi-homolog-auth-" + prior);
  sessionStorage.setItem("arkom-multi-launch", requestId);
  async function launch(event) {
    if (event.origin !== portal || event.source !== window.parent ||
        event.data?.type !== "arkom.multi.session" || event.data.requestId !== requestId) return;
    window.removeEventListener("message", launch);
    try {
      const { data, error } = await getSupabase().auth.setSession(event.data.session);
      if (error || !data.session) throw Error("invalid_session");
      window.parent.postMessage({ type: "arkom.multi.opened", requestId }, portal);
      window.location.replace("/");
    } catch {
      window.parent.postMessage({ type: "arkom.multi.failed", requestId }, portal);
    }
  }
  window.addEventListener("message", launch);
  window.parent.postMessage({ type: "arkom.multi.ready", requestId }, portal);
}
`;

function arkomMultiBridge(publishableKey) {
  const enterPath = "/__arkom/entrar";
  return {
    name: "arkom-multipropriedades-demo",
    enforce: "pre",
    transform(source, id) {
      const file = id.split("?")[0];
      if (file.endsWith("/src/homolog/env.ts")) {
        return source.replaceAll("__MULTI_HOMOLOG_KEY__", "arkomMultiPublishableKey")
          .replace("declare const arkomMultiPublishableKey: string;", "const arkomMultiPublishableKey = " + publishableKey + ";");
      }
      if (!file.endsWith("/src/homolog/client.ts")) return;
      const anchor = 'storageKey: "arkom-multi-homolog-auth",';
      if (!source.includes(anchor)) throw Error("Cliente de homologação do Multipropriedades incompatível.");
      return source.replace(anchor, `
        storageKey: typeof window !== "undefined" && window.parent !== window
          ? "arkom-multi-homolog-auth-" + window.sessionStorage.getItem("arkom-multi-launch")
          : "arkom-multi-homolog-auth",
        storage: typeof window !== "undefined" && window.parent !== window ? window.sessionStorage : undefined,
      `);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.headers.host !== new URL(product).host) {
          res.writeHead(403).end();
          return;
        }
        const csp = [
          "connect-src 'self' http://127.0.0.1:55321 http://127.0.0.1:8190 ws://127.0.0.1:8180",
          "form-action 'self'",
          "base-uri 'self'",
          "frame-ancestors " + portal,
        ].join("; ");
        // The product config also supplies a connection-only CSP.
        res.setHeader("Content-Security-Policy", csp);
        if (req.method === "GET" && req.url === "/__arkom/ready") {
          res.writeHead(200, { "Cache-Control": "no-store" }).end();
        } else if (req.method === "GET" && req.url === enterPath) {
          res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": csp + "; script-src 'self'",
          }).end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Multipropriedades</title><script type="module" src="' + enterPath + '.js"></script></html>');
        } else if (req.method === "GET" && req.url === enterPath + ".js") {
          res.writeHead(200, {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          }).end(script);
        } else {
          next();
        }
      });
    },
  };
}

export function withArkomMultiBridge(config) {
  const guard = config.plugins.find((plugin) => plugin.name === "homologacao-local-isolada");
  const publishableKey = config.define?.__MULTI_HOMOLOG_KEY__;
  if (!/^"sb_publishable_[A-Za-z0-9_-]+"$/.test(publishableKey)) {
    throw Error("Chave publicável local ausente.");
  }
  const bridge = arkomMultiBridge(publishableKey);
  // Run after the homologation CSP middleware, before TanStack's SSR handler.
  const index = config.plugins.indexOf(guard);
  if (index < 0) throw Error("Configuração segura de homologação ausente.");
  const plugins = [...config.plugins];
  plugins.splice(index + 1, 0, bridge);
  return {
    ...config,
    plugins,
    server: {
      ...config.server,
      fs: {
        ...config.server?.fs,
        deny: [
          "**/.env", "**/.env.*", "**/*.{crt,pem}", "**/.git/**",
          "**/.homolog/**", "**/.homolog", "**/backend/**",
          ...(config.server?.fs?.deny ?? []),
        ],
      },
    },
  };
}
