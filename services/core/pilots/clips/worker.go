package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

var fixtures = map[string]bool{
	"entrevista-demo": true,
	"retry-demo":      true,
	"falha-demo":      true,
}

func simulateVideo(ctx context.Context, j job) (json.RawMessage, *string) {
	select {
	case <-ctx.Done():
		code := "processing_interrupted"
		return nil, &code
	case <-time.After(350 * time.Millisecond):
	}
	if j.Fixture == "falha-demo" || (j.Fixture == "retry-demo" && j.Attempts == 1) {
		code := "simulated_failure"
		return nil, &code
	}
	return json.RawMessage(`{"simulated":true,"clips":[{"start_seconds":12,"duration_seconds":28},{"start_seconds":57,"duration_seconds":34}]}`), nil
}

func runWorker(ctx context.Context, q queue) {
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			processOne(ctx, q)
		}
	}
}

func processOne(ctx context.Context, q queue) {
	queryCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	if err := q.expireFinalAttempts(queryCtx); err != nil {
		cancel()
		if ctx.Err() == nil {
			log.Printf("expire jobs: %v", err)
		}
		return
	}
	j, err := q.claim(queryCtx)
	cancel()
	if err != nil {
		if ctx.Err() == nil && !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("claim job: %v", err)
		}
		return
	}

	var result json.RawMessage
	var mp4 []byte
	var code *string
	if q.studio != "" {
		duration := 85 * time.Second
		if q.hosted {
			duration = 420 * time.Second
		}
		processingCtx, cancel := context.WithTimeout(ctx, duration)
		result, mp4, code = q.renderStudio(processingCtx, j)
		cancel()
	} else if q.video != nil && j.Fixture == "entrevista-demo" {
		processingCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
		result, mp4, code = q.video.trim(processingCtx, j)
		cancel()
	} else {
		processingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		result, code = simulateVideo(processingCtx, j)
		cancel()
	}
	if ctx.Err() != nil {
		return // A restarted worker can reclaim the job after the lease expires.
	}

	queryCtx, cancel = context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	finished, err := q.finish(queryCtx, j, result, mp4, code)
	if err != nil && ctx.Err() == nil {
		log.Printf("finish job %s: %v", j.ID, err)
	} else if !finished && err == nil {
		log.Printf("job %s lost its lease", j.ID)
	}
}
