package contextworker

import (
	"context"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

type Worker struct {
	Queue  sdrsdk.ContextQueue
	Policy sdrsdk.Policy
}

func (w *Worker) Once(parent context.Context) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, 15*time.Second)
	defer cancel()
	job, ok, err := w.Queue.ClaimContext(ctx)
	if err != nil || !ok {
		return ok, err
	}
	prepared, err := sdrsdk.BuildContext(job.Candidate, w.Policy)
	if err != nil {
		return true, w.Queue.FailContext(ctx, job, "context_overflow")
	}
	err = w.Queue.CompleteContext(ctx, job, prepared)
	for attempt := 0; attempt < 2 && errors.Is(err, sdrsdk.ErrUnavailable); attempt++ {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
		err = w.Queue.CompleteContext(ctx, job, prepared)
	}
	if errors.Is(err, sdrsdk.ErrStale) {
		return true, nil
	}
	return true, err
}
func (w *Worker) Run(ctx context.Context) {
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			_, _ = w.Once(ctx)
		}
	}
}
