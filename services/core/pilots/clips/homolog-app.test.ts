// Copy into arkom-clips/src/test and run while the Go localhost homologation is active.
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useExportClip } from "@/hooks/useExportClip";

const mock = vi.hoisted(() => ({
  invoke: vi.fn(),
  storage: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mock.invoke }, storage: { from: mock.storage } },
}));
vi.mock("@/lib/org", () => ({ requireOrgId: async () => "org-clips-homolog" }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mock.toast }) }));

const base = "http://127.0.0.1:18082";
const headers = {
  Authorization: "Bearer fixture-clips-owner",
  "x-org-id": "org-clips-homolog",
  "Content-Type": "application/json",
};
const colleague = { ...headers, Authorization: "Bearer fixture-clips-colleague" };
const options = {
  projectId: "projeto-clips-novo",
  clipId: "corte-clips-novo",
  clipTitle: "Podcast vertical",
  startTime: 30,
  endTime: 43.6,
  format: "9:16",
  resolution: "720p",
};

afterEach(() => vi.restoreAllMocks());

it("exporta pelo Go usando o hook real e limita o pedido ao projeto e usuário autorizados", async () => {
  const health = await fetch(base + "/healthz").then((r) => r.json());
  expect(health.mode).toBe("homolog-export");

  const invoke = (slug: string, body: object, auth = headers) =>
    fetch(base + "/homolog/functions/v1/" + slug, {
      method: "POST",
      headers: auth,
      body: JSON.stringify(body),
    });

  const submit = (body: object, auth = headers) => invoke("clips_trim-video", body, auth);
  const request = { ...options, mode: "mp4" };

  for (const [body, auth] of [
    [{ ...request, projectId: "projeto-existente" }, headers],
    [request, colleague],
    [{ ...request, clipId: "outro-corte" }, headers],
  ] as const) {
    const res = await submit(body, auth);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ route: "legacy" });
  }
  expect((await submit(request, { ...headers, "x-org-id": "outra-org" })).status).toBe(403);
  expect((await submit(request, { ...headers, Authorization: "Bearer invalid" })).status).toBe(401);
  expect((await submit({ ...request, format: "16:9" })).status).toBe(400);
  expect((await invoke("outra_solucao", request)).status).toBe(404);
  expect((await fetch(base + "/jobs", { method: "POST" })).status).toBe(404);

  let accepted: { exportId: string; exportPath: string; downloadName: string } | undefined;
  const storagePath = (id: string) => base + "/homolog/exports/" + id;
  mock.invoke.mockImplementation(async (slug, args) => {
    const response = await invoke(slug, args.body, { ...headers, ...args.headers });
    expect(response.status).toBe(202);
    accepted = await response.json();
    return { data: accepted, error: null };
  });

  mock.storage.mockImplementation((bucket) => {
    expect(bucket).toBe("clips-videos");
    return {
      list: async (folder: string, query: { search: string }) => {
        expect(folder + "/" + query.search).toBe(accepted?.exportPath);
        const ready = await fetch(storagePath(accepted!.exportId), { method: "HEAD", headers });
        expect([200, 404]).toContain(ready.status);
        return { data: ready.ok ? [{ name: query.search, metadata: { size: Number(ready.headers.get("x-export-bytes")) } }] : [] };
      },
      createSignedUrl: async (path: string, _seconds: number, download: { download: string }) => {
        expect(path).toBe(accepted?.exportPath);
        expect(download.download).toBe(accepted?.downloadName);
        const response = await fetch(storagePath(accepted!.exportId) + "/sign", { method: "POST", headers });
        expect(response.status).toBe(200);
        return { data: await response.json() };
      },
    };
  });

  let downloadURL = "";
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("podcast-vertical-legendado.mp4");
    downloadURL = this.href;
  });

  const { result } = renderHook(() => useExportClip());
  await act(async () => {
    expect(await result.current.exportClip(options)).toEqual({ success: true, method: "server" });
  });

  expect(accepted?.exportPath).toMatch(/^org-clips-homolog\/usuario-clips-homolog\/projeto-clips-novo\/exports\/[A-Z0-9]+\.mp4$/);
  expect(downloadURL).toMatch(/^http:\/\/127\.0\.0\.1:18082\/homolog\/exports\//);
  const repeated = await submit(request);
  expect(repeated.status).toBe(202);
  expect((await repeated.json()).exportId).toBe(accepted?.exportId);

  const path = storagePath(accepted!.exportId);
  expect((await fetch(path + "/sign", { method: "POST", headers: colleague })).status).toBe(403);
  expect((await fetch(path + "/file")).status).toBe(403);
  const output = await fetch(downloadURL);
  expect(output.status).toBe(200);
  expect(output.headers.get("content-type")).toBe("video/mp4");
  expect(output.headers.get("content-disposition")).toContain("podcast-vertical-legendado.mp4");
  const bytes = Buffer.from(await output.arrayBuffer());
  expect(bytes.length).toBeGreaterThan(100_000);
  expect(bytes.subarray(4, 8).toString()).toBe("ftyp");
}, 20_000);
