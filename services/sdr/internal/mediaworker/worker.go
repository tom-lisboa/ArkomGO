// Package mediaworker prepares files and extracts reference text. It cannot send
// WhatsApp messages, change a business configuration or assume a conversation.
package mediaworker

import (
	"context"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

type Worker struct {
	Queue     sdrsdk.MediaQueue
	Processor sdrsdk.MediaProcessor
}

func (w *Worker) Once(parent context.Context) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, 75*time.Second)
	defer cancel()
	j, ok, e := w.Queue.ClaimMedia(ctx)
	if e != nil || !ok {
		return ok, e
	}
	b, e := w.Queue.ReadMedia(ctx, j)
	if errors.Is(e, sdrsdk.ErrMediaPending) {
		return true, w.Queue.FailMedia(ctx, j, "media_waiting_download")
	}
	if errors.Is(e, sdrsdk.ErrStale) {
		return true, nil
	}
	var result sdrsdk.MediaResult
	if e == nil {
		result, e = w.Processor.Process(ctx, j, b)
	}
	if e != nil {
		// Failure is explicit; never turn an unread file into an invented transcript.
		failCtx, stop := context.WithTimeout(parent, 10*time.Second)
		defer stop()
		return true, w.Queue.FailMedia(failCtx, j, "media_processing_failed")
	}
	e = w.Queue.CompleteMedia(ctx, j, result)
	for n := 0; n < 2 && errors.Is(e, sdrsdk.ErrUnavailable); n++ {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
		e = w.Queue.CompleteMedia(ctx, j, result)
	}
	if errors.Is(e, sdrsdk.ErrStale) {
		return true, nil
	}
	return true, e
}
func (w *Worker) Run(ctx context.Context) {
	t := time.NewTicker(350 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			_, _ = w.Once(ctx)
		}
	}
}
