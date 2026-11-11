package sdrsdk

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
)

var ErrMediaPending = errors.New("media_preparing")

const MaxMediaBytes = 8 << 20

type MediaFile struct {
	Seconds int    `json:"seconds,omitempty"`
	Kind    string `json:"kind"`
	MIME    string `json:"mime"`
	Name    string `json:"name"`
	Size    int    `json:"size"`
	SHA256  string `json:"sha256"`
}
type MediaJob struct {
	ID           string    `json:"id"`
	Lease        string    `json:"lease"`
	Organization string    `json:"organization_id"`
	Conversation string    `json:"conversation_id"`
	Message      string    `json:"message_id,omitempty"`
	Direction    string    `json:"direction"`
	File         MediaFile `json:"file"`
}
type MediaResult struct {
	Text string    `json:"text,omitempty"`
	Data []byte    `json:"data,omitempty"`
	File MediaFile `json:"file"`
}
type MediaQueue interface {
	ClaimMedia(context.Context) (MediaJob, bool, error)
	ReadMedia(context.Context, MediaJob) ([]byte, error)
	CompleteMedia(context.Context, MediaJob, MediaResult) error
	FailMedia(context.Context, MediaJob, string) error
}
type MediaProcessor interface {
	Process(context.Context, MediaJob, []byte) (MediaResult, error)
}

// Detect content from bytes, never from a client-controlled URL or filename.
func InspectMedia(b []byte, name string) (MediaFile, error) {
	if len(b) == 0 || len(b) > MaxMediaBytes {
		return MediaFile{}, errors.New("media_size_invalid")
	}
	ct := http.DetectContentType(b)
	switch {
	case bytes.HasPrefix(b, []byte("OggS")):
		ct = "audio/ogg"
	case bytes.HasPrefix(b, []byte("fLaC")):
		ct = "audio/flac"
	case bytes.HasPrefix(b, []byte("ID3")) || (len(b) > 2 && b[0] == 0xff && b[1]&0xe0 == 0xe0):
		ct = "audio/mpeg"
	case len(b) > 12 && string(b[4:8]) == "ftyp":
		ct = "video/mp4"
		if strings.HasSuffix(strings.ToLower(name), ".m4a") {
			ct = "audio/mp4"
		}
	case len(b) > 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WAVE":
		ct = "audio/wav"
	case len(b) > 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP":
		ct = "image/webp"
	case len(b) > 4 && bytes.Equal(b[:4], []byte{0x1a, 0x45, 0xdf, 0xa3}):
		ct = "audio/webm"
	}
	kind := ""
	switch ct {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		kind = "image"
	case "audio/ogg", "audio/flac", "audio/mpeg", "audio/wav", "audio/mp4", "audio/webm":
		kind = "audio"
	case "application/pdf":
		kind = "document"
	case "video/mp4":
		kind = "video"
	default:
		return MediaFile{}, errors.New("media_type_unsupported")
	}
	name = filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 || r == '"' {
			return -1
		}
		return r
	}, name)
	if name == "" || name == "." || len(name) > 120 {
		name = "arquivo"
	}
	sum := sha256.Sum256(b)
	seconds := 0
	if ct == "audio/ogg" {
		seconds = opusSeconds(b)
	}
	return MediaFile{Kind: kind, MIME: ct, Name: name, Size: len(b), SHA256: hex.EncodeToString(sum[:]), Seconds: seconds}, nil
}
func (c *Client) ClaimMedia(ctx context.Context) (MediaJob, bool, error) {
	var j MediaJob
	ok, e := c.post(ctx, "/internal/workers/media/claim", map[string]string{}, &j)
	return j, ok, e
}
func (c *Client) ReadMedia(ctx context.Context, j MediaJob) ([]byte, error) {
	raw := map[string]string{"id": j.ID, "lease": j.Lease}
	return c.mediaBytes(ctx, raw)
}
func (c *Client) mediaBytes(ctx context.Context, body any) ([]byte, error) {
	raw, _ := json.Marshal(body)
	r, e := http.NewRequestWithContext(ctx, "POST", c.Base+"/internal/workers/media/read", bytes.NewReader(raw))
	if e != nil {
		return nil, ErrUnavailable
	}
	r.Header.Set("Authorization", "Bearer "+c.Token)
	r.Header.Set("Content-Type", "application/json")
	res, e := c.HTTP.Do(r)
	if e != nil {
		return nil, ErrUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode == 425 {
		return nil, ErrMediaPending
	}
	if res.StatusCode == 409 {
		return nil, ErrStale
	}
	if res.StatusCode != 200 {
		return nil, ErrUnavailable
	}
	b, e := io.ReadAll(io.LimitReader(res.Body, MaxMediaBytes+1))
	if e != nil || len(b) > MaxMediaBytes {
		return nil, ErrUnavailable
	}
	return b, nil
}
func (c *Client) CompleteMedia(ctx context.Context, j MediaJob, v MediaResult) error {
	_, e := c.post(ctx, "/internal/workers/media/complete", struct {
		ID     string      `json:"id"`
		Lease  string      `json:"lease"`
		Result MediaResult `json:"result"`
	}{j.ID, j.Lease, v}, nil)
	return e
}
func (c *Client) FailMedia(ctx context.Context, j MediaJob, code string) error {
	_, e := c.post(ctx, "/internal/workers/media/fail", map[string]string{"id": j.ID, "lease": j.Lease, "code": code}, nil)
	return e
}
func MediaContentType(raw string) string {
	ct, _, e := mime.ParseMediaType(raw)
	if e != nil {
		return "application/octet-stream"
	}
	return ct
}

// WhatsApp voice notes carry an explicit duration. Only parse our Ogg/Opus
// container; malformed or different Ogg codecs are left for the codec worker.
func opusSeconds(b []byte) int {
	at := 0
	var last uint64
	var skip uint16
	found := false
	for at+27 <= len(b) {
		if string(b[at:at+4]) != "OggS" {
			return 0
		}
		segments := int(b[at+26])
		start := at + 27 + segments
		if start > len(b) {
			return 0
		}
		n := 0
		for _, v := range b[at+27 : start] {
			n += int(v)
		}
		if n > len(b)-start {
			return 0
		}
		body := b[start : start+n]
		if len(body) >= 12 && string(body[:8]) == "OpusHead" {
			skip = binary.LittleEndian.Uint16(body[10:12])
			found = true
		}
		granule := binary.LittleEndian.Uint64(b[at+6 : at+14])
		if granule != ^uint64(0) && granule > last {
			last = granule
		}
		at = start + n
	}
	if !found || last <= uint64(skip) || last > 48000*86400 {
		return 0
	}
	return int((last - uint64(skip) + 47999) / 48000)
}
