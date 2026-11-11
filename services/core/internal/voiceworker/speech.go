package voiceworker

import (
	"context"
	"errors"
	"io"
	"time"
)

type speechChunk struct {
	ItemID string
	Audio  []byte
	Done   bool
	Err    error
}

func streamSpeech(ctx context.Context, provider SpeechSynthesizer, itemID, text string, out chan<- speechChunk) {
	request, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	post := func(chunk speechChunk) bool {
		chunk.ItemID = itemID
		select {
		case out <- chunk:
			return true
		case <-ctx.Done():
			return false
		}
	}
	body, err := provider.Open(request, text)
	if err != nil {
		post(speechChunk{Err: err})
		return
	}
	defer body.Close()
	const maxAudioBytes = 60 * 8000
	total := 0
	for {
		frame := make([]byte, 800) // 100 ms at 8 kHz.
		n, err := io.ReadFull(body, frame)
		total += n
		if total > maxAudioBytes {
			post(speechChunk{Err: errors.New("speech exceeded duration limit")})
			return
		}
		if n > 0 && !post(speechChunk{Audio: frame[:n]}) {
			return
		}
		if err != nil {
			if (err == io.EOF || err == io.ErrUnexpectedEOF) && total > 0 {
				post(speechChunk{Done: true})
			} else {
				post(speechChunk{Err: err})
			}
			return
		}
	}
}
