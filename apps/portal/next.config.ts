import type { NextConfig } from "next";

// Em git worktrees locais o `node_modules` é uma junction para o repo principal
// (economia de disco). O Turbopack calcula a raiz do filesystem na pasta do
// worktree e rejeita a junction por apontar "para fora" dela. Definir
// TURBOPACK_ROOT (só na estação local, ex.: a pasta pai que contém worktree +
// alvo da junction) eleva a raiz do Turbopack e resolve isso. Ausente em
// produção/Railway (node_modules real dentro do projeto) → config inalterada.
const turbopackRoot = process.env.TURBOPACK_ROOT?.trim();

const nextConfig: NextConfig = {
  output: "standalone",
  ...(turbopackRoot ? { turbopack: { root: turbopackRoot } } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
