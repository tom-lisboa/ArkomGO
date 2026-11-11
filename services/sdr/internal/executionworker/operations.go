package executionworker

import (
	"context"
	"errors"
	"sdr-next-pilot/pkg/sdrsdk"
	"time"
)

func (w *Worker) OnceOperation(parent context.Context) (bool, error) {
	q, ok := w.Queue.(sdrsdk.OperationQueue)
	if !ok {
		return false, nil
	}
	ctx, cancel := context.WithTimeout(parent, 20*time.Second)
	defer cancel()
	j, worked, e := q.ClaimOperation(ctx)
	if e != nil || !worked {
		return worked, e
	}
	result, e := sdrsdk.ComputeAction(j.Plan)
	if e != nil {
		return true, q.FailOperation(ctx, j, e.Error())
	}
	e = q.CompleteOperation(ctx, j, result)
	for i := 0; i < 2 && errors.Is(e, sdrsdk.ErrUnavailable); i++ {
		select {
		case <-ctx.Done():
			return true, ctx.Err()
		case <-time.After(200 * time.Millisecond):
		}
		e = q.CompleteOperation(ctx, j, result)
	}
	if errors.Is(e, sdrsdk.ErrStale) {
		return true, nil
	}
	return true, e
}
func (w *Worker) runOperations(ctx context.Context) {
	tick := time.NewTicker(400 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			_, _ = w.OnceOperation(ctx)
		}
	}
}
