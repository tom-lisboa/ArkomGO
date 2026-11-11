package metricsworker

import (
	"path/filepath"
	"sdr-next-pilot/pkg/sdrsdk"
	"strings"
	"testing"
	"time"
)

func metricStartFixture(org, worker, job, lease string, seq int64, at time.Time, parents ...string) sdrsdk.WorkerMetricEvent {
	j := sdrsdk.MetricJob(org, worker, job)
	a := sdrsdk.Digest(j + lease)
	return sdrsdk.WorkerMetricEvent{SchemaVersion: 1, Sequence: seq, ID: a + ":start", Organization: org, Worker: worker, Job: j, Attempt: a, Phase: "start", Kind: "test", Mode: "real", At: at, Parents: parents}
}
func fixtureBatch(events ...sdrsdk.WorkerMetricEvent) sdrsdk.WorkerMetricBatch {
	head := int64(0)
	if len(events) > 0 {
		head = events[len(events)-1].Sequence
	}
	return sdrsdk.WorkerMetricBatch{Source: "source-fixture", CollectedSince: time.Date(2026, 11, 3, 0, 0, 0, 0, time.UTC), Floor: 1, Head: head, Events: events}
}
func TestProjectionRestartValidationAndFutureWorkers(t *testing.T) {
	path := filepath.Join(t.TempDir(), "metrics.sqlite")
	store, e := Open(path)
	if e != nil {
		t.Fatal(e)
	}
	now := time.Date(2026, 11, 4, 1, 0, 0, 0, time.UTC)
	first := metricStartFixture("org_alfa", "future.worker", "job-a", "lease-1", 1, now)
	finish := first
	finish.Phase = "finish"
	finish.ID = first.Attempt + ":finish"
	finish.Outcome = "completed"
	finish.Sequence = 2
	finish.At = now.Add(time.Second)
	b := fixtureBatch(first, finish)
	if e = store.Apply(b, now.Add(time.Second)); e != nil {
		t.Fatal(e)
	}
	_ = store.Close()
	store, e = Open(path)
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	if e = store.Apply(b, now.Add(time.Second)); e != nil {
		t.Fatal(e)
	}
	report, e := store.Report(now.Add(time.Second), 1, "")
	if e != nil {
		t.Fatal(e)
	}
	if len(report.Workers) != 1 || report.Workers[0].ID != "future.worker" || report.Workers[0].Starts != 1 || report.Workers[0].Completed != 1 || report.Monitor.Batches != 1 {
		t.Fatal("future worker or replay incorrect", report)
	}
	invalid := first
	invalid.Sequence = 3
	invalid.ID = "forged-event"
	b = fixtureBatch(invalid)
	if e = store.Apply(b, now); e == nil {
		t.Fatal("invalid event accepted")
	}
	cursor, _ := store.Cursor()
	if cursor != 2 {
		t.Fatal("invalid batch advanced cursor")
	}
	b = fixtureBatch()
	b.Source = "another-server"
	if e = store.Apply(b, now); e == nil {
		t.Fatal("mixed data sources")
	}
}
func TestCausalPathsDoNotInventLinksFromAdjacentTasks(t *testing.T) {
	now := time.Now()
	a := metricStartFixture("org_a", "context", "a", "a1", 1, now)
	b := metricStartFixture("org_b", "execution", "b", "b1", 2, now)
	store, e := Open(filepath.Join(t.TempDir(), "metrics.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	if e = store.Apply(fixtureBatch(a, b), now); e != nil {
		t.Fatal(e)
	}
	report, _ := store.Report(now, 1, "")
	if len(report.Chains) != 2 {
		t.Fatal("unrelated customers linked by clock", report.Chains)
	}
	for _, chain := range report.Chains {
		if len(chain.Workers) != 1 {
			t.Fatal("invented dependency")
		}
	}
	filtered, _ := store.Report(now, 1, "org_a")
	if len(filtered.Workers) != 1 || filtered.Workers[0].ID != "context" {
		t.Fatal("organization filter leaked")
	}
	preview, _ := store.Report(now, 1, "", "preview")
	if len(preview.Workers) != 0 {
		t.Fatal("preview filter ignored")
	}
}
func TestParallelMediaDeduplicatesEquivalentPathsAndMissingHistoryIsExplicit(t *testing.T) {
	now := time.Now()
	one := metricStartFixture("org_a", "media", "one", "1", 1, now)
	two := metricStartFixture("org_a", "media", "two", "2", 2, now)
	ctx := metricStartFixture("org_a", "context", "context", "3", 3, now, one.Job, two.Job)
	exec := metricStartFixture("org_a", "execution", "execution", "4", 4, now, ctx.Job)
	store, e := Open(filepath.Join(t.TempDir(), "metrics.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	if e = store.Apply(fixtureBatch(one, two, ctx, exec), now); e != nil {
		t.Fatal(e)
	}
	report, _ := store.Report(now, 1, "")
	if len(report.Chains) != 1 || report.Chains[0].Count != 1 || strings.Join(report.Chains[0].Workers, ",") != "media,context,execution" {
		t.Fatal("parallel inputs multiplied a turn", report.Chains)
	}
	other := metricStartFixture("org_a", "whatsapp", "lost-parent", "5", 5, now, sdrsdk.MetricJob("org_a", "execution", "missing"))
	b := fixtureBatch(other)
	b.Floor = 5
	if e = store.Apply(b, now); e != nil {
		t.Fatal(e)
	}
	report, _ = store.Report(now, 1, "")
	partial := false
	for _, chain := range report.Chains {
		if chain.Partial {
			partial = true
		}
	}
	if !partial {
		t.Fatal("missing parent silently invented a full path")
	}
}
func TestRetentionGapIsRecordedAndDoesNotRepeat(t *testing.T) {
	store, e := Open(filepath.Join(t.TempDir(), "metrics.sqlite"))
	if e != nil {
		t.Fatal(e)
	}
	defer store.Close()
	now := time.Now()
	event := metricStartFixture("org_a", "media", "a", "a", 12, now)
	b := fixtureBatch(event)
	b.Floor = 12
	if e = store.Apply(b, now); e != nil {
		t.Fatal(e)
	}
	if e = store.Apply(b, now); e != nil {
		t.Fatal(e)
	}
	report, _ := store.Report(now, 1, "")
	if report.Monitor.Gaps != 1 || report.Monitor.Events != 1 {
		t.Fatal("gap hidden or repeated", report.Monitor)
	}
}
