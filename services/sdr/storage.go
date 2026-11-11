package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"syscall"

	_ "modernc.org/sqlite"
)

// The in-memory model is a single-process working set. SQLite commits the complete
// state and append-only audit entries in one durable transaction. An OS lock
// prevents stale working sets in a second process from overwriting this database.
func (a *App) openStore(file string) error {
	if file == "" {
		return nil
	}
	abs, err := filepath.Abs(file)
	if err != nil {
		return err
	}
	if filepath.Ext(abs) != ".sqlite" {
		return errors.New("laboratory database must use .sqlite extension; legacy JSON is never imported automatically")
	}
	info, err := os.Lstat(abs)
	if err == nil && (info.Mode()&os.ModeSymlink != 0) {
		return errors.New("database symlinks are forbidden")
	}
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	lock, err := os.OpenFile(abs+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return errors.New("laboratory database is already in use")
	}
	a.lockFile = lock
	f, err := os.OpenFile(abs, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		a.Close()
		return err
	}
	f.Close()
	if err = os.Chmod(abs, 0600); err != nil {
		a.Close()
		return err
	}
	dsn := (&url.URL{Scheme: "file", Path: abs}).String() + "?_pragma=journal_mode(WAL)&_pragma=synchronous(FULL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		a.Close()
		return err
	}
	a.db = db
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS lab_metadata (id INTEGER PRIMARY KEY CHECK(id=1), marker TEXT NOT NULL);
 INSERT OR IGNORE INTO lab_metadata VALUES (1,'sdr-isolated-lab-v1');
 CREATE TABLE IF NOT EXISTS state_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), payload BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,organization_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL,conversation_id TEXT NOT NULL,operation_id TEXT NOT NULL,revision INTEGER NOT NULL,reason TEXT NOT NULL,at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS audit_org_seq ON audit(organization_id,seq);
 CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
 CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'audit is append-only'); END;
 CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, started_at INTEGER NOT NULL, used INTEGER NOT NULL);`)
	if err != nil {
		a.Close()
		return err
	}
	var marker string
	if err = db.QueryRow("SELECT marker FROM lab_metadata WHERE id=1").Scan(&marker); err != nil || marker != "sdr-isolated-lab-v1" {
		a.Close()
		return errors.New("invalid lab database marker")
	}
	var payload []byte
	err = db.QueryRow("SELECT payload FROM state_snapshot WHERE id=1").Scan(&payload)
	if err == nil {
		a.state = State{}
		err = json.Unmarshal(payload, &a.state)
	} else if errors.Is(err, sql.ErrNoRows) {
		err = nil
	}
	if err != nil {
		a.Close()
		return err
	}
	return nil
}
func (a *App) Close() error {
	var err error
	if a.db != nil {
		err = a.db.Close()
		a.db = nil
	}
	if a.lockFile != nil {
		_ = syscall.Flock(int(a.lockFile.Fd()), syscall.LOCK_UN)
		_ = a.lockFile.Close()
		a.lockFile = nil
	}
	return err
}
func (a *App) save() error {
	if a.failSave {
		return errors.New("injected storage failure")
	}
	if a.db == nil {
		a.pendingMetrics = nil
		return nil
	}
	payload, err := json.Marshal(a.state)
	if err != nil {
		return err
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("INSERT INTO state_snapshot(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", payload); err != nil {
		return err
	}
	for _, v := range a.state.Audit {
		if _, err = tx.Exec(`INSERT INTO audit(id,organization_id,actor_id,action,conversation_id,operation_id,revision,reason,at) VALUES(?,?,?,?,?,?,?,?,?)`, v.ID, v.Org, v.Actor, v.Action, v.Conversation, v.Operation, v.Revision, v.Reason, v.At); err != nil {
			return fmt.Errorf("audit commit: %w", err)
		}
	}
	if err = a.saveMetricEvents(tx); err != nil {
		return err
	}
	if err = tx.Commit(); err == nil {
		a.pendingMetrics = nil
		a.state.Audit = nil
	}
	return err
}
