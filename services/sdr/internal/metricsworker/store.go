package metricsworker

import (
	"database/sql"
	"encoding/json"
	"errors"
	_ "modernc.org/sqlite"
	"os"
	"path/filepath"
	"regexp"
	"sdr-next-pilot/pkg/sdrsdk"
	"slices"
	"sync"
	"time"
)

type Store struct {
	mu sync.Mutex
	db *sql.DB
}

var nameRE = regexp.MustCompile(`^[a-zA-Z0-9_.:-]{1,100}$`)
var hashRE = regexp.MustCompile(`^[a-f0-9]{64}$`)

func Open(path string) (*Store, error) {
	if !filepath.IsAbs(path) || filepath.Ext(path) != ".sqlite" {
		return nil, errors.New("metrics_path_invalid")
	}
	if info, e := os.Lstat(path); e == nil && info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("metrics_symlink_forbidden")
	}
	f, e := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0600)
	if e != nil {
		return nil, e
	}
	_ = f.Close()
	if e = os.Chmod(path, 0600); e != nil {
		return nil, e
	}
	db, e := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=synchronous(FULL)&_pragma=busy_timeout(5000)")
	if e != nil {
		return nil, e
	}
	db.SetMaxOpenConns(1)
	_, e = db.Exec(`CREATE TABLE IF NOT EXISTS checkpoint(id INTEGER PRIMARY KEY CHECK(id=1),source TEXT NOT NULL DEFAULT '',cursor INTEGER NOT NULL DEFAULT 0,since TEXT NOT NULL DEFAULT '',last_poll INTEGER NOT NULL DEFAULT 0,last_batch INTEGER NOT NULL DEFAULT 0,batches INTEGER NOT NULL DEFAULT 0,events INTEGER NOT NULL DEFAULT 0,gaps INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO checkpoint(id) VALUES(1);
CREATE TABLE IF NOT EXISTS attempts(attempt TEXT PRIMARY KEY,organization TEXT NOT NULL,worker TEXT NOT NULL,job TEXT NOT NULL,kind TEXT NOT NULL,mode TEXT NOT NULL,parents TEXT NOT NULL,started INTEGER NOT NULL,finished INTEGER NOT NULL DEFAULT 0,outcome TEXT NOT NULL DEFAULT 'running');
CREATE INDEX IF NOT EXISTS metric_attempt_time ON attempts(started,organization);
CREATE INDEX IF NOT EXISTS metric_attempt_job ON attempts(organization,job);
CREATE TABLE IF NOT EXISTS monitor_daily(day INTEGER PRIMARY KEY,batches INTEGER NOT NULL DEFAULT 0,events INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0);`)
	if e != nil {
		_ = db.Close()
		return nil, e
	}
	return &Store{db: db}, nil
}
func (s *Store) Close() error { return s.db.Close() }
func (s *Store) Cursor() (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var cursor int64
	e := s.db.QueryRow("SELECT cursor FROM checkpoint WHERE id=1").Scan(&cursor)
	return cursor, e
}
func validEvent(e sdrsdk.WorkerMetricEvent) bool {
	if e.SchemaVersion != 1 || e.Sequence < 1 || !nameRE.MatchString(e.Organization) || !nameRE.MatchString(e.Worker) || !hashRE.MatchString(e.Job) || !hashRE.MatchString(e.Attempt) || e.At.IsZero() {
		return false
	}
	if e.Phase == "start" {
		if e.ID != e.Attempt+":start" || !nameRE.MatchString(e.Kind) || !slices.Contains([]string{"real", "simulated", "preparation", "preview"}, e.Mode) || len(e.Parents) > 32 {
			return false
		}
		for _, p := range e.Parents {
			if !hashRE.MatchString(p) || p == e.Job {
				return false
			}
		}
		return true
	}
	return e.Phase == "finish" && e.ID == e.Attempt+":finish" && slices.Contains([]string{"completed", "failed", "cancelled", "expired", "waiting_download", "uncertain"}, e.Outcome)
}
func (s *Store) Apply(b sdrsdk.WorkerMetricBatch, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if b.Source == "" || len(b.Source) > 100 || b.CollectedSince.IsZero() || b.Head < 0 || b.Floor < 0 || len(b.Events) > 500 {
		return errors.New("metrics_batch_invalid")
	}
	previous := int64(0)
	for _, e := range b.Events {
		if !validEvent(e) || e.Sequence <= previous || e.Sequence > b.Head {
			return errors.New("metrics_event_invalid")
		}
		previous = e.Sequence
	}
	tx, e := s.db.Begin()
	if e != nil {
		return e
	}
	defer tx.Rollback()
	var source string
	var cursor int64
	if e = tx.QueryRow("SELECT source,cursor FROM checkpoint WHERE id=1").Scan(&source, &cursor); e != nil {
		return e
	}
	if source != "" && source != b.Source {
		return errors.New("metrics_source_changed")
	}
	if cursor > b.Head {
		return errors.New("metrics_source_rewound")
	}
	gap := 0
	if b.Floor > cursor+1 {
		gap = 1
		cursor = b.Floor - 1
	}
	processed := 0
	for _, event := range b.Events {
		if event.Sequence <= cursor {
			continue
		}
		if event.Phase == "start" {
			parents, _ := json.Marshal(event.Parents)
			_, e = tx.Exec("INSERT OR IGNORE INTO attempts(attempt,organization,worker,job,kind,mode,parents,started) VALUES(?,?,?,?,?,?,?,?)", event.Attempt, event.Organization, event.Worker, event.Job, event.Kind, event.Mode, string(parents), event.At.UnixMilli())
		} else {
			_, e = tx.Exec("UPDATE attempts SET finished=?,outcome=? WHERE attempt=? AND organization=? AND worker=? AND job=? AND outcome='running'", event.At.UnixMilli(), event.Outcome, event.Attempt, event.Organization, event.Worker, event.Job)
		}
		if e != nil {
			return e
		}
		cursor = event.Sequence
		processed++
	}
	batchCount := 0
	if processed > 0 {
		batchCount = 1
	}
	lastBatch := int64(0)
	if processed > 0 {
		lastBatch = now.Unix()
	}
	_, e = tx.Exec("UPDATE checkpoint SET source=?,cursor=?,since=?,last_poll=?,last_batch=CASE WHEN ?>0 THEN ? ELSE last_batch END,batches=batches+?,events=events+?,gaps=gaps+? WHERE id=1", b.Source, cursor, b.CollectedSince.Format(time.RFC3339Nano), now.Unix(), lastBatch, lastBatch, batchCount, processed, gap)
	if e != nil {
		return e
	}
	if processed > 0 {
		_, e = tx.Exec("INSERT INTO monitor_daily(day,batches,events) VALUES(?,1,?) ON CONFLICT(day) DO UPDATE SET batches=batches+1,events=events+excluded.events", now.UTC().Truncate(24*time.Hour).Unix(), processed)
		if e != nil {
			return e
		}
	}
	_, e = tx.Exec("DELETE FROM attempts WHERE started<?", now.Add(-90*24*time.Hour).UnixMilli())
	if e != nil {
		return e
	}
	_, e = tx.Exec("DELETE FROM monitor_daily WHERE day<?", now.Add(-90*24*time.Hour).Unix())
	if e != nil {
		return e
	}
	return tx.Commit()
}
func (s *Store) PollError(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, _ = s.db.Exec("UPDATE checkpoint SET errors=errors+1 WHERE id=1")
	_, _ = s.db.Exec("INSERT INTO monitor_daily(day,errors) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET errors=errors+1", now.UTC().Truncate(24*time.Hour).Unix())
}
