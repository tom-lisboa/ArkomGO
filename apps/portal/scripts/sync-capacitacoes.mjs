/**
 * Sincroniza o catálogo REAL de capacitações no schema app_arkom
 * (mesmo schema que o /admin grava). INSERT puro + idempotente por título:
 * cursos já existentes são pulados; nada é apagado. Transacional.
 *
 * Fonte dos vídeos: schema `educacional` (bilhon-ai), capturado read-only —
 * URLs Panda da biblioteca vz-2cdebb25-226. Capas = PNGs em /public/capacitacoes.
 *
 * Uso: node scripts/sync-capacitacoes.mjs
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const LIB = "2cdebb25-226";
const embed = (id) => `https://player-vz-${LIB}.tv.pandavideo.com.br/embed/?v=${id}`;
const cc = (n) => `Aula ${n} do curso Claude Code.`;
const lv = (n) => `Nesta aula: lovable na prática - aula ${n}. Assista até o final.`;

/** courseSpecs — mesmo shape do seed. lessons: [title, videoUrl, desc]. */
const CATALOG = [
  {
    title: "Claude Code",
    description:
      "Curso prático para usar Claude Code como um agente de desenvolvimento: instalação, interface, comandos, fluxo de trabalho e transformação de ideias em ferramentas.",
    cover: "/capacitacoes/claude-code.png",
    modules: [
      {
        title: "Claude Code na prática",
        description:
          "Do primeiro contato ao fluxo completo: instalar, comandar e transformar ideias em ferramentas com o Claude Code.",
        lessons: [
          ["O que é o Claude Code", embed("388579fd-cc1d-4db0-97fc-ddd743f926a4"), cc(1)],
          ["Visão: Claude Code como seu time", embed("0f97d31b-d963-4660-8777-1a47f5f79772"), cc(2)],
          ["Baixando o Claude Code na prática", embed("3f16848a-38b1-4ecc-940b-4da9b272c94b"), cc(3)],
          ["Tour pela interface e seu primeiro agente", embed("24628d04-9465-4670-8789-37c927760a54"), cc(4)],
          ["Comandos Claude Code", embed("066cfc3f-4810-40fa-93c7-8aa3f1100ed8"), cc(5)],
          ["Fluxo de ouro + Cérebro Empresarial", embed("8f8b5454-b3c8-4a0c-b29c-dc07c553d5f7"), cc(6)],
          ["Transformando ideias em ferramentas", embed("e7e001ce-e56e-4fa5-b33f-745d714fe572"), cc(7)],
        ],
      },
    ],
  },
  {
    title: "Lovable na Prática",
    description:
      "Aprenda a transformar ideias em aplicações reais com Lovable: estrutura de projeto, telas, ajustes, publicação e iteração rápida sem depender de um time técnico.",
    cover: "/capacitacoes/lovable-na-pratica.png",
    modules: [
      {
        title: "Aulas",
        description:
          "Construção prática de aplicações com IA, da primeira tela ao refinamento do produto.",
        lessons: [
          "05819416-c8a6-45ba-9a8b-9891195d9fb0",
          "a31ee201-11f5-4f19-8839-580118a37185",
          "e4d7aeac-dff7-4185-90b3-1dae1bfb6cdb",
          "1164a162-1a4e-42bf-acef-1712923336d4",
          "620959c4-8805-42bc-9240-91b6c7b273b1",
          "1aad8b0d-47fc-4b56-b535-6150a0f12caa",
          "5a748594-13b1-42a7-92c4-dafb3f3c8ba3",
          "94f31e8b-5e67-4df3-a377-afe356e8af3b",
          "dca661e1-3418-4caf-829a-2bc2dd4e1eeb",
          "56e32a6f-3c96-4694-a5ed-8aae9a790e23",
          "7e34b9c5-1103-434f-aa7c-bd9913d3639a",
          "9af6b74b-0cab-4921-85f2-67bb21e143d9",
          "3a4daa6b-bfd6-4796-b3ae-0a6a04f2e569",
          "a0cce592-4f7b-4551-8248-08dadcd76689",
          "cc6e5397-3e6f-4f1b-955c-e1d980907c0e",
          "eaee0185-a74b-4f17-ae81-776437134207",
          "f5232c8e-4d3d-49ad-a5a5-3dcdf3302c3c",
        ].map((id, i) => [
          `Lovable na Prática - Aula ${String(i + 1).padStart(2, "0")}`,
          embed(id),
          lv(String(i + 1).padStart(2, "0")),
        ]),
      },
    ],
  },
  {
    title: "HeyGen",
    description:
      "Aprenda a criar vídeos profissionais com avatares de IA: roteiro, criação do avatar, cenas, ajustes de voz e exportação para campanhas, treinamentos e conteúdo comercial.",
    cover: "/capacitacoes/heygen.png",
    modules: [
      {
        title: "Aulas",
        description: "Do roteiro à exportação: produção de vídeos com avatares de IA no HeyGen.",
        lessons: [
          ["HeyGen - Aula 01", embed("b8cabf64-2bd2-4b89-86dc-044d07843653"), "Primeiro contato com HeyGen, principais recursos e como estruturar um vídeo com avatar de IA."],
          ["HeyGen - Aula 02", embed("afd927ba-a39f-49b4-97ee-c1ed0f6de5f1"), "Configuração da base do vídeo: roteiro, avatar, voz e organização da cena."],
          ["HeyGen - Aula 03", embed("59699ed9-105c-4f4b-b1ca-34c598200cf8"), "Refinamento da apresentação, ajustes visuais e boas práticas para deixar o vídeo profissional."],
          ["HeyGen - Aula 04", embed("547dc408-a743-4d69-84ae-ccaba88602c5"), "Finalização do projeto, revisão, exportação e aplicações comerciais do material produzido."],
          // Aula 05 vem em delivery b-vz-* (verbatim do banco) — o player normaliza via embedSrc().
          ["HeyGen - Aula 05", `https://b-vz-${LIB}.tv.pandavideo.com.br/85ccd26c-4faa-44b2-8c05-2542357967c0/playlist.m3u8`, "Encerramento do curso HeyGen."],
        ],
      },
    ],
  },
];

