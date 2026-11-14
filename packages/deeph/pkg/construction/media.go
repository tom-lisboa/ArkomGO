package construction

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image/gif"
	"image/png"
	"regexp"
	"strings"
)

const MediaPath = "frontend/media.json"
const MaxMediaBytes = 6 << 20

var mediaName = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,39}$`)

type GIFRequest struct {
	Prompt string `json:"prompt"`
	Alt    string `json:"alt"`
}
type GIFOutput struct {
	JobID string
	Data  []byte
}
type GIFGenerator interface {
	GenerateGIF(context.Context, string, GIFRequest) (GIFOutput, error)
}
type MediaAsset struct {
	Prompt string `json:"prompt"`
	Alt    string `json:"alt"`
	JobID  string `json:"job_id"`
	Src    string `json:"src,omitempty"`
	Poster string `json:"poster,omitempty"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Frames int    `json:"frames"`
}
type Media struct {
	Schema string                `json:"schema"`
	Assets map[string]MediaAsset `json:"assets"`
}

func readMedia(raw string) (Media, error) {
	m := Media{Schema: "arkom.media.v1", Assets: map[string]MediaAsset{}}
	if raw == "" {
		return m, nil
	}
	if len(raw) > MaxMediaBytes || json.Unmarshal([]byte(raw), &m) != nil || m.Schema != "arkom.media.v1" || m.Assets == nil || len(m.Assets) > 4 {
		return m, errors.New("invalid_frontend_media")
	}
	for name, a := range m.Assets {
		if !mediaName.MatchString(name) || !strings.HasPrefix(a.Src, "data:image/gif;base64,") || !strings.HasPrefix(a.Poster, "data:image/png;base64,") || a.Width < 1 || a.Height < 1 || a.Width > 512 || a.Height > 512 || a.Frames < 2 || a.Frames > 16 {
			return m, errors.New("invalid_frontend_media")
		}
	}
	return m, nil
}
func MediaSummary(raw string) string {
	m, err := readMedia(raw)
	if err != nil {
		return "{}"
	}
	for name, a := range m.Assets {
		a.Src = ""
		a.Poster = ""
		m.Assets[name] = a
	}
	data, _ := json.Marshal(m)
	return string(data)
}
func mediaScript(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}
	m, err := readMedia(raw)
	if err != nil {
		return "", err
	}
	data, _ := json.Marshal(m) // HTML-safe JSON: even prompts cannot close the script tag.
	return `<script type="application/json" id="arkom-media">` + string(data) + `</script>`, nil
}
func mediaAsset(out GIFOutput, req GIFRequest) (MediaAsset, error) {
	if len(out.Data) == 0 || len(out.Data) > 2<<20 || out.JobID == "" {
		return MediaAsset{}, errors.New("gif_output_invalid")
	}
	config, err := gif.DecodeConfig(bytes.NewReader(out.Data))
	if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 512 || config.Height > 512 {
		return MediaAsset{}, errors.New("gif_output_invalid")
	}
	animation, err := gif.DecodeAll(bytes.NewReader(out.Data))
	if err != nil || len(animation.Image) < 2 || len(animation.Image) > 16 {
		return MediaAsset{}, errors.New("gif_output_invalid")
	}
	var poster bytes.Buffer
	if err := png.Encode(&poster, animation.Image[0]); err != nil {
		return MediaAsset{}, err
	}
	return MediaAsset{Prompt: req.Prompt, Alt: req.Alt, JobID: out.JobID, Src: "data:image/gif;base64," + base64.StdEncoding.EncodeToString(out.Data), Poster: "data:image/png;base64," + base64.StdEncoding.EncodeToString(poster.Bytes()), Width: config.Width, Height: config.Height, Frames: len(animation.Image)}, nil
}
func (e *Engine) generateGIF(ctx context.Context, files map[string]string, action Action, emit func(Event) error) error {
	var request GIFRequest
	if !mediaName.MatchString(action.Path) || len(action.Content) > 5000 || json.Unmarshal([]byte(action.Content), &request) != nil || len(strings.TrimSpace(request.Prompt)) < 8 || len(request.Prompt) > 4000 || strings.TrimSpace(request.Alt) == "" || len(request.Alt) > 300 {
		return errors.New("gif_request_invalid")
	}
	media, err := readMedia(files[MediaPath])
	if err != nil {
		return err
	}
	if previous, ok := media.Assets[action.Path]; ok && previous.Prompt == request.Prompt && previous.Alt == request.Alt {
		return nil
	}
	if len(media.Assets) >= 4 {
		if _, ok := media.Assets[action.Path]; !ok {
			return errors.New("gif_asset_limit")
		}
	}
	if e.GIFGenerator == nil {
		return errors.New("clips_gif_unavailable")
	}
	if err := emit(Event{Kind: "asset.generating", Agent: "gif", Path: MediaPath, Summary: "O CLIPS está criando a animação da sua página"}); err != nil {
		return err
	}
	out, err := e.GIFGenerator.GenerateGIF(ctx, action.Path, request)
	if err != nil {
		return err
	}
	asset, err := mediaAsset(out, request)
	if err != nil {
		return err
	}
	media.Assets[action.Path] = asset
	data, _ := json.Marshal(media)
	if len(data) > MaxMediaBytes {
		return errors.New("gif_asset_limit")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := emit(Event{Kind: "file.written", Agent: "system", Path: MediaPath, Before: files[MediaPath], After: string(data), Summary: "Salvou o GIF do CLIPS e sua imagem estática"}); err != nil {
		return err
	}
	files[MediaPath] = string(data)
	return emit(Event{Kind: "asset.generated", Agent: "gif", Path: MediaPath, Summary: "Animação pronta para entrar na página", Output: MediaSummary(string(data))})
}

const VisualAgentsReference = `ESPECIALISTAS VISUAIS: o time inclui gif (Luma, animações pelo worker CLIPS) e motion (Fluxo, scroll com Motion e Lenis). Bibliotecas disponíveis localmente: motion 14.14.0, lenis 1.3.27, lenis/dist/lenis.css; nunca carregue CDN.
Somente o agente gif pode chamar generate_gif: path é um nome curto (ex.: cafe), content é uma string JSON com prompt (descrição visual, movimento e loop; até 4000 caracteres) e alt (texto alternativo até 300). O host usa a conta autenticada, limites e fila do CLIPS. Uma geração por pedido de página; prefira reutilizar um GIF existente quando o usuário não pediu trocá-lo. Não invente GIF pronto. Sem saldo/chave ou erro, descreva a lacuna; não repita chamadas para cobrar de novo. frontend/media.json é somente leitura; o contexto mostra metadados, nunca os bytes da imagem.
Depois da geração, importe AnimatedImage de '@arkom/AnimatedImage.svelte' e use <AnimatedImage asset="cafe" alt="Xícara de café soltando vapor" /> em um container do layout. O componente usa o GIF real, oferece pausa e troca por uma imagem estática quando o visitante prefere movimento reduzido. Props: asset (chave existente), alt (opcional), class (opcional), showControls (padrão true). Pode estilizar o container e :global(.arkom-animation). Para composição avançada, import { media } from '@arkom/assets' fornece media.cafe.src, poster, width, height, alt. Não escreva base64 nem URLs de serviço na fonte.
O especialista motion pode escrever frontend/src/ e design/motion.json; os demais planos são leitura. Pode usar diretamente motion e lenis para efeitos originais com limpeza e movimento reduzido, ou as ações Svelte de '@arkom/motion': reveal, parallax, smoothScroll, scrollProgress. Exemplos: <section use:reveal={{distance:24,duration:.7}}>...</section>; <div use:parallax={{distance:35}}>...</div>; <main use:smoothScroll>...</main>; <div class="progress" use:scrollProgress></div>. As ações respeitam a preferência de movimento reduzido e removem listeners/animações ao desmontar. smoothScroll usa Lenis, uma instância por página, sem interceptar a navegação entre rotas. reveal e parallax usam Motion. Não esconda conteúdo até a animação acontecer, não bloqueie a rolagem, preserve filtros, cliques e teclado. Animações dentro do iframe só alteram a página criada, nunca os chats do Genesis. Compile com test. Registre em design/motion.json os efeitos escolhidos e como respeitam acesso e celular. O GIF é criado antes da implementação; motion finaliza o movimento depois que a página está montada.`
