import type postgres from "postgres";
import { addDays, format, subDays, subHours, subMinutes } from "date-fns";

type DbSql = postgres.Sql | postgres.TransactionSql;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260704);
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[randInt(0, arr.length - 1)];

const iso = (d: Date) => d.toISOString();
const day = (d: Date) => format(d, "yyyy-MM-dd");

const VIDEOS = [
  "https://www.youtube.com/watch?v=aircAruvnKk",
  "https://www.youtube.com/watch?v=wjZofJX0v4M",
  "https://youtu.be/zjkBMFhNj_g",
  "https://www.youtube.com/watch?v=kCc8FmEb1nY",
  "https://youtu.be/LPZh9BOjkQs",
  "https://www.youtube.com/watch?v=eMlx5fFNoYc",
  "https://www.youtube.com/watch?v=R9OHn5ZF4Uo",
  "https://youtu.be/bZQun8Y4L2A",
];
const video = (i: number) => VIDEOS[i % VIDEOS.length];

async function insertProfile(
  sql: DbSql,
  fullName: string,
  email: string,
  passwordHash: string | null,
  role: "admin" | "student",
  status: "active" | "blocked" | "deleted",
  registeredAt: string
) {
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO profiles (full_name, email, password_hash, role, status, registered_at)
    VALUES (${fullName}, ${email}, ${passwordHash}, ${role}, ${status}, ${registeredAt})
    RETURNING id
  `;
  return row.id;
}

export async function seed(db: postgres.Sql): Promise<void> {
  const now = new Date();
  // Perfis demo locais não criam credenciais no GoTrue central.
  const passwordHash: string | null = null;

  await db.begin(async (sql) => {
    // Registro relacional para autoria do conteúdo demo. Ele é deliberadamente
    // bloqueado, usa domínio reservado e não recebe auth_user_id nem senha.
    const adminId = await insertProfile(
      sql,
      "Admin de demonstração",
      "seed-admin@example.invalid",
      passwordHash,
      "admin",
      "blocked",
      iso(subDays(now, 120))
    );

    const joaoId = await insertProfile(
      sql,
      "João Silva",
      "aluno@example.invalid",
      passwordHash,
      "student",
      "active",
      iso(subDays(now, 10))
    );

    const fakeNames: Array<[string, string]> = [
      ["Ana Beatriz Souza", "ana.souza"], ["Bruno Carvalho", "bruno.carvalho"],
      ["Camila Ferreira", "camila.ferreira"], ["Diego Martins", "diego.martins"],
      ["Eduarda Lima", "eduarda.lima"], ["Felipe Rocha", "felipe.rocha"],
      ["Gabriela Nunes", "gabriela.nunes"], ["Henrique Alves", "henrique.alves"],
      ["Isabela Castro", "isabela.castro"], ["Júlia Mendes", "julia.mendes"],
      ["Kaique Barbosa", "kaique.barbosa"], ["Larissa Oliveira", "larissa.oliveira"],
      ["Marcos Vinícius Costa", "marcos.costa"], ["Natália Ribeiro", "natalia.ribeiro"],
      ["Otávio Pereira", "otavio.pereira"], ["Patrícia Gomes", "patricia.gomes"],
      ["Rafael Santana", "rafael.santana"], ["Sofia Cardoso", "sofia.cardoso"],
      ["Thiago Moreira", "thiago.moreira"], ["Vanessa Duarte", "vanessa.duarte"],
      ["William Teixeira", "william.teixeira"], ["Yasmin Fonseca", "yasmin.fonseca"],
      ["Pedro Henrique Ramos", "pedro.ramos"], ["Mariana Azevedo", "mariana.azevedo"],
      ["Lucas Fogaça", "lucas.fogaca"], ["Beatriz Monteiro", "beatriz.monteiro"],
      ["Gustavo Pires", "gustavo.pires"], ["Renata Sales", "renata.sales"],
    ];

    const studentIds: number[] = [];
    for (const [i, [name, slug]] of fakeNames.entries()) {
      const status = i === 11 || i === 24 ? "blocked" : "active";
      const id = await insertProfile(
        sql,
        name,
        `${slug}@example.invalid`,
        passwordHash,
        "student",
        status,
        iso(subDays(now, randInt(5, 110)))
      );
      studentIds.push(id);
    }
    const activeStudents = studentIds.filter((_, i) => i !== 11 && i !== 24);

    type LessonSpec =
      | string
      | {
          title: string;
          videoProvider: "youtube" | "panda";
          videoUrl: string;
          description?: string;
        };

    type CourseSpec = {
      title: string;
      description: string;
      coverUrl?: string | null;
      releaseType: "immediate" | "after_days";
      releaseAfterDays: number;
      status: "draft" | "published";
      modules: Array<{ title: string; description: string; lessons: LessonSpec[] }>;
    };

    const pandaLovableLessons: LessonSpec[] = [
      {
        title: "Lovable na Prática - Aula 01",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=05819416-c8a6-45ba-9a8b-9891195d9fb0",
      },
      {
        title: "Lovable na Prática - Aula 02",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=a31ee201-11f5-4f19-8839-580118a37185",
      },
      {
        title: "Lovable na Prática - Aula 03",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=e4d7aeac-dff7-4185-90b3-1dae1bfb6cdb",
      },
      {
        title: "Lovable na Prática - Aula 04",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=1164a162-1a4e-42bf-acef-1712923336d4",
      },
      {
        title: "Lovable na Prática - Aula 05",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=620959c4-8805-42bc-9240-91b6c7b273b1",
      },
      {
        title: "Lovable na Prática - Aula 06",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=1aad8b0d-47fc-4b56-b535-6150a0f12caa",
      },
      {
        title: "Lovable na Prática - Aula 07",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=5a748594-13b1-42a7-92c4-dafb3f3c8ba3",
      },
      {
        title: "Lovable na Prática - Aula 08",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=94f31e8b-5e67-4df3-a377-afe356e8af3b",
      },
      {
        title: "Lovable na Prática - Aula 09",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=dca661e1-3418-4caf-829a-2bc2dd4e1eeb",
      },
      {
        title: "Lovable na Prática - Aula 10",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=56e32a6f-3c96-4694-a5ed-8aae9a790e23",
      },
      {
        title: "Lovable na Prática - Aula 11",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=7e34b9c5-1103-434f-aa7c-bd9913d3639a",
      },
      {
        title: "Lovable na Prática - Aula 12",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=9af6b74b-0cab-4921-85f2-67bb21e143d9",
      },
      {
        title: "Lovable na Prática - Aula 13",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=3a4daa6b-bfd6-4796-b3ae-0a6a04f2e569",
      },
      {
        title: "Lovable na Prática - Aula 14",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=a0cce592-4f7b-4551-8248-08dadcd76689",
      },
      {
        title: "Lovable na Prática - Aula 15",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=cc6e5397-3e6f-4f1b-955c-e1d980907c0e",
      },
      {
        title: "Lovable na Prática - Aula 16",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=eaee0185-a74b-4f17-ae81-776437134207",
      },
      {
        title: "Lovable na Prática - Aula 17",
        videoProvider: "panda",
        videoUrl:
          "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=f5232c8e-4d3d-49ad-a5a5-3dcdf3302c3c",
      },
    ];

    const courseSpecs: CourseSpec[] = [
      {
        title: "Claude Code",
        description:
          "Curso prático para usar Claude Code como um agente de desenvolvimento: instalação, interface, comandos, fluxo de trabalho e transformação de ideias em ferramentas.",
        coverUrl: "/trainings/claude-code.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [
          {
            title: "Claude Code na prática",
            description:
              "Do primeiro contato ao fluxo completo: instalar, comandar e transformar ideias em ferramentas.",
            lessons: [
              { title: "O que é o Claude Code", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=388579fd-cc1d-4db0-97fc-ddd743f926a4", description: "Aula 1 do curso Claude Code." },
              { title: "Visão: Claude Code como seu time", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=0f97d31b-d963-4660-8777-1a47f5f79772", description: "Aula 2 do curso Claude Code." },
              { title: "Baixando o Claude Code na prática", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=3f16848a-38b1-4ecc-940b-4da9b272c94b", description: "Aula 3 do curso Claude Code." },
              { title: "Tour pela interface e seu primeiro agente", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=24628d04-9465-4670-8789-37c927760a54", description: "Aula 4 do curso Claude Code." },
              { title: "Comandos Claude Code", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=066cfc3f-4810-40fa-93c7-8aa3f1100ed8", description: "Aula 5 do curso Claude Code." },
              { title: "Fluxo de ouro + Cérebro Empresarial", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=8f8b5454-b3c8-4a0c-b29c-dc07c553d5f7", description: "Aula 6 do curso Claude Code." },
              { title: "Transformando ideias em ferramentas", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=e7e001ce-e56e-4fa5-b33f-745d714fe572", description: "Aula 7 do curso Claude Code." },
            ],
          },
        ],
      },
      {
        title: "Lovable na Prática",
        description:
          "Aprenda a transformar ideias em aplicações reais com Lovable: estrutura de projeto, telas, ajustes, publicação e iteração rápida sem depender de um time técnico.",
        coverUrl: "/trainings/lovable-na-pratica.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [
          {
            title: "Aulas",
            description:
              "Construção prática de aplicações com IA, da primeira tela ao refinamento do produto.",
            lessons: pandaLovableLessons,
          },
        ],
      },
      {
        title: "HeyGen",
        description:
          "Aprenda a criar vídeos profissionais com avatares de IA: roteiro, criação do avatar, cenas, ajustes de voz e exportação para campanhas, treinamentos e conteúdo comercial.",
        coverUrl: "/trainings/heygen.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [
          {
            title: "Aulas",
            description: "Do roteiro à exportação: produção de vídeos com avatares de IA no HeyGen.",
            lessons: [
              { title: "HeyGen - Aula 01", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=b8cabf64-2bd2-4b89-86dc-044d07843653", description: "Primeiro contato com HeyGen, principais recursos e como estruturar um vídeo com avatar de IA." },
              { title: "HeyGen - Aula 02", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=afd927ba-a39f-49b4-97ee-c1ed0f6de5f1", description: "Configuração da base do vídeo: roteiro, avatar, voz e organização da cena." },
              { title: "HeyGen - Aula 03", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=59699ed9-105c-4f4b-b1ca-34c598200cf8", description: "Refinamento da apresentação, ajustes visuais e boas práticas para deixar o vídeo profissional." },
              { title: "HeyGen - Aula 04", videoProvider: "panda", videoUrl: "https://player-vz-2cdebb25-226.tv.pandavideo.com.br/embed/?v=547dc408-a743-4d69-84ae-ccaba88602c5", description: "Finalização do projeto, revisão, exportação e aplicações comerciais do material produzido." },
              { title: "HeyGen - Aula 05", videoProvider: "panda", videoUrl: "https://b-vz-2cdebb25-226.tv.pandavideo.com.br/85ccd26c-4faa-44b2-8c05-2542357967c0/playlist.m3u8", description: "Encerramento do curso HeyGen." },
            ],
          },
        ],
      },
      // Cursos publicados no catálogo, ainda sem módulos/lessons (estado "em breve").
      {
        title: "Capacitação N8N",
        description: "Em breve.",
        coverUrl: "/trainings/capacitacao-n8n.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [],
      },
      {
        title: "Capacitação CODEX",
        description: "Em breve.",
        coverUrl: "/trainings/capacitacao-codex.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [],
      },
      {
        title: "Capacitação GPT",
        description: "Em breve.",
        coverUrl: "/trainings/capacitacao-gpt.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [],
      },
      {
        title: "Capacitação Shopify",
        description: "Em breve.",
        coverUrl: "/trainings/capacitacao-shopify.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [],
      },
      {
        title: "Capacitação Antigravity",
        description: "Em breve.",
        coverUrl: "/trainings/capacitacao-antigravity.png",
        releaseType: "immediate",
        releaseAfterDays: 0,
        status: "published",
        modules: [],
      },
    ];

    const resourceSamples: Array<[string, "pdf" | "external_link", string]> = [
      ["Slides da aula (PDF)", "pdf", "https://arkom.ai/materiais/slides-aula.pdf"],
      ["Template de prompts (Notion)", "external_link", "https://www.notion.so/bilhon/template-prompts"],
      ["Checklist de implementação (PDF)", "pdf", "https://arkom.ai/materiais/checklist-implementacao.pdf"],
      ["Planilha de ROI (Google Sheets)", "external_link", "https://docs.google.com/spreadsheets/d/bilhon-roi"],
      ["Guia rápido da aula (PDF)", "pdf", "https://arkom.ai/materiais/guia-rapido.pdf"],
      ["Ferramenta citada na aula", "external_link", "https://platform.openai.com/docs"],
    ];

    const courseIds: number[] = [];
    const lessonsByCourse: number[][] = [];
    let videoIdx = 0;
    let resourceIdx = 0;

    for (const [ci, spec] of courseSpecs.entries()) {
      const [course] = await sql<{ id: number }[]>`
        INSERT INTO courses
          (title, description, cover_url, release_type, release_after_days, sort_order, status, created_by, created_at)
        VALUES
          (${spec.title}, ${spec.description}, ${spec.coverUrl ?? null}, ${spec.releaseType}, ${spec.releaseAfterDays},
           ${ci + 1}, ${spec.status}, ${adminId}, ${iso(subDays(now, 100 - ci * 10))})
        RETURNING id
      `;
      courseIds.push(course.id);
      const lessonIds: number[] = [];

      for (const [mi, mod] of spec.modules.entries()) {
        const [module] = await sql<{ id: number }[]>`
          INSERT INTO course_modules (course_id, title, description, sort_order, status)
          VALUES (${course.id}, ${mod.title}, ${mod.description}, ${mi + 1}, 'published')
          RETURNING id
        `;

        for (const [li, lessonSpec] of mod.lessons.entries()) {
          const lessonTitle = typeof lessonSpec === "string" ? lessonSpec : lessonSpec.title;
          const lessonDescription =
            typeof lessonSpec === "string"
              ? `Nesta aula: ${lessonTitle.toLowerCase()}. Assista até o final e baixe os materiais de apoio.`
              : lessonSpec.description ??
                `Nesta aula: ${lessonTitle.toLowerCase()}. Assista até o final.`;
          const lessonProvider =
            typeof lessonSpec === "string" ? ("youtube" as const) : lessonSpec.videoProvider;
          const lessonVideoUrl = typeof lessonSpec === "string" ? video(videoIdx++) : lessonSpec.videoUrl;

          const [lesson] = await sql<{ id: number }[]>`
            INSERT INTO lessons
              (course_id, module_id, title, description, video_provider, video_url, sort_order, status)
            VALUES
              (${course.id}, ${module.id}, ${lessonTitle},
               ${lessonDescription},
               ${lessonProvider}, ${lessonVideoUrl}, ${li + 1}, 'published')
            RETURNING id
          `;
          lessonIds.push(lesson.id);

          const [t1, ty1, u1] = resourceSamples[resourceIdx++ % resourceSamples.length];
          await sql`
            INSERT INTO lesson_resources (lesson_id, title, resource_type, url, sort_order)
            VALUES (${lesson.id}, ${t1}, ${ty1}, ${u1}, 1)
          `;
          if (li % 2 === 0) {
            const [t2, ty2, u2] = resourceSamples[resourceIdx++ % resourceSamples.length];
            await sql`
              INSERT INTO lesson_resources (lesson_id, title, resource_type, url, sort_order)
              VALUES (${lesson.id}, ${t2}, ${ty2}, ${u2}, 2)
            `;
          }
        }
      }

      lessonsByCourse.push(lessonIds);
    }

    const [curso1Id, curso2Id, curso3Id] = courseIds;
    const curso1Lessons = lessonsByCourse[0];
    const curso2Lessons = lessonsByCourse[1];

    for (const [i, lessonId] of curso1Lessons.slice(0, 5).entries()) {
      await sql`
        INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at)
        VALUES (${joaoId}, ${lessonId}, 1, ${iso(subDays(now, 9 - i * 2))})
      `;
    }
    await sql`
      INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at)
      VALUES (${joaoId}, ${curso2Lessons[0]}, 1, ${iso(subHours(now, 20))})
    `;
    await sql`INSERT INTO lesson_likes (user_id, lesson_id, liked) VALUES (${joaoId}, ${curso1Lessons[0]}, 1)`;
    await sql`INSERT INTO lesson_likes (user_id, lesson_id, liked) VALUES (${joaoId}, ${curso1Lessons[3]}, 1)`;
    await sql`INSERT INTO lesson_ratings (user_id, lesson_id, rating) VALUES (${joaoId}, ${curso1Lessons[0]}, 5)`;
    await sql`INSERT INTO lesson_ratings (user_id, lesson_id, rating) VALUES (${joaoId}, ${curso1Lessons[3]}, 4)`;

    const ratableLessons = [...curso1Lessons, ...curso2Lessons];
    for (const studentId of activeStudents) {
      const completedCount = randInt(0, ratableLessons.length);
      const shuffled = [...ratableLessons].sort(() => rand() - 0.5);
      for (const lessonId of shuffled.slice(0, completedCount)) {
        await sql`
          INSERT INTO lesson_progress (user_id, lesson_id, completed, completed_at)
          VALUES (${studentId}, ${lessonId}, 1, ${iso(subDays(now, randInt(0, 45)))})
          ON CONFLICT (user_id, lesson_id) DO NOTHING
        `;
      }
      for (const lessonId of shuffled.slice(0, randInt(0, 3))) {
        await sql`
          INSERT INTO lesson_likes (user_id, lesson_id, liked)
          VALUES (${studentId}, ${lessonId}, 1)
          ON CONFLICT (user_id, lesson_id) DO NOTHING
        `;
      }
      for (const lessonId of shuffled.slice(0, randInt(0, 4))) {
        await sql`
          INSERT INTO lesson_ratings (user_id, lesson_id, rating)
          VALUES (${studentId}, ${lessonId}, ${randInt(3, 5)})
          ON CONFLICT (user_id, lesson_id) DO NOTHING
        `;
      }
    }

    for (let i = 0; i < 220; i++) {
      const uid = pick([joaoId, ...activeStudents]);
      const cid = rand() < 0.55 ? curso1Id : rand() < 0.75 ? curso2Id : curso3Id;
      await sql`
        INSERT INTO course_access_logs (user_id, course_id, accessed_at)
        VALUES (${uid}, ${cid}, ${iso(subMinutes(subDays(now, randInt(0, 30)), randInt(0, 720)))})
      `;
    }

    type EventSpec = [
      title: string,
      desc: string,
      date: Date,
      start: string,
      end: string | null,
      rec: "none" | "weekly",
      recUntil: Date | null,
      status: string,
    ];
    const eventSpecs: EventSpec[] = [
      ["Mentoria Coletiva — Estratégia de IA",
        "Sessão ao vivo para revisar o roadmap de IA dos membros e priorizar os próximos passos.",
        subDays(now, 7), "19:00", "20:30", "none", null, "published"],
      ["Hot Seat: Destrave seu Projeto",
        "Traga seu caso real e receba um plano de ação direto da equipe Bilhon.",
        subDays(now, 3), "19:00", "20:00", "none", null, "published"],
      ["Mentoria de Boas-Vindas — Turma de Julho",
        "Onboarding ao vivo: como aproveitar ao máximo a plataforma e a comunidade.",
        subDays(now, 1), "12:00", "13:00", "none", null, "published"],
      ["Plantão de Dúvidas ao Vivo",
        "Tire qualquer dúvida sobre as capacitações, apps e implementação com IA.",
        now, "19:00", "20:00", "none", null, "published"],
      ["Workshop: Agentes de IA no WhatsApp",
        "Construção ao vivo de um agente de atendimento no WhatsApp, do zero ao deploy.",
        addDays(now, 2), "19:30", "21:00", "none", null, "published"],
      ["Mentoria: Funil de Vendas com IA",
        "Como montar um funil completo com prospecção, qualificação e follow-up assistidos por IA.",
        addDays(now, 9), "20:00", "21:30", "none", null, "published"],
      ["Encontro de Networking da Comunidade",
        "Conexões estratégicas entre membros: apresente seu negócio em 60 segundos.",
        addDays(now, 14), "19:00", "20:30", "none", null, "published"],
      ["Sessão Estratégica (rascunho)",
        "Pauta em definição pela equipe de conteúdo.",
        addDays(now, 20), "19:00", null, "none", null, "draft"],
    ];

    const recurrenceUntil = addDays(now, 26);
    for (let week = 0; week < 4; week++) {
      eventSpecs.push([
        "Mentoria Semanal de Implementação",
        "Acompanhamento semanal: cada membro reporta avanços e recebe direcionamento prático.",
        addDays(now, 5 + week * 7),
        "19:00",
        "20:00",
        "weekly",
        recurrenceUntil,
        "published",
      ]);
    }

    const meetCodes = ["oqx-bilh-onai", "kzp-ment-oria", "vip-bilh-hub", "acc-impl-ementa"];
    const eventIds: number[] = [];
    for (const [i, e] of eventSpecs.entries()) {
      const [title, desc, date, start, end, rec, recUntil, status] = e;
      const [event] = await sql<{ id: number }[]>`
        INSERT INTO mentorship_events
          (title, description, cover_url, event_date, starts_at, ends_at, redirect_url,
           recurrence_type, recurrence_until, status, created_by)
        VALUES
          (${title}, ${desc}, ${null}, ${day(date)}, ${start}, ${end},
           ${`https://meet.google.com/${meetCodes[i % meetCodes.length]}`},
           ${rec}, ${recUntil ? day(recUntil) : null}, ${status}, ${adminId})
        RETURNING id
      `;
      eventIds.push(event.id);
    }

    for (const [i, eventId] of eventIds.entries()) {
      if (eventSpecs[i][7] !== "published") continue;
      const confirmCount = randInt(6, 16);
      const shuffled = [...activeStudents].sort(() => rand() - 0.5);
      for (const studentId of shuffled.slice(0, confirmCount)) {
        await sql`
          INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
          VALUES (${studentId}, ${eventId}, 1, ${iso(subDays(now, randInt(0, 6)))})
          ON CONFLICT (user_id, event_id) DO NOTHING
        `;
      }
    }
    await sql`
      INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
      VALUES (${joaoId}, ${eventIds[3]}, 1, ${iso(subHours(now, 30))})
      ON CONFLICT (user_id, event_id) DO NOTHING
    `;
    await sql`
      INSERT INTO event_confirmations (user_id, event_id, confirmed, confirmed_at)
      VALUES (${joaoId}, ${eventIds[4]}, 1, ${iso(subHours(now, 5))})
      ON CONFLICT (user_id, event_id) DO NOTHING
    `;

    const [catAgentes] = await sql<{ id: number }[]>`
      INSERT INTO app_categories (name, slug, sort_order, status)
      VALUES ('Agentes', 'agentes', 1, 'published')
      RETURNING id
    `;
    const [catDashboards] = await sql<{ id: number }[]>`
      INSERT INTO app_categories (name, slug, sort_order, status)
      VALUES ('Dashboards', 'dashboards', 2, 'published')
      RETURNING id
    `;
    const [catAutomacao] = await sql<{ id: number }[]>`
      INSERT INTO app_categories (name, slug, sort_order, status)
      VALUES ('Automação', 'automacao', 3, 'published')
      RETURNING id
    `;

    const remixGo = (slug: string) => `/api/remix/go/${slug}`;
    const coverUrl = (file: string) => `/solutions/capas/${file}.avif`;
    const appCoverUrls: Record<string, string> = {
      sdr: coverUrl("sdr"),
      atendimento: "/solutions/capas/suporte.png",
      ad_manager: coverUrl("ads"),
      financeai: coverUrl("finance"),
      social: coverUrl("social"),
    };
    type AppSpec = [cat: number, slug: string, title: string, tagline: string, desc: string, btn: string];
    const appSpecs: AppSpec[] = [
      [catAgentes.id, "sdr", "BIA SDR",
        "O módulo que qualifica leads, conversa, agenda e opera pré-vendas com IA.",
        "O módulo que qualifica leads, conversa, agenda e opera pré-vendas com IA.",
        "Remixar solução"],
      [catAgentes.id, "atendimento", "DESK",
        "O módulo de atendimento, suporte e WhatsApp multi-instâncias com IA.",
        "O módulo de atendimento, suporte e WhatsApp multi-instâncias com IA.",
        "Remixar solução"],
      [catDashboards.id, "ad_manager", "ADS",
        "O módulo para gestão, análise e otimização de campanhas.",
        "O módulo para gestão, análise e otimização de campanhas.",
        "Remixar solução"],
      [catDashboards.id, "financeai", "FINANCE",
        "O módulo financeiro com IA para controle, leitura e organização da operação.",
        "O módulo financeiro com IA para controle, leitura e organização da operação.",
        "Remixar solução"],
      [catAutomacao.id, "social", "SOCIAL",
        "O módulo de automação para redes sociais, conteúdo e distribuição.",
        "O módulo de automação para redes sociais, conteúdo e distribuição.",
        "Remixar solução"],
    ];

    const appIds: number[] = [];
    for (const [i, app] of appSpecs.entries()) {
      const [cat, slug, title, tagline, desc, btn] = app;
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO apps
          (category_id, title, tagline, description, cover_url, video_provider, video_url,
           button_label, redirect_url, sort_order, status, created_by)
        VALUES
          (${cat}, ${title}, ${tagline}, ${desc}, ${appCoverUrls[slug] ?? null}, ${null}, ${null},
           ${btn}, ${remixGo(slug)}, ${i + 1}, 'published', ${adminId})
        RETURNING id
      `;
      appIds.push(row.id);
    }

    for (const studentId of activeStudents) {
      const ratedApps = [...appIds].sort(() => rand() - 0.5).slice(0, randInt(0, 4));
      for (const appId of ratedApps) {
        await sql`
          INSERT INTO app_ratings (user_id, app_id, rating)
          VALUES (${studentId}, ${appId}, ${randInt(3, 5)})
          ON CONFLICT (user_id, app_id) DO NOTHING
        `;
      }
    }
    await sql`INSERT INTO app_ratings (user_id, app_id, rating) VALUES (${joaoId}, ${appIds[0]}, 5)`;
    await sql`INSERT INTO app_ratings (user_id, app_id, rating) VALUES (${joaoId}, ${appIds[3]}, 4)`;

    const clickWeights = [30, 26, 18, 10, 14];
    for (const [i, appId] of appIds.entries()) {
      for (let c = 0; c < clickWeights[i]; c++) {
        await sql`
          INSERT INTO app_clicks (user_id, app_id, clicked_at)
          VALUES
            (${pick([joaoId, ...activeStudents])}, ${appId},
             ${iso(subMinutes(subDays(now, randInt(0, 30)), randInt(0, 720)))})
        `;
      }
    }

    // O seed nunca gera convite resgatável. Os registros abaixo existem apenas
    // para demonstrar histórico/status no admin e são todos terminalmente usados,
    // revogados ou expirados.
    const invites: Array<[
      code: string,
      email: string | null,
      role: "admin" | "student",
      status: "used" | "expired" | "revoked",
      usedBy: number | null,
      usedAt: string | null,
      expiresAt: string | null,
      createdAt: string,
    ]> = [
      ["ARKOM-U1TR", "ana.souza@example.invalid", "student", "used", studentIds[0], iso(subDays(now, 30)), null, iso(subDays(now, 35))],
      ["ARKOM-U2KM", "bruno.carvalho@example.invalid", "student", "used", studentIds[1], iso(subDays(now, 21)), null, iso(subDays(now, 25))],
      ["ARKOM-U3PX", "aluno@example.invalid", "student", "used", joaoId, iso(subDays(now, 10)), null, iso(subDays(now, 12))],
      ["ARKOM-R3V0", null, "student", "revoked", null, null, null, iso(subDays(now, 8))],
      ["ARKOM-EXP1", "atrasado@example.invalid", "student", "expired", null, null, iso(subDays(now, 2)), iso(subDays(now, 16))],
    ];

    for (const [code, email, role, status, usedBy, usedAt, expiresAt, createdAt] of invites) {
      await sql`
        INSERT INTO invites (code, email, role, status, created_by, used_by, used_at, expires_at, created_at)
        VALUES (${code}, ${email}, ${role}, ${status}, ${adminId}, ${usedBy}, ${usedAt}, ${expiresAt}, ${createdAt})
      `;
    }
  });
}
