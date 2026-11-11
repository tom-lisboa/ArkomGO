// Package dataworker packages an already authorized, immutable customer view.
// It has no model, WhatsApp, database or cross-customer authority.
package dataworker

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"time"
)

const MaxArchiveBytes int64 = 384 << 20

type Record struct {
	ID           string          `json:"id"`
	Collection   string          `json:"collection"`
	Conversation string          `json:"conversation_id,omitempty"`
	At           time.Time       `json:"recorded_at"`
	Data         json.RawMessage `json:"data"`
}
type File struct {
	ID      string `json:"id"`
	AssetID string `json:"asset_id"`
	Name    string `json:"name"`
	Size    int64  `json:"size"`
	SHA256  string `json:"sha256"`
	Path    string `json:"path"`
	Status  string `json:"status"`
}
type Snapshot struct {
	Organization string            `json:"organization_id"`
	CapturedAt   time.Time         `json:"captured_at"`
	Records      []Record          `json:"records"`
	Files        []File            `json:"files"`
	Coverage     map[string]string `json:"coverage"`
}
type Result struct {
	Records          int `json:"records"`
	Files            int `json:"files"`
	UnavailableFiles int `json:"unavailable_files"`
}
type ReadFile func(context.Context, File) ([]byte, error)

var safeID = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)
var safeCollection = regexp.MustCompile(`^[a-z_]{1,40}$`)
var ErrFileUnavailable = errors.New("export_file_unavailable")

type boundedWriter struct {
	w       io.Writer
	written int64
}

func (w *boundedWriter) Write(p []byte) (int, error) {
	if w.written+int64(len(p)) > MaxArchiveBytes {
		return 0, errors.New("export_size_limit")
	}
	n, e := w.w.Write(p)
	w.written += int64(n)
	return n, e
}

// Build streams files individually, never loading the complete ZIP in memory.
// Names supplied by users are metadata only and never become archive paths.
func Build(ctx context.Context, dst io.Writer, s Snapshot, read ReadFile) (Result, error) {
	result := Result{Records: len(s.Records)}
	if s.Organization == "" || s.CapturedAt.IsZero() {
		return result, errors.New("export_snapshot_invalid")
	}
	byCollection := map[string][]Record{}
	for _, r := range s.Records {
		if !safeCollection.MatchString(r.Collection) || !json.Valid(r.Data) {
			return result, errors.New("export_record_invalid")
		}
		byCollection[r.Collection] = append(byCollection[r.Collection], r)
	}
	z := zip.NewWriter(&boundedWriter{w: dst})
	writeJSON := func(name string, v any) error {
		w, e := z.Create(name)
		if e != nil {
			return e
		}
		return json.NewEncoder(w).Encode(v)
	}
	for collection, records := range byCollection {
		if e := ctx.Err(); e != nil {
			return result, e
		}
		if e := writeJSON(collection+".json", records); e != nil {
			return result, e
		}
	}
	files := append([]File(nil), s.Files...)
	for i := range files {
		if e := ctx.Err(); e != nil {
			return result, e
		}
		f := &files[i]
		if !safeID.MatchString(f.ID) || !safeID.MatchString(f.AssetID) {
			return result, errors.New("export_file_id_invalid")
		}
		f.Path = "" // Caller paths are never trusted.
		if f.Status != "available" {
			result.UnavailableFiles++
			continue
		}
		b, e := read(ctx, *f)
		if errors.Is(e, ErrFileUnavailable) {
			f.Status = "unavailable_during_export"
			result.UnavailableFiles++
			continue
		}
		if e != nil {
			return result, e
		}
		h := sha256.Sum256(b)
		if int64(len(b)) != f.Size || hex.EncodeToString(h[:]) != f.SHA256 {
			return result, errors.New("export_file_integrity")
		}
		f.Path = "media/" + f.AssetID + "/" + f.ID + ".bin"
		w, e := z.Create(f.Path)
		if e != nil {
			return result, e
		}
		if _, e = w.Write(b); e != nil {
			return result, e
		}
		f.Status = "included"
		result.Files++
	}
	manifest := map[string]any{"schema_version": 1, "organization_id": s.Organization, "captured_at": s.CapturedAt, "coverage": s.Coverage, "records": result.Records, "files": files, "included_files": result.Files, "unavailable_files": result.UnavailableFiles, "scope": "Data retained by this platform at capture time, not the phone's previous WhatsApp history.", "excluded": "Passwords, access codes, provider credentials, WhatsApp session keys and other customers' data are not exported."}
	if e := writeJSON("manifest.json", manifest); e != nil {
		return result, e
	}
	w, e := z.Create("LEIA-ME.txt")
	if e != nil {
		return result, e
	}
	_, e = io.WriteString(w, "Dados da empresa em JSON. O manifest.json informa a cobertura, os nomes originais e os anexos incluídos ou indisponíveis. Arquivos .bin preservam os bytes; consulte os metadados de mídia para o formato e o nome. Este pacote contém somente o histórico recebido e conservado pela plataforma, não o histórico anterior do celular.\n")
	if e != nil {
		return result, e
	}
	return result, z.Close()
}
