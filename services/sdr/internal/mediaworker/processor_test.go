package mediaworker

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"sync/atomic"
	"testing"

	openai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func testWAV() []byte {
	b := make([]byte, 44+3200)
	copy(b, "RIFF")
	binary.LittleEndian.PutUint32(b[4:], uint32(len(b)-8))
	copy(b[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(b[16:], 16)
	binary.LittleEndian.PutUint16(b[20:], 1)
	binary.LittleEndian.PutUint16(b[22:], 1)
	binary.LittleEndian.PutUint32(b[24:], 16000)
	binary.LittleEndian.PutUint32(b[28:], 32000)
	binary.LittleEndian.PutUint16(b[32:], 2)
	binary.LittleEndian.PutUint16(b[34:], 16)
	copy(b[36:], "data")
	binary.LittleEndian.PutUint32(b[40:], 3200)
	return b
}
func TestWAVBoundsAndContentValidation(t *testing.T) {
	d, e := wavDuration(testWAV())
	if e != nil || d != 0.1 {
		t.Fatal(d, e)
	}
	if _, e = wavDuration(testWAV()[:46]); e == nil {
		t.Fatal("truncated audio accepted")
	}
	if _, e = sdrsdk.InspectMedia([]byte("<html>not an image</html>"), "photo.png"); e == nil {
		t.Fatal("file extension bypassed byte validation")
	}
}
func TestProcessorCodecsAndPrivateOpenAIContracts(t *testing.T) {
	ff, e := exec.LookPath("ffmpeg")
	if e != nil {
		t.Skip("ffmpeg is required; CI installs the actual codec")
	}
	fp, e := exec.LookPath("ffprobe")
	if e != nil {
		t.Fatal(e)
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("Authorization") != "Bearer fixture-only" {
			t.Error("missing provider authentication")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/audio/transcriptions" {
			if e := r.ParseMultipartForm(1 << 20); e != nil {
				t.Error(e)
			}
			if r.FormValue("model") != "gpt-transcribe" {
				t.Error("wrong transcription model")
			}
			f, header, e := r.FormFile("file")
			if e != nil {
				t.Error(e)
			} else {
				f.Close()
				if header.Filename != "audio.wav" {
					t.Error("audio was not normalized")
				}
			}
			_, _ = w.Write([]byte(`{"text":"Sou Ana e tenho dois vendedores."}`))
			return
		}
		if r.URL.Path != "/responses" {
			t.Error("unexpected provider route")
		}
		var v map[string]any
		if json.NewDecoder(r.Body).Decode(&v) != nil || v["store"] != false || v["model"] != "fixture-vision" {
			t.Error("vision persistence/model contract changed")
		}
		raw, _ := json.Marshal(v)
		if !strings.Contains(string(raw), "data:image/png;base64,") {
			t.Error("vision did not receive normalized image bytes")
		}
		_, _ = w.Write([]byte(`{"id":"vision-fixture","status":"completed","model":"fixture-vision","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"A imagem mostra uma oferta de teste."}]}]}`))
	}))
	defer server.Close()
	p := &Processor{AI: openai.NewClient(option.WithBaseURL(server.URL+"/"), option.WithAPIKey("fixture-only"), option.WithMaxRetries(0)), FFmpeg: ff, FFprobe: fp, AudioModel: "gpt-transcribe", VisionModel: "fixture-vision"}
	wav := testWAV()
	file, _ := sdrsdk.InspectMedia(wav, "voice.wav")
	result, e := p.Process(context.Background(), sdrsdk.MediaJob{Direction: "inbound", File: file}, wav)
	if e != nil || !strings.Contains(result.Text, "Sou Ana") {
		t.Fatal(result, e)
	}
	result, e = p.Process(context.Background(), sdrsdk.MediaJob{Direction: "outbound", File: file}, wav)
	if e != nil || result.File.MIME != "audio/ogg" || !bytes.HasPrefix(result.Data, []byte("OggS")) {
		t.Fatal("voice-note codec", e)
	}
	var b bytes.Buffer
	im := image.NewRGBA(image.Rect(0, 0, 16, 16))
	im.Set(0, 0, color.RGBA{B: 255, A: 255})
	_ = png.Encode(&b, im)
	file, _ = sdrsdk.InspectMedia(b.Bytes(), "oferta.png")
	result, e = p.Process(context.Background(), sdrsdk.MediaJob{Direction: "inbound", File: file}, b.Bytes())
	if e != nil || !strings.Contains(result.Text, "oferta") {
		t.Fatal(result, e)
	}
	if calls.Load() != 2 {
		t.Fatal("unexpected provider calls", calls.Load())
	}
}
