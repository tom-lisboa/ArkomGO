package executionworker

import (
	"context"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"time"
)

type Worker struct {
	Queue   sdrsdk.ExecutionQueue
	Planner sdrsdk.Planner
}

func (w *Worker) Once(parent context.Context) (bool, error) {
	ctx, cancel := context.WithTimeout(parent, 55*time.Second)
	defer cancel()
	job, ok, err := w.Queue.ClaimExecution(ctx)
	if err != nil || !ok {
		return ok, err
	}
	op, stop := context.WithTimeout(ctx, 40*time.Second)
	out, err := w.Planner.Generate(op, job.Context)
	stop()
	if err != nil {
		code := "model_unavailable_or_invalid"
		if strings.HasPrefix(err.Error(), "openai_http_") {
			code = err.Error()
		}
		return true, w.Queue.FailExecution(ctx, job, code)
	}
	err = w.Queue.CompleteExecution(ctx, job, out)
	for attempt := 0; attempt < 2 && errors.Is(err, sdrsdk.ErrUnavailable); attempt++ {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
		err = w.Queue.CompleteExecution(ctx, job, out)
	}
	if errors.Is(err, sdrsdk.ErrStale) {
		return true, nil
	}
	return true, err
}
func (w *Worker) Run(ctx context.Context) {
	if _, ok := w.Queue.(sdrsdk.OperationQueue); ok {
		go w.runOperations(ctx)
	}
	tick := time.NewTicker(350 * time.Millisecond)
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
