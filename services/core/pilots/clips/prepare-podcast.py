"""Prepare the fixed local podcast recipe and its Portuguese captions."""

import hashlib
import json
import os
import shutil
from pathlib import Path
from urllib.request import urlopen

state = Path(__file__).resolve().parents[2] / ".local" / "clips-podcast"
source_url = (
    "https://imagine.gsfc.nasa.gov/educators/programs/cosmictimes/"
    "universe_mashup/archive/media/video/chandra_dark_universe.m4v"
)
source_sha256 = "15a90e013fade0688ffb25fe92d8abdbe5ac179e9815c56f9da55822766556fe"
font = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")

os.umask(0o077)
state.mkdir(parents=True, exist_ok=True)
if not font.is_file():
    raise SystemExit("Arial Bold is required for this macOS recipe")

source = state / "source.m4v"
if not source.exists():
    pending = source.with_suffix(".download")
    try:
        with urlopen(source_url, timeout=90) as response, pending.open("wb") as target:
            shutil.copyfileobj(response, target)
        if hashlib.sha256(pending.read_bytes()).hexdigest() != source_sha256:
            raise SystemExit("The NASA source differs from the validated download")
        pending.replace(source)
    finally:
        pending.unlink(missing_ok=True)
if hashlib.sha256(source.read_bytes()).hexdigest() != source_sha256:
    raise SystemExit(f"Replace the incomplete or different file at {source} and retry")

subtitle = state / "podcast-pt-br.ass"
subtitle.write_text(r"""[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Podcast,Arial,47,&H00FFFFFF,&H00FFFFFF,&H00101520,&H800C1020,-1,0,0,0,100,100,0,0,1,3,2,2,48,48,290,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.16,0:00:03.96,Podcast,,0,0,0,,Quando você olha para\No céu à noite,
Dialogue: 0,0:00:03.96,0:00:05.68,Podcast,,0,0,0,,vê muita coisa brilhando.
Dialogue: 0,0:00:05.68,0:00:08.40,Podcast,,0,0,0,,Estrelas, planetas e galáxias.
Dialogue: 0,0:00:08.40,0:00:11.12,Podcast,,0,0,0,,Por isso, pode parecer\Nestranho saber
Dialogue: 0,0:00:11.12,0:00:13.60,Podcast,,0,0,0,,que a maior parte\Ndo universo é escura.
""", encoding="utf-8")


def title(text, size, y, color):
    return (
        f"drawtext=fontfile='{font}':text='{text}':fontsize={size}:"
        f"fontcolor={color}:x=(w-tw)/2:y={y}:shadowcolor=black@0.6:shadowy=2"
    )


filters = (
    "split=2[bg][fg];"
    "[bg]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,"
    "boxblur=12:2,scale=720:1280,eq=brightness=-0.26:saturation=0.65,setsar=1[canvas];"
    "[fg]scale=720:-2,setsar=1[video];"
    "[canvas][video]overlay=x=0:y=300,"
    + title("CHANDRA PODCAST", 23, 125, "0xB8D6FF")
    + ","
    + title("O universo escuro", 54, 175, "white")
    + ","
    + title("Fonte  NASA / CXC", 21, 1150, "0xDAE3F4")
)
(state / "request.json").write_text(json.dumps({
    "url": str(source),
    "start": 30,
    "duration": 13.6,
    "vf": filters,
    "subtitle_url": subtitle.as_uri(),
}, ensure_ascii=False), encoding="utf-8")
print(f"Receita e legenda prontas em {state}")
