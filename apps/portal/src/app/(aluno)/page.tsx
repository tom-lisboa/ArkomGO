import { redirect } from "next/navigation";

export default function Home() {
  // /hub está travado ("Em breve") — a raiz cai na home real do aluno.
  redirect("/home");
}
