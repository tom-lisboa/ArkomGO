"""Package only the official frontend for one previously verified CLIPS installation."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--installation", required=True, type=Path, help="Operator result of directory-installation; never a credential file")
parser.add_argument("--output", type=Path, default=root / ".local/clips-remix-delivery")
args = parser.parse_args()
installation = json.loads(args.installation.read_text())
uuid = re.compile(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")
if installation.get("solution") != "clips" or not uuid.fullmatch(installation.get("installation_id", "")):
    raise SystemExit("A registered CLIPS installation is required.")
for field in ("api_url", "origin"):
    parsed = urlsplit(installation[field])
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        raise SystemExit("Only exact verified HTTPS origins can be packaged.")
checkout = root / ".local/arkom-clips-go-interface"
base = "f44b29e60c355e397c95d4360083a10b9f7ec113"
if subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip() != base:
    raise SystemExit("The reviewed official interface base is required.")
for path in ("src/pages/Login.tsx", "src/index.css", "index.html", "tailwind.config.ts", "src/assets/arkom-clips-logo.png"):
    if subprocess.check_output(["git", "show", base + ":" + path], cwd=checkout) != (checkout / path).read_bytes():
        raise SystemExit("Official design or login was modified: " + path)
args.output.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="clips-remix-package-") as temp:
    stage = Path(temp)
    for name in ("src", "public"):
        for path in (checkout / name).rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(checkout)
            if "test" in relative.parts or "__tests__" in relative.parts or ".test." in path.name or ".spec." in path.name:
                continue
            if path.is_symlink():
                raise SystemExit("Symlinks cannot be included in a customer package.")
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    for name in ("package.json", "package-lock.json", "index.html", "vite.config.ts", "tailwind.config.ts", "postcss.config.js", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "components.json", "eslint.config.js"):
        shutil.copy2(checkout / name, stage / name)
    (stage / "scripts").mkdir()
    for name in ("guard-ds.mjs", "scan-cascade.mjs", "check-composicao.mjs"):
        shutil.copy2(checkout / "scripts" / name, stage / "scripts" / name)
    package = json.loads((stage / "package.json").read_text())
    package["name"] = "arkom-clips-go-remix"
    package["scripts"] = {
        "dev": "vite --mode clips-remix --host 0.0.0.0 --port 8080",
        "prebuild": "node scripts/guard-ds.mjs && npm run typecheck",
        "build": "vite build --mode clips-remix",
        "typecheck": "tsc --noEmit -p tsconfig.app.json",
        "preview": "vite preview --host 0.0.0.0 --port 8080",
    }
    (stage / "package.json").write_text(json.dumps(package, indent=2) + "\n")
    lock = json.loads((stage / "package-lock.json").read_text())
    lock["name"] = package["name"]
    lock["packages"][""]["name"] = package["name"]
    (stage / "package-lock.json").write_text(json.dumps(lock, indent=2) + "\n")
    config = {"api_url": installation["api_url"], "installation_id": installation["installation_id"]}
    (stage / "public/clips-installation.json").write_text(json.dumps(config, indent=2) + "\n")
    (stage / ".gitignore").write_text("node_modules/\ndist/\n.env\n.env.*\n*.log\n")
    (stage / "README.md").write_text(f"""# CLIPS Go — interface candidata para Remix

Interface oficial ARKOM, com o design system e a tela de login preservados.
Instalação: `{installation['installation_id']}`.
Endereço autorizado: {installation['origin']}.

Importe os fontes no projeto Lovable correspondente ao endereço já verificado.
Não é necessário configurar banco ou Edge Functions. Em Gerar GIFs, cada cliente
pode cadastrar sua própria chave OpenAI ou usar saldo de brinde da equipe.
`npm ci` instala as dependências; `npm run build` verifica e compila a interface.

Ao abrir, o aplicativo consulta sua instalação, encaminha para o login oficial
e retorna ao mesmo projeto. Recarregar faz uma nova entrada pela sessão ainda
válida. A saída encerra o acesso CLIPS usado nesta entrada. Outros produtos e
outros dispositivos mantêm suas sessões.

Este pacote é um candidato. Só deve ser entregue ao cliente após publicação,
ativação e validação do backend nesse endereço. Endereços `.test` ou `.invalid`
identificam exclusivamente o laboratório e não são acessos públicos.

Prévia e publicação podem ter endereços diferentes. A equipe deve registrar e
verificar cada endereço antes de gerar seu pacote; copiar a configuração de
outro cliente não concede acesso. O arquivo público clips-installation.json
contém apenas API e identificador da instalação, sem segredos.

Escopo atual: MP4 de até 7 MiB e trecho manual de até 30 segundos em 720×1280.
Transcrição, legendas automáticas, análise por IA e histórico migrado continuam
pendentes. A integração não altera as outras soluções do cliente.
""")
    (stage / "LOVABLE.md").write_text("""Use os fontes deste pacote como interface CLIPS Go. Preserve a tela de login, os componentes, os tokens e as marcas do design system ARKOM. Preserve o modo clips-remix e o arquivo público clips-installation.json já configurado pela equipe. A API, o processamento e os dados ficam no backend privado Go. Não criar Supabase, Edge Functions ou dados de cliente no navegador e não pedir chaves de banco ou serviços durante a instalação. Em Gerar GIFs, use o fluxo existente para salvar a chave OpenAI privada do cliente no servidor ou usar um brinde ativo. O login ocorre no acesso oficial e retorna para esta instalação. Se o endereço da prévia/publicação mudar, solicite à equipe um pacote para o endereço verificado. Mantenha explícitos os limites atuais de corte manual da homologação. Este pacote candidato precisa de backend publicado e validado antes da entrega ao cliente.
""")
    with (args.output / "package-validation.log").open("w") as log:
        subprocess.run(["npm", "ci", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund"], cwd=stage, check=True, stdout=log, stderr=subprocess.STDOUT)
        subprocess.run(["npm", "run", "build"], cwd=stage, check=True, stdout=log, stderr=subprocess.STDOUT)
    files = [p for p in stage.rglob("*") if p.is_file() and not {"node_modules", "dist"}.intersection(p.relative_to(stage).parts)]
    for path in files:
        if path.suffix in (".go", ".sql", ".pem", ".key", ".pfx", ".p12") or path.name.startswith(".env"):
            raise SystemExit("Backend or private file in customer package.")
        if path.suffix in (".ts", ".tsx", ".js", ".json", ".md"):
            if re.search(rb"arkom_service_[A-Za-z0-9_-]{43}|clips_remix_(?:access|refresh)_[A-Za-z0-9_-]{43}|sk-(?:proj-)?[A-Za-z0-9_-]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY", path.read_bytes()):
                raise SystemExit("Credential-like content in customer package.")
    archive = args.output / ("ClipsGo-Remix-Candidato-" + installation["installation_id"][:8] + ".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipped:
        for path in sorted(files):
            zipped.write(path, path.relative_to(stage))
    proof = {"status": "candidate", "zip": str(archive), "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": len(files), "installation_id": installation["installation_id"], "origin": installation["origin"], "clean_install_and_build": "passed", "official_design_preserved": True, "credentials_included": False, "backend_source_included": False, "published": False}
    (args.output / "package-check.json").write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps(proof, indent=2))
