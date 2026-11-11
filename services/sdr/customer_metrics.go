package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"sdr-next-pilot/internal/metricsworker"
	"strconv"
	"time"
)

func (a *App) customerUsage(ctx context.Context, org string, days int) (metricsworker.CustomerReport, error) {
	var report metricsworker.CustomerReport
	if org == "" || days < 1 || days > 90 || a.ops == nil {
		return report, errors.New("metrics_unavailable")
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	q := url.Values{"organization": {org}, "days": {strconv.Itoa(days)}}
	r, e := http.NewRequestWithContext(ctx, "GET", a.ops.base+"/customer-report?"+q.Encode(), nil)
	if e != nil {
		return report, e
	}
	r.Header.Set("Authorization", "Bearer "+a.ops.workerToken)
	resp, e := a.ops.client.Do(r)
	if e != nil {
		return report, errors.New("metrics_unavailable")
	}
	defer resp.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if e != nil || resp.StatusCode != 200 || len(raw) > 1<<20 || json.Unmarshal(raw, &report) != nil || report.Organization != org {
		return report, errors.New("metrics_unavailable")
	}
	for _, cell := range report.Heat {
		if cell.Organization != org {
			return metricsworker.CustomerReport{}, errors.New("metrics_scope_invalid")
		}
	}
	return report, nil
}
