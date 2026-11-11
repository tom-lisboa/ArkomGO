package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"flag"
	"fmt"
	"image/gif"
	"log"
	"os"
	"time"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func main() {
	output := flag.String("out", "mascote.gif", "output GIF path")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	if err := generate(ctx, *output); err != nil {
		log.Fatal(err)
	}
}

func generate(ctx context.Context, output string) error {
	if os.Getenv("OPENAI_API_KEY") == "" {
		return fmt.Errorf("set OPENAI_API_KEY before running this example")
	}

	client := openai.NewClient()
	result, err := client.Images.Generate(ctx, openai.ImageGenerateParams{
		Model: "gpt-image-2.6-flare",
		Prompt: "A friendly little robot mascot waves one hand and returns to its starting pose. " +
			"Centered character, fixed camera, solid blue background, seamless looping animation.",
	}, option.WithJSONSet("output_format", "gif"),
		option.WithJSONSet("frame_count", 9),
		option.WithJSONSet("frame_duration_ms", 200),
	)
	if err != nil {
		if apiErr, ok := err.(*openai.Error); ok {
			return fmt.Errorf("image generation failed (HTTP %d, code %q): %s", apiErr.StatusCode, apiErr.Code, apiErr.Message)
		}
		return fmt.Errorf("generate image: %w", err)
	}
	if len(result.Data) == 0 || result.Data[0].B64JSON == "" {
		return fmt.Errorf("image generation returned no data")
	}

	data, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
	if err != nil {
		return fmt.Errorf("decode image data: %w", err)
	}
	animation, err := gif.DecodeAll(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode GIF: %w", err)
	}
	if len(animation.Image) < 2 {
		return fmt.Errorf("expected an animated GIF, received %d frame(s)", len(animation.Image))
	}
	if err := os.WriteFile(output, data, 0644); err != nil {
		return fmt.Errorf("save GIF: %w", err)
	}

	var duration time.Duration
	for _, delay := range animation.Delay {
		duration += time.Duration(delay) * 10 * time.Millisecond
	}
	fmt.Printf("%s: %d × %d, %d frames, %s per cycle\n",
		output, animation.Config.Width, animation.Config.Height, len(animation.Image), duration)
	return nil
}
