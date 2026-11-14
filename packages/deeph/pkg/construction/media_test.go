package construction

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"strings"
	"testing"
)

type gifFixtureGenerator struct{ calls int }

func (g *gifFixtureGenerator) GenerateGIF(_ context.Context, _ string, _ GIFRequest) (GIFOutput, error) {
	g.calls++
	palette := color.Palette{color.Black, color.White}
	first := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	second := image.NewPaletted(image.Rect(0, 0, 2, 2), palette)
	second.SetColorIndex(0, 0, 1)
	var data bytes.Buffer
	if err := gif.EncodeAll(&data, &gif.GIF{Image: []*image.Paletted{first, second}, Delay: []int{20, 20}}); err != nil {
		panic(err)
	}
	return GIFOutput{JobID: "private-worker-job", Data: data.Bytes()}, nil
}
func TestGIFStagePersistsRealMediaButDoesNotSendImageBytesToModel(t *testing.T) {
	generator := &gifFixtureGenerator{}
	request := Action{Tool: "generate_gif", Path: "cafe", Content: `{"prompt":"A cup of coffee with steam in a seamless loop","alt":"Café soltando vapor"}`}
	files := NewSeed()
	files["application.json"] = testManifest
	e := Engine{StepsVersion: 5, GIFGenerator: generator, Tester: &frontendTester{}, References: map[string]string{"reference/catalog.json": "{}", "reference/platform-contracts.go": Contracts}}
	e.Provider = fakeProvider{func(r Request) Turn {
		if strings.Contains(r.Files[MediaPath], "base64") {
			t.Fatal("image bytes leaked into model context")
		}
		return Turn{Actions: []Action{request}, Verdict: "ready"}
	}}
	out, err := e.RunStep(context.Background(), "Add a GIF", files, "gif")
	if err != nil {
		t.Fatal(err)
	}
	media, err := readMedia(out[MediaPath])
	if err != nil || media.Assets["cafe"].Frames != 2 || media.Assets["cafe"].Poster == "" {
		t.Fatal(media, err)
	}
	out, err = e.RunStep(context.Background(), "Keep the GIF", out, "gif")
	if err != nil || generator.calls != 1 {
		t.Fatal("existing GIF was charged again", err, generator.calls)
	}
	if strings.Contains(MediaSummary(out[MediaPath]), "base64") {
		t.Fatal("summary contains binary")
	}
	if err = e.compileFrontend(context.Background(), out, "interface", func(Event) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out["frontend/index.html"], `id="arkom-media"`) || !strings.Contains(out["frontend/index.html"], "data:image/gif;base64,") || !FrontendCurrent(out) {
		t.Fatal("exportable page lacks its real media")
	}
	out[MediaPath] = strings.Replace(out[MediaPath], "Café soltando vapor", "Outra descrição", 1)
	if FrontendCurrent(out) {
		t.Fatal("media changes did not invalidate the compilation receipt")
	}
	for _, agent := range []string{"architect", "gif", "motion", "interface", "reviewer"} {
		if allowed(agent, MediaPath) {
			t.Fatal("agent can forge host media", agent)
		}
	}
	if len(StepsForVersion(5)) != 7 || StepIndexForVersion(5, "backend") != -1 || len(StepsForVersion(4)) != 5 {
		t.Fatal("pipeline version compatibility broken")
	}
}
func TestGIFOutputRejectsStaticAndOversizedMedia(t *testing.T) {
	request := GIFRequest{Prompt: "coffee", Alt: "coffee"}
	if _, err := mediaAsset(GIFOutput{JobID: "x", Data: []byte("not a GIF")}, request); err == nil {
		t.Fatal("invalid media accepted")
	}
	frame := image.NewPaletted(image.Rect(0, 0, 513, 1), color.Palette{color.Black})
	var b bytes.Buffer
	_ = gif.EncodeAll(&b, &gif.GIF{Image: []*image.Paletted{frame, frame}, Delay: []int{20, 20}})
	if _, err := mediaAsset(GIFOutput{JobID: "x", Data: b.Bytes()}, request); err == nil {
		t.Fatal("oversized dimensions accepted")
	}
	if _, err := readMedia(strings.Repeat("x", MaxMediaBytes+1)); err == nil {
		t.Fatal("oversized metadata accepted")
	}
}

type unavailableGIF struct{}

func (unavailableGIF) GenerateGIF(context.Context, string, GIFRequest) (GIFOutput, error) {
	return GIFOutput{}, errors.New("worker unavailable")
}
func TestFailedGIFDoesNotBecomeACompletedSpecialist(t *testing.T) {
	files := NewSeed()
	files["frontend/src/App.svelte"] = "<h1>Keep this page</h1>"
	failed, finished := false, false
	e := Engine{StepsVersion: 5, Tester: &frontendTester{}, GIFGenerator: unavailableGIF{}, Provider: fakeProvider{func(Request) Turn {
		return Turn{Actions: []Action{{Tool: "generate_gif", Path: "coffee", Content: `{"prompt":"coffee with steam","alt":"coffee"}`}}, Verdict: "ready"}
	}}, Emit: func(event Event) error {
		failed = failed || event.Kind == "asset.failed"
		finished = finished || event.Kind == "agent.finished"
		return nil
	}}
	out, err := e.RunStep(context.Background(), "Add a GIF", files, "gif")
	if err == nil || !failed || finished || out["frontend/src/App.svelte"] != files["frontend/src/App.svelte"] {
		t.Fatal("worker failure was reported as a successful page change", err, failed, finished)
	}
}