/** Cursos publicados no catálogo, ainda sem módulos/aulas (estado "em breve"). */
const COMING_SOON = [
  ["Capacitação N8N", "/capacitacoes/capacitacao-n8n.png"],
  ["Capacitação CODEX", "/capacitacoes/capacitacao-codex.png"],
  ["Capacitação GPT", "/capacitacoes/capacitacao-gpt.png"],
  ["Capacitação Shopify", "/capacitacoes/capacitacao-shopify.png"],
  ["Capacitação Antigravity", "/capacitacoes/capacitacao-antigravity.png"],
];

const sql = postgres(process.env.ARKOM_DATABASE_URL, {
  connection: { search_path: "app_arkom" },
  ssl: "require",
  max: 3,
});

const nowIso = new Date().toISOString();

try {
  const [{ id: adminId } = {}] = await sql`SELECT id FROM profiles WHERE role='admin' ORDER BY id LIMIT 1`;
  if (!adminId) throw new Error("nenhum admin em app_arkom.profiles para created_by");

  let sort = 0;
  let insertedCourses = 0;
  let insertedLessons = 0;

  await sql.begin(async (tx) => {
    // Cursos reais (com módulos + aulas)
    for (const spec of CATALOG) {
      sort += 1;
      const [existing] = await tx`SELECT id FROM courses WHERE title = ${spec.title} LIMIT 1`;
      if (existing) {
        console.log(`= já existe: ${spec.title} (#${existing.id}) — pulado`);
        continue;
      }
      const [course] = await tx`
        INSERT INTO courses (title, description, cover_url, release_type, release_after_days, sort_order, status, created_by, created_at)
        VALUES (${spec.title}, ${spec.description}, ${spec.cover}, 'immediate', 0, ${sort}, 'published', ${adminId}, ${nowIso})
        RETURNING id`;
      insertedCourses += 1;
      for (const [mi, mod] of spec.modules.entries()) {
        const [module] = await tx`
          INSERT INTO course_modules (course_id, title, description, sort_order, status)
          VALUES (${course.id}, ${mod.title}, ${mod.description}, ${mi + 1}, 'published')
          RETURNING id`;
        for (const [li, [title, videoUrl, desc]] of mod.lessons.entries()) {
          await tx`
            INSERT INTO lessons (course_id, module_id, title, description, video_provider, video_url, sort_order, status)
            VALUES (${course.id}, ${module.id}, ${title}, ${desc}, 'panda', ${videoUrl}, ${li + 1}, 'published')`;
          insertedLessons += 1;
        }
      }
      console.log(`+ curso: ${spec.title} (#${course.id}) · ${spec.modules[0].lessons.length} aulas`);
    }

    // Cursos "em breve" (sem aulas)
    for (const [title, cover] of COMING_SOON) {
      sort += 1;
      const [existing] = await tx`SELECT id FROM courses WHERE title = ${title} LIMIT 1`;
      if (existing) {
        console.log(`= já existe: ${title} (#${existing.id}) — pulado`);
        continue;
      }
      const [course] = await tx`
        INSERT INTO courses (title, description, cover_url, release_type, release_after_days, sort_order, status, created_by, created_at)
        VALUES (${title}, 'Em breve.', ${cover}, 'immediate', 0, ${sort}, 'published', ${adminId}, ${nowIso})
        RETURNING id`;
      insertedCourses += 1;
      console.log(`+ em breve: ${title} (#${course.id})`);
    }
  });

  console.log(`\nOK — cursos inseridos: ${insertedCourses}, aulas: ${insertedLessons}`);

  const rows = await sql`
    SELECT c.title, c.status,
           (SELECT count(*) FROM lessons l WHERE l.course_id=c.id) AS aulas
    FROM courses c ORDER BY c.sort_order, c.id`;
  console.log("\n=== app_arkom.courses agora ===");
  for (const r of rows) console.log(`- ${r.title} [${r.status}] · ${r.aulas} aulas`);
} catch (e) {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
